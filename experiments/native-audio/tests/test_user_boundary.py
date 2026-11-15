"""Live adversarial checks against only the marked candidate on localhost:18124."""

import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from bridge_peer import NativePeer

STATE = Path("/tmp/butler-native-users-lab")
URL = "http://127.0.0.1:18124"
DOMAIN = "butler_native_audio_poc/"


async def wait(predicate, seconds=30):
    async with asyncio.timeout(seconds):
        while not await predicate():
            await asyncio.sleep(0.04)


async def denied(peer, kind, **payload):
    subscription = peer.event_subscription
    try:
        with pytest.raises(RuntimeError, match="^unauthorized$"):
            await peer.call(kind, **payload)
    finally:
        peer.event_subscription = subscription


@pytest.mark.asyncio
async def test_two_ordinary_users_cannot_access_or_inject_foreign_sessions():
    assert (STATE / "BUTLER_NATIVE_AUDIO_POC").is_file()
    alice = NativePeer(STATE, URL, "alice-auth.json")
    bob = NativePeer(STATE, URL, "bob-auth.json")
    admin = NativePeer(STATE, URL)
    events_a, events_b = [], []
    await asyncio.gather(alice.connect(), bob.connect(), admin.connect())
    alice.on_event = events_a.append
    bob.on_event = events_b.append
    try:
        for client in [alice, bob]:
            current = await client.call("auth/current_user")
            assert not current["is_admin"]
            await client.call(DOMAIN + "open")
            await client.call(DOMAIN + "events")
            await client.call(DOMAIN + "prepare")
            await client.start()
        assert alice.bridge_id != bob.bridge_id
        assert alice.entity != bob.entity

        async def both_receiving():
            return all(
                value["sdk_frames"] >= 5
                for value in await asyncio.gather(
                    alice.call(DOMAIN + "status"), bob.call(DOMAIN + "status")
                )
            )

        await wait(both_receiving)
        before_a = await alice.call(DOMAIN + "status")
        before_b = await bob.call(DOMAIN + "status")
        attacks = 0
        for attacker, victim in [(bob, alice), (alice, bob)]:
            for kind in ["prepare", "status", "stop", "events"]:
                await denied(attacker, DOMAIN + kind, session_id=victim.bridge_id)
                attacks += 1
            for command in [
                "connect",
                "get_conversation",
                "text",
                "start_turn",
                "end_turn",
                "cancel_turn",
                "set_audio_output",
                "disconnect",
            ]:
                await denied(
                    attacker,
                    DOMAIN + "control",
                    session_id=victim.bridge_id,
                    command=command,
                    payload="foreign-injection",
                )
                attacks += 1
            await denied(
                attacker, "camera/webrtc/get_client_config", entity_id=victim.entity
            )
            await denied(
                attacker,
                "camera/webrtc/offer",
                entity_id=victim.entity,
                offer=attacker.pc.localDescription.sdp,
            )
            await denied(
                attacker,
                "camera/webrtc/candidate",
                entity_id=victim.entity,
                session_id=victim.session_id,
                candidate={"candidate": ""},
            )
            await denied(
                attacker,
                "camera/webrtc/candidate",
                entity_id=attacker.entity,
                session_id=victim.session_id,
                candidate={"candidate": ""},
            )
            attacks += 4
        await denied(admin, DOMAIN + "status", session_id=alice.bridge_id)
        await denied(admin, "camera/webrtc/get_client_config", entity_id=alice.entity)
        attacks += 2
        for peer, before in [(alice, before_a), (bob, before_b)]:
            after = await peer.call(DOMAIN + "status")
            assert after["active"]
            assert after["sdk_frames"] >= before["sdk_frames"]

        # Both models/reply streams are live concurrently. Only synthetic text is sent.
        await asyncio.gather(
            alice.call(
                DOMAIN + "control",
                command="text",
                payload="Reply with exactly these two words: Alice maple.",
            ),
            bob.call(
                DOMAIN + "control",
                command="text",
                payload="Reply with exactly these two words: Bob cobalt.",
            ),
        )

        async def replies_arrived():
            return all(
                any(
                    event["type"] == "conversation"
                    and any(item["role"] == "agent" for item in event["items"])
                    for event in stream
                )
                and any(event["type"] == "audio_end" for event in stream)
                for stream in [events_a, events_b]
            )

        await wait(replies_arrived, 60)
        histories = []
        for stream, own, foreign in [
            (events_a, "Alice maple", "Bob cobalt"),
            (events_b, "Bob cobalt", "Alice maple"),
        ]:
            history = [
                event["items"] for event in stream if event["type"] == "conversation"
            ][-1]
            serialized = json.dumps(history).lower()
            assert own.lower() in serialized
            assert foreign.lower() not in json.dumps(stream).lower()
            assert any(event["type"] == "audio" for event in stream)
            histories.append(history)

        # Stopping Alice cannot stop Bob; Bob's receiver continues accumulating frames.
        await alice.stop()
        final_a = await alice.call(DOMAIN + "status")
        bob_count = (await bob.call(DOMAIN + "status"))["sdk_frames"]

        async def bob_continues():
            return (await bob.call(DOMAIN + "status"))["sdk_frames"] >= bob_count + 5

        await wait(bob_continues)
        assert (await alice.call(DOMAIN + "status")) == final_a
        assert not final_a["active"]

        stale_id, stale_entity = alice.bridge_id, alice.entity
        await alice.call(DOMAIN + "control", command="disconnect")
        await alice.call(DOMAIN + "open")
        assert alice.bridge_id != stale_id
        await denied(alice, DOMAIN + "status", session_id=stale_id)
        await denied(alice, "camera/webrtc/get_client_config", entity_id=stale_entity)
        await alice.call(DOMAIN + "control", command="connect")
        fresh = await alice.call(DOMAIN + "control", command="get_conversation")
        if fresh.get("conversation_id"):
            assert "alice maple" in json.dumps(fresh["items"]).lower()
            assert "bob cobalt" not in json.dumps(fresh["items"]).lower()
        else:
            assert fresh["items"] == []
        assert (await bob.call(DOMAIN + "status"))["active"]
        bob_history = await bob.call(DOMAIN + "control", command="get_conversation")
        assert "Alice maple".lower() not in json.dumps(bob_history).lower()
        print(
            f"PASS: {attacks} known-ID cross-user/admin attacks denied, simultaneous audio and model/reply isolation, independent stop, stale IDs and clean replacement"
        )
    finally:
        await asyncio.gather(alice.close(), bob.close(), admin.close())
