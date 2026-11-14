"""The launcher must refuse ordinary configurations and concurrent runtime writes."""

import fcntl
import subprocess
import sys
from pathlib import Path

import pytest

LAUNCHER = Path(__file__).parents[1] / "run.py"


@pytest.mark.parametrize("arguments", [["--state", "/etc"], ["--port", "8123"]])
def test_household_paths_and_ports_are_rejected(arguments):
    result = subprocess.run(
        [sys.executable, str(LAUNCHER), *arguments, "--prepare-only"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2


def test_existing_unmarked_directory_is_not_modified(tmp_path):
    result = subprocess.run(
        [sys.executable, str(LAUNCHER), "--state", str(tmp_path), "--prepare-only"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2
    assert not list(tmp_path.iterdir())


def test_active_lab_lock_prevents_preparing_runtime_files(tmp_path):
    (tmp_path / "BUTLER_NATIVE_AUDIO_POC").touch()
    with (tmp_path / ".lab.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = subprocess.run(
            [sys.executable, str(LAUNCHER), "--state", str(tmp_path), "--prepare-only"],
            check=False,
            capture_output=True,
            text=True,
        )
    assert result.returncode == 2
    assert "running" in result.stderr
    assert not (tmp_path / "configuration.yaml").exists()
