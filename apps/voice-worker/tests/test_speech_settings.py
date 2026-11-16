"""English installations use an identified voice; custom speech choices still win."""

from config import load_settings


def test_unconfigured_speech_uses_grok_rex_through_livekit(monkeypatch):
    for key in ["TTS_MODEL", "TTS_VOICE", "TTS_LANGUAGE"]:
        monkeypatch.delenv(key, raising=False)
    settings = load_settings()
    assert settings.tts_model == "xai/tts-1"
    assert settings.tts_voice == "rex"
    assert settings.tts_language == "en"


def test_explicit_voice_and_language_are_preserved(monkeypatch):
    monkeypatch.setenv("TTS_MODEL", "custom/model")
    monkeypatch.setenv("TTS_VOICE", "custom-voice")
    monkeypatch.setenv("TTS_LANGUAGE", "fr")
    settings = load_settings()
    assert (settings.tts_model, settings.tts_voice, settings.tts_language) == (
        "custom/model", "custom-voice", "fr"
    )
