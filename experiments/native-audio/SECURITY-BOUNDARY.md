# Per-user native audio boundary

Authorized scope: implement and verify inside the isolated worktree; preserve the existing Butler UI and LAN HTTP. Do not change household HA, beta, existing data paths, the working single-user lab, or other working trees.

Each session has an opaque server-generated ID, one authenticated active non-system HA owner, a distinct audio receiver, a distinct model WebSocket/session, and distinct reply listeners. All controls, status, events and signaling must resolve the owner from `connection.user`, never a client-supplied user ID. Even an HA administrator using these APIs gets no cross-user bypass. Server administrators with host/configuration access are outside this application-level boundary.

The Companion bridge currently sends camera WebRTC commands with an entity ID. A disposable-only adapter wraps the three installed HA camera command handlers for the reserved Butler endpoint prefix, preserving the original schemas and delegating unrelated entities unchanged. A request-scoped principal is inherited by the scheduled handler; the receiver's entity callbacks also require the matching principal, failing closed if any path bypasses the wrapper. This is a version-pinned integration experiment, not an upstream-approved general interface or a modification to installed HA source. Refuse setup when the expected command handlers are unavailable.

Endpoints are separate per session. Core entity listing can reveal endpoint IDs: identifiers are not secrets or authorization. An authenticated attacker knowing another user's exact session, entity, peer and subscription identifiers must still be denied. Stale sessions cannot be reused or redirected into a replacement. Candidate peer IDs must belong to the selected receiver. Native unsubscription is scoped by HA to its originating connection and closes only that peer.

The UI uses a per-card client with a single-flight session open; no global session identity or cross-card connection lookup. Every protected message carries that server session ID. Login remains normal HA authentication and ordinary LAN HTTP. The boundary protects against other authenticated clients; it does not encrypt LAN traffic or prevent a network attacker from stealing plaintext HTTP credentials.

Required evidence:

- Two ordinary disposable users have simultaneous independent sessions and audio inputs.
- Bob knowing Alice's exact IDs cannot read history/status, subscribe to replies, control/stop/disconnect, negotiate audio, or inject candidates into Alice's session; test both directions.
- Foreign operations leave the victim's live session, audio counters, transcript and reply events unchanged.
- Each user's audio/transcript/reply markers appear only in that user's event stream.
- Closed/expired sessions and stale peer IDs fail; closing one user leaves the other working.
- A signaling callback without an authenticated principal fails closed; unrelated camera handlers still delegate.
- Real HTTP card capture/Send/Cancel and independent model sessions remain functional.

Use a new disposable HA directory/port and separate loopback speech port for live verification; do not replace the already verified phone lab. All account credentials and runtime state remain under /tmp and outside Git. No household/model calls are needed for most isolation tests; a bounded real-model smoke test may use only existing model configuration with no house tools.
