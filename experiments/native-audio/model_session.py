"""Loopback-only Butler speech session. No household clients, tools or persistence."""

import asyncio
import base64
import json
import logging
import secrets
import time
from pathlib import Path

from aiohttp import WSMsgType, web
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    TurnHandlingOptions,
    inference,
    io,
    utils,
)
from livekit.agents.llm import ChatMessage
from livekit.plugins import openai

PROMPT = """You are Butler, a warm, concise conversational assistant in an isolated
voice lab. Answer the person naturally in one or two short sentences. You have no
household access, tools, notifications, memory service or device controls. Never
claim to inspect or change any devices. If asked to control the house, explain
that this isolated session cannot do that. Remember this conversation only while
this session is open. Do not mention test telemetry unless asked."""


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


def models(config):
    gateway = {
        "base_url": config.get("LIVEKIT_INFERENCE_URL")
        or "https://agent-gateway.livekit.cloud/v1",
        "api_key": config.get("LIVEKIT_INFERENCE_API_KEY")
        or config.get("LIVEKIT_API_KEY"),
        "api_secret": config.get("LIVEKIT_INFERENCE_API_SECRET")
        or config.get("LIVEKIT_API_SECRET"),
    }
    llm_name = config.get("LLM_MODEL", "google/gemma-4-31b-it")
    llm = (
        openai.LLM(
            model=llm_name,
            base_url=config["LLM_BASE_URL"],
            api_key=config.get("LLM_API_KEY"),
            extra_body=json.loads(config.get("LLM_EXTRA_BODY") or "{}"),
        )
        if config.get("LLM_BASE_URL")
        else inference.LLM(llm_name, **gateway)
    )
    return {
        "stt": inference.STT(
            config.get("STT_MODEL", "assemblyai/universal-3-5-pro"),
            language=config.get("STT_LANGUAGE", "multi"),
            **gateway,
        ),
        "llm": llm,
        "tts": inference.TTS(
            config.get("TTS_MODEL", "fishaudio/s2.1-pro"),
            voice=config.get("TTS_VOICE", "5c353fdb312f4888836a9a5680099ef0"),
            **gateway,
        ),
    }


