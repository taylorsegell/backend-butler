# Changelog

## 1.1.0-beta.2 — canonical repository candidate

- Use the canonical `taylorsegell/backend-butler` repository and migrated `apps/` source layout.
- Preserve legacy data locations and explicit prompt/MCP overrides; add automated fresh/upgrade Compose migration checks.
- Include the merged fix for reporting denied voice resumes after joining the room.
- Supersede the unpublished staging beta.1 candidate; keep the optional HA app version independent.

## 1.1.0-beta.1 — release candidate

- Voice-first conversation UI with live captions, reply controls, unified history, and a visible dictation glow.
- Persistent voice conversations with owner-bound leases, expiry, and voice/text concurrency protection.
- Conversation drawers, appearance settings, responsive device controls, schedule editing, and recovery feedback.
- Wrapping chat placeholders and composer sizing updates in the separate Butler HA app.
- Contributor/security documentation and a beta release/rollback checklist.
- Patched OpenTelemetry 1.45.2 with parser and LiveKit telemetry regression tests.

The Home Assistant integration/card and the separate Agent SDK HA app have independent versions. No public beta tag has been published by this preparation change.
