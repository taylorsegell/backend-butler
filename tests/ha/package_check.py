"""Install the standard component into a fresh disposable HA; no live services.

Run with the HA test requirements installed. Always allocates a fresh /tmp config,
uses only 127.0.0.1, and terminates only its own child HA process on exit.
"""

import asyncio
import json
import os
import secrets
import shutil
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from aiohttp import ClientSession, web
from fixture_service import TOKEN, Service
from peer import NativePeer

ROOT = Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:18125"
DOMAIN = "backend_butler/native/"


async def wait(predicate, seconds=60):
    async with asyncio.timeout(seconds):
        while not await predicate():
            await asyncio.sleep(0.1)


async def onboard(state):
    async with ClientSession() as client:

        async def ready():
            try:
                async with client.get(BASE + "/api/onboarding") as response:
                    return response.status == 200
            except OSError:
                return False

        await wait(ready)
        credentials = {
            "username": "package-admin",
            "password": secrets.token_urlsafe(24),
        }
        async with client.post(
            BASE + "/api/onboarding/users",
            json={
                **credentials,
                "name": "Package Test",
                "client_id": BASE + "/",
                "language": "en",
            },
        ) as response:
            assert response.status == 200
            code = (await response.json())["auth_code"]
        async with client.post(
            BASE + "/auth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": BASE + "/",
            },
        ) as response:
            credentials.update(await response.json())
        target = state / "test-auth.json"
        target.write_text(json.dumps(credentials))
        target.chmod(0o600)
        for step, data in [
            ("core_config", {}),
            ("analytics", {}),
            ("integration", {"client_id": BASE + "/", "redirect_uri": BASE + "/"}),
        ]:
            async with client.post(
                BASE + "/api/onboarding/" + step,
                json=data,
                headers={"Authorization": "Bearer " + credentials["access_token"]},
            ) as response:
                assert response.status in (200, 403)


async def provision(admin, state, label):
    credentials = {"username": label, "password": secrets.token_urlsafe(24)}
    user = (
        await admin.call("config/auth/create", name=label, group_ids=["system-users"])
    )["user"]
    await admin.call(
        "config/auth_provider/homeassistant/create", user_id=user["id"], **credentials
    )
    async with ClientSession() as client:
        async with client.post(
            BASE + "/auth/login_flow",
            json={
                "client_id": BASE + "/",
                "handler": ["homeassistant", None],
                "redirect_uri": BASE + "/",
            },
        ) as response:
            flow = await response.json()
        async with client.post(
            BASE + "/auth/login_flow/" + flow["flow_id"],
            json={"client_id": BASE + "/", **credentials},
        ) as response:
            code = (await response.json())["result"]
        async with client.post(
            BASE + "/auth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": BASE + "/",
            },
        ) as response:
            credentials.update(await response.json())
    target = state / (label + "-auth.json")
    target.write_text(json.dumps(credentials))
    target.chmod(0o600)
    return user["id"]


