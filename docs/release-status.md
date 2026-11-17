# Release preparation — 2026-11-17

## Prepared

- README poster/video replaced with the approved promo video.
- “For Home Assistant. Powered by LiveKit.” appears in the closing frame, graphics and promotion copy.
- [Promotion kit and posting copy](promotion.md) prepared; no announcement posted.
- Public repository: `taylorsegell/backend-butler`, default branch `main`.
- Private development repository: `taylorsegell/backend-butler-private`, default branch `main`, no open PRs at the initial audit.
- Current published prerelease is `v1.1.0-beta.6`. Keep beta.4 withdrawn. The next integration/card candidate is `1.1.0-beta.7`; its version fields, changelog and release notes are prepared without creating a tag or publishing a release.

## Pull requests to consolidate

- [#1 — Actions updates](https://github.com/taylorsegell/backend-butler/pull/1): full-commit pins retained, checkout token persistence disabled, supported hosted runners. The Actions update must pass fresh CI with the approved audit policy.
- [#10 — JavaScript updates](https://github.com/taylorsegell/backend-butler/pull/10): compiler API compatibility restored, Node types aligned to Node 22, explicit browser-fixture esbuild dependency, card bundle regenerated. Card unit/type checks and Chromium tests pass locally; configuration app has 385 passing tests and a passing typecheck/build. The beta.7 candidate includes aligned integration/card version fields, changelog and release notes. Full CI, including WebKit, must pass before merge.
- [#14 — README/demo/promotion kit](https://github.com/taylorsegell/backend-butler/pull/14): relative media links checked; video verified as 1920×1080 H.264/AAC. Merged into main after all required checks passed, including the approved exception described below.

## Approved temporary audit exception

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) is a high-severity denial-of-service advisory for repeated extglob patterns in picomatch through 4.0.7. As checked on 2026-11-17, GitHub lists no patched version and npm’s latest is 4.0.7. The upstream PR referenced by the advisory does not claim to fix the general single-branch issue.

Complete native audits report this advisory in build/test tooling. Production-only audits are clean. On November 17, the maintainer explicitly approved a seven-day exception limited to this advisory. The [exception record](security-audit-exception.md) defines exposure, mitigation, review owner and automatic expiry on November 24, 2026 at 19:32:35 UTC. Production high/critical findings, unrelated advisories and audit errors still fail. Required checks and branch protection remain enforced.

## Local security mitigation

Both JavaScript toolchains now select the [reviewed local picomatch patch](../apps/configuration-app/vendor/README.md) through native, integrity-pinned overrides. Required checks verify installed bytes and run bounded security/compatibility regressions. Upstream version metadata and the approved November 24 deadline remain unchanged. Refresh publication source snapshots after this patch merges.

## Final verification after unblock

1. Run all PR checks again and merge reviewed PRs into `main` without bypassing required checks.
2. Verify the resulting `main` commit passes `CI required`, including HACS, audits, browser tests and image builds.
3. Verify README poster and video links from the public repository and inspect the video on a phone.
4. If shipping new software, choose a fresh version in a release PR, synchronize integration/card versions, regenerate the bundle, run the required release and physical-device checks, then tag the tested commit. Do not retag beta.6.
5. Review the draft release and final promotion copy before publishing. Follow the [beta monitor/rollback guidance](public-beta.md#monitor-and-roll-back) for deployment changes.
