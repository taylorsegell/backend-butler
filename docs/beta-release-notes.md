# Backend Butler 1.1.0-beta.5

Beta.5 corrects the HAOS installation failure in the withdrawn beta.4: aiortc 1.16.0 supports HA 2026.11.1's AV 19 constraint. The package is now tested under official core constraints, without downgrading shared HA media dependencies.

Live calls now use the glowing Butler logo, with the transcript available on demand. Tap Call once to start continuous conversation; spoken turns no longer require Send. Pause/Resume, Interrupt, Sound and End remain in the same UI.

Supported Home Assistant Companion apps can use their native microphone over **local HTTP**, without opening Assist or configuring local HTTPS. The bridge is opt-in and requires **Home Assistant 2026.11.1 or newer** plus the matching worker. Web browsers still require HTTPS or localhost for microphone capture.

## Changes

- Keep voice, transcript, draft, reading position and saved conversation context together when switching views.
- Use Grok Rex through LiveKit Inference as the default voice (`TTS_MODEL=xai/tts-1`, `TTS_VOICE=rex`, `TTS_LANGUAGE=en`). Explicit worker voice settings take precedence.
- Disable cloud audio recordings by default and close inactive voice sessions after 120 seconds, saving and releasing the conversation before disconnecting. Saved conversation history remains available.
- Enforce per-user ownership of native sessions, camera signaling and saved conversations, including during settings changes, reload and cleanup.
- Correct logo transparency and retain an SVG fallback when the browser cannot provide the required WebGL output.

## Install or upgrade

Select `v1.1.0-beta.5` from the `taylorsegell/backend-butler` HACS Integration repository with prereleases enabled. **HACS updates the integration/card only; update the worker from this same tag separately.** The optional configuration app keeps its independent version.

Before upgrading, back up actual deployed configuration/history and retain the old worker image and integration. Preserve existing `agent-data/`, `ha-notify-scheduler/data/`, configuration-app data, tokens, linked people and custom prompt/MCP files. Do not run two workers against one writable history store. See [migration guidance](https://github.com/taylorsegell/backend-butler/blob/v1.1.0-beta.5/docs/beta2-migration.md).

To enable local HTTP voice, set `NATIVE_AUDIO_ENABLED=true` on the matching worker, then enable **Companion native microphone** in the existing Backend Butler integration's Configure options. Keep the existing worker chat URL/service token and scheduler URL/token. Link the HA login to its existing person in Butler Settings. Enable spoken replies in the card and reload Companion. See [native audio setup](https://github.com/taylorsegell/backend-butler/blob/v1.1.0-beta.5/docs/native-audio.md) for network and capability requirements.

## Validation and beta limits

The iPhone 17 tester confirmed the logo and continuous calls over local HTTP in Companion, then reported all seven acceptance checks passed: capture controls, interrupt/sound, transcript/draft continuity, saved context after app restart, idle expiry/reconnect, background/network recovery and permission recovery. Exact iOS/Companion build numbers were not recorded. These results do not establish Android, Bluetooth/headset or universal background compatibility.

The release tag passed Chromium/WebKit checks, worker and scheduler tests, standard-package native WebRTC/history/ownership/reload tests, Compose validation, all three Linux AMD64 image builds, dependency audits, full-history secret scanning and HACS validation. Two-user authorization tests reject cross-user access. Physical phone acceptance used an isolated installation with household controls disconnected.

Linux AMD64 is the validated image target; ARM64 is outside this matrix. Draft LiveKit persistence APIs, inference/provider charges and the configuration app's bundle-size warning remain beta limitations. Disabling recordings does not erase prior usage or remove separate provider quotas.

Report the release, HA/app/browser versions, HTTP versus HTTPS and redacted reproduction details. Do not include credentials or private conversation transcripts.
