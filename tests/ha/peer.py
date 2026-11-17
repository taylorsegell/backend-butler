"""Synthetic native-peer emulator using the real HA camera WebRTC protocol.

This exercises the transport, NOT iOS microphone hardware. It never calls browser
getUserMedia, opens Assist, accesses the household, or uses provider credentials.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

import aiohttp
import av
import numpy as np
from aiortc import (
    AudioStreamTrack,
    RTCConfiguration,
    RTCPeerConnection,
    RTCSessionDescription,
)

STATE = Path("/tmp/butler-standard-package-check")
URL = "http://127.0.0.1:18125"
ENTITY = "camera.backend_butler_native_audio_"


class SyntheticTone(AudioStreamTrack):
    async def recv(self):
        frame = await super().recv()
        wave = (
            np.sin(np.arange(frame.samples) * 440 * 2 * np.pi / frame.sample_rate)
            * 10000
        ).astype(np.int16)
        result = av.AudioFrame.from_ndarray(
            wave.reshape(1, -1), format="s16", layout="mono"
        )
        result.sample_rate, result.pts, result.time_base = (
            frame.sample_rate,
            frame.pts,
            frame.time_base,
        )
        return result


class NativePeer:
    def __init__(self, state=STATE, url=URL, auth_file="test-auth.json"):
        self.state = Path(state)
        self.url = url
        self.auth_file = auth_file
        self.entity = ENTITY
        self.bridge_id = None
        self.counter = 0
        self.pending = {}
        self.pc = None
        self.subscription = None
        self.session_id = None
        self.signal_error = None
        self.event_subscription = None
        self.on_event = lambda _event: None

    async def connect(self):
        assert (self.state / "BUTLER_STANDARD_PACKAGE_CHECK").is_file()
        auth = json.loads((self.state / self.auth_file).read_text())
        self.client = aiohttp.ClientSession()
        try:
            async with self.client.post(
                self.url + "/auth/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": auth["refresh_token"],
                    "client_id": self.url + "/",
                },
            ) as response:
                if response.status != 200:
                    raise RuntimeError(
                        "Disposable lab login expired; recreate its test account"
                    )
                access_token = (await response.json())["access_token"]
            self.access_token = access_token
            self.ws = await self.client.ws_connect(self.url + "/api/websocket")
            assert (await self.ws.receive_json())["type"] == "auth_required"
            await self.ws.send_json({"type": "auth", "access_token": access_token})
            assert (await self.ws.receive_json())["type"] == "auth_ok"
            self.reader = asyncio.create_task(self._read())
            config = await self.call("get_config")
            assert config["location_name"] == "Butler Package Check"
        except BaseException:
            await self.client.close()
            raise

    async def api(self, method, path, data=None):
        async with self.client.request(
            method,
            self.url + "/api/" + path,
            json=data,
            headers={"Authorization": "Bearer " + self.access_token},
        ) as response:
            result = await response.json()
            if response.status >= 400:
                raise RuntimeError(str(response.status) + ": " + str(result))
            return result

    async def _read(self):
        async for message in self.ws:
            if message.type != aiohttp.WSMsgType.TEXT:
                continue
            value = message.json()
            if value.get("type") == "result":
                pending = self.pending.pop(value["id"], None)
                if pending and not pending.done():
                    if value["success"]:
                        pending.set_result(value.get("result"))
                    else:
                        pending.set_exception(
                            RuntimeError(
                                value.get("error", {}).get("code", "request_failed")
                            )
                        )
            elif value.get("type") == "event" and value.get("id") == self.subscription:
                event = value["event"]
                if event["type"] == "session":
                    self.session_id = event["session_id"]
                elif event["type"] == "answer" and self.pc:
                    await self.pc.setRemoteDescription(
                        RTCSessionDescription(event["answer"], "answer")
                    )
                elif event["type"] == "error":
                    self.signal_error = event.get("code", "signaling_failed")

            elif (
                value.get("type") == "event"
                and value.get("id") == self.event_subscription
            ):
                self.on_event(value["event"])

    async def call(self, kind, **payload):
        self.counter += 1
        number = self.counter
        future = asyncio.get_running_loop().create_future()
        self.pending[number] = future
        if kind == "backend_butler/native/events":
            self.event_subscription = number
        if (
            kind.startswith("backend_butler/native/")
            and kind
            not in {"backend_butler/native/open", "backend_butler/native/history"}
            and "session_id" not in payload
            and self.bridge_id
        ):
            payload["session_id"] = self.bridge_id
        await self.ws.send_json({"id": number, "type": kind, **payload})
        result = await asyncio.wait_for(future, 30)
        if kind == "backend_butler/native/open":
            self.bridge_id = result["session_id"]
        if kind == "backend_butler/native/prepare":
            self.entity = result["entity_id"]
        return result

    async def start(self):
        self.pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))
        self.pc.addTrack(SyntheticTone())
        await self.pc.setLocalDescription(await self.pc.createOffer())
        await self.call("camera/webrtc/get_client_config", entity_id=self.entity)
        self.subscription = self.counter + 1
        await self.call(
            "camera/webrtc/offer",
            entity_id=self.entity,
            offer=self.pc.localDescription.sdp,
        )
        async with asyncio.timeout(8):
            while (
                self.pc.iceConnectionState not in ("connected", "completed")
                or not self.session_id
            ):
                if self.signal_error:
                    raise RuntimeError(self.signal_error)
                await asyncio.sleep(0.02)
        return {"session_id": self.session_id}

    async def stop(self):
        if self.subscription is not None:
            await self.call("unsubscribe_events", subscription=self.subscription)
            self.subscription = None
        if self.pc:
            await self.pc.close()
            self.pc = None
        self.session_id = None

    async def close(self):
        try:
            await self.stop()
        finally:
            await self.ws.close()
            await self.reader
            await self.client.close()


async def main():
    state = Path(os.getenv("BUTLER_NATIVE_LAB_STATE", str(STATE))).resolve()
    port = int(os.getenv("BUTLER_NATIVE_LAB_PORT", "18125"))
    auth_file = os.getenv("BUTLER_NATIVE_AUTH_FILE", "test-auth.json")
    if (
        not state.is_relative_to("/tmp")
        or not 18123 <= port <= 65535
        or Path(auth_file).name != auth_file
    ):
        raise ValueError("Use only a marked disposable lab and local auth filename")
    peer = NativePeer(state, f"http://127.0.0.1:{port}", auth_file)
    await peer.connect()
    peer.on_event = lambda event: print(json.dumps({"event": event}), flush=True)
    try:
        while line := await asyncio.to_thread(sys.stdin.readline):
            message = json.loads(line)
            try:
                if isinstance(message["method"], dict) and message["method"].get("api"):
                    value = message["method"]
                    result = await peer.api(
                        value["verb"], value["path"], value.get("data")
                    )
                elif message["method"] == "unsubscribe_native_events":
                    result = await peer.call(
                        "unsubscribe_events", subscription=peer.event_subscription
                    )
                    peer.event_subscription = None
                elif message["method"] == "start":
                    result = await peer.start()
                elif message["method"] == "stop":
                    await peer.stop()
                    result = None
                else:
                    method = message["method"]
                    if isinstance(method, dict):
                        method = method.copy()
                        result = await peer.call(method.pop("type"), **method)
                    else:
                        result = await peer.call(method)
                print(json.dumps({"id": message["id"], "result": result}), flush=True)
            except (
                RuntimeError,
                TimeoutError,
                ValueError,
                aiohttp.ClientError,
            ) as error:
                print(
                    json.dumps(
                        {
                            "id": message["id"],
                            "error": type(error).__name__ + ": " + str(error),
                        }
                    ),
                    flush=True,
                )
    finally:
        await peer.close()


if __name__ == "__main__":
    asyncio.run(main())
