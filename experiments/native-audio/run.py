"""Prepare and run a disposable HA instance, never the household configuration."""

import argparse
import fcntl
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--state", default="/tmp/butler-native-audio-lab")
parser.add_argument("--bind", default="127.0.0.1")
parser.add_argument("--port", type=int, default=18123)
parser.add_argument("--prepare-only", action="store_true")
parser.add_argument("--stop", action="store_true")
parser.add_argument(
    "--speech", action="store_true", help="Enable the separate loopback speech service"
)
args = parser.parse_args()
state = Path(args.state).resolve()
if not state.is_relative_to("/tmp") or state == Path("/tmp"):
    parser.error("Runtime state must be in a dedicated /tmp directory")
if not 18123 <= args.port <= 65535:
    parser.error("Use an isolated unprivileged port, at least 18123")
if state.exists() and not (state / "BUTLER_NATIVE_AUDIO_POC").is_file():
    parser.error("Refusing to reuse a directory without the disposable lab marker")
if args.stop:
    import signal

    pid = int((state / "lab.pid").read_text())
    command = Path(f"/proc/{pid}/cmdline")
    if command.exists():
        parts = command.read_bytes().split(b"\0")
        if parts[:5] != [
            sys.executable.encode(),
            b"-m",
            b"homeassistant",
            b"--config",
            str(state).encode(),
        ]:
            parser.error("PID does not belong to this disposable lab")
        os.kill(pid, signal.SIGTERM)
    print("Stopped only the disposable audio lab")
    raise SystemExit(0)
pid_file = state / "lab.pid"
if pid_file.exists():
    old_pid = int(pid_file.read_text())
    if Path(f"/proc/{old_pid}").exists():
        parser.error(
            "Lab PID is still running; stop this lab before preparing its files"
        )
state.mkdir(mode=0o700, parents=True, exist_ok=True)
(state / "BUTLER_NATIVE_AUDIO_POC").touch()
# Hold the same filesystem lock across exec, even when /proc is namespaced.
lab_lock = (state / ".lab.lock").open("a")
try:
    fcntl.flock(lab_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    parser.error("Disposable lab is running; stop it before changing runtime files")
os.set_inheritable(lab_lock.fileno(), True)

if args.speech:
    if not (state / "model-config.json").is_file():
        parser.error("Prepare the private model-only configuration first")
    (state / "BUTLER_NATIVE_SPEECH").touch()
else:
    (state / "BUTLER_NATIVE_SPEECH").unlink(missing_ok=True)
root = Path(__file__).resolve().parent
component = state / "custom_components/butler_native_audio_poc"
component.mkdir(parents=True, exist_ok=True)
(component.parent / "__init__.py").touch()
for source in (root / "custom_components/butler_native_audio_poc").glob("*"):
    if source.is_file():
        shutil.copyfile(source, component / source.name)
subprocess.run(
    [
        "node",
        str(root / "build.cjs"),
        str(component / "frontend"),
        *(["--speech"] if args.speech else []),
    ],
    check=True,
)
# JSON is also valid YAML and avoids interpolating arbitrary shell/config text.

configuration = {
    "homeassistant": {
        "name": "Butler Native Audio Lab",
        "latitude": 0,
        "longitude": 0,
        "elevation": 0,
        "unit_system": "metric",
        "time_zone": "UTC",
    },
    "frontend": {},
    "config": {},
    "api": {},
    "mobile_app": {},
    "lovelace": {"mode": "yaml"},
    "butler_native_audio_poc": {"enabled": True},
    "logger": {
        "default": "warning",
        "logs": {"custom_components.butler_native_audio_poc": "info"},
    },
}
# Seed only this disposable fixture's HTTP store before HA starts. YAML HTTP
# settings otherwise enter HA's five-minute trial/restart flow on first boot.
# The schema is pinned with HA 2026.11.1; this never opens a household store.
storage = state / ".storage"
storage.mkdir(exist_ok=True)
http_config = {
    "server_port": args.port,
    "server_host": list(dict.fromkeys(["127.0.0.1", args.bind])),
    "cors_allowed_origins": [],
    "login_attempts_threshold": 5,
    "ip_ban_enabled": True,
    "ssl_profile": "intermediate_v6",
    "use_x_frame_options": True,
    "created_at": datetime.now(UTC).isoformat(),
    "error": None,
    "error_message": None,
}
http_store = {
    "version": 3,
    "minor_version": 1,
    "key": "http",
    "data": {
        "stable": http_config,
        "pending": None,
        "yaml_migration_done": True,
    },
}
http_target = storage / "http"
http_target.write_text(json.dumps(http_store, indent=2))
http_target.chmod(0o600)
(state / "configuration.yaml").write_text(json.dumps(configuration, indent=2))
(state / "ui-lovelace.yaml").write_text(
    json.dumps(
        {
            "title": "Butler Audio Lab",
            "views": [
                {
                    "title": "Butler",
                    "path": "butler",
                    "panel": True,
                    "cards": [{"type": "custom:backend-butler-native-poc"}],
                },
            ],
        }
    )
)
print(
    f"Disposable audio lab: http://{args.bind}:{args.port}/lovelace/butler", flush=True
)
print(
    f"State: {state}. No household configuration or credentials are used.", flush=True
)
if not args.prepare_only:
    (state / "lab.pid").write_text(str(os.getpid()))
    os.chdir(state)
    os.execv(
        sys.executable, [sys.executable, "-m", "homeassistant", "--config", str(state)]
    )
