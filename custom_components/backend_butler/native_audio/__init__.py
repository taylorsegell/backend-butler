"""Companion audio transport inside the standard authenticated Butler integration."""

import asyncio
import re
from urllib.parse import urlsplit

import aiohttp

try:  # HA 2026.11 uses probatio for websocket schemas.
    import probatio as vol
except ImportError:
    import voluptuous as vol
from aiohttp import web
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.exceptions import Unauthorized
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from ..const import (
    CONF_CHAT_TOKEN,
    CONF_CHAT_URL,
    DATA_NATIVE_AUDIO,
    DOMAIN,
)
from ..tasks import person_id_for_user
from .receiver import Receiver
from .sessions import SessionRegistry
from .signaling import install, owner
from .speech import SpeechRelay

COMMAND_PREFIX = DOMAIN + "/native"
SESSION = {vol.Required("session_id"): vol.Match(r"^[0-9a-f]{32}$")}
CONTROLS = {
    "connect",
    "disconnect",
    "start_turn",
    "end_turn",
    "cancel_turn",
    "get_conversation",
    "text",
    "set_audio_output",
    "set_turn_mode",
    "playback_finished",
}


def worker_url(value):
    """Only administrator-configured HTTP(S) service origins are accepted."""
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Configure a worker HTTP(S) URL without credentials or query")
    return value.rstrip("/")


class NativeAudioBridge:
    def __init__(self, hass, config):
        self.hass = hass
        base = worker_url(config.get(CONF_CHAT_URL, ""))
        token = config.get(CONF_CHAT_TOKEN)
        if not token:
            raise ValueError("Native audio requires the worker URL and text API token")
        self.paused = False
        self.generation = 0
        self.add_entities = None
        self.registry = SessionRegistry(
            Receiver,
            lambda person, selected: SpeechRelay(
                async_get_clientsession(hass),
                token,
                base,
                owner=person,
                conversation_id=selected,
            ),
            self.add,
            self.remove,
        )
        self.gate = None
        self.unsubscribe = None

    async def add(self, session):
        from .camera import NativeAudioCamera

        if self.add_entities is None:
            raise ValueError("Native camera platform is unavailable")
        session.camera = NativeAudioCamera(session)
        self.add_entities([session.camera])
        # Platform add is scheduled; wait until it is attached before offering capture.
        await asyncio.wait_for(session.camera.added.wait(), 10)

    async def remove(self, session):
        if session.camera and getattr(session.camera, "hass", None):
            await session.camera.async_remove()

    def activate(self):
        self.gate = install(self.hass, self.registry)
        self.unsubscribe = self.hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STOP, self.shutdown_event
        )

    async def shutdown_event(self, _event):
        self.unsubscribe = None  # HA removed this one-shot listener before invoking it.
        await self.close()

    async def close(self):
        if self.gate:
            self.gate["registry"] = None
        if self.unsubscribe:
            self.unsubscribe()
            self.unsubscribe = None
        await self.registry.shutdown()


class NativeAudioConfigView(HomeAssistantView):
    url = "/api/backend_butler/native/config"
    name = "api:backend_butler:native_config"
    requires_auth = True

    def __init__(self, hass):
        self.hass = hass

    async def get(self, request):
        bridge = self.hass.data.get(DOMAIN, {}).get(DATA_NATIVE_AUDIO)
        return web.json_response(
            {
                "enabled": bool(
                    bridge
                    and not bridge.paused
                    and bridge.gate
                    and bridge.gate["registry"] is not None
                )
            }
        )


def bridge_for(hass):
    bridge = hass.data.get(DOMAIN, {}).get(DATA_NATIVE_AUDIO)
    if (
        not bridge
        or bridge.paused
        or not bridge.gate
        or bridge.gate["registry"] is None
    ):
        raise Unauthorized()
    return bridge


def owned(hass, connection, message):
    try:
        return bridge_for(hass).registry.owned(owner(connection), message["session_id"])
    except PermissionError as error:
        raise Unauthorized() from error


