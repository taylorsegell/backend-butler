"""Real worker history/lease tests through two authenticated candidate HA users."""

import asyncio
import json
import os
import signal
import sys
from pathlib import Path

import aiohttp
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from bridge_peer import NativePeer

STATE = Path("/tmp/butler-native-users-lab")
URL = "http://127.0.0.1:18124"
DOMAIN = "butler_native_audio_poc/"


async def history(client, operation, **data):
    return await client.call(DOMAIN + "history", operation=operation, data=data)


async def wait_reply(client, marker, previous=0):
    async with asyncio.timeout(45):
        while True:
            value = await history(client, "history")
            assert value["status"] == 200
            items = value["body"]["items"]
            replies = [
                i for i in items if i["kind"] == "message" and i["role"] == "agent"
            ]
            if len(replies) > previous and marker.lower() in json.dumps(items).lower():
                return items
            await asyncio.sleep(0.08)


@pytest.mark.asyncio
async def test_real_worker_history_is_owned_persisted_and_resumed():
    alice, bob = [
        NativePeer(STATE, URL, name + "-auth.json") for name in ["alice", "bob"]
    ]
    await asyncio.gather(alice.connect(), bob.connect())
    try:
        conversations = []
        for client, marker in [(alice, "maple lantern"), (bob, "cobalt valley")]:
            created = await history(client, "send", new=True)
            assert created["status"] == 200
            listing = await history(client, "conversations")
            ident = listing["body"]["current"]
            conversations.append(ident)
            await client.call(DOMAIN + "open", conversation_id=ident)
            connected = await client.call(DOMAIN + "control", command="connect")
            assert connected["conversation_id"] == ident
            await client.call(
                DOMAIN + "control",
                command="text",
                payload="For this conversation, label the sample with these two words: "
                + marker
                + ". Reply briefly.",
            )
            items = await wait_reply(client, marker)
            assert marker in json.dumps(items).lower()
        a_id, b_id = conversations
        assert a_id != b_id
        for client, own, foreign in [(alice, a_id, b_id), (bob, b_id, a_id)]:
            listing = (await history(client, "conversations"))["body"]
            assert own in [i["id"] for i in listing["conversations"]]
            assert foreign not in [i["id"] for i in listing["conversations"]]
            assert (await history(client, "history", conversation_id=foreign))[
                "status"
            ] == 404
            assert (await history(client, "switch", conversation_id=foreign))["body"][
                "switched"
            ] is False
            assert (await history(client, "delete", conversation_id=foreign))["body"][
                "deleted"
            ] is False
        # A second audio session cannot acquire the same live conversation lease.
        duplicate = NativePeer(STATE, URL, "alice-auth.json")
        await duplicate.connect()
        try:
            await duplicate.call(DOMAIN + "open", conversation_id=a_id)
            with pytest.raises(RuntimeError, match="speech_failed"):
                await duplicate.call(DOMAIN + "control", command="connect")
        finally:
            await duplicate.close()
        for client in [alice, bob]:
            await client.call(DOMAIN + "control", command="disconnect")
        # Bob cannot acquire Alice's saved context by choosing a known conversation ID.
        await bob.call(DOMAIN + "open", conversation_id=a_id)
        with pytest.raises(RuntimeError, match="speech_failed"):
            await bob.call(DOMAIN + "control", command="connect")
        await bob.call(DOMAIN + "control", command="disconnect")
        await alice.call(DOMAIN + "open", conversation_id=a_id)
        restored = await alice.call(DOMAIN + "control", command="connect")
        text = json.dumps(restored["items"]).lower()
        assert "maple lantern" in text and "cobalt valley" not in text
        before = len([i for i in restored["items"] if i.get("role") == "agent"])
        await alice.call(
            DOMAIN + "control",
            command="text",
            payload="Repeat the two-word sample label from earlier in this conversation.",
        )
        resumed = await wait_reply(alice, "maple lantern", before)
        assert (
            "maple lantern"
            in [i["text"].lower() for i in resumed if i.get("role") == "agent"][-1]
        )
        await alice.call(DOMAIN + "control", command="disconnect")
        (STATE / "worker-history-proof.json").write_text(
            json.dumps({"alice": a_id, "bob": b_id})
        )
        print(
            "PASS: real worker history persisted/resumed, independent owners, foreign list/read/select/delete/lease denied, duplicate live lease rejected"
        )
    finally:
        await asyncio.gather(alice.close(), bob.close())


@pytest.mark.asyncio
async def test_worker_restart_retains_owned_history():
    worker_state = Path("/tmp/butler-native-worker-lab")
    assert (worker_state / "BUTLER_NATIVE_WORKER_LAB").is_file()
    pid = int((worker_state / "worker.pid").read_text())
    command = Path(f"/proc/{pid}/cmdline")
    assert str(worker_state / "boot.py").encode() in command.read_bytes().split(b"\0")
    os.kill(pid, signal.SIGTERM)
    async with asyncio.timeout(20):
        while command.exists() and command.read_bytes():
            await asyncio.sleep(0.1)
    process = await asyncio.create_subprocess_exec(
        "/root/backend-butler/apps/voice-worker/.venv/bin/python",
        str(Path(__file__).parents[1] / "start_worker_lab.py"),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await process.communicate()
    assert process.returncode == 0
    assert int((worker_state / "worker.pid").read_text()) != pid
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=1)) as http:
        async with asyncio.timeout(30):
            while True:
                try:
                    async with http.get("http://127.0.0.1:18954/") as response:
                        if response.status < 500:
                            break
                except aiohttp.ClientError:
                    pass
                await asyncio.sleep(0.1)
    proof = json.loads((STATE / "worker-history-proof.json").read_text())
    for label, own_marker, foreign_marker in [
        ("alice", "maple lantern", "cobalt valley"),
        ("bob", "cobalt valley", "maple lantern"),
    ]:
        client = NativePeer(STATE, URL, label + "-auth.json")
        await client.connect()
        try:
            await client.call(DOMAIN + "open", conversation_id=proof[label])
            restored = await client.call(DOMAIN + "control", command="connect")
            text = json.dumps(restored["items"]).lower()
            assert own_marker in text and foreign_marker not in text
            assert restored["conversation_id"] == proof[label]
            before = len([i for i in restored["items"] if i.get("role") == "agent"])
            await client.call(
                DOMAIN + "control",
                command="text",
                payload="Repeat the two-word sample label from earlier in this conversation.",
            )
            replies = await wait_reply(client, own_marker, before)
            assert (
                own_marker
                in [i["text"].lower() for i in replies if i.get("role") == "agent"][-1]
            )
            await client.call(DOMAIN + "control", command="disconnect")
        finally:
            await client.close()
