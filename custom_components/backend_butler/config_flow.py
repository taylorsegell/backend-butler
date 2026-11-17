"""Config + options flow for the Backend Butler integration."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback

from .const import (
    CONF_AGENT_NAME,
    CONF_API_KEY,
    CONF_API_SECRET,
    CONF_CHAT_TOKEN,
    CONF_CHAT_URL,
    CONF_LIVEKIT_URL,
    CONF_NATIVE_AUDIO,
    CONF_SCHEDULER_TOKEN,
    CONF_SCHEDULER_URL,
    DEFAULT_AGENT_NAME,
    DOMAIN,
)
from .legacy import legacy_defaults


def native_config_errors(config):
    if not config.get(CONF_NATIVE_AUDIO, False):
        return {}
    if not all(config.get(key) for key in (CONF_CHAT_TOKEN, CONF_SCHEDULER_URL, CONF_SCHEDULER_TOKEN)):
        return {"base": "native_connection_required"}
    try:
        parsed = urlsplit(config.get(CONF_CHAT_URL, ""))
        valid = parsed.scheme in {"http", "https"} and parsed.hostname and not (
            parsed.username or parsed.password or parsed.query or parsed.fragment
        )
    except ValueError:
        valid = False
    return {} if valid else {"base": "native_connection_required"}


class LiveKitVoiceConfigFlow(ConfigFlow, domain=DOMAIN):
    """Collect the LiveKit connection details for the token endpoint."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle the initial setup step."""
        errors = native_config_errors(user_input) if user_input is not None else {}
        if user_input is not None and not errors:
            return self.async_create_entry(
                title="Backend Butler", data=user_input
            )

        # pre-fill from an older install's entry when one exists
        prev = user_input or legacy_defaults(self.hass)

        def _required(key: str) -> vol.Required:
            return vol.Required(key, default=prev[key]) if key in prev else vol.Required(key)

        schema = vol.Schema(
            {
                _required(CONF_LIVEKIT_URL): str,
                _required(CONF_API_KEY): str,
                _required(CONF_API_SECRET): str,
                vol.Optional(
                    CONF_AGENT_NAME, default=prev.get(CONF_AGENT_NAME, DEFAULT_AGENT_NAME)
                ): str,
                # Optional: enables the card's Schedules tab. Also editable later via Options.
                vol.Optional(CONF_SCHEDULER_URL, default=prev.get(CONF_SCHEDULER_URL, "")): str,
                vol.Optional(CONF_SCHEDULER_TOKEN, default=prev.get(CONF_SCHEDULER_TOKEN, "")): str,
                # Optional: enables the card's Text tab.
                vol.Optional(CONF_CHAT_URL, default=prev.get(CONF_CHAT_URL, "")): str,
                vol.Optional(CONF_CHAT_TOKEN, default=prev.get(CONF_CHAT_TOKEN, "")): str,
                vol.Optional(CONF_NATIVE_AUDIO, default=prev.get(CONF_NATIVE_AUDIO, False)): bool,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return LiveKitVoiceOptionsFlow(config_entry)


class LiveKitVoiceOptionsFlow(OptionsFlow):
    """Edit any setting on an existing entry (no re-add needed).

    Options are merged over the entry's original data (see __init__._merged_config), so editing
    a value here overrides what was set at initial setup.
    """

    def __init__(self, config_entry: ConfigEntry) -> None:
        self._entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        current = {**self._entry.data, **self._entry.options, **(user_input or {})}
        errors = native_config_errors(current) if user_input is not None else {}
        if user_input is not None and not errors:
            # Preserve saved settings which are no longer exposed by the form.
            return self.async_create_entry(
                title="", data={**self._entry.options, **user_input}
            )

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_LIVEKIT_URL, default=current.get(CONF_LIVEKIT_URL, "")
                ): str,
                vol.Required(CONF_API_KEY, default=current.get(CONF_API_KEY, "")): str,
                vol.Required(
                    CONF_API_SECRET, default=current.get(CONF_API_SECRET, "")
                ): str,
                vol.Optional(
                    CONF_AGENT_NAME,
                    default=current.get(CONF_AGENT_NAME, DEFAULT_AGENT_NAME),
                ): str,
                vol.Optional(
                    CONF_SCHEDULER_URL, default=current.get(CONF_SCHEDULER_URL, "")
                ): str,
                vol.Optional(
                    CONF_SCHEDULER_TOKEN, default=current.get(CONF_SCHEDULER_TOKEN, "")
                ): str,
                vol.Optional(CONF_CHAT_URL, default=current.get(CONF_CHAT_URL, "")): str,
                vol.Optional(
                    CONF_CHAT_TOKEN, default=current.get(CONF_CHAT_TOKEN, "")
                ): str,
                vol.Optional(CONF_NATIVE_AUDIO, default=current.get(CONF_NATIVE_AUDIO, False)): bool,
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
