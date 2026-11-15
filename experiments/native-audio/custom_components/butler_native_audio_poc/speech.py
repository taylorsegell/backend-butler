"""Authenticated loopback bridge; only the disposable HA server sees its secret."""

import asyncio
from contextlib import suppress

import aiohttp


class SpeechRelay:
    def __init__(self, token, port=18952):
        if not isinstance(port, int) or not 18952 <= port <= 65535:
            raise ValueError("Use an isolated loopback speech port")
        self.port = port
        self.closed = False
        self.token = token
        self.lock = asyncio.Lock()
        self.client = None
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
            if self.client:
                await self.client.close()
            self.client = aiohttp.ClientSession()
            try:
                self.socket = await self.client.ws_connect(
                    f"http://127.0.0.1:{self.port}/session",
                    headers={"Authorization": "Bearer " + self.token},
                    max_msg_size=200000,
                    heartbeat=20,
                )
                self.items = []
                self.ready = asyncio.get_running_loop().create_future()
                self.reader = asyncio.create_task(self._read())
                await asyncio.wait_for(asyncio.shield(self.ready), 30)
            except BaseException:
                await self.client.close()
                raise

    async def _read(self):
        try:
            async for message in self.socket:
                if message.type != aiohttp.WSMsgType.TEXT:
                    continue
                event = message.json()
                kind = event.get("type")
                if kind == "ready":
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
                    if kind == "conversation":
                        self.items = event["items"]
                    if kind == "state":
                        self.state = event["state"]
                    self.publish(event)
        finally:
            error = ConnectionError("The isolated speech session disconnected")
            if self.ready and not self.ready.done():
                self.ready.set_exception(error)
            for future in self.pending.values():
                if not future.done():
                    future.set_exception(error)
            self.pending.clear()
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
            raise ConnectionError("The isolated speech session is unavailable")
        await self.socket.send_bytes(bytes(frame.data))

    async def close(self):
        self.closed = True
        if self.socket:
            await self.socket.close()
        if self.reader:
            with suppress(asyncio.CancelledError):
                await self.reader
        if self.client:
            await self.client.close()
