# Native capture with Butler UI retained

## User requirements
Normal Home Assistant users must be able to use local HTTP in the Companion app without configuring DNS or HTTPS. Butler must retain its current UI; opening a separate native Assist screen is unacceptable. These product requirements supersede the installation-specific DNS proposal in LAN-VOICE.md.

## Verified upstream work
Home Assistant iOS PR #5942, merged October 22, 2026: https://github.com/home-assistant/iOS/pull/5942
It adds native audio-only WebRTC microphone streaming through the external bus, without launching Assist. Commands: `webrtc/stream/start` with `{stream_type: "microphone", entity_id}`, `webrtc/stream/stop` with `{session_id}`, and a `webrtc/stream/stopped` event. Capability: `config/get` -> `webrtc.hasCameraMicrophoneStream`; false on Mac Catalyst in that change.

The source patch was inspected through the connected GitHub app. CameraMicrophoneSession creates a native microphone WebRTC peer and uses Home Assistant camera WebRTC signaling, rather than exposing a browser MediaStream. The API currently targets a camera entity. It is not an arbitrary LiveKit microphone track and is not a drop-in Butler transport. An implementation must establish whether clean reuse is supported or whether upstream generalization is needed; do not assert this is ready for Butler. An installed-app version/capability check and an actual-device test are still needed.

Native Assist's separate `assist/show` API launches the native Assist interface and does not meet the user's retained-UI requirement. Earlier advice that native capture necessarily requires this interface was too categorical given the newer WebRTC bridge.

## Proposed architecture and proof
Keep the Butler card responsible for microphone controls, transcript, approvals, and session status. Put browser capture and native capture behind one audio-transport interface. A native path needs an authenticated, owner-bound receive/relay into the Butler voice session; the existing iOS bridge itself sends to HA's camera WebRTC signaling. Test native capture over ordinary LAN HTTP reaching an isolated Butler worker while the card remains visible, then stop/cancel, late grants, backgrounding, and reconnection cleanup. Only claim general compatibility after testing supported app versions/platforms.

No implementation or deployment was performed in this research pass. No DNS, proxy, Home Assistant, worker, or household data settings were changed.

## Isolation and release decision

The user elected to release the current beta with an explicit caveat: dashboard voice requires HTTPS and cannot capture a microphone over ordinary LAN HTTP. HTTPS can still be used on a local network. Native local-HTTP audio remains future work and must not be implemented or merged into that beta.

This research was copied into a dedicated managed worktree, branch `codex/native-local-audio`, based on public repository main at `6f0e6cc698db7c6f1ac3e339e20cbf9df28040a2`. The existing dirty development checkout and all data paths were preserved. No native-audio implementation exists in either checkout at the time of isolation.

The next implementation step, when requested, is a narrowly scoped feasibility proof of native microphone audio reaching an isolated Butler session over local HTTP while Butler's existing UI remains visible. Validate the camera-specific bridge contract and installed-app capability before promising compatibility. Do not launch Assist as a substitute for the required UI, and do not change household services or DNS to claim success.


## Isolated implementation evidence (2026-11-14)

The authorized proof now lives in `experiments/native-audio/` on the isolated branch. The opt-in card transport uses the native bus while retaining Butler's Root and styles. The external bus's `webrtc/stream/stopped` notification becomes the frontend DOM event `webrtc-stream-stopped`; the card handles this DOM event.

Automated checks demonstrated the existing card on insecure HTTP, with browser capture unavailable, sending native bridge commands to an emulated peer. Real authenticated HA camera signaling, WebRTC decoding and delivery into a LiveKit AudioSource passed, including Send/Cancel cleanup. A disposable HA login and Lovelace rendering passed at mobile width without page errors. Native capability remains checked at runtime; an unavailable native bridge now produces a lab-specific message rather than directing users to configure HTTPS.

This is a transport feasibility proof with a synthetic session adapter: there is no production worker/room connection, STT, model or home control. The experimental camera receiver uses one disposable admin account and is not production multi-user authorization. The subsequent physical iPhone Companion test produced an “Audio received…” receipt, confirmed by the user. The receiver reported 371 decoded/SDK frames and 356,160 samples at 48 kHz (7.42 seconds), inactive at inspection. Basic native HTTP delivery and the receipt are verified on that device; physical Cancel/background behavior and speech intelligibility remain unverified. See `experiments/native-audio/README.md` for the exact boundary, evidence and phone checklist. No beta bundle or household configuration was modified.

## Isolated speech session and physical reply (2026-11-14)

