"""Protocol tests run in the worker environment; no model requests are made."""

import asyncio
import sys
from pathlib import Path

import aiohttp
import pytest
from aiohttp.test_utils import TestClient, TestServer

sys.path.insert(0, str(Path(__file__).parents[1]))
from model_session import NativeInput, SpeechSession, create_app


class FakeSpeech:
    closed = False

    def __init__(self, emit, _providers):
        self.emit = emit
        self.items = []

    async def start(self):
        pass

    def push(self, _data):
        self.emit({"type": "audio", "marker": self.items[-1]["text"]})

    async def control(self, kind, payload):
        if kind == "text":
            self.items.append({"text": payload})
            self.emit({"type": "conversation", "items": list(self.items)})
        return {"items": list(self.items)}

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_only_authenticated_single_lab_client_can_open_session():
    async with TestClient(
        TestServer(
            create_app(
                {"LAB_SERVICE_TOKEN": "synthetic"},
                FakeSpeech,
                lambda _: {},
                max_sessions=1,
            )
        )
    ) as client:
        with pytest.raises(aiohttp.WSServerHandshakeError) as error:
            await client.ws_connect("/session")
        assert error.value.status == 401
        ws = await client.ws_connect(
            "/session", headers={"Authorization": "Bearer synthetic"}
        )
        assert (await ws.receive_json())["type"] == "ready"
        with pytest.raises(aiohttp.WSServerHandshakeError) as error:
            await client.ws_connect(
                "/session", headers={"Authorization": "Bearer synthetic"}
            )
        assert error.value.status == 409
        await ws.send_json({"id": 1, "type": "text", "payload": "Synthetic hello"})
        assert (await ws.receive_json())["items"][0]["text"] == "Synthetic hello"
        assert (await ws.receive_json())["id"] == 1
        await ws.close()


def test_input_is_bounded_and_audio_is_rejected_outside_turn():
    speech = object.__new__(SpeechSession)
    speech.input = NativeInput()
    speech.listening = False
    speech.push(bytes(1920))
    assert speech.input.frames.empty()
    speech.listening = True
    speech.started = __import__("time").monotonic()
    with pytest.raises(ValueError):
        speech.push(bytes(19201))
    for _ in range(100):
        speech.push(bytes(1920))
    with pytest.raises(asyncio.QueueFull):
        speech.push(bytes(1920))
    speech.input.clear()
    assert speech.input.frames.empty()


@pytest.mark.asyncio
async def test_reply_output_reports_audio_and_playback_completion():
    from livekit import rtc
    from model_session import ReplyOutput

    events = []
    completed = []
    output = ReplyOutput(events.append)
    output.on("playback_finished", completed.append)
    await output.capture_frame(rtc.AudioFrame(bytes(960), 24000, 1, 480))
    output.flush()
    assert [event["type"] for event in events] == ["audio", "audio_end"]
    assert completed[0].interrupted is False
    await output.capture_frame(rtc.AudioFrame(bytes(960), 24000, 1, 480))
    output.clear_buffer()
    assert completed[-1].interrupted is True


@pytest.mark.asyncio
async def test_two_backend_connections_have_independent_transcripts_and_reply_streams():
    app = create_app(
        {"LAB_SERVICE_TOKEN": "synthetic"}, FakeSpeech, lambda _: {}, max_sessions=2
    )
    async with TestClient(TestServer(app)) as client:
        headers = {"Authorization": "Bearer synthetic"}
        alice = await client.ws_connect("/session", headers=headers)
        bob = await client.ws_connect("/session", headers=headers)
        assert (await alice.receive_json())["type"] == "ready"
        assert (await bob.receive_json())["type"] == "ready"
        for socket, marker in [(alice, "alice-private"), (bob, "bob-private")]:
            await socket.send_json(
                {
                    "id": 1,
                    "type": "text",
                    "payload": marker,
                    "session_id": "foreign-id-is-not-a-router",
                }
            )
            assert (await socket.receive_json())["items"] == [{"text": marker}]
            assert (await socket.receive_json())["result"]["items"] == [
                {"text": marker}
            ]
            await socket.send_bytes(bytes(1920))
            assert (await socket.receive_json()) == {"type": "audio", "marker": marker}
        await alice.close()
        await bob.send_json({"id": 2, "type": "get_conversation"})
        assert (await bob.receive_json())["result"]["items"] == [
            {"text": "bob-private"}
        ]
        await bob.close()


def test_prototype_model_factory_passes_explicit_voice_and_language(monkeypatch):
    from unittest.mock import Mock

    import model_session

    for name in ["STT", "LLM", "TTS"]:
        monkeypatch.setattr(model_session.inference, name, Mock())
    model_session.models(
        {"TTS_MODEL": "fishaudio/s2.1-pro", "TTS_VOICE": "chosen", "TTS_LANGUAGE": "en"}
    )
    options = model_session.inference.TTS.call_args.kwargs
    assert options["voice"] == "chosen"
    assert options["language"] == "en"
