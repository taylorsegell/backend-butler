# Voice session resource policy

LiveKit remains the voice framework and RTC transport. Saved per-user conversation history remains in the existing worker store. This change controls session lifetime and cloud audio uploads; it does not migrate data, switch speech providers or replace the UI.

## Recording

Normal RTC sessions explicitly pass `record={"audio": False}` to the pinned LiveKit SDK by default. `CLOUD_AUDIO_RECORDING_ENABLED=true` opts into audio uploads; the LiveKit project must also allow observability recording. The SDK's other recording categories (logs, traces and transcripts) continue to follow the project setting. The isolated native bridge retains its stricter `record=False`, which uploads no observability data. Text-only sessions do not record audio.

The recording argument is independent of `persist=RemoteSession`. SDK conversation snapshots, ownership, tool context and token totals still save through VoiceAuthority to the same conversation files. This policy does not delete existing cloud recordings or restore previously consumed monthly quotas. Changing the policy affects newly started sessions after deployment.

## Idle behavior

`VOICE_IDLE_TIMEOUT` defaults to 120 seconds and must be finite and greater than zero. Its deadline uses the event loop's monotonic clock. Nonempty transcriptions, conversation items and deliberate start/end/cancel/text actions reset the grace period. Speaking, model thinking/speaking, running function tools and scheduled deferred tool replies suspend expiry. Completion starts a full quiet grace period. A closed agent clears stale busy states so they cannot hold a quiet room open. Open microphones, silent PCM frames, state/settings requests and history/lease polling alone do not keep a connection alive. This is an inactivity bound, not a maximum time limit on active work.

On RTC expiry, a single shared close saves the final SDK snapshot and releases the owner-bound lease. The worker sends a normal `ha.session_idle` notice and deletes only that session's room, disconnecting all its participants. HA creates a separate random room for every voice request. A failed conversation acquisition gets the same bounded room lifetime while its error remains readable. If the final save fails, the client receives a conversation error instead of a successful idle notice; release and room shutdown are still attempted. If room deletion fails, the worker logs it and shuts down its job; client-side cleanup also handles the notice, but a network/API failure can prevent immediate server-side deletion.

On native expiry, save/release completes before the idle notice and WebSocket close. HA revokes the bridge and closes its receiver/camera even if the browser is suspended. The card handles the notice through its existing End voice path, releasing native/browser capture and playback without a microphone-failure message. It retains the selected conversation and visible transcript. The next explicit send/speak obtains a fresh session and resumes saved history; auto-connect does not create an idle reconnect loop. Abrupt network loss can prevent delivery of the idle notice, so physical interruption behavior still needs phone acceptance.

Text HTTP/A2A conversations use the separate existing `TEXT_IDLE_TIMEOUT` unload policy and do not gain RTC connections from this change.

## Verification

The checks use synthetic event/model/room boundaries and fresh temporary SQLite files. They make no paid speech/model requests and do not require a running household or beta service.

- SDK-event tests cover quiet expiry, real speech/activity reset, long generation/playback, concurrent tools/deferred replies and timer disposal.
- RTC entrypoint tests check recording opt-in, save/release ordering before whole-room deletion, overlapping user/idle disconnect, and failure reporting.
- An actual SDK session and real SQLite store prove that an idle close releases the lease and restores both history and agent context on resume, with audio recording off.
- Native socket tests prove status/history polling cannot prevent expiry, durable close precedes the notice, and reconnect retains saved items.
- HA tests prove idle bridge revocation without a browser and no cross-user impact; relay idle closure emits no speech error or redundant close handshake.
- The actual card browser fixture verifies mic release, retained history, no recovery error, no automatic reconnect and explicit reconnect for normal/auto-connect configurations. The old card fails this regression.

Chromium, TypeScript and production build checks run locally. WebKit cannot run on this host because its system libraries are missing; idle behavior still needs physical iPhone signoff. The tester has confirmed the current logo and continuous call; see the phone checklist for the remaining scope.

This policy is part of the beta.4 candidate. Its isolated phone installation uses the matching standard integration and worker; no household installation, cloud project setting or existing data path is changed by preparing the release.

References: [LiveKit session recording options](https://docs.livekit.io/reference/agents/session-recording-options/), [resource definitions and quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/), and the locally installed pinned SDK's AgentSession/JobContext APIs.


Verification includes worker idle/persistence regressions, owner-bound HA receiver/signaling checks, the compiled standard card in disposable HA, and real isolated continuous speech through STT/model/Grok. No household or beta service was changed. The tester confirmed the logo and continuous call on iPhone; the remaining physical acceptance is tracked in [the phone checklist](phone-beta-checklist.md). Fresh release-wide CI is required on the beta.4 commit.
