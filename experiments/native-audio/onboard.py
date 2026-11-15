"""Create a synthetic lab account; credentials stay in a local mode-0600 file."""

import argparse
import asyncio
import json
import os
import secrets
from pathlib import Path

import aiohttp

parser = argparse.ArgumentParser()
parser.add_argument("--state", type=Path, default=Path("/tmp/butler-native-audio-lab"))
parser.add_argument("--port", type=int, default=18123)
args = parser.parse_args()
STATE = args.state.resolve()
if not STATE.is_relative_to("/tmp") or not 18123 <= args.port <= 65535:
    parser.error("Use only a disposable /tmp lab and isolated port")
BASE = f"http://127.0.0.1:{args.port}"


async def main():
    assert (STATE / "BUTLER_NATIVE_AUDIO_POC").is_file()
    target = STATE / "test-auth.json"
    if target.exists():
        print("Disposable test account already exists")
        return
    credentials = {"username": "native-audio", "password": secrets.token_urlsafe(24)}
    async with aiohttp.ClientSession() as client:
        async with client.post(
            BASE + "/api/onboarding/users",
            json={
                **credentials,
                "name": "Native Audio Test",
                "client_id": BASE + "/",
                "language": "en",
            },
        ) as response:
            assert response.status == 200, (response.status, await response.text())
            code = (await response.json())["auth_code"]
        async with client.post(
            BASE + "/auth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": BASE + "/",
            },
        ) as response:
            assert response.status == 200, response.status
            credentials.update(await response.json())
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as output:
            json.dump(credentials, output)
        headers = {"Authorization": "Bearer " + credentials["access_token"]}
        for step, data in [
            ("core_config", {}),
            ("analytics", {}),
            ("integration", {"client_id": BASE + "/", "redirect_uri": BASE + "/"}),
        ]:
            async with client.post(
                BASE + "/api/onboarding/" + step, json=data, headers=headers
            ) as response:
                assert response.status in (200, 403), (
                    step,
                    response.status,
                    await response.text(),
                )
    print("Disposable test account created; credentials stored locally, not printed")


asyncio.run(main())
