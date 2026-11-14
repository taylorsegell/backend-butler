"""Generate the synthetic utterance for the opt-in real speech browser check."""

import argparse
import asyncio
import json
import wave
from pathlib import Path

from livekit.agents import utils
from model_session import models


async def generate(state):
    config = json.loads((state / "model-config.json").read_text())
    async with utils.http_context.open():
        providers = models(config)
        try:
            chunks = []
            rate = 0
            async for event in providers["tts"].synthesize("What is two plus two?"):
                frame = event.frame
                chunks.append(bytes(frame.data))
                rate = frame.sample_rate
            with wave.open(str(state / "synthetic-speech.wav"), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(b"".join(chunks))
            print("Generated synthetic speech sample; no microphone was used")
        finally:
            for provider in providers.values():
                await provider.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--state", type=Path, default=Path("/tmp/butler-native-audio-lab")
    )
    args = parser.parse_args()
    state = args.state.resolve()
    if (
        not state.is_relative_to("/tmp")
        or not (state / "BUTLER_NATIVE_AUDIO_POC").is_file()
    ):
        parser.error("Use a marked disposable lab directory")
    asyncio.run(generate(state))
