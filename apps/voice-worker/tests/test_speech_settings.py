"""English installations use an identified voice; custom speech choices still win."""

from config import load_settings


def test_unconfigured_speech_uses_documented_english_voice(monkeypatch):
    for key in ["TTS_MODEL", "TTS_VOICE", "TTS_LANGUAGE"]:
        monkeypatch.delenv(key, raising=False)
    settings = load_settings()
    assert settings.tts_model == "fishaudio/s2.1-pro"
    assert settings.tts_voice == "b347db033a6549378b48d00acb0d06cd"
    assert settings.tts_language == "en"


def test_explicit_voice_and_language_are_preserved(monkeypatch):
    monkeypatch.setenv("TTS_MODEL", "custom/model")
    monkeypatch.setenv("TTS_VOICE", "custom-voice")
    monkeypatch.setenv("TTS_LANGUAGE", "fr")
    settings = load_settings()
    assert (settings.tts_model, settings.tts_voice, settings.tts_language) == (
        "custom/model", "custom-voice", "fr"
    )
