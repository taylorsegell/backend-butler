"""Optional native PCM transport for the real Butler agent and voice authority.

Only a trusted bridge holding TEXT_API_TOKEN may open a socket. Its authenticated
person and optional selected conversation are fixed for the connection lifetime.
"""

import asyncio
import base64
import json
import logging
import re
import secrets
from functools import partial

import httpx
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from livekit import rtc
from livekit.agents import AgentSession, TurnHandlingOptions, inference, io, utils
from livekit.agents.metrics import LLMModelUsage

from agent import HomeAssistantAgent
from config import UPDATE_PREFIX, settings
from history import render
from native_speech import SpeechEvidence
from session_idle import SessionIdle
from utils import build_llm
from voice_persistence import RemoteSession

logger = logging.getLogger(__name__)


class NativeInput(io.AudioInput):
    def __init__(self):
        super().__init__(label="native-http-lab")
        self.frames = asyncio.Queue(maxsize=100)

    async def __anext__(self):
        return await self.frames.get()

    def clear(self):
        while not self.frames.empty():
            self.frames.get_nowait()


class ReplyOutput(io.AudioOutput):
    def __init__(
        self, emit, on_start=lambda: None, on_done=lambda: None, on_timeout=lambda: None
    ):
        super().__init__(
            label="lab-reply", capabilities=io.AudioOutputCapabilities(pause=False)
        )
        self.emit_event = emit
        self.duration = 0
        self.segment = 0
        self.pending = {}
        self.on_start = on_start
        self.on_done = on_done
        self.on_timeout = on_timeout

    async def capture_frame(self, frame):
        await super().capture_frame(frame)
        self.on_start()
        self.duration += frame.samples_per_channel / frame.sample_rate
        self.emit_event(
            {
                "type": "audio",
                "pcm": base64.b64encode(bytes(frame.data)).decode(),
                "sample_rate": frame.sample_rate,
                "channels": frame.num_channels,
            }
        )

    def flush(self):
        super().flush()
        if not self.duration:
            return
        self.segment += 1
        timer = asyncio.get_running_loop().call_later(
            self.duration + 30, self.on_timeout
        )
        self.pending[self.segment] = (self.duration, timer)
        self.emit_event({"type": "audio_end", "segment": self.segment})
        self.duration = 0

    def acknowledge(self, segment):
        pending = self.pending.pop(segment, None)
        if pending is None:
            return
        duration, timer = pending
        timer.cancel()
        self.on_playback_finished(playback_position=duration, interrupted=False)
        if not self.pending and not self.duration:
            self.on_done()

    def clear_buffer(self):
        super().flush()
        self.emit_event({"type": "audio_clear"})
        for _, timer in self.pending.values():
            timer.cancel()
        self.pending.clear()
        while self._pending_playback_count:
            self.on_playback_finished(playback_position=0, interrupted=True)
        self.duration = 0
        self.on_done()


