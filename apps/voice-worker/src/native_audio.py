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

import httpx
from fastapi import HTTPException, WebSocket, WebSocketDisconnect
from livekit import rtc
from livekit.agents import AgentSession, TurnHandlingOptions, inference, io, utils
from livekit.agents.metrics import LLMModelUsage

from agent import HomeAssistantAgent
from config import settings
from history import render
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
    def __init__(self, emit):
        super().__init__(
            label="lab-reply", capabilities=io.AudioOutputCapabilities(pause=False)
        )
        self.emit_event = emit
        self.duration = 0

    async def capture_frame(self, frame):
        await super().capture_frame(frame)
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
        self.emit_event({"type": "audio_end"})
        self.on_playback_finished(playback_position=self.duration, interrupted=False)
        self.duration = 0

    def clear_buffer(self):
        super().flush()
        self.emit_event({"type": "audio_clear"})
        if self._pending_playback_count:
            self.on_playback_finished(playback_position=0, interrupted=True)
        self.duration = 0


class NativeSession:
    def __init__(self, emit, person, selected):
        self.emit = emit
        self.person = person
        self.selected = selected
        self.persisted = None
        self.saver = None
        self.heartbeat = None
        self.dirty = asyncio.Event()
        self.failed = False
        self.closing = False
        self.close_task = None
        self.failure_task = None
        self.input = NativeInput()
        self.output = ReplyOutput(emit)
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
            turn_handling=TurnHandlingOptions(turn_detection="manual"),
            max_tool_steps=settings.max_tool_steps,
        )
        self.session.input.audio = self.input
        self.session.output.audio = self.output
        self.agent = HomeAssistantAgent(user_id=person)
        self.agent.update_options(stt=None)
        self.items = []
        self.conversation_id = None
        self.listening = False
        self.turn_timer = None

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

    def idle_input(self):
        self.listening = False
        self.session.input.set_audio_enabled(False)
        self.agent.update_options(stt=None)
        if self.turn_timer:
            self.turn_timer.cancel()
            self.turn_timer = None

    def push(self, data):
        if len(data) > 19200 or len(data) % 2:
            raise ValueError("Invalid PCM frame")
        if self.listening and not self.failed:
            self.input.frames.put_nowait(rtc.AudioFrame(data, 48000, 1, len(data) // 2))

    async def control(self, command, payload=""):
        if self.failed:
            raise ValueError("Conversation unavailable; reconnect to continue")
        if command == "start_turn":
            self.session.interrupt()
            self.session.clear_user_turn()
            self.input.clear()
            self.agent.update_options(stt=self.providers["stt"])
            self.listening = True
            self.session.input.set_audio_enabled(True)
            if self.turn_timer:
                self.turn_timer.cancel()
            self.turn_timer = asyncio.get_running_loop().call_later(90, self.idle_input)
        elif command == "end_turn":
            self.listening = False
            try:
                transcript = await self.session.commit_user_turn(transcript_timeout=8)
            finally:
                self.idle_input()
            if not transcript.strip():
                raise ValueError("No speech was recognized")
        elif command == "cancel_turn":
            self.idle_input()
            self.session.clear_user_turn()
            self.session.interrupt()
            self.input.clear()
        elif command == "text":
            if not 1 <= len(payload) <= 2000:
                raise ValueError("Invalid message length")
            self.session.generate_reply(user_input=payload)
        elif command == "set_turn_mode":
            self.session.update_options(
                turn_detection="stt" if payload == "auto" else "manual"
            )
        elif command == "set_audio_output":
            self.session.output.set_audio_enabled(payload == "on")
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
        self.idle_input()
        tasks = [task for task in [self.saver, self.heartbeat] if task]
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


def mount(server, factory=None):
    if not settings.native_audio_enabled:
        return
    token = settings.text_api_token
    if not token:
        raise RuntimeError("Native audio requires the configured service token")
    factory = factory or NativeSession
    active = set()

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
        try:
            await socket.accept()
            events = asyncio.Queue(maxsize=512)

            async def send():
                while True:
                    await socket.send_json(await events.get())

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
                async with asyncio.timeout(1200):
                    while True:
                        message = await socket.receive()
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