async def checks(state, service):
    admin = NativePeer(state, BASE)
    await admin.connect()
    peers = []
    try:
        for label in ["alice", "bob"]:
            user = await provision(admin, state, label)
            service.people[user] = "person-" + label
        service.people[(await admin.call("auth/current_user"))["id"]] = "person-admin"
        flow = await admin.api(
            "POST", "config/config_entries/flow", {"handler": "backend_butler"}
        )
        result = await admin.api(
            "POST",
            "config/config_entries/flow/" + flow["flow_id"],
            {
                "livekit_url": "wss://synthetic.invalid",
                "api_key": "synthetic",
                "api_secret": "synthetic" * 5,
                "chat_url": "http://127.0.0.1:18964",
                "chat_token": TOKEN,
                "scheduler_url": "http://127.0.0.1:18964",
                "scheduler_token": TOKEN,
                "native_audio_enabled": True,
            },
        )
        assert result["type"] == "create_entry", result
        entry_id = result["result"]["entry_id"]

        async def enabled():
            return (await admin.api("GET", "backend_butler/native/config"))["enabled"]

        await wait(enabled)
        # HA must serve the packaged artwork rather than its missing-icon placeholder.
        for image in ["icon.png", "icon@2x.png", "dark_icon.png", "dark_icon@2x.png"]:
            async with admin.client.get(
                BASE + "/api/brands/integration/backend_butler/" + image + "?placeholder=no",
                headers={"Authorization": "Bearer " + admin.access_token},
            ) as response:
                assert response.status == 200, (image, response.status)
                assert await response.read() == (
                    state / "custom_components/backend_butler/brand" / image
                ).read_bytes()
        print("PASS: packaged light/dark Butler icons served through HA's authenticated brands API")
        for label in ["alice", "bob"]:
            peer = NativePeer(state, BASE, label + "-auth.json")
            await peer.connect()
            peers.append(peer)
            assert not (await peer.call("auth/current_user"))["is_admin"]
            await peer.call(DOMAIN + "open")
            await peer.call(DOMAIN + "events")
            await peer.call(DOMAIN + "prepare")
            await peer.start()

        async def audio():
            return all(
                service.pcm.get("person-" + label, 0) > 9600
                for label in ["alice", "bob"]
            )

        await wait(audio, 10)
        rtc_token = await peers[0].api(
            "POST", "backend_butler/token", {"input_mode": "push_to_talk"}
        )
        assert rtc_token["serverUrl"] == "wss://synthetic.invalid"
        assert rtc_token["participantToken"].count(".") == 2
        attacks = 0
        for attacker, victim in [peers, peers[::-1]]:
            messages = [
                (DOMAIN + action, {"session_id": victim.bridge_id})
                for action in ["prepare", "stop", "events"]
            ]
            messages += [
                (
                    DOMAIN + "control",
                    {"session_id": victim.bridge_id, "command": action},
                )
                for action in [
                    "connect",
                    "disconnect",
                    "text",
                    "get_conversation",
                    "start_turn",
                    "end_turn",
                    "cancel_turn",
                    "playback_finished",
                    "set_audio_output",
                ]
            ]
            messages += [
                ("camera/webrtc/get_client_config", {"entity_id": victim.entity}),
                (
                    "camera/webrtc/offer",
                    {
                        "entity_id": victim.entity,
                        "offer": attacker.pc.localDescription.sdp,
                    },
                ),
                (
                    "camera/webrtc/candidate",
                    {
                        "entity_id": victim.entity,
                        "session_id": victim.session_id,
                        "candidate": {"candidate": ""},
                    },
                ),
                (
                    "camera/webrtc/candidate",
                    {
                        "entity_id": attacker.entity,
                        "session_id": victim.session_id,
                        "candidate": {"candidate": ""},
                    },
                ),
            ]
            for kind, payload in messages:
                try:
                    await attacker.call(kind, **payload)
                except RuntimeError as error:
                    assert str(error) == "unauthorized", (kind, str(error))
                else:
                    raise AssertionError("Foreign access accepted: " + kind)
                attacks += 1
        for peer, label in zip(peers, ["alice", "bob"]):
            await peer.call(
                DOMAIN + "control", command="text", payload=label + " private question"
            )
            await peer.stop()
            await peer.call(DOMAIN + "control", command="disconnect")
            history = await peer.api("GET", "backend_butler/chat/history")
            assert any(
                row["text"] == label + " private question" for row in history["items"]
            )
            assert all(
                ("bob" if label == "alice" else "alice") not in row["text"]
                for row in history["items"]
            )
            assert ("person-" + label, history["conversation_id"]) in service.closed
        print(
            f"PASS: standard config entry, real HA camera signaling/PCM, {attacks} cross-user attacks denied, shared history person mapping and close acknowledgement"
        )
        if os.getenv("BUTLER_PACKAGE_BROWSER") == "1":
            environment = {
                **os.environ,
                "BUTLER_PACKAGE_STATE": str(state),
                "BUTLER_PACKAGE_PYTHON": sys.executable,
            }
            process = await asyncio.create_subprocess_exec(
                "node", str(ROOT / "tests/ha/package_browser.cjs"), env=environment
            )
            assert await process.wait() == 0
        # Core reload revokes old sessions and keeps registrations reusable.
        await peers[0].call(DOMAIN + "open")
        old_id = peers[0].bridge_id
        await peers[0].call(DOMAIN + "control", command="connect")
        await admin.api("POST", "config/config_entries/entry/" + entry_id + "/reload")
        await wait(enabled)
        try:
            await peers[0].call(
                DOMAIN + "control", session_id=old_id, command="connect"
            )
        except RuntimeError as error:
            assert str(error) == "unauthorized"
        else:
            raise AssertionError("Reload retained an old session")
        await peers[0].call(DOMAIN + "open")
        await peers[0].call(DOMAIN + "control", command="connect")
        # Worker idle notice must revoke the HA session too.
        await service.sockets["person-alice"].send_json({"type": "idle"})

        async def revoked():
            try:
                await peers[0].call(DOMAIN + "control", command="get_conversation")
            except RuntimeError as error:
                return str(error) == "unauthorized"
            return False

        await wait(revoked)
        await peers[0].call(DOMAIN + "open")
        await peers[0].call(DOMAIN + "control", command="connect")
        await admin.api("PUT", "backend_butler/settings", {"users": []})
        await wait(revoked)
        await admin.api("DELETE", "config/config_entries/entry/" + entry_id)
        assert (await admin.api("GET", "backend_butler/native/config"))[
            "enabled"
        ] is False
        print(
            "PASS: reload revokes old sessions, worker idle expires HA bridge, account remapping revokes sessions, uninstall disables native endpoints"
        )

    finally:
        for peer in peers:
            await peer.close()
        await admin.close()