class NativeSession:
    def __init__(self, emit, person, selected, *, approval_events=None):
        self.emit = emit
        self.person = person
        self.selected = selected
        self.persisted = None
        self.saver = None
        self.heartbeat = None
        self.approval_events = approval_events
        self.butler_updates = None
        self.dirty = asyncio.Event()
        self.failed = False
        self.closing = False
        self.close_task = None
        self.failure_task = None
        self.resume_timer = None
        self.speech_evidence = SpeechEvidence()
        self.input = NativeInput()
        self.output = ReplyOutput(
            emit,
            self.block_for_playback,
            self.playback_done,
            lambda: self.fail(
                "Reply playback could not be confirmed. Reconnect to continue."
            ),
        )
        self.providers = {
            "stt": inference.STT(settings.stt_model, language=settings.stt_language),
            "llm": build_llm(),
            "tts": inference.TTS(
                settings.tts_model,
                voice=settings.tts_voice,
                language=settings.tts_language,
            ),
        }
        self.session = AgentSession(
            **self.providers,
            vad=self.speech_evidence.detector(),
            turn_handling=TurnHandlingOptions(
                turn_detection="manual",
                interruption={"enabled": False, "resume_false_interruption": False},
                preemptive_generation={"enabled": False},
            ),
            max_tool_steps=settings.max_tool_steps,
        )
        self.session.input.audio = self.input
        self.session.output.audio = self.output
        self.agent = HomeAssistantAgent(user_id=person)
        self.agent._speech_evidence = self.speech_evidence
        self.agent.update_options(stt=None)
        self.items = []
        self.conversation_id = None
        self.listening = False
        self.turn_timer = None
        self.turn_mode = "manual"

        @self.session.on("conversation_item_added")
        def item(_event):
            self.dirty.set()

        @self.session.on("session_usage_updated")
        def usage(event):
            llms = [u for u in event.usage.model_usage if isinstance(u, LLMModelUsage)]
            self.persisted.usage = {
                key: int(self.persisted.earlier_usage.get(key, 0))
                + sum(getattr(u, field) for u in llms)
                for key, field in {
                    "input": "input_tokens",
                    "output": "output_tokens",
                    "cached": "input_cached_tokens",
                }.items()
            }
            self.dirty.set()

        @self.session.on("agent_state_changed")
        def state(event):
            self.emit({"type": "state", "state": event.new_state})

        @self.session.on("error")
        def error(_event):
            self.fail("The speech service failed. Reconnect to continue.")

    def refresh(self):
        self.items = render(list(self.session.history.items))[0][-100:]
        return {"items": self.items, "conversation_id": self.conversation_id}

    def fail(self, message):
        if self.failed:
            return
        self.failed = True
        self.idle_input()
        self.failure_task = asyncio.create_task(self.close())
        self.emit({"type": "error", "message": message})

    async def start(self):
        self.persisted = await RemoteSession.open(self.person, self.selected)
        self.conversation_id = self.persisted.session_id
        await self.session.start(
            agent=self.agent, persist=self.persisted, record=False, session_host=False
        )
        self.session.input.set_audio_enabled(False)
        await self.agent.update_chat_ctx(
            self.agent.chat_ctx.copy().truncate(max_items=settings.text_max_items)
        )
        await self.session.save()
        self.refresh()
        self.saver = asyncio.create_task(self.save_loop())
        self.heartbeat = asyncio.create_task(self.heartbeat_loop())
        if self.person and self.approval_events:
            cursor = self.approval_events(self.person, None)["cursor"]
            self.butler_updates = asyncio.create_task(
                self.forward_butler_updates(cursor)
            )

    async def forward_butler_updates(self, cursor):
        while not self.closing and not self.failed:
            data = self.approval_events(self.person, cursor)
            cursor = data["cursor"]
            for event in data["events"]:
                try:
                    self.session.generate_reply(
                        user_input=f"{UPDATE_PREFIX} butler: {event['text']}",
                        tool_choice="none",
                    )
                except RuntimeError:
                    logger.warning("Could not relay a native Butler update")
            await asyncio.sleep(1)

    async def save_loop(self):
        try:
            while True:
                await self.dirty.wait()
                self.dirty.clear()
                await self.session.save()
                self.emit({"type": "conversation", **self.refresh()})
        except Exception:
            logger.exception("Native conversation save failed")
            self.fail("Conversation could not be saved. Reconnect to continue.")

    async def heartbeat_loop(self):
        try:
            await self.persisted.heartbeat()
        except Exception:
            logger.exception("Native conversation lease lost")
            self.fail("Conversation lease expired. Reconnect to continue.")

    def idle_input(self, *, preserve_speech=False):
        self.listening = False
        if not preserve_speech:
            self.speech_evidence.reset()
        if self.resume_timer:
            self.resume_timer.cancel()
            self.resume_timer = None
        self.session.input.set_audio_enabled(False)
        self.agent.update_options(stt=None)
        if self.turn_timer:
            self.turn_timer.cancel()
            self.turn_timer = None

    def block_for_playback(self):
        if self.resume_timer:
            self.resume_timer.cancel()
            self.resume_timer = None
        if self.speech_evidence.blocked:
            return
        self.speech_evidence.blocked = True
        self.speech_evidence.reset()
        self.session.input.set_audio_enabled(False)
        self.session.clear_user_turn()
        self.input.clear()

    def playback_done(self):
        if self.resume_timer:
            self.resume_timer.cancel()
        # Allow the last speaker sound and in-flight microphone packets to drain.
        self.resume_timer = asyncio.get_running_loop().call_later(
            0.35, self.resume_input
        )

    def resume_input(self):
        if self.resume_timer:
            self.resume_timer.cancel()
        self.resume_timer = None
        self.speech_evidence.reset()
        self.speech_evidence.blocked = False
        self.input.clear()
        self.session.clear_user_turn()
        if self.listening and not self.failed and not self.closing:
            self.session.input.set_audio_enabled(True)

    def push(self, data):
        if len(data) > 19200 or len(data) % 2:
            raise ValueError("Invalid PCM frame")
        if self.listening and not self.failed and not self.speech_evidence.blocked:
            self.input.frames.put_nowait(rtc.AudioFrame(data, 48000, 1, len(data) // 2))

    async def control(self, command, payload=""):
        if self.failed:
            raise ValueError("Conversation unavailable; reconnect to continue")
        if command == "start_turn":
            self.session.interrupt(force=True)
            self.output.clear_buffer()
            self.session.clear_user_turn()
            self.input.clear()
            self.speech_evidence.reset()
            self.agent.update_options(stt=self.providers["stt"])
            self.listening = True
            self.session.input.set_audio_enabled(not self.speech_evidence.blocked)
            if self.turn_timer:
                self.turn_timer.cancel()
            self.turn_timer = None
            if self.turn_mode == "manual":
                self.turn_timer = asyncio.get_running_loop().call_later(
                    90, self.idle_input
                )
        elif command == "end_turn":
            self.listening = False
            try:
                transcript = await self.session.commit_user_turn(transcript_timeout=8)
            finally:
                # SDK commit resolves before its turn-completed hook necessarily
                # runs. That hook must still be able to validate this capture.
                self.idle_input(preserve_speech=True)
            if not transcript.strip():
                raise ValueError("No speech was recognized")
        elif command == "cancel_turn":
            self.idle_input()
            self.session.clear_user_turn()
            self.session.interrupt(force=True)
            self.input.clear()
        elif command == "text":
            if not 1 <= len(payload) <= 2000:
                raise ValueError("Invalid message length")
            self.session.generate_reply(user_input=payload)
        elif command == "set_turn_mode":
            if payload not in {"auto", "manual"}:
                raise ValueError("Invalid turn mode")
            self.turn_mode = payload
            if self.turn_timer:
                self.turn_timer.cancel()
                self.turn_timer = None
            if self.listening and payload == "manual":
                self.turn_timer = asyncio.get_running_loop().call_later(
                    90, self.idle_input
                )
            self.session.update_options(
                turn_detection="stt" if payload == "auto" else "manual"
            )
        elif command == "set_audio_output":
            self.session.output.set_audio_enabled(payload == "on")
            if payload != "on":
                self.output.clear_buffer()
        elif command == "playback_finished":
            if not payload.isdecimal() or len(payload) > 12:
                raise ValueError("Invalid playback segment")
            self.output.acknowledge(int(payload))
        elif command != "get_conversation":
            raise ValueError("Unsupported native command")
        return self.refresh()

    async def close(self):
        # End, socket loss and persistence failure can overlap. All await the same
        # durable save/release, so none acknowledges a lease that is still held.
        if self.close_task is None:
            self.close_task = asyncio.create_task(self._close())
        await asyncio.shield(self.close_task)

    async def _close(self):
        self.closing = True
        self.output.clear_buffer()
        self.idle_input()
        tasks = [
            task for task in (self.saver, self.heartbeat, self.butler_updates) if task
        ]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            await self.session.aclose()
        finally:
            try:
                if self.persisted:
                    await self.persisted.release()
            finally:
                await asyncio.gather(
                    *(provider.aclose() for provider in self.providers.values()),
                    return_exceptions=True,
                )


def mount(server, factory=None, *, approval_events=None):
    if not settings.native_audio_enabled:
        return
    token = settings.text_api_token
    if not token:
        raise RuntimeError("Native audio requires the configured service token")
    factory = factory or partial(NativeSession, approval_events=approval_events)
    active = set()
    idle_seconds = settings.voice_idle_timeout

    @server.http.websocket("/chat/native")
    async def endpoint(socket: WebSocket):
        owner = socket.headers.get("X-Butler-User", "")
        selected = socket.headers.get("X-Butler-Conversation") or None
        if (
            not secrets.compare_digest(
                socket.headers.get("Authorization", ""), "Bearer " + token
            )
            or not re.fullmatch(r"[a-z0-9_-]{1,200}", owner)
            or (selected and len(selected) > 200)
            or len(active) >= 8
        ):
            await socket.close(code=1008)
            return
        slot = object()
        active.add(slot)
        speech = None
        pump = None
        idle = None
        receiving = None
        try:
            await socket.accept()
            events = asyncio.Queue(maxsize=512)

            async def send():
                while True:
                    event = await events.get()
                    try:
                        await socket.send_json(event)
                    finally:
                        events.task_done()

            pump = asyncio.create_task(send())
            async with utils.http_context.open():
                speech = factory(events.put_nowait, owner, selected)
                await speech.start()
                events.put_nowait(
                    {
                        "type": "ready",
                        "conversation_id": speech.conversation_id,
                        "items": speech.items,
                    }
                )

                async def disconnect_idle():
                    nonlocal speech
                    current = speech
                    await current.close()
                    speech = None
                    events.put_nowait(
                        {"type": "idle", "conversation_id": current.conversation_id}
                    )
                    # Preserve event order, but do not wait forever if the client
                    # disconnects and the sender has already stopped.
                    drained = asyncio.create_task(events.join())
                    try:
                        done, _ = await asyncio.wait(
                            [drained, pump],
                            timeout=5,
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                        if not done:
                            raise TimeoutError("Idle notice delivery timed out")
                        if pump in done:
                            await pump
                    finally:
                        drained.cancel()
                        await asyncio.gather(drained, return_exceptions=True)

                idle = SessionIdle(speech.session, idle_seconds, disconnect_idle)
                async with asyncio.timeout(1200):
                    while True:
                        receiving = asyncio.create_task(socket.receive())
                        await asyncio.wait(
                            [receiving, idle.task], return_when=asyncio.FIRST_COMPLETED
                        )
                        if idle.expired:
                            await idle.task
                            break
                        message = receiving.result()
                        receiving = None
                        if message["type"] == "websocket.disconnect":
                            break
                        if message.get("bytes") is not None:
                            speech.push(message["bytes"])
                            continue
                        raw = message.get("text") or ""
                        if len(raw) > 10000:
                            raise ValueError("Invalid command")
                        command = json.loads(raw)
                        if (
                            not isinstance(command, dict)
                            or set(command) - {"id", "type", "payload"}
                            or type(command.get("id")) is not int
                            or not isinstance(command.get("type"), str)
                            or not isinstance(command.get("payload", ""), str)
                            or len(command.get("payload", "")) > 2000
                        ):
                            raise ValueError("Invalid command")
                        if command["type"] == "close_session":
                            await speech.close()
                            speech = None
                            await socket.send_json(
                                {
                                    "type": "result",
                                    "id": command["id"],
                                    "result": {"saved": True},
                                }
                            )
                            break
                        if command["type"] in {
                            "start_turn",
                            "end_turn",
                            "cancel_turn",
                            "text",
                        }:
                            idle.touch()
                        try:
                            result = await speech.control(
                                command["type"], command.get("payload", "")
                            )
                            events.put_nowait(
                                {
                                    "type": "result",
                                    "id": command["id"],
                                    "result": result,
                                }
                            )
                        except (ValueError, RuntimeError):
                            events.put_nowait(
                                {
                                    "type": "result",
                                    "id": command["id"],
                                    "error": "Native speech request failed",
                                }
                            )
        except (
            ValueError,
            TimeoutError,
            asyncio.QueueFull,
            HTTPException,
            httpx.HTTPError,
            WebSocketDisconnect,
        ):
            if pump and not pump.done():
                await socket.send_json(
                    {
                        "type": "error",
                        "message": "Conversation unavailable. Reconnect to continue.",
                    }
                )
        finally:
            if receiving:
                receiving.cancel()
                await asyncio.gather(receiving, return_exceptions=True)
            if idle:
                await idle.aclose()
            try:
                if speech:
                    await speech.close()
            except Exception:
                logger.exception("Native session cleanup failed")
            if pump:
                pump.cancel()
                await asyncio.gather(pump, return_exceptions=True)
            active.discard(slot)
            try:
                await socket.close()
            except (RuntimeError, WebSocketDisconnect):
                pass
