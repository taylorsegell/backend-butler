# Backend Butler 1.1.0-beta.3

**Voice requires HTTPS in this beta.** The dashboard microphone, including dictation, does not work when Home Assistant is opened through an ordinary local HTTP address, including inside the Companion app. Home Wi-Fi is supported when the app or browser uses a trusted HTTPS URL; cellular is not a requirement. Text chat remains available over local HTTP. Native microphone support over local HTTP, while retaining Butler’s UI, is planned for a future release and is not included here.

## Changes

- Request microphone capture from the initiating tap before waiting for a voice connection.
- Release pending capture on cancellation or card removal, and distinguish capture failures from missing permission.
- Include diagnostic details for microphone errors and keep text chat available after capture fails.

Beta.3 includes the merged microphone repair that was absent from the published beta.2 tag. Native local-HTTP audio is deferred; this release does not add a native audio adapter or change the voice interface.

## Install or upgrade

Add `taylorsegell/backend-butler` as a HACS **Integration** custom repository and enable prerelease versions to select `v1.1.0-beta.3`. The worker and scheduler are separate Compose services; installing the integration does not install them.

Read [migration verification](beta2-migration.md) before updating an older checkout. Preserve `agent-data/`, `ha-notify-scheduler/data/`, configuration-app data and prompt/MCP overrides. Back up actual deployment state before upgrading. The optional configuration app keeps its independent version.

## Validation and remaining limits

Controlled full-card tests cover Chromium and WebKit, including cancellation and microphone cleanup. An iPhone 17 user confirmed microphone startup over HTTPS on cellular; local HTTP reproduced the missing capture API. Broader physical-phone checks, including backgrounding, reconnects, Bluetooth and permission recovery, remain unverified. See the [phone checklist](phone-beta-checklist.md); this beta does not claim a complete device acceptance pass.

Worker smoke tests used an isolated candidate stack. No household worker, scheduler or data was migrated during these checks. Linux AMD64 is validated by CI; ARM64 and older Python versions are not covered by this matrix. Draft LiveKit persistence APIs, inference/provider costs and the configuration-app chunk-size warning remain beta limitations.

Report version, HA/app/browser version, whether the HA URL uses HTTP or HTTPS, redacted errors and reproduction steps. Do not include credentials or household transcripts.
