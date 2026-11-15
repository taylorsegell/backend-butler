import sys
from pathlib import Path

import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

sys.path.insert(0, str(Path(__file__).parents[1]))
from custom_components.butler_native_audio_poc.history import HistoryProxy, worker_url


@pytest.mark.parametrize(
    "url",
    [
        "http://homeassistant.local:8123",
        "http://127.0.0.1:8123",
        "https://example.com",
        "http://127.0.0.1:18954/other",
        "http://x:y@127.0.0.1:18954",
    ],
)
def test_worker_target_is_fixed_to_an_isolated_loopback_origin(url):
    with pytest.raises(ValueError):
        worker_url(url)


@pytest.mark.asyncio
async def test_owner_is_server_assigned_and_foreign_override_rejected():
    async def received(request):
        assert request.headers["Authorization"] == "Bearer synthetic-service"
        return web.json_response(
            dict(request.query) if request.method == "GET" else await request.json()
        )

    app = web.Application()
    app.router.add_get("/chat/history", received)
    app.router.add_post("/chat/switch", received)
    async with TestServer(app) as server:
        proxy = HistoryProxy(str(server.make_url("")).rstrip("/"), "synthetic-service")
        value = await proxy.request("alice", "history", {"conversation_id": "selected"})
        assert value["body"]["user"] == "alice"
        assert value["body"]["conversation_id"] == "selected"
        value = await proxy.request("bob", "switch", {"conversation_id": "selected"})
        assert value["body"]["user"] == "bob"
        for operation, data in [
            ("history", {"user": "alice"}),
            ("../voice/open", {}),
            ("history", {"conversation_id": ["bad"]}),
        ]:
            with pytest.raises(ValueError):
                await proxy.request("bob", operation, data)
