"""Authenticated adapter around the native bridge's HA camera commands."""

from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.exceptions import Unauthorized

from .sessions import PREFIX, principal

COMMANDS = (
    "camera/webrtc/get_client_config",
    "camera/webrtc/offer",
    "camera/webrtc/candidate",
)


def owner(connection):
    user = connection.user
    if not user or not user.is_active or user.system_generated:
        raise Unauthorized()
    return user.id


def install(hass, registry):
    gate = hass.data.get("backend_butler_native_signaling")
    if gate is not None:
        gate["registry"] = registry
        return gate
    gate = {"registry": registry}
    handlers = hass.data.get(websocket_api.DOMAIN, {})
    if any(command not in handlers for command in COMMANDS):
        raise RuntimeError(
            "Required authenticated camera signaling handlers are unavailable"
        )
    originals = {command: handlers[command] for command in COMMANDS}

    def guard(original):
        @callback
        def secured(hass, connection, message):
            entity = message.get("entity_id", "")
            if not entity.startswith(PREFIX):
                original(hass, connection, message)
                return
            try:
                if gate["registry"] is None:
                    raise PermissionError("Audio session unavailable")
                session = gate["registry"].for_entity(owner(connection), entity)
                if (
                    message["type"] == "camera/webrtc/candidate"
                    and message["session_id"] not in session.receiver.peers
                ):
                    raise PermissionError("Audio session unavailable")
            except PermissionError as error:
                raise Unauthorized() from error
            token = principal.set((session.owner, session.id))
            try:
                # HA schedules its async handler here; task context inherits the principal.
                original(hass, connection, message)
            finally:
                principal.reset(token)

        return secured

    for command, (handler, schema) in originals.items():
        websocket_api.async_register_command(hass, command, guard(handler), schema)

    hass.data["backend_butler_native_signaling"] = gate
    return gate
