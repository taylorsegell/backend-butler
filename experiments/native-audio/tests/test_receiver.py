import asyncio
import importlib.util
from pathlib import Path

import av
import numpy as np
import pytest
from aiortc import AudioStreamTrack, RTCConfiguration, RTCPeerConnection

SOURCE = (
    Path(__file__).parents[1] / "custom_components/butler_native_audio_poc/receiver.py"
)
spec = importlib.util.spec_from_file_location("poc_receiver", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


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
async def test_real_webrtc_audio_is_decoded_into_livekit_frames_and_closed():
    receiver = module.Receiver()
    client = RTCPeerConnection(RTCConfiguration(iceServers=[]))
    client.addTrack(Tone())
    try:
        await receiver.arm("synthetic-alice")
        await client.setLocalDescription(await client.createOffer())
        answer = await receiver.offer(client.localDescription.sdp, "test-session")
        await client.setRemoteDescription(answer)
        async with asyncio.timeout(8):
            while receiver.stats["sdk_frames"] < 4:
                await asyncio.sleep(0.03)
        assert receiver.stats["samples"] > 0
        assert receiver.stats["peak"] > 0.05
        assert receiver.stats["sdk_frames"] > 0
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


@pytest.mark.asyncio
async def test_simultaneous_stops_dispose_audio_source_once():
    receiver = module.Receiver()

    class Source:
        closes = 0

        def clear_queue(self):
            pass

        async def aclose(self):
            self.closes += 1
            await asyncio.sleep(0)

    source = Source()
    receiver.source = source
    await asyncio.gather(receiver.close(), receiver.close())
    assert source.closes == 1
    assert receiver.source is None
    assert not receiver.stats["active"]
