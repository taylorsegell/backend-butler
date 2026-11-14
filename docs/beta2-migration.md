# Beta.2 migration verification

Canonical installation source: https://github.com/taylorsegell/backend-butler . The old `backend-butler-public` staging repository is archived and its unpublished beta.1 draft is superseded. Do not install from that staging URL.

## Source moves, stable runtime identity

| Old source | Current source |
| --- | --- |
| `agent/` | `apps/voice-worker/` |
| `card/` | `apps/dashboard-card/` |
| `ha-notify-scheduler/` | `apps/household-service/` |
| `backend_butler/` | `apps/configuration-app/` |

The Home Assistant integration domain and optional app slug remain `backend_butler`. Compose service names, published ports, internal scheduler DNS and container data mounts remain unchanged. Do not rename/delete existing data folders simply because source moved.

## Fresh clone

Use canonical source, copy `.env.example` to `.env`, configure your own credentials, then use the root Compose file. Build contexts and default prompt/MCP mounts resolve into `apps/voice-worker` and `apps/household-service`. HACS continues to install `custom_components/backend_butler` at the repository root. Supervisor discovers the optional app recursively from `apps/configuration-app/config.yaml`.

## Upgrade an existing checkout

1. Stop new conversations and back up `agent-data/`, `ha-notify-scheduler/data/`, local configuration-app data and any custom prompt/MCP files. Retain the previous deployment image/commit.
2. Keep `agent-data/` and `ha-notify-scheduler/data/` in place: they are still mounted at `/data`. Development configuration-app data remains at repository-root `backend_butler/.data`; explicit `DATA_DIR`/`CONFIG_DIR` and Supervisor `/data`/`/config` take precedence.
3. Preserve ignored `agent/*.local.yaml` files and existing `AGENT_PROMPT`/`AGENT_MCP_CONFIG` values. New default files live under `apps/voice-worker/`; a fresh clone needs your custom files copied in explicitly.
4. Run `python3 scripts/check-migration.py` where Docker Compose is available. It validates fresh and legacy paths with synthetic fixtures and does not start services or read production state.
5. Review `docker compose --env-file .env config --quiet`, build the candidate on a host with sufficient free disk, then follow the normal deployment/smoke guide. Do not run destructive volume cleanup as part of upgrading.

For an existing HACS installation from the staging URL, back up HA first. Replace the old HACS repository's downloaded code with the canonical repository's integration, then restart after the replacement is installed. Keep the existing Home Assistant integration entry and settings; the domain has not changed. Do not delete that entry or persisted conversations merely to switch download sources.

## Validation scope

- Real Docker Compose planning passes for clean and legacy layouts, preserving synthetic state markers and custom overrides. This is configuration validation, not a production migration.
- All three configuration-app path tests pass. The compiled app boots from the new source location with legacy state/config markers preserved, no deployment credentials and no external HA/model endpoints.
- CI builds all three Linux/amd64 images and runs tests, audits, HACS, secret scanning and the stale-bundle guard.
- The card bundle is unchanged by the beta.2 version bump; the previous exact-bundle mobile check remains applicable. The merged denied-voice-resume fix has dedicated regression and live-test evidence in `docs/smoke-tests.md`.

The worker host has limited root-disk headroom. Use CI's isolated builds for release validation; check capacity before an on-host rebuild. No household services, images, secrets or state were changed for these migration checks. ARM64 remains outside this validation matrix.
