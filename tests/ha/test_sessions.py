"""Session ownership is independent of the linked history identity."""

import asyncio
import importlib
from unittest.mock import AsyncMock

import pytest


def registry():
    module = importlib.import_module(
        "custom_components.backend_butler.native_audio.sessions"
    )
    speech = AsyncMock()
    speech.listeners = set()
    return module, module.SessionRegistry(
        lambda _: AsyncMock(), lambda person, selected: speech
    )


@pytest.mark.asyncio
async def test_owner_and_history_identity_are_separate():
    module, store = registry()
    session = await store.open("ha-alice", "person-alice", "saved-conversation")
    assert session.person == "person-alice"
    assert store.owned("ha-alice", session.id) is session
    with pytest.raises(PermissionError):
        store.owned("ha-bob", session.id)
    with pytest.raises(PermissionError):
        store.for_entity("ha-bob", session.entity_id)
    with pytest.raises(PermissionError):
        session.check_signaling()
    token = module.principal.set(("ha-alice", session.id))
    try:
        session.check_signaling()
    finally:
        module.principal.reset(token)
    await store.close("ha-alice", session.id)
    with pytest.raises(PermissionError):
        store.owned("ha-alice", session.id)
    session.speech.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_close_revokes_before_waiting_for_inflight_operation():
    _, store = registry()
    session = await store.open("alice", "person-alice")
    await session.operation_lock.acquire()
    closing = asyncio.create_task(store.close("alice", session.id))
    await asyncio.sleep(0)
    assert session.closed and session.id not in store.sessions
    session.operation_lock.release()
    await closing


@pytest.mark.asyncio
async def test_limits_and_shutdown():
    _, store = registry()
    await store.open("alice", "alice")
    await store.open("alice", "alice")
    with pytest.raises(ValueError):
        await store.open("alice", "alice")
    await store.shutdown()
    assert not store.sessions


@pytest.mark.asyncio
async def test_partial_camera_add_failure_disposes_receiver_and_entity():
    module, _ = registry()
    receiver, speech, remove = AsyncMock(), AsyncMock(), AsyncMock()
    store = module.SessionRegistry(
        lambda _: receiver,
        lambda *_: speech,
        add=AsyncMock(side_effect=ValueError("entity add failed")),
        remove=remove,
    )
    with pytest.raises(ValueError, match="entity add failed"):
        await store.open("alice", "person-alice")
    assert not store.sessions
    receiver.close.assert_awaited_once()
    speech.close.assert_awaited_once()
    remove.assert_awaited_once()


@pytest.mark.asyncio
async def test_shutdown_revokes_every_session_if_one_worker_close_fails():
    module, _ = registry()

    def speech_for(person, _selected):
        speech = AsyncMock()
        speech.listeners = set()
        if person == "person-alice":
            speech.close.side_effect = ConnectionError("worker save unavailable")
        return speech

    store = module.SessionRegistry(lambda _: AsyncMock(), speech_for)
    alice = await store.open("alice", "person-alice")
    bob = await store.open("bob", "person-bob")
    with pytest.raises(ExceptionGroup, match="cleanup failed"):
        await store.shutdown()
    assert not store.sessions
    assert alice.closed and bob.closed
    bob.speech.close.assert_awaited_once()
