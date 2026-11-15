"""Opt-in live contract test against only the disposable lab on localhost:18123."""

import asyncio
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from bridge_peer import NativePeer


@pytest.mark.asyncio
@pytest.mark.skipif(
    os.getenv("BUTLER_NATIVE_LAB") != "1", reason="start the disposable lab explicitly"
)
async def test_native_camera_signaling_reaches_sdk_audio_and_stops():
    peer = NativePeer()
    await peer.connect()
    try:
        opened = await peer.call("butler_native_audio_poc/open")
        prepared = await peer.call("butler_native_audio_poc/prepare")
        assert prepared["session_id"] == opened["session_id"]
        assert (
            prepared["entity_id"]
            == "camera.butler_native_audio_" + opened["session_id"]
        )
        assert prepared["experiment"] is True
        await peer.start()
        async with asyncio.timeout(8):
            while (stats := await peer.call("butler_native_audio_poc/status"))[
                "sdk_frames"
            ] < 4:
                await asyncio.sleep(0.03)
        assert stats["samples"] > 0
        assert stats["peak"] > 0.05
        await peer.stop()
        async with asyncio.timeout(3):
            while (await peer.call("butler_native_audio_poc/status"))["active"]:
                await asyncio.sleep(0.02)
    finally:
        await peer.close()
