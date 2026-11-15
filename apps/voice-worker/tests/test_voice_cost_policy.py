"""Exercise real RTC entrypoint wiring without joining rooms or calling models."""

import asyncio
import json
from dataclasses import replace
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from livekit.agents.llm import ChatContext
from livekit.rtc import EventEmitter

import main
from config import load_settings


def test_recording_is_opt_in_and_idle_timeout_is_bounded(monkeypatch):
    monkeypatch.delenv("CLOUD_AUDIO_RECORDING_ENABLED", raising=False)
    monkeypatch.delenv("VOICE_IDLE_TIMEOUT", raising=False)
    settings = load_settings()
    assert settings.cloud_audio_recording_enabled is False
    assert settings.voice_idle_timeout == 120
    monkeypatch.setenv("CLOUD_AUDIO_RECORDING_ENABLED", "true")
    assert load_settings().cloud_audio_recording_enabled is True
    for value in ["0", "-1", "nan", "inf"]:
        monkeypatch.setenv("VOICE_IDLE_TIMEOUT", value)
        with pytest.raises(SystemExit, match="VOICE_IDLE_TIMEOUT"):
            load_settings()


@pytest.mark.asyncio
@pytest.mark.parametrize("record_audio", [False, True])
@pytest.mark.parametrize("shutdown_mode", ["idle", "interrupt", "save_failure"])
async def test_rtc_idle_saves_releases_and_disconnects_entire_room(
    monkeypatch, record_audio, shutdown_mode
):
    interrupted = shutdown_mode == "interrupt"
    calls = []
    session = EventEmitter()
    session.start = AsyncMock()
    session.history = SimpleNamespace(items=[])
    session.agent_state = session.user_state = "listening"
    session.input = SimpleNamespace(set_audio_enabled=Mock())
    session.output = SimpleNamespace(set_audio_enabled=Mock())
    session.update_options = Mock()
    session.save = AsyncMock()
    saving = asyncio.Event()
    finish_save = asyncio.Event()
    if not interrupted:
        finish_save.set()

    async def close():
        calls.append("save-close")
        saving.set()
        await finish_save.wait()
        if shutdown_mode == "save_failure":
            raise RuntimeError("synthetic save failure")

    session.aclose = AsyncMock(side_effect=close)
    remote = SimpleNamespace(
        session_id="owned-conversation",
        earlier_usage={},
        heartbeat=AsyncMock(side_effect=asyncio.Event().wait),
        release=AsyncMock(side_effect=lambda: calls.append("release")),
    )
    agent = SimpleNamespace(
        user_id="alice",
        chat_ctx=ChatContext(),
        update_chat_ctx=AsyncMock(),
        update_options=Mock(),
    )
    room = EventEmitter()
    room.name = "ha-voice-test-only"
    room.local_participant = SimpleNamespace(
        publish_data=AsyncMock(),
        register_rpc_method=lambda _name: lambda callback: callback,
    )
    deleted = asyncio.Event()

    async def delete(request):
        assert request.room == room.name
        calls.append("delete-room")
        deleted.set()

    shutdown = []
    ctx = SimpleNamespace(
        room=room,
        job=SimpleNamespace(metadata=json.dumps({"user_id": "alice"})),
        connect=AsyncMock(),
        add_shutdown_callback=shutdown.append,
        api=SimpleNamespace(
            room=SimpleNamespace(delete_room=AsyncMock(side_effect=delete))
        ),
        shutdown=Mock(side_effect=lambda **_kwargs: calls.append("shutdown")),
    )
    for name in ["TurnDetector", "STT", "TTS"]:
        monkeypatch.setattr(main.inference, name, Mock())
    monkeypatch.setattr(main, "build_llm", Mock())
    monkeypatch.setattr(main, "AgentSession", Mock(return_value=session))
    monkeypatch.setattr(main, "HomeAssistantAgent", Mock(return_value=agent))
    monkeypatch.setattr(main.RemoteSession, "open", AsyncMock(return_value=remote))
    monkeypatch.setattr(main, "_forward_tool_events", Mock())
    monkeypatch.setattr(main, "_forward_butler_events", Mock())
    monkeypatch.setattr(
        main,
        "settings",
        replace(
            main.settings,
            voice_idle_timeout=0.03,
            cloud_audio_recording_enabled=record_audio,
        ),
    )
    try:
        await main.entrypoint(ctx)
        assert session.start.await_args.kwargs["record"] == {"audio": record_audio}
        assert session.start.await_args.kwargs["persist"] is remote
        if interrupted:
            await asyncio.wait_for(saving.wait(), 1)
            normal_close = asyncio.create_task(shutdown[0]())
            await asyncio.sleep(0)
            assert "release" not in calls
            finish_save.set()
            await asyncio.wait_for(normal_close, 1)
            assert calls == ["save-close", "release"]
        else:
            await asyncio.wait_for(deleted.wait(), 1)
            await asyncio.sleep(0)
            assert calls == ["save-close", "release", "delete-room", "shutdown"]
            topics = [
                call.kwargs.get("topic")
                for call in room.local_participant.publish_data.await_args_list
            ]
            assert ("ha.conversation_error" in topics) == (
                shutdown_mode == "save_failure"
            )
            assert ("ha.session_idle" in topics) == (shutdown_mode != "save_failure")
    finally:
        finish_save.set()
        for number, callback in enumerate(shutdown):
            if number == 0 and shutdown_mode == "save_failure":
                with pytest.raises(RuntimeError, match="synthetic save failure"):
                    await callback()
            else:
                await callback()
    session.aclose.assert_awaited_once()
    remote.release.assert_awaited_once()
