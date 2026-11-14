"""A denied voice resume reports its error after joining the client's room."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest

import main


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "detail"),
    [(404, "no such conversation"), (409, "active in another session"), (None, None)],
)
async def test_denied_resume_connects_before_registering_error_rpc(
    monkeypatch, status, detail
):
    callbacks = {}
    participant = SimpleNamespace(publish_data=AsyncMock())

    def register(method):
        def capture(callback):
            callbacks[method] = callback
            return callback

        return capture

    participant.register_rpc_method = register

    class Room:
        name = "synthetic-denied-resume"
        connected = False

        @property
        def local_participant(self):
            if not self.connected:
                raise RuntimeError("cannot access local participant before connecting")
            return participant

    room = Room()

    async def connect():
        room.connected = True

    ctx = SimpleNamespace(
        room=room,
        job=SimpleNamespace(metadata=json.dumps({"user_id": "bob"})),
        connect=AsyncMock(side_effect=connect),
    )
    for name in ("TurnDetector", "STT", "TTS"):
        monkeypatch.setattr(main.inference, name, Mock())
    monkeypatch.setattr(main, "build_llm", Mock())
    monkeypatch.setattr(main, "AgentSession", Mock())
    monkeypatch.setattr(
        main, "HomeAssistantAgent", lambda **kwargs: SimpleNamespace(**kwargs)
    )
    if status is None:
        failure = RuntimeError("private storage implementation details")
    else:
        response = httpx.Response(
            status,
            json={"detail": detail},
            request=httpx.Request("POST", "http://authority/chat/voice/open"),
        )
        failure = httpx.HTTPStatusError(
            "denied", request=response.request, response=response
        )
    monkeypatch.setattr(main.RemoteSession, "open", AsyncMock(side_effect=failure))

    await main.entrypoint(ctx)

    ctx.connect.assert_awaited_once()
    participant.publish_data.assert_awaited_once()
    call = participant.publish_data.await_args
    assert call.kwargs == {"topic": "ha.conversation_error", "reliable": True}
    payload = json.loads(call.args[0])
    message = detail or "Conversation could not be opened. Reconnect to try again."
    assert payload == {"error": message, "message": message}
    assert json.loads(await callbacks["get_conversation"](None)) == payload
