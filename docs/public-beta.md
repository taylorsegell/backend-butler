# Release and support guide

Backend Butler 1.1.0 is the stable integration/card release, including the latest native voice playback guard, long-caption following, WebKit composer repair and frontend/tooling updates. See the [release notes](release-notes.md). Earlier beta tags remain unchanged; beta.4 stays withdrawn.

## Install or upgrade

Use Home Assistant **2026.11.1 or newer**. Keep the worker and scheduler on a trusted
network. Follow the [README](../README.md), [HA guide](home-assistant.md) and
[native audio setup](native-audio.md). Marketplace installs the HA integration/card only;
update the matching worker separately before enabling native capture. Retain the
existing history volume and person mapping, and never run two workers against the
same writable history store. The optional configuration app has its own version.

Companion native capture works over local HTTP after enabling it on HA and the
worker. Browsers retain HTTPS/localhost microphone requirements. Opening Live does
not open the microphone; Call starts a continuous conversation. Pause/End release
capture. Interrupt stops reply audio while keeping continuous capture open. Transcript
shows the same conversation, selected history and draft.

Stable 1.1.0 does not require beta opt-in. Enable Butler’s **Pre-release** entity and switch only if you want future beta updates; the [setup guide](home-assistant.md#beta-versions-and-updates) covers version selection.

## Release gates

- Require a reviewed release PR and `CI required`:
  card/browser checks, worker/service/app tests, security audits, image builds,
  Compose migration checks, repository hygiene, and HACS validation.
- Keep integration/card versions at `1.1.0`, regenerate the card bundle and
  build the matching worker. Do not change the optional app's independent version.
- The iPhone tester confirmed logo rendering, continuous calls and all seven
  [physical phone checks](phone-beta-checklist.md) on the standard isolated
  beta.6 candidate. The subsequent native voice repair received positive user feedback on the installed iPhone setup. No new full device-matrix signoff is claimed for 1.1.0; automated browser/native checks do not certify other devices or audio routes.
- Install the HA package tests under the matching official core constraints,
  including AV 19. An unconstrained venv does not model the HAOS resolver.
- Capture actual deployment backups and the previous integration/worker versions
  before any household update. Keep release publication and installation updates
  separate from release-candidate preparation.
- Create a new immutable version tag at the tested commit. Tag CI must
  pass before the workflow creates a draft release; review it before publishing.

The maintainer-approved build/test-only picomatch audit exception expires November 24, 2026 at 19:32:35 UTC. Production high/critical findings and unrelated advisories remain blocking. See the [exception record](security-audit-exception.md).

## Known limits

Native signaling is verified on HA 2026.11.1 and requires a supported Companion
capability. Browser HTTP voice remains unavailable. The supported build matrix is
Linux AMD64; ARM64, other phone platforms, Bluetooth and background/lock-screen
behavior are not certified by the current tests. Record actual phone results.

The worker uses draft persistence APIs pinned to upstream commits and build-time
patches. Back up `agent-data/` before upgrading; storage is not a stable interchange
format. The optional configuration app emits a known frontend chunk-size warning.
Inference/model use can incur charges. Cloud audio recordings are off by default;
conversation history remains enabled. Idle sessions disconnect after inactivity.
See [voice resource policy](voice-session-policy.md).

## Monitor and roll back

Monitor connection/capture failures, permission recovery, history resumes and
scheduler errors without collecting household transcripts. Stop rollout for lost
history, cross-user access or unintended actions. Restore the previous integration
and matching worker image/commit, preserving a copy of failed state. If a storage
restore is needed, use the matching pre-upgrade backups of history and scheduler
data; there is no automatic database downgrade guarantee. Recheck authentication,
a harmless query and saved history before resuming rollout.
