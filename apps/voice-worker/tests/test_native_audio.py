"""The optional native endpoint binds identity at the trusted bridge handshake."""

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from livekit.rtc import EventEmitter
from starlette.websockets import WebSocketDisconnect

import native_audio
from approvals import ApprovalStore


class NativeSession:
    def __init__(self, emit, person, selected):
        self.session = EventEmitter()
        self.person = person
        self.selected = selected
        self.items = []
        self.conversation_id = "owned-" + person

    async def start(self):
        pass

    def push(self, data):
        pass

    async def control(self, command, payload):
        return {"owner": self.person, "selected": self.selected}

    async def close(self):
        pass


def app(enabled=True):
    result = FastAPI()
    with patch.object(
        native_audio,
        "settings",
        SimpleNamespace(
            native_audio_enabled=enabled,
            text_api_token="service-token",
            voice_idle_timeout=120,
        ),
    ):
        native_audio.mount(SimpleNamespace(http=result), factory=NativeSession)
    return result


def test_disabled_by_default_and_rejects_non_service_credentials():
    with TestClient(app(False)) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/chat/native"):
                pass
    with TestClient(app()) as client:
        for token in ["", "person-token"]:
            with pytest.raises(WebSocketDisconnect):
                with client.websocket_connect(
                    "/chat/native",
                    headers={
                        "Authorization": "Bearer " + token,
                        "X-Butler-User": "alice",
                    },
                ):
                    pass


def test_identity_is_bound_to_socket_not_message_and_errors_do_not_leak_history():
    with TestClient(app()) as client:
        with client.websocket_connect(
            "/chat/native",
            headers={
                "Authorization": "Bearer service-token",
                "X-Butler-User": "alice",
                "X-Butler-Conversation": "chosen",
            },
        ) as socket:
            assert socket.receive_json()["conversation_id"] == "owned-alice"
            socket.send_json({"id": 1, "type": "get_conversation", "payload": ""})
            assert socket.receive_json()["result"]["owner"] == "alice"
            socket.send_json(
                {"id": 2, "type": "get_conversation", "payload": "", "user": "bob"}
            )
            error = socket.receive_json()
            assert error["type"] == "error"
            assert "bob" not in json.dumps(error)


def test_close_acknowledges_release_before_new_connection():
    closed = []

    class Session(NativeSession):
        async def close(self):
            closed.append(self.person)

    result = FastAPI()
    with patch.object(
        native_audio,
        "settings",
        SimpleNamespace(
            native_audio_enabled=True,
            text_api_token="service-token",
            voice_idle_timeout=120,
        ),
    ):
        native_audio.mount(SimpleNamespace(http=result), factory=Session)
    with TestClient(result) as client:
        with client.websocket_connect(
            "/chat/native",
            headers={"Authorization": "Bearer service-token", "X-Butler-User": "alice"},
        ) as socket:
            socket.receive_json()
            socket.send_json({"id": 1, "type": "close_session", "payload": ""})
            assert socket.receive_json()["result"]["saved"]
            assert closed == ["alice"]
    assert closed == ["alice"]


@pytest.mark.asyncio
async def test_active_native_call_reads_only_new_owner_updates(tmp_path):
    feed = ApprovalStore(tmp_path / "approvals.json")
    feed.note("alice", "Earlier update")
    generated = asyncio.Event()
    speech = native_audio.NativeSession.__new__(native_audio.NativeSession)
    speech.approval_events = feed.events
    speech.person, speech.selected = "alice", None
    speech.failed = speech.closing = False
    speech.close_task = None
    speech.providers = {}
    speech.output, speech.agent = Mock(), Mock()
    speech.idle_input, speech.refresh = Mock(), Mock()
    speech.save_loop = speech.heartbeat_loop = AsyncMock()
    speech.session = SimpleNamespace(
        start=AsyncMock(),
        save=AsyncMock(),
        aclose=AsyncMock(),
        input=Mock(),
        generate_reply=Mock(side_effect=lambda **_: generated.set()),
    )
    speech.agent.update_chat_ctx = AsyncMock()
    persisted = SimpleNamespace(session_id="owned-conversation", release=AsyncMock())

    with patch.object(
        native_audio.RemoteSession, "open", AsyncMock(return_value=persisted)
    ):
        await speech.start()
    try:
        feed.note("bob", "Another person's update")
        feed.note("alice", "Approval needed for the porch schedule.")
        await asyncio.wait_for(generated.wait(), 2)
        speech.session.generate_reply.assert_called_once_with(
            user_input="[update] butler: Approval needed for the porch schedule.",
            tool_choice="none",
        )
    finally:
        await speech.close()
    assert speech.butler_updates.cancelled()
    persisted.release.assert_awaited_once()


