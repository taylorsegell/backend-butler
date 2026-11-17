# Backend Butler 1.1.0-beta.6

Beta.6 fixes the Home Assistant integration's settings and branding. It keeps the
Live call UI, native Companion microphone over local HTTP, Grok Rex through
LiveKit, and saved conversation history from beta.5.

## Changes

- Remove **Music server URL** from first-time setup and Configure. Previously
  saved connections remain intact when other settings are edited.
- Preserve stored options when saving the smaller form, and validate native
  audio against the merged settings.
- Show the existing Butler logo on the integration page instead of “icon not
  available.” Package transparent light/dark icons with high-resolution variants
  through Home Assistant's local brands API.
- Require full HACS validation, including branding, plus Home Assistant Hassfest
  validation for catalog readiness. Default-catalog inclusion requires a separate
  upstream submission and approval; this release does not claim it is listed.

## Install or upgrade

Add `https://github.com/taylorsegell/backend-butler` to HACS as an **Integration**
custom repository, then select `v1.1.0-beta.6` in the version picker. Restart Home
Assistant and reload the frontend after installation. Requires **HA 2026.11.1 or
newer**. Keep the existing integration entry and settings.

HACS installs the integration/card only. Worker source is unchanged from beta.5;
an existing beta.5 worker remains compatible. A fresh installation still needs the
worker and household service configured separately. Enable native audio on both
the worker and integration for supported Companion microphone capture over local
HTTP. Browsers still require HTTPS/localhost for microphone access. See
[native audio setup](https://github.com/taylorsegell/backend-butler/blob/v1.1.0-beta.6/docs/native-audio.md).

Back up actual deployment configuration/history before updating. Preserve existing
history and scheduler data paths, linked people, tokens and prompt/MCP overrides.
Do not run two workers against the same writable history store. This update does
not migrate history or change runtime data paths. The optional configuration app
keeps its independent version.

## Validation and limits

The settings patch passed 20 HA tests, copied-package native WebRTC/PCM/playback
and history tests, 30 cross-user access checks, and reload/idle/remapping/uninstall
cleanup. Real isolated HA browser checks confirm the correct logo and Configure
form without the music field. Release validation also runs Chromium/WebKit,
worker/service/app tests, dependency audits, history secret scanning, Compose
checks, three Linux AMD64 image builds, HACS and Hassfest.

The user accepted the seven iPhone checks on the isolated standard integration
and confirmed a successful call after beta.5 was installed on HAOS. Beta.6 does
not change the voice transport. Exact iOS/Companion build numbers were not recorded.
Android, Bluetooth/headsets, ARM64 and universal background compatibility remain
outside the verified matrix. Draft persistence APIs and provider costs remain beta
limitations. Cloud audio recordings stay off by default; saved history remains.

Report release, HA/app/browser versions and redacted reproduction details. Do not
include credentials or private conversations.
