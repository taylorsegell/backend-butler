"""Opt-in and fail-closed configuration contract."""

from types import SimpleNamespace

import pytest

from custom_components.backend_butler.config_flow import (
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
async def test_existing_options_form_keeps_native_disabled_and_music_url():
    flow = LiveKitVoiceOptionsFlow(
        SimpleNamespace(data={"music_url": "http://music"}, options={})
    )
    form = await flow.async_step_init()
    fields = form["data_schema"]({})
    assert fields["native_audio_enabled"] is False
    assert fields["music_url"] == "http://music"