@websocket_api.websocket_command(
    {
        vol.Required("type"): COMMAND_PREFIX + "/open",
        vol.Optional("conversation_id"): vol.All(str, vol.Length(min=1, max=200)),
    }
)
@websocket_api.async_response
async def open_session(hass, connection, msg):
    bridge = bridge_for(hass)
    generation = bridge.generation
    ha_user = owner(connection)
    person = await person_id_for_user(hass, connection.user)
    if not isinstance(person, str) or not re.fullmatch(r"[a-z0-9_-]{1,200}", person):
        connection.send_error(
            msg["id"],
            "person_required",
            "Link your HA account to a person in Butler Settings first",
        )
        return
    if bridge.paused or generation != bridge.generation:
        raise Unauthorized()
    try:
        session = await bridge.registry.open(
            ha_user, person, msg.get("conversation_id")
        )
    except ValueError:
        connection.send_error(
            msg["id"],
            "session_limit",
            "Close an existing audio session before opening another",
        )
        return
    if bridge.paused or generation != bridge.generation:
        await bridge.registry.expire(session.id)
        raise Unauthorized()
    connection.subscriptions[msg["id"]] = lambda: hass.async_create_task(
        bridge.registry.expire(session.id)
    )
    session.cleanup.append(lambda: connection.subscriptions.pop(msg["id"], None))
    connection.send_result(msg["id"], {"session_id": session.id})


@websocket_api.websocket_command(
    {
        vol.Required("type"): COMMAND_PREFIX + "/prepare",
        vol.Optional("continuous", default=False): bool,
        **SESSION,
    }
)
@websocket_api.async_response
async def prepare(hass, connection, msg):
    session = owned(hass, connection, msg)
    try:
        async with session.operation_lock:
            if session.closed:
                raise Unauthorized()
            await session.speech.connect()
            if session.closed:
                raise Unauthorized()
            await session.receiver.arm(session.owner, continuous=msg["continuous"])
        connection.send_result(
            msg["id"], {"entity_id": session.entity_id, "session_id": session.id}
        )
    except (ValueError, ConnectionError, TimeoutError, aiohttp.ClientError):
        connection.send_error(
            msg["id"], "speech_failed", "Native audio could not reach the Butler worker"
        )


@websocket_api.websocket_command(
    {vol.Required("type"): COMMAND_PREFIX + "/stop", **SESSION}
)
@websocket_api.async_response
async def stop(hass, connection, msg):
    session = owned(hass, connection, msg)
    async with session.operation_lock:
        await session.receiver.close()
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {
        vol.Required("type"): COMMAND_PREFIX + "/control",
        **SESSION,
        vol.Required("command"): vol.In(CONTROLS),
        vol.Optional("payload", default=""): vol.All(str, vol.Length(max=2000)),
    }
)
@websocket_api.async_response
async def control(hass, connection, msg):
    session = owned(hass, connection, msg)
    command = msg["command"]
    if command == "disconnect":
        await bridge_for(hass).registry.close(session.owner, session.id)
        connection.send_result(msg["id"], {})
        return
    try:
        async with session.operation_lock:
            if session.closed:
                raise Unauthorized()
            if command == "connect":
                await session.speech.connect()
                result = {
                    "items": session.speech.items,
                    "conversation_id": session.speech.conversation_id,
                }
            else:
                result = await session.speech.control(command, msg["payload"])
            if session.closed:
                raise Unauthorized()
        connection.send_result(msg["id"], {**result, "session_id": session.id})
    except (ValueError, ConnectionError, TimeoutError, aiohttp.ClientError):
        connection.send_error(
            msg["id"],
            "speech_failed",
            "Butler could not complete this speech request. Please retry.",
        )


@websocket_api.websocket_command(
    {vol.Required("type"): COMMAND_PREFIX + "/events", **SESSION}
)
@websocket_api.async_response
async def events(hass, connection, msg):
    session = owned(hass, connection, msg)

    if len(session.speech.listeners) >= 5:
        connection.send_error(
            msg["id"], "session_limit", "Too many audio event subscriptions"
        )
        return

    def listener(event):
        if not session.closed:
            connection.send_event(msg["id"], event)

    session.speech.listeners.add(listener)
    connection.subscriptions[msg["id"]] = lambda: session.speech.listeners.discard(
        listener
    )
    session.cleanup.append(lambda: connection.subscriptions.pop(msg["id"], None))
    connection.send_result(msg["id"])


def register(hass):
    hass.http.register_view(NativeAudioConfigView(hass))
    for command in (open_session, prepare, stop, control, events):
        websocket_api.async_register_command(hass, command)
