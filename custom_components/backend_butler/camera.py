"""Ephemeral owner-bound microphone receivers; no camera images are exposed."""

from .const import DATA_NATIVE_AUDIO, DOMAIN


async def async_setup_entry(hass, entry, async_add_entities):
    bridge = hass.data[DOMAIN].get(DATA_NATIVE_AUDIO)
    if bridge:
        bridge.add_entities = async_add_entities