async def main():
    state = Path(tempfile.mkdtemp(prefix="butler-standard-package-", dir="/tmp"))
    state.chmod(0o700)
    (state / "BUTLER_STANDARD_PACKAGE_CHECK").touch()
    component = state / "custom_components/backend_butler"
    shutil.copytree(
        ROOT / "custom_components/backend_butler",
        component,
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    # Use only a copied normal integration, no experimental component or lab markers.
    (state / "configuration.yaml").write_text(
        json.dumps(
            {
                "homeassistant": {
                    "name": "Butler Package Check",
                    "latitude": 0,
                    "longitude": 0,
                    "elevation": 0,
                    "unit_system": "metric",
                    "time_zone": "UTC",
                },
                "frontend": {},
                "config": {},
                "api": {},
                "logger": {"default": "warning"},
            }
        )
    )
    storage = state / ".storage"
    storage.mkdir()
    (storage / "http").write_text(
        json.dumps(
            {
                "version": 3,
                "minor_version": 1,
                "key": "http",
                "data": {
                    "stable": {
                        "server_port": 18125,
                        "server_host": ["127.0.0.1"],
                        "cors_allowed_origins": [],
                        "login_attempts_threshold": 5,
                        "ip_ban_enabled": True,
                        "ssl_profile": "intermediate_v6",
                        "use_x_frame_options": True,
                        "created_at": datetime.now(UTC).isoformat(),
                        "error": None,
                        "error_message": None,
                    },
                    "pending": None,
                    "yaml_migration_done": True,
                },
            }
        )
    )
    service = Service()
    runner = web.AppRunner(service.app())
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", 18964).start()
    log = (state / "ha.log").open("w")
    child = await asyncio.create_subprocess_exec(
        *[sys.executable, "-m", "homeassistant", "--config", str(state), "--skip-pip"],
        stdout=log,
        stderr=log,
    )
    print("Disposable standard integration check:", state, flush=True)
    try:
        await onboard(state)
        await checks(state, service)
        assert service.warms == 0
    finally:
        child.terminate()
        try:
            await asyncio.wait_for(child.wait(), timeout=30)
        except TimeoutError:
            child.kill()
            await child.wait()
        log.close()
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
