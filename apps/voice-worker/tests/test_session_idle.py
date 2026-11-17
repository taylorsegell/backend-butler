"""No model calls: silence expires, work and actual conversation activity do not."""

import asyncio
from types import SimpleNamespace as Event
from unittest.mock import AsyncMock

import pytest
from livekit.rtc import EventEmitter

from session_idle import SessionIdle


@pytest.mark.asyncio
async def test_idle_expires_once_and_removes_listeners():
    session = EventEmitter()
    close = AsyncMock()
    guard = SessionIdle(session, 0.025, close)
    await asyncio.wait_for(guard.task, 1)
    close.assert_awaited_once()
    await guard.aclose()
    assert not session._events.get("agent_state_changed")


@pytest.mark.asyncio
async def test_text_or_speech_restarts_grace_but_empty_transcript_does_not():
    session = EventEmitter()
    close = AsyncMock()
    guard = SessionIdle(session, 0.08, close)
    try:
        await asyncio.sleep(0.05)
        session.emit("user_input_transcribed", Event(transcript="hello"))
        await asyncio.sleep(0.05)
        close.assert_not_awaited()
        session.emit("user_input_transcribed", Event(transcript=""))
        await asyncio.wait_for(guard.task, 1)
        close.assert_awaited_once()
    finally:
        await guard.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind,state", [("agent", "thinking"), ("agent", "speaking"), ("user", "speaking")]
)
async def test_active_work_finishes_before_idle_grace_starts(kind, state):
    session = EventEmitter()
    close = AsyncMock()
    guard = SessionIdle(session, 0.025, close)
    try:
        session.emit(kind + "_state_changed", Event(new_state=state))
        await asyncio.sleep(0.06)
        close.assert_not_awaited()
        session.emit(kind + "_state_changed", Event(new_state="listening"))
        await asyncio.wait_for(guard.task, 1)
        close.assert_awaited_once()
    finally:
        await guard.aclose()


@pytest.mark.asyncio
async def test_background_tools_and_deferred_replies_hold_session_open():
    session = EventEmitter()
    close = AsyncMock()
    guard = SessionIdle(session, 0.025, close)
    try:
        for ident in ["one", "two"]:
            session.emit(
                "tool_execution_updated",
                Event(
                    update=Event(
                        type="tool_call_started", function_call=Event(call_id=ident)
                    )
                ),
            )
        session.emit(
            "tool_execution_updated",
            Event(update=Event(type="tool_call_ended", call_id="one")),
        )
        await asyncio.sleep(0.06)
        close.assert_not_awaited()
        session.emit(
            "tool_execution_updated",
            Event(
                update=Event(
                    type="tool_reply_updated", speech_id="reply", status="scheduled"
                )
            ),
        )
        session.emit(
            "tool_execution_updated",
            Event(update=Event(type="tool_call_ended", call_id="two")),
        )
        await asyncio.sleep(0.06)
        close.assert_not_awaited()
        session.emit(
            "tool_execution_updated",
            Event(
                update=Event(
                    type="tool_reply_updated", speech_id="reply", status="completed"
                )
            ),
        )
        await asyncio.wait_for(guard.task, 1)
        close.assert_awaited_once()
    finally:
        await guard.aclose()


@pytest.mark.asyncio
async def test_shutdown_cancels_timeout_without_disconnecting_twice():
    session = EventEmitter()
    close = AsyncMock()
    guard = SessionIdle(session, 0.025, close)
    await guard.aclose()
    await asyncio.sleep(0.05)
    close.assert_not_awaited()


@pytest.mark.asyncio
async def test_closed_agent_cannot_leave_stale_busy_state_connected():
    session = EventEmitter()
    close = AsyncMock()
    guard = SessionIdle(session, 0.025, close)
    try:
        session.emit("agent_state_changed", Event(new_state="thinking"))
        session.emit("close", Event(reason="error"))
        await asyncio.wait_for(guard.task, 1)
        close.assert_awaited_once()
    finally:
        await guard.aclose()
