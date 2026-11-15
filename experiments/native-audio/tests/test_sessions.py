"""Adversarial ownership tests: foreign IDs are deliberately known, not guessed."""

import importlib.util
import sys
from pathlib import Path

import pytest

SOURCE = (
    Path(__file__).parents[1] / "custom_components/butler_native_audio_poc/sessions.py"
)
spec = importlib.util.spec_from_file_location("native_sessions", SOURCE)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


class Receiver:
    def __init__(self, speech):
        self.speech = speech
        self.closed = False

    async def close(self):
        self.closed = True


@pytest.mark.asyncio
async def test_foreign_known_ids_and_stale_sessions_never_resolve():
    registry = module.SessionRegistry(Receiver)
    alice = await registry.open("alice")
    bob = await registry.open("bob")
    assert alice.receiver is not bob.receiver
    assert alice.entity_id != bob.entity_id
    for owner, foreign in [("bob", alice), ("alice", bob)]:
        with pytest.raises(PermissionError):
            registry.owned(owner, foreign.id)
        with pytest.raises(PermissionError):
            registry.for_entity(owner, foreign.entity_id)
        with pytest.raises(PermissionError):
            await registry.close(owner, foreign.id)
    assert registry.owned("alice", alice.id) is alice
    await registry.close("alice", alice.id)
    replacement = await registry.open("alice")
    assert replacement.id != alice.id
    with pytest.raises(PermissionError):
        registry.owned("alice", alice.id)
    assert registry.owned("bob", bob.id) is bob
    assert not bob.receiver.closed
    await registry.shutdown()


@pytest.mark.asyncio
async def test_signaling_callbacks_require_matching_request_principal():
    registry = module.SessionRegistry(Receiver)
    alice = await registry.open("alice")
    with pytest.raises(PermissionError):
        alice.check_signaling()
    token = module.principal.set(("bob", alice.id))
    try:
        with pytest.raises(PermissionError):
            alice.check_signaling()
    finally:
        module.principal.reset(token)
    token = module.principal.set(("alice", alice.id))
    try:
        alice.check_signaling()
        await registry.close("alice", alice.id)
        with pytest.raises(PermissionError):
            alice.check_signaling()
    finally:
        module.principal.reset(token)


@pytest.mark.asyncio
async def test_parallel_opens_obey_per_user_limit():
    import asyncio

    registry = module.SessionRegistry(Receiver)
    results = await asyncio.gather(
        *(registry.open("alice") for _ in range(6)), return_exceptions=True
    )
    assert sum(isinstance(item, module.BridgeSession) for item in results) == 2
    assert sum(isinstance(item, ValueError) for item in results) == 4
    await registry.shutdown()


@pytest.mark.asyncio
async def test_close_revokes_immediately_then_waits_for_inflight_setup_cleanup():
    import asyncio

    registry = module.SessionRegistry(Receiver)
    session = await registry.open("alice")
    await session.operation_lock.acquire()
    closing = asyncio.create_task(registry.close("alice", session.id))
    await asyncio.sleep(0)
    with pytest.raises(PermissionError):
        registry.owned("alice", session.id)
    assert not session.receiver.closed
    session.operation_lock.release()
    await closing
    assert session.receiver.closed


@pytest.mark.asyncio
async def test_worker_idle_revokes_only_its_bridge_without_a_browser_cleanup():
    import asyncio
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    registry = module.SessionRegistry(
        Receiver,
        lambda _owner, _selected: SimpleNamespace(listeners=set(), close=AsyncMock()),
    )
    alice = await registry.open("alice")
    bob = await registry.open("bob")
    try:
        for listener in list(alice.speech.listeners):
            listener({"type": "idle"})
        async with asyncio.timeout(1):
            while not alice.receiver.closed:
                await asyncio.sleep(0)
        with pytest.raises(PermissionError):
            registry.owned("alice", alice.id)
        assert not bob.receiver.closed
        assert registry.owned("bob", bob.id) is bob
        alice.speech.close.assert_awaited_once()
    finally:
        await registry.shutdown()
