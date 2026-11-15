"""Idle server shutdown is a normal event, not a speech failure or reconnect loop."""

import asyncio
import sys
from pathlib import Path

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

sys.path.insert(0, str(Path(__file__).parents[1]))
from custom_components.butler_native_audio_poc.speech import SpeechRelay


@pytest.mark.asyncio
async def test_idle_notice_closes_without_failure_or_extra_close_handshake():
    commands = []

    async def serve(request):
        socket = web.WebSocketResponse()
        await socket.prepare(request)
        await socket.send_json({"type": "ready", "conversation_id": "owned", "items": []})
        await asyncio.sleep(0.02)
        await socket.send_json({"type": "idle", "conversation_id": "owned"})
        async for message in socket:
            commands.append(message.data)
        return socket

    app = web.Application()
    app.router.add_get("/chat/native", serve)
    async with TestServer(app) as server:
        relay = SpeechRelay("synthetic", owner="alice", worker_url=str(server.make_url("")).rstrip("/"))
        events = asyncio.Queue()
        relay.listeners.add(events.put_nowait)
        try:
            await relay.connect()
            event = await asyncio.wait_for(events.get(), 1)
            assert event["type"] == "idle"
            await asyncio.wait_for(relay.close(), 1)
            assert relay.closed
            assert events.empty(), "normal idle close must not publish a speech error"
            assert commands == [], "idle already saved/released; do not send another close"
        finally:
            if not relay.closed:
                await relay.close()
