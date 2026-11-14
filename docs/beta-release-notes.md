# Backend Butler 1.1.0-beta.2 — release candidate

Voice-first conversations for Home Assistant, powered by LiveKit. Talk, follow live captions, pick up in chat and return to saved conversations.

This candidate uses the canonical [Backend Butler repository](https://github.com/taylorsegell/backend-butler), the migrated `apps/` source layout and the merged denied-voice-resume fix. The old public staging repository is archived; its unpublished beta.1 draft is superseded.

Read [migration verification](beta2-migration.md) before upgrading an existing checkout. Existing data mounts, custom prompt/MCP overrides, integration domain and optional app slug remain stable. The configuration app retains its independent version.

Fresh/legacy Compose planning, configuration-app path tests and compiled startup pass with synthetic state. The card bundle is byte-identical to the previously phone-tested candidate. Prior voice evidence applies to unchanged paths; the merged error-path fix has dedicated regression/live evidence in [smoke tests](smoke-tests.md). Full CI and the tag pipeline must pass before publishing this draft.

Back up deployment state before an upgrade and ensure the build host has sufficient disk. Linux AMD64 is validated; ARM64 and older Python versions are not covered by this release matrix. Draft LiveKit persistence APIs, provider costs and the configuration-app chunk-size warning remain beta limitations.
