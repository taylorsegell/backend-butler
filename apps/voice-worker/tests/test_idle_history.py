"""Actual SDK/SQLite history survives an idle close with no cloud/model services."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from livekit.agents import Agent, AgentSession, TurnHandlingOptions, utils

import voice_persistence as voice
from conversations import Conversations
from session_idle import SessionIdle


@pytest.mark.asyncio
async def test_idle_close_saves_actual_sdk_context_and_releases_for_resume(
    tmp_path, monkeypatch
):
    conversations = Conversations(tmp_path)
    monkeypatch.setattr(voice, "conversations", conversations)
    authority = voice.VoiceAuthority(
        lambda _owner: SimpleNamespace(
            busy=False, _lock=asyncio.Lock(), _close_client=AsyncMock()
        )
    )

    async def request(path, data):
        if path == "open":
            return await authority.open(data["user"], data["conversation_id"])
        return await authority.update(
            data["user"],
            data["id"],
            data["lease"],
            data["record"],
            release=path == "release",
            usage=data["usage"],
        )

    monkeypatch.setattr(voice.RemoteSession, "request", staticmethod(request))
    session = AgentSession(
        vad=None, turn_handling=TurnHandlingOptions(turn_detection="manual")
    )
    remote = await voice.RemoteSession.open("alice", None)
    guard = None
    try:
        async with utils.http_context.open():
            agent = Agent(instructions="Synthetic persistence check", id="idle-test")
            await session.start(
                agent, persist=remote, record={"audio": False}, session_host=False
            )
            assert session._opts.recording_options["audio"] is False
            session.history.add_message(
                role="user", content="My sample is silver badger"
            )
            session.history.add_message(role="assistant", content="silver badger")
            await agent.update_chat_ctx(session.history.copy())

            async def close():
                await session.aclose()
                await remote.release()

            guard = SessionIdle(session, 0.025, close)
            await asyncio.wait_for(guard.task, 2)
            assert not authority.leases
            assert remote.closed
            restored = await voice.RemoteSession.open("alice", remote.session_id)
            assert [
                i.text_content
                for i in restored.record.history
                if i.type == "message" and i.role != "system"
            ] == ["My sample is silver badger", "silver badger"]
            assert "silver badger" in str(restored.record.agents)
            await restored.release()
    finally:
        if guard:
            await guard.aclose()
        await session.aclose()
        await remote.release()
        for task in authority.watchdogs:
            task.cancel()
        await asyncio.gather(*authority.watchdogs, return_exceptions=True)
        for ident in list(authority.leases):
            await authority._release(ident)
        await conversations.store.aclose()
