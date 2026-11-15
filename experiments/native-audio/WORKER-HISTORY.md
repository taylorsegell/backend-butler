# Real worker/history integration contract

Keep all deployment in a new disposable worker process, loopback ports and a fresh history directory. Do not change the beta, household integrations, original voice-worker environment, working phone lab or previous test databases. Use only model settings plus synthetic service credentials and a read-only mock HA MCP server.

Enable the native PCM endpoint explicitly with NATIVE_AUDIO_ENABLED; default remains off. The endpoint lives in the real worker HTTP app alongside the existing VoiceAuthority/history routes and constructs HomeAssistantAgent with the worker's configured speech models. It uses RemoteSession to acquire an owner-checked, expiring history lease and the real SDK persistence. Persisted snapshots and lease heartbeats fail closed. No parallel shadow conversation store.

HA remains the browser authentication boundary. It passes the immutable authenticated owner and optional conversation selection in service-authenticated WebSocket headers, never arbitrary per-message user fields. The worker verifies selected ownership via VoiceAuthority. Conversation list/read/switch/new/delete proxies use the same owner from HA auth and allowlisted worker routes. No client URL, user override or service credential reaches the browser.

Acceptance: speech produces persisted user/assistant items; the unchanged drawer lists and resumes the owner's conversations; Alice and Bob cannot read/select/delete/lease one another's known IDs; duplicate leases are rejected; close/reopen and a restart of only the disposable worker retain each user's own history/context; original per-user audio/signaling tests and HTTP speech UI continue to pass.
