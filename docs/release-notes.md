# Backend Butler 1.1.0

Stable release for Home Assistant 2026.11.1 or newer. For Home Assistant. Powered by LiveKit.

## Changes

- Prevent native calls from transcribing Butler’s own replies. Recognition waits for confirmed device playback and fresh local speech evidence; known low-confidence transcripts are rejected before history or tool actions.
- Keep the latest lines of long Live responses visible as text streams or reflows. Earlier text remains scrollable and call controls stay in frame.
- Avoid a WebKit layout loop when opening the transcript composer.
- Include the refreshed frontend dependencies, pinned CI updates, installation guidance and locally patched picomatch build tooling accumulated since beta.6.

## Install or upgrade

Install the stable `v1.1.0` integration/card through HACS or Home Assistant Marketplace using `https://github.com/taylorsegell/backend-butler`. Beta opt-in is not required. The default-store submission is still under review; add the repository by link if it is not listed yet. See the [installation guide](home-assistant.md).

**Upgrade the worker, integration and card together.** HACS/Marketplace installs only the integration and bundled card. Update the separately deployed worker from the same `v1.1.0` tag, preserve its environment and data mounts, and rebuild/restart that worker. Restart Home Assistant after installing the integration and refresh Companion/browser to load the matching card. Older cards do not acknowledge playback and will time out against the repaired native worker. Use the call controls to interrupt native spoken replies; automatic voice interruption is disabled during playback.

Back up configuration and history first. Preserve linked people, tokens, prompt/MCP overrides and existing worker/scheduler data paths; never run two workers against the same writable history store. This release adds no history migration. The optional configuration app keeps its independent version. Publishing this release does not automatically update an existing household deployment.

## Validation and support limits

The release is gated by card type/unit tests, Chromium and WebKit browser regressions, worker/service/app tests, copied standard-HA/native-audio package tests, image builds, HACS/Hassfest, audits and secret scanning. The native speech tests cover playback acknowledgements, silence rejection and confidence handling; caption regressions cover long streaming replies, text reflow, view changes and mobile widths.

Existing iPhone acceptance and subsequent feedback on the installed native voice repair are recorded. No broader device certification is implied: ARM64, other phone platforms, Bluetooth/headsets and universal background behavior remain outside the verified matrix. Ordinary browser microphones require HTTPS/localhost; supported Companion native capture over local HTTP remains opt-in. See the [support and rollback guide](public-beta.md).

The maintainer-approved development-only picomatch advisory exception expires November 24, 2026 at 19:32:35 UTC. Installed tooling uses a reviewed, integrity-pinned local patch; version-based scanners still report the upstream advisory. Production high/critical findings, unrelated advisories, audit failures and expiry remain blocking. See the [exception record](security-audit-exception.md).

LiveKit persistence APIs remain pinned upstream draft APIs, so retain state backups. Inference can incur charges. Cloud audio recordings remain off by default; saved conversation history remains enabled. Known frontend build warnings do not represent browser runtime failures.
