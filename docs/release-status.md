# Release preparation — 2026-11-17

## Prepared

- README poster/video replaced with the approved 24-second voice demo.
- “For Home Assistant. Powered by LiveKit.” appears in the closing frame, graphics and promotion copy.
- [Promotion kit and posting copy](promotion.md) prepared; no announcement posted.
- Public repository: `taylorsegell/backend-butler`, default branch `main`.
- Private development repository: `taylorsegell/backend-butler-private`, default branch `main`, no open PRs at the initial audit.
- Current published prerelease is `v1.1.0-beta.6`. Keep beta.4 withdrawn. No new software version or release is created by the media update.

## Pull requests to consolidate

- [#1 — Actions updates](https://github.com/taylorsegell/backend-butler/pull/1): full-commit pins retained, checkout token persistence disabled, supported hosted runners. Earlier CI passed; the shared dependency-audit issue below also affects a fresh validation of its base tree.
- [#10 — JavaScript updates](https://github.com/taylorsegell/backend-butler/pull/10): compiler API compatibility restored, Node types aligned to Node 22, explicit browser-fixture esbuild dependency, card bundle regenerated. Card unit/type checks and Chromium tests pass locally; configuration app has 385 passing tests and a passing typecheck/build. Full CI, including WebKit, must pass before merge.
- [#14 — README/demo/promotion kit](https://github.com/taylorsegell/backend-butler/pull/14): relative media links checked; video verified as 24 seconds, 1920×1080 H.264/AAC. Fresh CI currently fails its JavaScript audits on the advisory below.

## Publication blocker

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) is a high-severity denial-of-service advisory for repeated extglob patterns in picomatch through 4.0.7. As checked on 2026-11-17, GitHub lists no patched version and npm’s latest is 4.0.7. The upstream PR referenced by the advisory does not claim to fix the general single-branch issue.

The current complete card/app audits fail. Production-only audits report zero vulnerabilities for both projects; the affected dependency paths here are build/test tooling. The configuration-app runtime image prunes development dependencies. These facts limit exposure but do not satisfy the current release gate: CONTRIBUTING requires JavaScript high/critical audits to pass, including development dependencies.

No advisory has been ignored, audit severity lowered, branch protection bypassed or merge forced. Recheck the advisory and package releases before publication. A maintainer decision is needed if considering a narrowly scoped, time-limited exception while no upstream patch exists; any such decision must record the reachable input paths, mitigation, expiry and review owner. No exception is approved by this document.

## Final verification after unblock

1. Run all PR checks again and merge reviewed PRs into `main` without bypassing required checks.
2. Verify the resulting `main` commit passes `CI required`, including HACS, audits, browser tests and image builds.
3. Verify README poster and video links from the public repository and inspect the video on a phone.
4. If shipping new software, choose a fresh version in a release PR, synchronize integration/card versions, regenerate the bundle, run the required release and physical-device checks, then tag the tested commit. Do not retag beta.6.
5. Review the draft release and final promotion copy before publishing. Follow the [beta monitor/rollback guidance](public-beta.md#monitor-and-roll-back) for deployment changes.
