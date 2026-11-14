"""Run only in a separate disposable HA instance; never install in a household."""

from pathlib import Path

import probatio
from homeassistant.components import websocket_api
from homeassistant.components.camera.const import DATA_COMPONENT
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.exceptions import Unauthorized

from .camera import NativeAudioCamera
from .receiver import Receiver

DOMAIN = "butler_native_audio_poc"
CONFIG_SCHEMA = probatio.Schema(
    {DOMAIN: {probatio.Required("enabled"): bool}}, extra=probatio.ALLOW_EXTRA
)


async def async_setup(hass, config):
    if (
        not config[DOMAIN]["enabled"]
        or not Path(hass.config.path("BUTLER_NATIVE_AUDIO_POC")).is_file()
    ):
        raise ValueError(
            "This experiment requires its separate disposable HA configuration"
        )
    receiver = Receiver()
    hass.data[DOMAIN] = receiver
    await hass.data[DATA_COMPONENT].async_add_entities([NativeAudioCamera(receiver)])
    frontend = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/butler-native-audio-poc", str(frontend), False)]
    )
    add_extra_js_url(hass, "/butler-native-audio-poc/card.js")

    async def shutdown(_event):
        await receiver.close()

    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, shutdown)
    for command in [prepare, status, stop]:
        websocket_api.async_register_command(hass, command)
    return True


def _owned(hass, connection):
    receiver = hass.data[DOMAIN]
    if receiver.owner and receiver.owner != connection.user.id:
        raise Unauthorized()
    return receiver


@websocket_api.websocket_command({probatio.Required("type"): DOMAIN + "/prepare"})
@websocket_api.require_admin
@websocket_api.async_response
async def prepare(hass, connection, msg):
    receiver = _owned(hass, connection)
    await receiver.arm(connection.user.id)
    connection.send_result(
        msg["id"], {"entity_id": "camera.butler_native_audio_poc", "experiment": True}
    )


@websocket_api.websocket_command({probatio.Required("type"): DOMAIN + "/status"})
@websocket_api.require_admin
@websocket_api.async_response
async def status(hass, connection, msg):
    connection.send_result(msg["id"], dict(_owned(hass, connection).stats))


@websocket_api.websocket_command({probatio.Required("type"): DOMAIN + "/stop"})
@websocket_api.require_admin
@websocket_api.async_response
async def stop(hass, connection, msg):
    receiver = _owned(hass, connection)
    await receiver.close()
    connection.send_result(msg["id"], dict(receiver.stats))
