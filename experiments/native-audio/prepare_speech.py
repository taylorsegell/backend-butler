"""Create model-only lab configuration from explicitly supplied environment settings."""

import argparse
import json
import os
import secrets
from pathlib import Path

from dotenv import dotenv_values

KEYS = {
    "LIVEKIT_INFERENCE_URL",
    "LIVEKIT_INFERENCE_API_KEY",
    "LIVEKIT_INFERENCE_API_SECRET",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "LLM_MODEL",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_EXTRA_BODY",
    "STT_MODEL",
    "STT_LANGUAGE",
    "TTS_MODEL",
    "TTS_VOICE",
    "TTS_LANGUAGE",
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--state", type=Path, default=Path("/tmp/butler-native-audio-lab")
    )
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--speech-port", type=int, default=18952)
    args = parser.parse_args()
    if not 18952 <= args.speech_port <= 65535:
        parser.error("Use an isolated loopback speech port")
    state = args.state.resolve()
    if (
        not state.is_relative_to("/tmp")
        or not (state / "BUTLER_NATIVE_AUDIO_POC").is_file()
    ):
        parser.error("Use a marked disposable lab directory")
    values = dotenv_values(args.env_file) if args.env_file else os.environ
    config = {key: values[key] for key in KEYS if values.get(key)}
    if not (
        config.get("LIVEKIT_INFERENCE_API_KEY") or config.get("LIVEKIT_API_KEY")
    ) or not (
        config.get("LIVEKIT_INFERENCE_API_SECRET") or config.get("LIVEKIT_API_SECRET")
    ):
        parser.error("Configured LiveKit inference credentials are required")
    config["LAB_SERVICE_TOKEN"] = secrets.token_urlsafe(32)
    config["LAB_SPEECH_PORT"] = args.speech_port
    target = state / "model-config.json"
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(config, output)
    print("Created model-only lab configuration; no credentials printed")
