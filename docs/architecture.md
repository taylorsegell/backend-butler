# Component layout

| Source | Responsibility |
| --- | --- |
| `apps/voice-worker/` | LiveKit voice sessions, text chat and Home Assistant tools |
| `apps/dashboard-card/` | React dashboard card, bundled into the integration |
| `apps/household-service/` | People, schedules and notifications |
| `apps/configuration-app/` | Optional Home Assistant app for reviewed configuration changes |
| `custom_components/backend_butler/` | Home Assistant integration and committed card bundle |

Root `docker-compose.yml` builds the worker and household service. The optional
configuration app is installed separately through Home Assistant; its slug remains
`backend_butler`. HACS installs the root integration, whose domain also remains
`backend_butler`. Source-folder names do not change these runtime identifiers.

## Existing deployments

Source was moved under `apps/`; storage was not moved. Compose continues to bind
`./agent-data` to worker `/data` and `./ha-notify-scheduler/data` to scheduler
`/data`. Service names, container ports, environment names and internal DNS stay
unchanged. Existing `AGENT_PROMPT` and `AGENT_MCP_CONFIG` overrides still refer to
their original files. Bundled defaults now live in `apps/voice-worker/`.

The configuration app retains Supervisor mounts `/data` and `/config`. In local
development its default data/config paths remain at repository-root
`backend_butler/.data` and `backend_butler/.data/config`, even when launched from
`apps/configuration-app`. Explicit `DATA_DIR` and `CONFIG_DIR` still take precedence.
Old source-named directories may remain locally for state, overrides and ignored
caches; do not delete them as part of upgrading. A new clone starts without state.

See [Contributing](../CONTRIBUTING.md) for development checks, [the integration
guide](home-assistant.md) for HACS, and [the configuration app guide](../apps/configuration-app/DOCS.md)
for the optional app.
