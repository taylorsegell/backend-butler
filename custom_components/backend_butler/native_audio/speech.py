"""Authenticated worker relay; credentials remain on the HA server."""

import asyncio
from contextlib import suppress

import aiohttp


class SpeechRelay:
    def __init__(self, client, token, worker_url, *, owner, conversation_id=None):
        self.owner = owner
        self.selected = conversation_id
        self.conversation_id = None
        self.worker_url = worker_url
        self.closed = False
        self.idle = False
        self.token = token
        self.lock = asyncio.Lock()
        self.client = client
        self.socket = None
        self.reader = None
        self.ready = None
        self.pending = {}
        self.sequence = 0
        self.listeners = set()
        self.items = []
        self.state = "idle"

    async def connect(self):
        async with self.lock:
            if self.closed:
                raise ConnectionError("Audio session is closed")
            if self.socket and not self.socket.closed:
                return
            try:
                headers = {"Authorization": "Bearer " + self.token}
                url = self.worker_url + "/chat/native"
                headers["X-Butler-User"] = self.owner
                if self.selected:
                    headers["X-Butler-Conversation"] = self.selected
                self.socket = await self.client.ws_connect(
                    url,
                    headers=headers,
                    max_msg_size=200000,
                    heartbeat=20,
                )
                self.items = []
                self.idle = False
                self.ready = asyncio.get_running_loop().create_future()
                self.reader = asyncio.create_task(self._read())
                await asyncio.wait_for(asyncio.shield(self.ready), 30)
            except BaseException:
                if self.socket:
                    await self.socket.close()
                raise

    async def _read(self):
        try:
            async for message in self.socket:
                if message.type != aiohttp.WSMsgType.TEXT:
                    continue
                event = message.json()
                kind = event.get("type")
                if kind == "ready":
                    self.conversation_id = event.get("conversation_id")
                    self.selected = self.conversation_id
                    self.items = event.get("items", [])
                    if not self.ready.done():
                        self.ready.set_result(True)
                elif kind == "result":
                    future = self.pending.pop(event.get("id"), None)
                    if future and not future.done():
                        if "error" in event:
                            future.set_exception(ValueError(event["error"]))
                        else:
                            future.set_result(event["result"])
                else:
                    if kind == "idle":
                        self.idle = True
                    if kind == "conversation":
                        self.items = event["items"]
                    if kind == "state":
                        self.state = event["state"]
                    self.publish(event)
        finally:
            error = ConnectionError("The Butler speech session disconnected")
            if self.ready and not self.ready.done():
                self.ready.set_exception(error)
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(error)
            self.pending.clear()
            if not self.idle and not self.closed:
                self.publish({"type": "error", "message": str(error)})

    def publish(self, event):
        for listener in list(self.listeners):
            listener(event)

    async def control(self, kind, payload=""):
        await self.connect()
        self.sequence += 1
        number = self.sequence
        future = asyncio.get_running_loop().create_future()
        self.pending[number] = future
        try:
            await self.socket.send_json(
                {"id": number, "type": kind, "payload": payload}
            )
            return await asyncio.wait_for(future, 20)
        finally:
            self.pending.pop(number, None)

    async def push(self, frame):
        if not self.socket or self.socket.closed:
            raise ConnectionError("The Butler speech session is unavailable")
        await self.socket.send_bytes(frame)

    async def close(self):
        self.closed = True
        try:
            if (
                self.worker_url
                and not self.idle
                and self.socket
                and not self.socket.closed
                and self.ready
                and self.ready.done()
                and not self.ready.cancelled()
                and self.ready.exception() is None
            ):
                self.sequence += 1
                number = self.sequence
                future = asyncio.get_running_loop().create_future()
                self.pending[number] = future
                try:
                    await self.socket.send_json(
                        {"id": number, "type": "close_session", "payload": ""}
                    )
                    await asyncio.wait_for(future, 20)
                finally:
                    self.pending.pop(number, None)
        finally:
            if self.socket:
                await self.socket.close()
            if self.reader:
                with suppress(asyncio.CancelledError):
                    await self.reader
