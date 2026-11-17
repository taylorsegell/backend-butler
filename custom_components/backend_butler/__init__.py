"""The Backend Butler integration.

This is deliberately thin glue: the voice "brain" is the standalone LiveKit worker
(agent/agent.py), unchanged. This integration only

  1. mints LiveKit access tokens for logged-in Home Assistant users (token.py), and
  2. serves + registers the dashboard card (../card) so it loads in the HA frontend.

The card renders device tiles from live ``hass.states`` and controls them with
``hass.callService`` — see ../README.md for the full architecture.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from aiohttp import web
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import HomeAssistantView
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import (
    CARD_FILENAME,
    CARD_URL,
    CONF_CHAT_TOKEN,
    CONF_CHAT_URL,
    CONF_MUSIC_URL,
    CONF_NATIVE_AUDIO,
    CONF_SCHEDULER_TOKEN,
    CONF_SCHEDULER_URL,
    DATA_CONFIG,
    DATA_NATIVE_AUDIO,
    DATA_REGISTERED,
    DOMAIN,
)
from .legacy import LEGACY_ENTRY_WARNING, legacy_entry
from .progress import LiveKitProgressView
from .tasks import (
    ButlerApprovalsView,
    LiveKitChatCancelView,
    LiveKitChatConversationsView,
    LiveKitChatDeleteView,
    LiveKitChatHistoryView,
    LiveKitChatSwitchView,
    LiveKitChatView,
    LiveKitChatWarmView,
    LiveKitSettingsView,
    LiveKitTasksView,
    LiveKitTaskView,
    clear_person_cache,
)
from .token import LiveKitTokenView

_LOGGER = logging.getLogger(__name__)

_CARD_PATH = Path(__file__).parent / "frontend" / CARD_FILENAME

# the media player adds itself only when a music server is configured
_PLATFORMS = [Platform.MEDIA_PLAYER]


class LiveKitCardView(HomeAssistantView):
    """Serve the card bundle, revalidated on every load so a changed file is picked up."""

    url = CARD_URL
    name = "backend_butler:card"
    # loaded by a <script> tag, which carries no HA auth
    requires_auth = False

    async def get(self, request: web.Request) -> web.FileResponse:
        return web.FileResponse(_CARD_PATH, headers={"Cache-Control": "no-cache"})


def _merged_config(entry: ConfigEntry) -> dict:
    """Options (set via the Options flow, e.g. scheduler URL/token) override data."""
    return {**entry.data, **entry.options}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Backend Butler from a config entry."""
    store = hass.data.setdefault(DOMAIN, {})
    store[DATA_CONFIG] = _merged_config(entry)
    clear_person_cache(hass)

    # The HTTP view, static path, and frontend module can only be registered once per
    # HA process (they cannot be cleanly torn down), so guard behind a flag that
    # survives entry reloads but not a full restart.
    if not store.get(DATA_REGISTERED):
        hass.http.register_view(LiveKitCardView())
        # the content hash in the URL makes a new bundle a new URL, past any cache
        digest = await hass.async_add_executor_job(
            lambda: hashlib.sha256(_CARD_PATH.read_bytes()).hexdigest()[:12]
        )
        add_extra_js_url(hass, f"{CARD_URL}?v={digest}")
        hass.http.register_view(LiveKitTokenView(hass))
        hass.http.register_view(LiveKitTasksView(hass))
        hass.http.register_view(LiveKitTaskView(hass))
        hass.http.register_view(LiveKitSettingsView(hass))
        hass.http.register_view(LiveKitChatView(hass))
        hass.http.register_view(ButlerApprovalsView(hass))
        hass.http.register_view(LiveKitChatHistoryView(hass))
        hass.http.register_view(LiveKitChatCancelView(hass))
        hass.http.register_view(LiveKitChatWarmView(hass))
        hass.http.register_view(LiveKitChatConversationsView(hass))
        hass.http.register_view(LiveKitChatSwitchView(hass))
        hass.http.register_view(LiveKitChatDeleteView(hass))
        hass.http.register_view(LiveKitProgressView(hass))
        from .native_audio import register
        register(hass)
        store[DATA_REGISTERED] = True
        _LOGGER.debug("registered token, tasks, settings, chat and progress views + card at %s", CARD_URL)

    if legacy_entry(hass) is not None:
        _LOGGER.warning(LEGACY_ENTRY_WARNING)

    platforms = list(_PLATFORMS)
    bridge = None
    if store[DATA_CONFIG].get(CONF_NATIVE_AUDIO, False):
        from .native_audio import NativeAudioBridge
        bridge = NativeAudioBridge(hass, store[DATA_CONFIG])
        store[DATA_NATIVE_AUDIO] = bridge
        platforms.append(Platform.CAMERA)
    try:
        await hass.config_entries.async_forward_entry_setups(entry, platforms)
        if bridge:
            bridge.activate()
    except BaseException:
        if bridge:
            await bridge.close()
            store.pop(DATA_NATIVE_AUDIO, None)
        await hass.config_entries.async_unload_platforms(entry, platforms)
        raise
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Keep the views reading the latest config after a data/options update."""
    config = _merged_config(entry)
    previous = hass.data[DOMAIN].get(DATA_CONFIG, {})
    hass.data[DOMAIN][DATA_CONFIG] = config
    # the media player is built from the music URL, so a new one needs a reload
    keys = (CONF_MUSIC_URL, CONF_NATIVE_AUDIO, CONF_CHAT_URL, CONF_CHAT_TOKEN,
            CONF_SCHEDULER_URL, CONF_SCHEDULER_TOKEN)
    if any(config.get(key) != previous.get(key) for key in keys):
        await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the config entry.

    The registered HTTP view / static path / frontend module remain until HA restarts
    (Home Assistant offers no runtime unregister for them); we only drop the config so
    the token endpoint reports "not configured" until set up again.
    """
    store = hass.data.get(DOMAIN, {})
    bridge = store.pop(DATA_NATIVE_AUDIO, None)
    platforms = list(_PLATFORMS)
    if bridge:
        await bridge.close()
        platforms.append(Platform.CAMERA)
    unloaded = await hass.config_entries.async_unload_platforms(entry, platforms)
    hass.data.get(DOMAIN, {}).pop(DATA_CONFIG, None)
    return unloaded
