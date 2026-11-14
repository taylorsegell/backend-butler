# Public beta

Backend Butler is available as an early, self-hosted public beta. The public repository uses a curated snapshot with fresh history; the development repository remains private. A release candidate is not a security certification or a promise of stable storage/API compatibility.

**Voice requires HTTPS in this beta.** The dashboard microphone, including dictation, does not work when Home Assistant is opened through an ordinary local HTTP address, including inside the Companion app. Home Wi-Fi is supported when the app or browser uses a trusted HTTPS URL; cellular is not a requirement. Text chat remains available over local HTTP. Native microphone support over local HTTP, while retaining Butler’s UI, is planned for a future release and is not included here.

## Install the voice-first stack

1. Read the root [README](../README.md) prerequisites. Enable Home Assistant's MCP Server integration, choose exposed entities, and create a dedicated access token.
2. Copy `.env.example` to `.env`, fill in your own Home Assistant and LiveKit credentials, and set unique scheduler/text service tokens. Keep the worker and scheduler on a trusted network. LiveKit Inference/model use can incur charges.
3. Follow the README's Docker Compose setup to run the worker and scheduler. Install the custom integration/card using [the Home Assistant guide](home-assistant.md). Add this repo as a HACS **Integration** custom repository and enable pre-release versions to select the beta tag. HACS store inclusion is a separate process.
4. Configure the integration with the same LiveKit project and worker name. Configure people and their permissions. Open the card over HTTPS, allow the microphone, and try a harmless device query before enabling write tools.
5. Verify voice → text → history/reconnect on the same conversation, reply mute/stop, dictation, and a disposable schedule. Check a second HA user cannot read or resume the first user's conversations.

The separate Agent SDK HA app in `apps/configuration-app/` is a different installation and model/auth path; see [its docs](butler-app/README.md). Installing the HACS integration does not install that app or the worker.

## Known limitations

- The LiveKit worker uses draft persistence APIs pinned to upstream Git commits and carries a build-time patch. Upstream availability is required for fresh builds. Back up `agent-data/` before upgrading; saved state is not a stable interchange format.
- Automated UI fixtures do not replace testing inside a real Home Assistant instance. Actual microphone permissions, LiveKit reconnects, paid inference, multiple users, and real devices need a release smoke test.
- The separate app currently emits a frontend chunk-size warning. Build succeeds; low-power-client performance has not been certified.
- Promo captures use synthetic data and are not evidence of a live integration test.

## OpenTelemetry security fix

The worker pins the API, SDK, and OTLP exporter family to patched OpenTelemetry 1.45.x through a narrow uv override, while retaining the LiveKit persistence Git pin. [GHSA-xcq7-p3pf-p88h](https://github.com/open-telemetry/opentelemetry-python/security/advisories/GHSA-xcq7-p3pf-p88h) is fixed by 1.45.1 and later; the lockfile resolves 1.45.2. Regression tests cover long malformed whitespace headers, oversized trace state, valid propagation, SDK span export, and LiveKit telemetry imports. Remove the override when the upstream persistence dependency allows patched versions.

## Beta release scope and validation

The maintainer accepted the local-HTTP microphone limitation for this beta on November 14, 2026. Native local-HTTP audio is separate future work, not a release gate for this version.

- The fresh public repository, private development archive, required CI checks and security settings are in place.
- Integration/card version is `1.1.0-beta.3`. The optional configuration app keeps its independent version. Beta.3 includes the microphone-start fix merged after beta.2 was published.
- Automated card checks cover Chromium and WebKit. Worker checks used an isolated candidate stack; household services were not restarted or upgraded for testing.
- An iPhone 17 user confirmed microphone startup through HTTPS on cellular after reproducing the unavailable microphone API on local HTTP. This is a startup check, not a complete physical-device acceptance pass.
- Background/reconnect behavior, Bluetooth routing, permission recovery and the other [phone checks](phone-beta-checklist.md) remain unverified on that phone. Beta testers should report results; these checks have not been marked passed.
- Closed-state backup/restoration passed with disposable conversation and scheduler data. Each installer must back up their actual deployment before upgrading.

Release tags are immutable. Require passing PR and tag CI before publishing a prerelease; do not replace an existing tag to deliver a fix.

## Monitor and roll back

For the first beta installations, monitor worker/scheduler logs, voice connection errors, permission failures, saved conversation recovery, and schedule execution. Do not collect raw home transcripts as telemetry. Ask testers to report version, HA/browser version, redacted errors, and reproduction steps through GitHub issues.

Stop rollout immediately for cross-user access, lost conversations, or unintended device actions. Stop the worker first to prevent new actions. Reinstall the previous integration version and redeploy the previous worker/app image or commit. Restore the matching pre-upgrade `agent-data/` and scheduler database backup if storage compatibility changed; keep a copy of the failed state for private investigation. Recheck authentication, a harmless voice query, saved history, and a disposable schedule before reopening access. There is no automatic database downgrade guarantee.

## Upgrading

Use the canonical repository and read [migration verification](beta2-migration.md) before upgrading an older checkout. Integration/card version is `1.1.0-beta.3`; the optional configuration app keeps its independent version. The beta.1 draft in the archived staging repository is superseded.
