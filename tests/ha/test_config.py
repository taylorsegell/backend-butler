"""Opt-in and fail-closed configuration contract."""

from types import SimpleNamespace

import pytest

from custom_components.backend_butler.config_flow import (
    LiveKitVoiceConfigFlow,
    LiveKitVoiceOptionsFlow,
    native_config_errors,
)
from custom_components.backend_butler.native_audio import worker_url


@pytest.mark.parametrize(
    "url",
    [
        "ftp://worker",
        "http://user:pass@worker",
        "http://worker?q=1",
        "http://worker#x",
        "",
    ],
)
def test_rejects_worker_url_overrides(url):
    with pytest.raises(ValueError):
        worker_url(url)


def test_native_is_opt_in_and_requires_link_resolution_service():
    assert native_config_errors({}) == {}
    assert native_config_errors({"native_audio_enabled": True})
    assert (
        native_config_errors(
            {
                "native_audio_enabled": True,
                "chat_url": "http://worker:8952",
                "chat_token": "synthetic",
                "scheduler_url": "http://scheduler:8951",
                "scheduler_token": "synthetic",
            }
        )
        == {}
    )


@pytest.mark.asyncio
async def test_options_hide_music_url_without_losing_saved_settings():
    entry = SimpleNamespace(
        data={"music_url": "http://old-music"},
        options={"music_url": "http://configured-music", "chat_token": "saved-token"},
    )
    flow = LiveKitVoiceOptionsFlow(entry)
    form = await flow.async_step_init()
    fields = form["data_schema"]({})
    assert fields["native_audio_enabled"] is False
    assert "music_url" not in fields
    saved = await flow.async_step_init({"agent_name": "renamed-agent"})
    assert saved["data"]["music_url"] == "http://configured-music"
    assert saved["data"]["chat_token"] == "saved-token"
    assert saved["data"]["agent_name"] == "renamed-agent"


@pytest.mark.asyncio
async def test_setup_has_no_music_url_field(monkeypatch):
    monkeypatch.setattr(
        "custom_components.backend_butler.config_flow.legacy_defaults", lambda _: {}
    )
    flow = LiveKitVoiceConfigFlow()
    form = await flow.async_step_user()
    assert "music_url" not in {field.schema for field in form["data_schema"].schema}


@pytest.mark.asyncio
async def test_existing_music_value_in_data_is_not_changed():
    flow = LiveKitVoiceOptionsFlow(
        SimpleNamespace(data={"music_url": "http://music"}, options={})
    )
    saved = await flow.async_step_init({"agent_name": "renamed-agent"})
    assert flow._entry.data["music_url"] == "http://music"
    assert "music_url" not in saved["data"]
