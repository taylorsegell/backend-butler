"""Model configuration never copies household or tool credentials."""

import json
import stat
import subprocess
import sys
from pathlib import Path


def test_only_model_settings_are_written_privately_and_never_overwritten(tmp_path):
    script = Path(__file__).parents[1] / "prepare_speech.py"
    (tmp_path / "BUTLER_NATIVE_AUDIO_POC").touch()
    source = tmp_path / "supplied.env"
    source.write_text(
        "LIVEKIT_INFERENCE_API_KEY=synthetic-key\nLIVEKIT_INFERENCE_API_SECRET=synthetic-secret\nHA_TOKEN=excluded\nSCHEDULER_TOKEN=excluded\nMEM0_API_KEY=excluded\n"
    )
    command = [
        sys.executable,
        str(script),
        "--state",
        str(tmp_path),
        "--env-file",
        str(source),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    assert result.returncode == 0
    target = tmp_path / "model-config.json"
    config = json.loads(target.read_text())
    assert set(config) == {
        "LIVEKIT_INFERENCE_API_KEY",
        "LIVEKIT_INFERENCE_API_SECRET",
        "LAB_SERVICE_TOKEN",
        "LAB_SPEECH_PORT",
    }
    assert stat.S_IMODE(target.stat().st_mode) == 0o600
    assert "synthetic-key" not in result.stdout + result.stderr
    repeated = subprocess.run(command, check=False, capture_output=True, text=True)
    assert repeated.returncode != 0
    assert json.loads(target.read_text()) == config
