"""Synthetic native-peer emulator using the real HA camera WebRTC protocol.

This exercises the transport, NOT iOS microphone hardware. It never calls browser
getUserMedia, opens Assist, accesses the household, or uses provider credentials.
"""

import asyncio
import json
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

STATE = Path("/tmp/butler-native-audio-lab")
URL = "http://127.0.0.1:18123"
ENTITY = "camera.butler_native_audio_poc"


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
    def __init__(self):
        self.counter = 0
        self.pending = {}
        self.pc = None
        self.subscription = None
        self.session_id = None
        self.signal_error = None

    async def connect(self):
        assert (STATE / "BUTLER_NATIVE_AUDIO_POC").is_file()
        auth = json.loads((STATE / "test-auth.json").read_text())
        self.client = aiohttp.ClientSession()
        try:
            async with self.client.post(
                URL + "/auth/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": auth["refresh_token"],
                    "client_id": URL + "/",
                },
            ) as response:
                if response.status != 200:
                    raise RuntimeError(
                        "Disposable lab login expired; recreate its test account"
                    )
                access_token = (await response.json())["access_token"]
            self.ws = await self.client.ws_connect(URL + "/api/websocket")
            assert (await self.ws.receive_json())["type"] == "auth_required"
            await self.ws.send_json({"type": "auth", "access_token": access_token})
            assert (await self.ws.receive_json())["type"] == "auth_ok"
            self.reader = asyncio.create_task(self._read())
            config = await self.call("get_config")
            assert config["location_name"] == "Butler Native Audio Lab"
        except BaseException:
            await self.client.close()
            raise

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

    async def call(self, kind, **payload):
        self.counter += 1
        number = self.counter
        future = asyncio.get_running_loop().create_future()
        self.pending[number] = future
        if kind == "camera/webrtc/offer":
            self.subscription = number
        await self.ws.send_json({"id": number, "type": kind, **payload})
        return await asyncio.wait_for(future, 15)

    async def start(self):
        self.pc = RTCPeerConnection(RTCConfiguration(iceServers=[]))
        self.pc.addTrack(SyntheticTone())
        await self.pc.setLocalDescription(await self.pc.createOffer())
        await self.call("camera/webrtc/get_client_config", entity_id=ENTITY)
        await self.call(
            "camera/webrtc/offer", entity_id=ENTITY, offer=self.pc.localDescription.sdp
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
    peer = NativePeer()
    await peer.connect()
    try:
        while line := await asyncio.to_thread(sys.stdin.readline):
            message = json.loads(line)
            try:
                if message["method"] == "start":
                    result = await peer.start()
                elif message["method"] == "stop":
                    await peer.stop()
                    result = None
                else:
                    result = await peer.call(message["method"])
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
