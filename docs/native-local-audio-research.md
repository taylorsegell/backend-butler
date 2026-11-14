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