class SpeechSession:
    def __init__(self, emit, providers):
        self.emit = emit
        self.input = NativeInput()
        self.output = ReplyOutput(emit)
        self.session = AgentSession(
            **providers, turn_handling=TurnHandlingOptions(turn_detection="manual")
        )
        self.session.input.audio = self.input
        self.session.output.audio = self.output
        self.agent = Agent(instructions=PROMPT, tools=[], stt=None)
        self.recognizer = providers["stt"]
        self.turn_timer = None
        self.items = []
        self.listening = False
        self.started = 0

        @self.session.on("conversation_item_added")
        def item_added(event):
            item = event.item
            if (
                not isinstance(item, ChatMessage)
                or item.role not in ("user", "assistant")
                or not item.text_content
            ):
                return
            self.items.append(
                {
                    "kind": "message",
                    "id": item.id,
                    "role": "agent" if item.role == "assistant" else "user",
                    "text": item.text_content,
                    "ts": item.created_at * 1000,
                }
            )
            self.items = self.items[-100:]
            self.emit({"type": "conversation", "items": self.items})

        @self.session.on("agent_state_changed")
        def state(event):
            self.emit({"type": "state", "state": event.new_state})

        @self.session.on("error")
        def error(_event):
            self.emit(
                {
                    "type": "error",
                    "message": "The lab speech service failed. Please retry the turn.",
                }
            )

    async def start(self):
        await self.session.start(self.agent, record=False, session_host=False)
        self.session.input.set_audio_enabled(False)

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
        if self.listening and time.monotonic() - self.started < 90:
            self.input.frames.put_nowait(rtc.AudioFrame(data, 48000, 1, len(data) // 2))

    async def control(self, command, payload=""):
        if command == "start_turn":
            self.session.interrupt()
            self.session.clear_user_turn()
            self.input.clear()
            self.listening = True
            self.started = time.monotonic()
            self.agent.update_options(stt=self.recognizer)
            self.session.input.set_audio_enabled(True)
            if self.turn_timer:
                self.turn_timer.cancel()
            self.turn_timer = asyncio.get_running_loop().call_later(90, self.idle_input)
        elif command == "end_turn":
            self.listening = False
            # The SDK flushes recognition before replying; final words may arrive later.
            try:
                transcript = await self.session.commit_user_turn(transcript_timeout=8)
            finally:
                self.idle_input()
            if not transcript.strip():
                raise ValueError(
                    "No speech was recognized. Please speak, then Send again."
                )
        elif command == "cancel_turn":
            self.idle_input()
            self.session.clear_user_turn()
            self.session.interrupt()
            self.input.clear()
        elif command == "text":
            if not isinstance(payload, str) or not 1 <= len(payload) <= 2000:
                raise ValueError("Message must contain 1–2000 characters")
            self.session.generate_reply(user_input=payload, tool_choice="none")
        elif command == "set_turn_mode":
            self.session.update_options(
                turn_detection="stt" if payload == "auto" else "manual"
            )
        elif command == "set_audio_output":
            self.session.output.set_audio_enabled(payload == "on")
        elif command != "get_conversation":
            raise ValueError("Unsupported lab command")
        return {"items": self.items}

    async def close(self):
        self.idle_input()
        await self.session.aclose()


def create_app(config, factory=SpeechSession, provider_factory=models):
    app = web.Application(client_max_size=20000)
    active = set()

    async def session(request):
        expected = "Bearer " + config["LAB_SERVICE_TOKEN"]
        if not secrets.compare_digest(
            request.headers.get("Authorization", ""), expected
        ):
            raise web.HTTPUnauthorized()
        if active:
            raise web.HTTPConflict(text="Only one isolated lab session is allowed")
        active.add("session")
        socket = web.WebSocketResponse(max_msg_size=20000, heartbeat=20)
        speech = None
        pump = None
        providers = {}
        try:
            await socket.prepare(request)
            events = asyncio.Queue(maxsize=512)

            async def send_events():
                while True:
                    await socket.send_json(await events.get())

            pump = asyncio.create_task(send_events())
            async with utils.http_context.open():
                providers = provider_factory(config)
                speech = factory(events.put_nowait, providers)
                await speech.start()
                events.put_nowait({"type": "ready"})
                async with asyncio.timeout(1200):
                    async for message in socket:
                        if message.type == WSMsgType.BINARY:
                            speech.push(message.data)
                        elif message.type == WSMsgType.TEXT:
                            command = message.json()
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
                            except (ValueError, RuntimeError) as error:
                                events.put_nowait(
                                    {
                                        "type": "result",
                                        "id": command["id"],
                                        "error": str(error),
                                    }
                                )
                        else:
                            break
                await speech.close()
                speech = None
        except (TimeoutError, ValueError, asyncio.QueueFull):
            await socket.close(
                code=1008, message=b"Lab session expired or input limit reached"
            )
        finally:
            if speech:
                await speech.close()
            if pump:
                pump.cancel()
                await asyncio.gather(pump, return_exceptions=True)
            for provider in providers.values():
                await provider.aclose()
            active.clear()
        return socket

    app.router.add_get("/session", session)
    return app


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    config_path = args.config.resolve()
    if (
        not config_path.is_relative_to("/tmp")
        or not (config_path.parent / "BUTLER_NATIVE_AUDIO_POC").is_file()
    ):
        parser.error("Use only a marked disposable lab directory")
    config = json.loads(config_path.read_text())
    logging.basicConfig(level=logging.WARNING)
    web.run_app(create_app(config), host="127.0.0.1", port=18952, access_log=None)
