"""Fail-closed signaling checks, including bypass and unrelated-camera delegation."""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from homeassistant.components import websocket_api
from homeassistant.exceptions import Unauthorized

sys.path.insert(0, str(Path(__file__).parents[1]))
from custom_components.butler_native_audio_poc.camera import NativeAudioCamera
from custom_components.butler_native_audio_poc.sessions import (
    SessionRegistry,
    principal,
)
from custom_components.butler_native_audio_poc.signaling import COMMANDS, install


class Receiver:
    def __init__(self, _speech):
        self.peers = {"own-peer": object()}

    async def close(self):
        pass


@pytest.mark.asyncio
async def test_guard_binds_scheduled_tasks_and_delegates_unrelated_cameras():
    registry = SessionRegistry(Receiver)
    alice = await registry.open("alice")
    bob = await registry.open("bob")
    tasks = []

    async def scheduled():
        await asyncio.sleep(0)
        return principal.get()

    def original(_hass, _connection, _message):
        tasks.append(asyncio.create_task(scheduled()))

    hass = SimpleNamespace(
        data={websocket_api.DOMAIN: {name: (original, object()) for name in COMMANDS}}
    )
    install(hass, registry)
    connection = lambda user: SimpleNamespace(
        user=SimpleNamespace(id=user, is_active=True, system_generated=False)
    )
    handler = hass.data[websocket_api.DOMAIN][COMMANDS[1]][0]
    for session in [alice, bob]:
        handler(
            hass,
            connection(session.owner),
            {"type": COMMANDS[1], "entity_id": session.entity_id},
        )
    assert principal.get() is None
    assert await asyncio.gather(*tasks) == [("alice", alice.id), ("bob", bob.id)]
    with pytest.raises(Unauthorized):
        handler(
            hass, connection("bob"), {"type": COMMANDS[1], "entity_id": alice.entity_id}
        )
    handler(
        hass, connection("bob"), {"type": COMMANDS[1], "entity_id": "camera.unrelated"}
    )
    assert await tasks[-1] is None
    camera = NativeAudioCamera(alice)
    with pytest.raises(PermissionError):
        await camera.async_handle_async_webrtc_offer("unused", "peer", lambda _: None)
    with pytest.raises(PermissionError):
        await camera.async_on_webrtc_candidate("peer", None)
    await registry.shutdown()


def test_missing_upstream_handlers_fail_setup_without_exposing_endpoints():
    hass = SimpleNamespace(data={websocket_api.DOMAIN: {}})
    with pytest.raises(RuntimeError, match="unavailable"):
        install(hass, None)
    assert hass.data[websocket_api.DOMAIN] == {}
