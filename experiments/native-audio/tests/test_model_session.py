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

    async def start(self):
        pass

    def push(self, _data):
        pass

    async def control(self, kind, payload):
        if kind == "text":
            self.emit({"type": "conversation", "items": [{"text": payload}]})
        return {"items": []}

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_only_authenticated_single_lab_client_can_open_session():
    async with TestClient(
        TestServer(
            create_app({"LAB_SERVICE_TOKEN": "synthetic"}, FakeSpeech, lambda _: {})
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
