# Backend Butler 1.1.0-beta.4 — release candidate

This candidate adds a Live call screen with the glowing Butler logo and Transcript
on demand. Call starts continuous conversation after an explicit tap; there is no
Send button for each spoken turn. Pause/Resume and End control capture, while
Interrupt stops reply audio without pausing the call. Manual mode remains optional.

Home Assistant Companion can capture natively over local HTTP using the same UI
and linked-person history. Enable the bridge on both HA and the matching worker;
see [setup](native-audio.md). Browsers still require HTTPS/localhost for microphone
access. Requires HA 2026.11.1 or newer and a supported Companion capability.

The default speech voice is Grok Rex through LiveKit Inference. Explicit voice
settings are respected. Cloud audio recordings are disabled by default; saved
conversation history remains. Quiet sessions expire after inactivity and can resume
the selected conversation. Native sessions and camera signaling enforce per-user
ownership; knowing another session's IDs does not grant access.

## Upgrade preparation

Update the worker together with the integration/card. HACS does not update the
worker. Preserve existing history/scheduler/configuration-app data paths, tokens,
people and prompt/MCP overrides; see [migration verification](beta2-migration.md).
Do not run a second worker against the same history store. Back up actual deployed
state and retain the previous integration plus worker image/commit for rollback.
The separate configuration app keeps its independent version.

## Acceptance and limits

The tester confirmed logo rendering and continuous calls on an iPhone 17 in
Companion using local HTTP. Automated standard-package tests cover native WebRTC
PCM, playback, user isolation, history, reload and idle cleanup; a real isolated
worker produced consecutive automatic STT/model/Grok replies without manual commits.
The remaining [phone checklist](phone-beta-checklist.md) is still a release gate.
This does not establish Bluetooth, Android or universal background compatibility.
Linux AMD64 is the CI image target. Draft persistence and provider costs remain
beta limitations.

This is prepared release text. No beta.4 tag, release publication or household
installation update is authorized merely by preparing this candidate.
