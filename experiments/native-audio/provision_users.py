"""Create two ordinary test users only in the separate per-user candidate lab."""

import asyncio
import json
import os
import secrets
from pathlib import Path

import aiohttp
from bridge_peer import NativePeer

STATE = Path("/tmp/butler-native-users-lab")
URL = "http://127.0.0.1:18124"


def save(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        json.dump(value, output)


async def main():
    assert (STATE / "BUTLER_NATIVE_AUDIO_POC").is_file()
    admin = NativePeer(STATE, URL)
    await admin.connect()
    try:
        for label in ["alice", "bob"]:
            target = STATE / (label + "-auth.json")
            if target.exists():
                continue
            credentials = {
                "username": "native-" + label + "-" + secrets.token_hex(3),
                "password": secrets.token_urlsafe(24),
            }
            user = (
                await admin.call(
                    "config/auth/create",
                    name="Native test " + label,
                    group_ids=["system-users"],
                )
            )["user"]
            assert user["group_ids"] == ["system-users"]
            await admin.call(
                "config/auth_provider/homeassistant/create",
                user_id=user["id"],
                **credentials,
            )
            async with aiohttp.ClientSession() as client:
                async with client.post(
                    URL + "/auth/login_flow",
                    json={
                        "client_id": URL + "/",
                        "handler": ["homeassistant", None],
                        "redirect_uri": URL + "/",
                    },
                ) as response:
                    flow = await response.json()
                async with client.post(
                    URL + "/auth/login_flow/" + flow["flow_id"],
                    json={"client_id": URL + "/", **credentials},
                ) as response:
                    result = await response.json()
                assert result["type"] == "create_entry"
                async with client.post(
                    URL + "/auth/token",
                    data={
                        "grant_type": "authorization_code",
                        "code": result["result"],
                        "client_id": URL + "/",
                    },
                ) as response:
                    assert response.status == 200
                    credentials.update(await response.json())
            credentials["user_id"] = user["id"]
            save(target, credentials)
            print("Created ordinary disposable test user:", label)
    finally:
        await admin.close()


if __name__ == "__main__":
    asyncio.run(main())
