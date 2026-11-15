"""Run the real worker with synthetic HA and fresh history, never household state."""

import json
import secrets
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
STATE = Path("/tmp/butler-native-worker-lab")
HA_STATE = Path("/tmp/butler-native-users-lab")
WORKER_PYTHON = Path("/root/backend-butler/apps/voice-worker/.venv/bin/python")


def main():
    assert (HA_STATE / "BUTLER_NATIVE_AUDIO_POC").is_file()
    if STATE.exists() and not (STATE / "BUTLER_NATIVE_WORKER_LAB").is_file():
        raise ValueError("Refusing an unmarked directory")
    STATE.mkdir(mode=0o700, exist_ok=True)
    (STATE / "BUTLER_NATIVE_WORKER_LAB").touch()
    model = json.loads((HA_STATE / "model-config.json").read_text())
    env = {
        key: value
        for key, value in model.items()
        if key.startswith(("LIVEKIT_", "LLM_", "STT_", "TTS_"))
    }
    assert "LIVEKIT_URL" in env, (
        "The isolated worker needs the configured LiveKit connection"
    )
    agent_name_file = STATE / "agent-name.txt"
    if not agent_name_file.exists():
        agent_name_file.write_text("butler-native-history-" + secrets.token_hex(4))
    env.update(
        PATH="/usr/bin:/bin",
        PYTHONUNBUFFERED="1",
        PYTHON_DOTENV_DISABLED="1",
        TERM="dumb",
        PYTHONPATH=str(ROOT / "apps/voice-worker/src"),
        NATIVE_AUDIO_ENABLED="1",
        HTTP_HOST="127.0.0.1",
        HTTP_PORT="18954",
        AGENT_NAME=agent_name_file.read_text(),
        TEXT_API_TOKEN=model["LAB_SERVICE_TOKEN"],
        TEXT_DATA_DIR=str(STATE / "history"),
        HA_URL="http://127.0.0.1:18955",
        HA_TOKEN="synthetic-fixture-only",
        SCHEDULER_URL="http://127.0.0.1:18955",
        SCHEDULER_TOKEN="synthetic-fixture-only",
        MCP_CONFIG=str(STATE / "mcp.yaml"),
        PROMPT_FILE=str(STATE / "prompt.yaml"),
        CALLBACK_BASE_URL="",
    )
    prompt = yaml.safe_load((ROOT / "apps/voice-worker/prompt.yaml").read_text())
    prompt["instructions"] += (
        "\nThis is an isolated validation session. Only a synthetic read-only Test Lamp is available. You cannot control the household, send real notifications or schedule real tasks. Never claim you have done so."
    )
    (STATE / "prompt.yaml").write_text(yaml.safe_dump(prompt))
    (STATE / "mcp.yaml").write_text("servers: []\n")
    fixture = STATE / "fixture.py"
    fixture.write_text("""import json
from mcp.server.fastmcp import FastMCP
m = FastMCP('Native worker read-only fixture', host='127.0.0.1', port=18955, streamable_http_path='/api/mcp', stateless_http=True)
@m.tool(name='GetLiveContext')
def context():
 return json.dumps({'success':True,'result':'Synthetic test house\\n- names: Test Lamp\\n  domain: light\\n  state: off\\n  area: Test Room\\n'})
m.run(transport='streamable-http')
""")
    boot = STATE / "boot.py"
    boot.write_text("""import os
os.nice(10)
import main
main.server.update_options(num_idle_processes=0, load_threshold=float('inf'), drain_timeout=3, shutdown_process_timeout=3)
main.cli.run_app(main.server)
""")
    for name, command in [
        ("fixture", [str(WORKER_PYTHON), str(fixture)]),
        ("worker", [str(WORKER_PYTHON), str(boot), "start"]),
    ]:
        pidfile = STATE / (name + ".pid")
        if (
            pidfile.exists()
            and Path("/proc", pidfile.read_text().strip(), "cmdline").exists()
        ):
            print("Isolated", name, "already running")
            continue
        log = (STATE / (name + ".log")).open("ab")
        process = subprocess.Popen(
            command,
            cwd=STATE,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        pidfile.write_text(str(process.pid))
        print("Started isolated real-worker", name, process.pid)
    model["LAB_WORKER_URL"] = "http://127.0.0.1:18954"
    target = HA_STATE / "model-config.json"
    if not (HA_STATE / "model-config.before-worker.json").exists():
        (HA_STATE / "model-config.before-worker.json").write_bytes(target.read_bytes())
        (HA_STATE / "model-config.before-worker.json").chmod(0o600)
    target.write_text(json.dumps(model))
    target.chmod(0o600)


if __name__ == "__main__":
    main()
