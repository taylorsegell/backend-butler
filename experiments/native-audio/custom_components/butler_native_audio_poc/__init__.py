"""Per-user native audio bridge, restricted to a disposable HA configuration."""

import json
from pathlib import Path

import aiohttp
import probatio
from homeassistant.components import websocket_api
from homeassistant.components.camera.const import DATA_COMPONENT
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.exceptions import Unauthorized

from .camera import NativeAudioCamera
from .history import HistoryProxy, worker_url
from .receiver import Receiver
from .sessions import SessionRegistry
from .signaling import install, owner
from .speech import SpeechRelay

DOMAIN = "butler_native_audio_poc"
CONFIG_SCHEMA = probatio.Schema(
    {DOMAIN: {probatio.Required("enabled"): bool}}, extra=probatio.ALLOW_EXTRA
)
SESSION = {probatio.Required("session_id"): probatio.Match(r"^[0-9a-f]{32}$")}
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
}


async def async_setup(hass, config):
    if (
        not config[DOMAIN]["enabled"]
        or not Path(hass.config.path("BUTLER_NATIVE_AUDIO_POC")).is_file()
    ):
        raise ValueError("Use only a separate disposable HA configuration")
    config_file = Path(hass.config.path("model-config.json"))
    token = None
    port = 18952
    target_worker = None
    if (
        config_file.exists()
        and Path(hass.config.path("BUTLER_NATIVE_SPEECH")).is_file()
    ):
        model_config = json.loads(
            await hass.async_add_executor_job(config_file.read_text)
        )
        token = model_config["LAB_SERVICE_TOKEN"]
        port = model_config.get("LAB_SPEECH_PORT", 18952)
        if model_config.get("LAB_WORKER_URL"):
            target_worker = worker_url(model_config["LAB_WORKER_URL"])

    async def add(session):
        session.camera = NativeAudioCamera(session)
        await hass.data[DATA_COMPONENT].async_add_entities([session.camera])

    async def remove(session):
        await session.camera.async_remove()

    registry = SessionRegistry(
        Receiver,
        lambda user, selected: (
            SpeechRelay(
                token,
                port,
                owner=user,
                conversation_id=selected,
                worker_url=target_worker,
            )
            if token
            else None
        ),
        add,
        remove,
    )
    # Install the authenticated signaling guard before exposing any audio endpoints.
    install(hass, registry)
    hass.data[DOMAIN] = registry
    hass.data[DOMAIN + "_history"] = (
        HistoryProxy(target_worker, token) if target_worker else None
    )
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                "/butler-native-audio-poc",
                str(Path(__file__).parent / "frontend"),
                False,
            )
        ]
    )
    add_extra_js_url(hass, "/butler-native-audio-poc/card.js")

    async def shutdown(_event):
        await registry.shutdown()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, shutdown)
    for command in [open_session, prepare, status, stop, control, events, history]:
        websocket_api.async_register_command(hass, command)
    return True


def owned(hass, connection, message):
    try:
        return hass.data[DOMAIN].owned(owner(connection), message["session_id"])
    except PermissionError as error:
        raise Unauthorized() from error


@websocket_api.websocket_command(
    {
        probatio.Required("type"): DOMAIN + "/open",
        probatio.Optional("conversation_id"): probatio.All(
            str, probatio.Length(min=1, max=200)
        ),
    }
)
@websocket_api.async_response
async def open_session(hass, connection, msg):
    registry = hass.data[DOMAIN]
    user_id = owner(connection)
    try:
        session = await registry.open(user_id, msg.get("conversation_id"))
    except ValueError:
        connection.send_error(
            msg["id"],
            "session_limit",
            "Close an existing audio session before opening another",
        )
        return

    def disconnected():
        hass.async_create_task(registry.expire(session.id))

    connection.subscriptions[msg["id"]] = disconnected
    connection.send_result(msg["id"], {"session_id": session.id, "experiment": True})


@websocket_api.websocket_command(
    {probatio.Required("type"): DOMAIN + "/prepare", **SESSION}
)
@websocket_api.async_response
async def prepare(hass, connection, msg):
    session = owned(hass, connection, msg)
    async with session.operation_lock:
        if session.closed:
            raise Unauthorized()
        if session.speech:
            await session.speech.connect()
        if session.closed:
            raise Unauthorized()
        await session.receiver.arm(session.owner)
    connection.send_result(
        msg["id"],
        {"entity_id": session.entity_id, "session_id": session.id, "experiment": True},
    )


@websocket_api.websocket_command(
    {probatio.Required("type"): DOMAIN + "/status", **SESSION}
)
@websocket_api.async_response
async def status(hass, connection, msg):
    connection.send_result(msg["id"], dict(owned(hass, connection, msg).receiver.stats))


@websocket_api.websocket_command(
    {probatio.Required("type"): DOMAIN + "/stop", **SESSION}
)
@websocket_api.async_response
async def stop(hass, connection, msg):
    session = owned(hass, connection, msg)
    await session.receiver.close()
    connection.send_result(msg["id"], dict(session.receiver.stats))


@websocket_api.websocket_command(
    {
        probatio.Required("type"): DOMAIN + "/control",
        **SESSION,
        probatio.Required("command"): str,
        probatio.Optional("payload", default=""): str,
    }
)
@websocket_api.async_response
async def control(hass, connection, msg):
    session = owned(hass, connection, msg)
    command = msg["command"]
    if command not in CONTROLS or len(msg["payload"]) > 2000:
        connection.send_error(
            msg["id"], "invalid_command", "Invalid lab speech command"
        )
        return
    if command == "disconnect":
        await hass.data[DOMAIN].close(session.owner, session.id)
        connection.send_result(msg["id"], {})
        return
    if not session.speech:
        connection.send_error(
            msg["id"], "unavailable", "The lab speech service is not configured"
        )
        return
    try:
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
            "The lab speech request failed. Please retry the turn.",
        )


@websocket_api.websocket_command(
    {probatio.Required("type"): DOMAIN + "/events", **SESSION}
)
@websocket_api.async_response
async def events(hass, connection, msg):
    session = owned(hass, connection, msg)
    if not session.speech:
        connection.send_error(
            msg["id"], "unavailable", "The lab speech service is not configured"
        )
        return

    def listener(event):
        if not session.closed:
            connection.send_event(msg["id"], event)

    session.speech.listeners.add(listener)
    connection.subscriptions[msg["id"]] = lambda: session.speech.listeners.discard(
        listener
    )
    connection.send_result(msg["id"])


@websocket_api.websocket_command(
    {
        probatio.Required("type"): DOMAIN + "/history",
        probatio.Required("operation"): str,
        probatio.Optional("data", default={}): dict,
    }
)
@websocket_api.async_response
async def history(hass, connection, msg):
    user = owner(connection)
    proxy = hass.data[DOMAIN + "_history"]
    if proxy is None:
        connection.send_error(
            msg["id"], "unavailable", "Worker history is not configured"
        )
        return
    try:
        result = await proxy.request(user, msg["operation"], msg["data"])
        connection.send_result(msg["id"], result)
    except (ValueError, aiohttp.ClientError, TimeoutError):
        connection.send_error(
            msg["id"], "history_failed", "Conversation request failed"
        )
