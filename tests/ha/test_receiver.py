import asyncio

import av
import numpy as np
import pytest
from aiortc import AudioStreamTrack, RTCConfiguration, RTCPeerConnection

from custom_components.backend_butler.native_audio import receiver as module


class Tone(AudioStreamTrack):
    async def recv(self):
        frame = await super().recv()
        samples = (
            np.sin(np.arange(frame.samples) * 2 * np.pi * 440 / frame.sample_rate)
            * 12000
        ).astype(np.int16)
        result = av.AudioFrame.from_ndarray(
            samples.reshape(1, -1), format="s16", layout="mono"
        )
        result.sample_rate, result.pts, result.time_base = (
            frame.sample_rate,
            frame.pts,
            frame.time_base,
        )
        return result


@pytest.mark.asyncio
async def test_real_webrtc_audio_is_decoded_into_worker_pcm_and_closed():
    class Speech:
        def __init__(self):
            self.frames = []

        async def push(self, frame):
            self.frames.append(frame)

    speech = Speech()
    receiver = module.Receiver(speech)
    client = RTCPeerConnection(RTCConfiguration(iceServers=[]))
    client.addTrack(Tone())
    try:
        await receiver.arm("synthetic-alice")
        await client.setLocalDescription(await client.createOffer())
        answer = await receiver.offer(client.localDescription.sdp, "test-session")
        await client.setRemoteDescription(answer)
        async with asyncio.timeout(8):
            while receiver.stats["pcm_frames"] < 4:
                await asyncio.sleep(0.03)
        assert receiver.stats["samples"] > 0
        assert receiver.stats["peak"] > 0.05
        assert receiver.stats["pcm_frames"] > 0
        assert speech.frames and isinstance(speech.frames[0], bytes)
        assert receiver.owner == "synthetic-alice"
        await receiver.close()
        assert not receiver.peers
        assert receiver.stats["active"] is False
    finally:
        await client.close()
        await receiver.close()


@pytest.mark.asyncio
async def test_unarmed_video_and_overlapping_inputs_are_rejected():
    receiver = module.Receiver()
    with pytest.raises(ValueError, match="armed"):
        await receiver.offer("v=0\r\n", "s")
    await receiver.arm("synthetic-alice")
    with pytest.raises(ValueError, match="audio-only"):
        await receiver.offer("v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n", "s")
    with pytest.raises(ValueError, match="too large"):
        await receiver.offer("x" * 70000, "s")
    await receiver.close()
