"""In-memory worker/scheduler contract fixture. No providers or household endpoints."""

import base64
import math
import struct
import uuid

from aiohttp import web

TOKEN = "synthetic-package-check-only"


class Service:
    def __init__(self):
        self.people = {}
        self.histories = {}
        self.current = {}
        self.opened = []
        self.pcm = {}
        self.closed = []
        self.sockets = {}
        self.warms = 0

    def history(self, person, selected=None):
        history = self.histories.setdefault(person, {})
        conversation = selected or self.current.get(person)
        if conversation and conversation not in history:
            raise web.HTTPForbidden()
        if not conversation:
            conversation = uuid.uuid4().hex
            history[conversation] = []
        self.current[person] = conversation
        return conversation, history[conversation]

    async def handle(self, request):
        if request.headers.get("Authorization") != "Bearer " + TOKEN:
            raise web.HTTPUnauthorized()
        path = request.path
        if path == "/users/resolve":
            return web.json_response(
                {"id": self.people.get(request.query.get("ha_user_id"))}
            )
        if path == "/settings":
            return web.json_response({"users": [], "servers": []})
        if path == "/tasks":
            return web.json_response([])
        if path.endswith("/approvals"):
            return web.json_response({"items": []})
        if path == "/chat/native":
            return await self.native(request)
        data = await request.json() if request.can_read_body else {}
        person = data.get("user") or request.query.get("user")
        if person not in self.people.values():
            raise web.HTTPForbidden()
        if path == "/chat/warm":
            self.warms += 1
            return web.json_response({})
        if path == "/chat/switch":
            self.current[person] = data["conversation_id"]
            return web.json_response({"switched": True})
        if path == "/chat/new" or (path == "/chat" and data.get("new")):
            self.current.pop(person, None)
        selected = data.get("conversation_id") or request.query.get("conversation_id")
        conversation, items = self.history(person, selected)
        if path == "/chat/conversations":
            return web.json_response(
                {
                    "current": conversation,
                    "conversations": [
                        {
                            "id": key,
                            "title": rows[0]["text"] if rows else "New conversation",
                            "created": 1,
                            "updated": 2,
                        }
                        for key, rows in self.histories[person].items()
                    ],
                }
            )
        return web.json_response(
            {"conversation_id": conversation, "items": items, "busy": False}
        )

    async def native(self, request):
        person = request.headers.get("X-Butler-User")
        if person not in self.people.values():
            raise web.HTTPForbidden()
        conversation, items = self.history(
            person, request.headers.get("X-Butler-Conversation")
        )
        self.opened.append((person, conversation))
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.sockets[person] = ws
        await ws.send_json(
            {"type": "ready", "conversation_id": conversation, "items": items}
        )

        async def reply(text):
            for role, content in [
                ("user", text),
                ("agent", "Synthetic reply for " + person),
            ]:
                items.append(
                    {
                        "kind": "message",
                        "id": uuid.uuid4().hex,
                        "role": role,
                        "text": content,
                        "ts": 1,
                    }
                )
            await ws.send_json(
                {
                    "type": "conversation",
                    "conversation_id": conversation,
                    "items": items,
                }
            )
            await ws.send_json({"type": "state", "state": "speaking"})
            pcm = b"".join(
                struct.pack("<h", int(math.sin(n * 440 * 2 * math.pi / 24000) * 5000))
                for n in range(2400)
            )
            await ws.send_json(
                {
                    "type": "audio",
                    "pcm": base64.b64encode(pcm).decode(),
                    "sample_rate": 24000,
                    "channels": 1,
                }
            )
            await ws.send_json({"type": "audio_end"})
            await ws.send_json({"type": "state", "state": "listening"})

        async for message in ws:
            if message.type == web.WSMsgType.BINARY:
                self.pcm[person] = self.pcm.get(person, 0) + len(message.data)
                continue
            if message.type != web.WSMsgType.TEXT:
                continue
            value = message.json()
            command = value["type"]
            if command in {"end_turn", "text"}:
                await reply(value.get("payload") or "Synthetic spoken question")
            await ws.send_json({"type": "result", "id": value["id"], "result": {}})
            if command == "close_session":
                self.closed.append((person, conversation))
                await ws.close()
        self.sockets.pop(person, None)
        return ws

    def app(self):
        app = web.Application()
        app.router.add_route("*", "/{path:.*}", self.handle)
        return app
