"""Check fresh and legacy Compose/storage layouts without running services."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix="butler-migration-") as directory:
        root = Path(directory)
        shutil.copy2(ROOT / "docker-compose.yml", root / "docker-compose.yml")
        shutil.copy2(ROOT / ".env.example", root / ".env")
        for project in ("voice-worker", "household-service", "configuration-app"):
            source = ROOT / "apps" / project
            assert (source / "Dockerfile").is_file(), project
            target = root / "apps" / project
            target.mkdir(parents=True)
            shutil.copy2(source / "Dockerfile", target / "Dockerfile")
        for name in ("prompt.yaml", "mcp.yaml"):
            shutil.copy2(
                ROOT / "apps/voice-worker" / name, root / "apps/voice-worker" / name
            )

        def config(*extra):
            result = subprocess.run(
                [
                    "docker",
                    "compose",
                    "--project-directory",
                    str(root),
                    "--env-file",
                    str(root / ".env"),
                    *extra,
                    "config",
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
                env={
                    key: value
                    for key, value in os.environ.items()
                    if key
                    in {"PATH", "HOME", "DOCKER_CONFIG", "LANG", "LC_ALL", "TMPDIR"}
                },
            )
            return json.loads(result.stdout)

        def mounts(service):
            return {item["target"]: item["source"] for item in service["volumes"]}

        fresh = config()["services"]
        assert fresh["agent"]["build"]["context"] == str(root / "apps/voice-worker")
        assert fresh["ha-notify-scheduler"]["build"]["context"] == str(
            root / "apps/household-service"
        )
        assert mounts(fresh["agent"])["/data"] == str(root / "agent-data")
        assert mounts(fresh["agent"])["/app/prompt.yaml"] == str(
            root / "apps/voice-worker/prompt.yaml"
        )
        assert mounts(fresh["agent"])["/app/mcp.yaml"] == str(
            root / "apps/voice-worker/mcp.yaml"
        )
        assert mounts(fresh["ha-notify-scheduler"])["/data"] == str(
            root / "ha-notify-scheduler/data"
        )
        assert (
            fresh["agent"]["environment"]["SCHEDULER_URL"]
            == "http://ha-notify-scheduler:8080"
        )
        for name, port in (("agent", 8081), ("ha-notify-scheduler", 8080)):
            assert fresh[name]["ports"][0]["target"] == port

        # Existing state/override locations intentionally keep their legacy names.
        fixtures = {
            "agent-data/conversation-marker": b"synthetic conversation",
            "ha-notify-scheduler/data/scheduler-marker": b"synthetic task",
            "backend_butler/.data/config/household.md": b"synthetic household",
            "agent/prompt.local.yaml": b"instructions: synthetic override\n",
            "agent/mcp.local.yaml": b"servers: []\n",
        }
        for name, data in fixtures.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        with (root / ".env").open("a") as stream:
            stream.write(
                "\nAGENT_PROMPT=./agent/prompt.local.yaml\nAGENT_MCP_CONFIG=./agent/mcp.local.yaml\n"
            )
        legacy = config()["services"]
        agent_mounts = mounts(legacy["agent"])
        assert agent_mounts["/app/prompt.yaml"] == str(root / "agent/prompt.local.yaml")
        assert agent_mounts["/app/mcp.yaml"] == str(root / "agent/mcp.local.yaml")
        assert agent_mounts["/data"] == str(root / "agent-data")
        assert mounts(legacy["ha-notify-scheduler"])["/data"] == str(
            root / "ha-notify-scheduler/data"
        )
        for name, data in fixtures.items():
            assert (
                hashlib.sha256((root / name).read_bytes()).digest()
                == hashlib.sha256(data).digest()
            )

    manifest = json.loads(
        (ROOT / "custom_components/backend_butler/manifest.json").read_text()
    )
    package = json.loads((ROOT / "apps/dashboard-card/package.json").read_text())
    assert manifest["domain"] == "backend_butler"
    assert manifest["version"] == package["version"]
    assert (
        "slug: backend_butler"
        in (ROOT / "apps/configuration-app/config.yaml").read_text()
    )
    assert (
        "https://github.com/taylorsegell/backend-butler"
        in (ROOT / "repository.yaml").read_text()
    )
    print(
        "PASS: fresh Compose contexts/defaults; legacy data and overrides; "
        "unchanged ports/DNS; HACS/app identity and versions. "
        "No services started or production state used."
    )


if __name__ == "__main__":
    main()
