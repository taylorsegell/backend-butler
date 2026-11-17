"""Bounded audio-only native capture; PCM stays in memory and is relayed to LiveKit.

Companion speaks HA camera WebRTC; the worker owns the LiveKit AgentSession.
"""

import asyncio
from array import array
from contextlib import suppress
from time import monotonic

import av
from aiortc import RTCConfiguration, RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamError
from aiortc.sdp import candidate_from_sdp


class Receiver:
    def __init__(self, speech=None):
        self.speech = speech
        self.lock = asyncio.Lock()
        self.expiry = None
        self.owner = None
        self.peers = {}
        self.tasks = set()
        self.armed_until = 0.0
        self.stats = self._empty_stats()

    @staticmethod
    def _empty_stats():
        return {
            "active": False,
            "frames": 0,
            "pcm_frames": 0,
            "samples": 0,
            "peak": 0.0,
        }

    async def arm(self, owner, *, continuous=False):
        async with self.lock:
            await self._arm(owner, 1200 if continuous else 90)

    async def _arm(self, owner, seconds):
        await self._close()
        self.owner = owner
        self.armed_until = monotonic() + seconds
        self.stats = self._empty_stats()
        self.expiry = asyncio.get_running_loop().call_later(
            seconds, lambda: asyncio.create_task(self.close())
        )

    async def offer(self, sdp, session_id):
        async with self.lock:
            return await self._offer(sdp, session_id)

    async def _offer(self, sdp, session_id):
        if not self.owner or monotonic() >= self.armed_until:
            raise ValueError("Receiver must be armed by its owner")
        if len(sdp) > 65536:
            raise ValueError("Offer is too large")
        if "\nm=video " in sdp or not "\nm=audio " in sdp:
            raise ValueError("Only audio-only offers are accepted")
        if self.peers:
            raise ValueError("An input is already connected")
        peer = RTCPeerConnection(RTCConfiguration(iceServers=[]))
        self.peers[session_id] = peer

        @peer.on("track")
        def track_received(track):
            if track.kind != "audio":
                track.stop()
                return
            task = asyncio.create_task(self._receive(track))
            self.tasks.add(task)
            task.add_done_callback(self.tasks.discard)

        try:
            await peer.setRemoteDescription(
                RTCSessionDescription(sdp=sdp, type="offer")
            )
            await peer.setLocalDescription(await peer.createAnswer())
        except Exception:
            await self._close()
            raise
        return peer.localDescription

    async def candidate(self, session_id, candidate):
        peer = self.peers.get(session_id)
        if peer is None:
            raise ValueError("Unknown audio session")
        value = candidate.get("candidate", "")
        if not value:
            await peer.addIceCandidate(None)
            return
        parsed = candidate_from_sdp(value.removeprefix("candidate:"))
        parsed.sdpMid = candidate.get("sdpMid")
        parsed.sdpMLineIndex = candidate.get("sdpMLineIndex")
        await peer.addIceCandidate(parsed)

    async def _receive(self, track):
        resampler = av.AudioResampler(format="s16", layout="mono", rate=48000)
        try:
            while monotonic() < self.armed_until:
                frame = await asyncio.wait_for(track.recv(), timeout=5)
                self.stats["active"] = True
                self.stats["frames"] += 1
                for converted in resampler.resample(frame):
                    data = converted.to_ndarray().tobytes()
                    if self.speech:
                        await self.speech.push(data)
                    self.stats["pcm_frames"] += 1
                    self.stats["samples"] += converted.samples
                    self.stats["peak"] = (
                        max(abs(value) for value in array("h", data)) / 32768
                    )
        except (MediaStreamError, TimeoutError, ConnectionError):
            pass
        finally:
            self.stats["active"] = False

    async def close(self):
        async with self.lock:
            await self._close()

    async def _close(self):
        if self.expiry:
            self.expiry.cancel()
            self.expiry = None
        self.armed_until = 0
        peers, self.peers = self.peers, {}
        for task in list(self.tasks):
            task.cancel()
        for task in list(self.tasks):
            with suppress(asyncio.CancelledError):
                await task
        await asyncio.gather(*(peer.close() for peer in peers.values()))
        self.stats["active"] = False
