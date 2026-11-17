# Backend Butler 1.1.0-beta.7 — release candidate

**Unpublished candidate.** This version is prepared on the default branch; create its immutable tag only after the final CI and release acceptance checks pass.

For Home Assistant. Powered by LiveKit. Voice first; chat when you want.

## Changes

- Apply the [pinned local picomatch security patch](../apps/configuration-app/vendor/README.md) in both build/test toolchains. Require byte verification and bounded attack tests; retain the existing November 24 audit exception deadline because upstream version-based scanners still identify 4.0.7.

- Refresh the card’s Motion/Vite dependencies and the configuration app’s JavaScript dependencies. Retain TypeScript 5.9.3 for the card’s compiler-API test harness and Node 22 types for the supported app runtime.
- Declare esbuild directly for browser test fixtures after Vite 8 removed that transitive dependency. Regenerate the Home Assistant card bundle.
- Update pinned CI Actions while retaining required browser, worker/service/app, HACS, image, audit and secret-scan checks.
- Add the current voice-conversation promo video, warm promo graphics and “For Home Assistant. Powered by LiveKit.” credit to the README and [promotion kit](promotion.md). The mobile wireframe illustrates fictional requests and speaking states; the video contains music and conveys dialogue visually.

## Install or upgrade after publication

In **Settings → Marketplace → Add from link**, add `https://github.com/taylorsegell/backend-butler` as an **Integration** (connect GitHub if prompted). Follow the [beta version instructions](home-assistant.md#beta-versions-and-updates) to enable prereleases. Once published, choose `v1.1.0-beta.7`, restart Home Assistant and reload the frontend. Requires **Home Assistant 2026.11.1 or newer**. Keep the existing integration entry and settings.

Marketplace installs the integration/card only. This candidate changes neither the voice-worker nor household-service source; existing beta.5/beta.6 matching worker setups remain compatible. A fresh installation still needs both services configured separately. Enable native audio on the worker and integration for supported Companion microphone capture over local HTTP. Ordinary browsers require HTTPS/localhost for microphone access. See [native audio setup](native-audio.md).

Back up actual deployment configuration/history before updating. Preserve linked people, tokens, prompt/MCP overrides and existing history/scheduler data paths. Do not run two workers against the same writable history store. There is no history migration in this candidate. The optional configuration app retains its independent version.

## Audit exception and validation

The maintainer approved a seven-day exception for [GHSA-fc5q-39xc-vjpf](security-audit-exception.md) in build/test dependencies only, expiring **November 24, 2026 at 19:32:35 UTC**. No patched picomatch release was available at approval. Native production audits remain blocking; all unrelated high/critical advisories, severity increases, audit failures and expiry fail CI. This is a temporary accepted tooling risk, not a security fix.

Card unit/type checks and Chromium tests passed locally; the configuration app passed 385 tests, typecheck and build. Final `CI required` must pass on the merged candidate, including WebKit, HA/native tests, Python/service tests, image builds and HACS. The existing app chunk-size warning remains.

Physical iPhone acceptance was recorded for beta.6. Repeat continuous calling, reply playback/Interrupt and saved-history checks on beta.7 before tagging because the frontend dependencies changed. Broader phone platforms, Bluetooth/headsets, ARM64 and universal background behavior remain outside the certified matrix. Keep cloud audio recordings off by default and retain saved history. Inference charges and draft persistence APIs remain beta limitations.

## Publish and promote

Use the approved video and [prepared post copy](promotion.md), including [media attribution](../media/README.md). Tag only the accepted, CI-passing commit; let tag CI create the draft prerelease, then review it before publishing. Keep beta.4 withdrawn and existing tags immutable. Monitor installation, capture/reconnect and history reports using [the beta rollback guidance](public-beta.md#monitor-and-roll-back).