@pytest.mark.asyncio
async def test_persistence_failure_stops_agent_and_waits_for_release():
    speech = native_audio.NativeSession.__new__(native_audio.NativeSession)
    speech.failed = False
    speech.close_task = None
    speech.saver = speech.heartbeat = None
    speech.butler_updates = None
    speech.providers = {}
    speech.output = Mock()
    speech.idle_input = Mock()
    speech.emit = Mock()
    speech.session = SimpleNamespace(aclose=AsyncMock())
    releasing = asyncio.Event()
    finish = asyncio.Event()

    async def release():
        releasing.set()
        await finish.wait()

    speech.persisted = SimpleNamespace(release=AsyncMock(side_effect=release))
    speech.fail("Could not save")
    await asyncio.wait_for(releasing.wait(), 1)
    speech.session.aclose.assert_awaited_once()
    other = asyncio.create_task(speech.close())
    await asyncio.sleep(0)
    assert not other.done(), "overlapping close must wait for release"
    finish.set()
    await asyncio.gather(other, speech.failure_task)
    speech.persisted.release.assert_awaited_once()
    speech.emit.assert_called_once_with({"type": "error", "message": "Could not save"})


def test_idle_closes_after_save_and_polling_cannot_keep_socket_alive():
    import time

    saved = []
    closed = []

    class Session(NativeSession):
        async def start(self):
            self.items = list(saved)

        async def control(self, command, payload):
            if command == "text":
                self.items.append({"role": "user", "text": payload})
            return {"items": self.items}

        async def close(self):
            saved[:] = self.items
            closed.append(self.person)

    result = FastAPI()
    with patch.object(
        native_audio,
        "settings",
        SimpleNamespace(
            native_audio_enabled=True,
            text_api_token="service-token",
            voice_idle_timeout=0.06,
        ),
    ):
        native_audio.mount(SimpleNamespace(http=result), factory=Session)
    headers = {"Authorization": "Bearer service-token", "X-Butler-User": "alice"}
    with TestClient(result) as client:
        with client.websocket_connect("/chat/native", headers=headers) as socket:
            socket.receive_json()
            socket.send_json({"id": 1, "type": "text", "payload": "Keep this context"})
            socket.receive_json()
            for number in range(2, 30):
                time.sleep(0.015)
                socket.send_json({"id": number, "type": "get_conversation"})
                message = socket.receive_json()
                if message["type"] == "idle":
                    assert closed == ["alice"], "idle notice follows final save/release"
                    break
            else:
                pytest.fail("History polling kept the idle native session alive")
            with pytest.raises(WebSocketDisconnect):
                socket.receive_json()
        with client.websocket_connect("/chat/native", headers=headers) as socket:
            assert socket.receive_json()["items"] == [
                {"role": "user", "text": "Keep this context"}
            ]
            socket.send_json({"id": 1, "type": "close_session", "payload": ""})
            assert socket.receive_json()["result"]["saved"]
    assert closed == ["alice", "alice"]


@pytest.mark.asyncio
async def test_continuous_start_keeps_input_open_without_manual_deadline():
    speech = native_audio.NativeSession.__new__(native_audio.NativeSession)
    speech.failed = False
    speech.listening = False
    speech.turn_timer = None
    speech.turn_mode = "manual"
    speech.session = Mock()
    speech.agent = Mock()
    speech.input = Mock()
    speech.output = Mock()
    speech.speech_evidence = native_audio.SpeechEvidence()
    speech.resume_timer = None
    speech.providers = {"stt": object()}
    speech.refresh = lambda: {}
    await speech.control("set_turn_mode", "auto")
    await speech.control("start_turn")
    try:
        assert speech.turn_mode == "auto"
        assert speech.listening
        assert speech.turn_timer is None, (
            "continuous calls must not stop at the manual 90-second timer"
        )
        speech.session.input.set_audio_enabled.assert_called_with(True)
        speech.session.commit_user_turn.assert_not_called()
        await speech.control("cancel_turn")
        assert not speech.listening
        speech.session.input.set_audio_enabled.assert_called_with(False)
    finally:
        speech.idle_input()


@pytest.mark.asyncio
async def test_switch_to_auto_removes_pending_manual_capture_timer():
    speech = native_audio.NativeSession.__new__(native_audio.NativeSession)
    speech.failed = False
    speech.listening = True
    speech.turn_mode = "manual"
    speech.turn_timer = Mock()
    timer = speech.turn_timer
    speech.session = Mock()
    speech.refresh = lambda: {}
    await speech.control("set_turn_mode", "auto")
    assert speech.turn_timer is None
    timer.cancel.assert_called_once()