The user authorized connecting native audio to an isolated Butler session while retaining the existing UI/local HTTP and leaving the beta/house alone. The experiment now has an explicit speech mode. A separate authenticated loopback process runs a real LiveKit AgentSession with the configured STT/LLM/TTS services, a tool-free Butler prompt and ephemeral memory. Native PCM streams into its custom AudioInput; actual transcripts/answers flow back through authenticated HA events and real reply PCM plays through WebAudio inside the existing card. The browser does not acquire its microphone and no Assist screen or production room/worker is joined.

A full synthetic speech/browser check passed with genuine HA WebRTC, speech recognition, model response, synthesized audio scheduled for playback and Cancel cleanup. The user then confirmed that both transcript and spoken reply work on their iPhone in Companion over local HTTP. This establishes the basic end-to-end device path, beyond the earlier transport receipt. Physical background/Bluetooth/continuous-mode coverage and production signaling authorization remain outstanding. See the experiment README for the exact limits and reproducible commands. Only temporary model-service configuration was reused; no household, scheduler or tool credentials/data were copied, and no beta or household service was changed.


## Per-user candidate boundary (2026-11-15)

The user authorized a per-user/per-session bridge and adversarial two-user proof, with the existing UI/local HTTP retained and no changes to beta, house or unrelated edits. The isolated branch now has an owner-bound registry, separate endpoint/receiver/model/history/reply stream per session, and per-card client state. Three version-pinned camera signaling handlers are guarded for the reserved Butler prefix; the authenticated principal reaches entity callbacks and bypass attempts fail closed. Unrelated camera handlers retain their original behavior. Active ordinary users are supported and administrators receive no cross-user bypass through these APIs.

A new candidate HA on loopback 18124 and speech service on 18953 left the working phone lab and household services untouched. Real HA tests with ordinary Alice/Bob accounts denied 34 known-ID cross-user/admin requests, verified simultaneous separate WebRTC audio and real model reply streams, independent stop, stale-session rejection and an empty replacement session. Unit checks cover principal propagation, direct callback denial, concurrent limits, immediate revocation and cleanup ordering. The existing HTTP card passed with the new protocol and emulated native capture. Full physical iPhone acceptance of this updated candidate remains separate from the earlier single-user phone result. See the experiment README and SECURITY-BOUNDARY.md for scope, evidence and reproduction.


### Real worker and persistent history (2026-11-15)

The authorized integration now uses an opt-in native PCM WebSocket on the actual worker HTTP app, with the existing HomeAssistantAgent and configured STT/LLM/TTS. It acquires and saves owner-checked conversations through the existing RemoteSession/VoiceAuthority and SDK persistence, including usage totals. Authenticated HA fixes the owner and selected conversation in the service handshake; the browser never receives the service credential or chooses another owner. An allowlisted HA proxy connects the existing history drawer to actual worker conversation APIs. Native reconnect skips competing text-session warmup, reads live connection state, and waits for durable close/release; late settings cannot resurrect an ended bridge. Persistence loss stops the agent.

Verification used a separate loopback worker and read-only synthetic HA fixture with fresh `/tmp/butler-native-worker-lab/history`. Both ordinary users retained their own history/context after disconnect and a guarded restart of only that worker; known foreign IDs failed list/read/select/delete/lease checks and duplicate active leases were rejected. All 34 prior known-ID audio/signaling attacks still failed in actual worker mode. The existing UI on insecure HTTP passed real speech/reply playback scheduling, Cancel, new conversation, exact-history preview and resume. Regression results: 47 worker tests, 19 HA tests, three live isolation/persistence tests, TypeScript and lifecycle/API/playback checks passed.

These are automated candidate results with emulated native hardware, distinct from the earlier physical iPhone confirmation. The final worker/history candidate still needs physical phone acceptance before promotion. No beta, household HA/worker, household data paths, original working phone lab or unrelated edits were changed. The flag defaults off. See the experiment README and WORKER-HISTORY.md for the bounded integration contract and reproduction.


### Physical worker/history candidate acceptance (2026-11-15)

The user explicitly authorized upgrading the existing phone lab and reusing its login. The lab was backed up and restarted at its same LAN HTTP address, retaining credentials and pointing to the separate real-worker test instance/history directory. Actual Lovelace login/mobile controls and genuine speech/history browser smoke checks passed before handover. No beta, household services or household data were changed.

The user reported all five physical iPhone 17 Companion checks passed: retained UI/login, native microphone transcript and spoken reply on Wi-Fi/local HTTP, Cancel cleanup, new/preview/resume with conversation-local model recall, and saved context after fully quitting/reopening the app. This closes the core physical acceptance gap for candidate `f31d338`; it does not establish background/lock-screen, Bluetooth, continuous-mode or cross-platform compatibility, nor authorize beta promotion/publication. The version-pinned camera signaling integration remains experimental. Full phone acceptance details and rollback context are in the experiment README.
