# Backend Butler for Home Assistant

**Backend Butler 1.1.0:** Home Assistant Companion can use its native microphone over local HTTP when the [native bridge](native-audio.md) is enabled on both HA and the matching Butler worker. The same Butler UI and saved history are retained. Ordinary browsers still require HTTPS (or localhost) for voice; typed chat works over HTTP. Home Assistant **2026.11.1 or newer** is required.

A Home Assistant **custom integration + Lovelace card**. The card runs your LiveKit voice
agent *inside* the HA dashboard and behaves like a native card: **live device tiles you can
tap to control**, plus voice, text chat, a transcript, and the agent's tool-call status.

The voice **worker** — the agent brain (STT / LLM / TTS + Home Assistant MCP) — is
`apps/voice-worker/` in this repo. The integration is the HA-side glue: it mints LiveKit tokens for
logged-in Home Assistant users, proxies the scheduler and the text chat for the card, and
serves the card that runs the voice session in the HA frontend.

For **Companion microphone capture over local HTTP**, the standard integration also
includes an opt-in per-user native bridge. It keeps this card and saved history;
see [native audio setup and support](native-audio.md). The tester confirmed logo rendering and continuous calls on the packaged iPhone
candidate; the remaining [phone checks](phone-beta-checklist.md) still need signoff.

## What the card does

- **Native device tiles from `hass.states`** — live status, **tap to toggle**, long-press /
  right-click opens HA's native more-info dialog. Tiles update themselves via `hass`.
- **Voice** — push-to-talk or auto turn detection. STT starts **off** and only spins up for
  an actual turn (then back down when you go idle), so a card idling on a dashboard costs
  nothing beyond the worker connection.
- **Text chat** — always available and needs no STT, so the card works as a pure text chat.
- **Speaker toggle** — turn the agent's spoken (TTS) replies on/off from the header; **off by
  default** (text-only).
- **Transcript** — SDK-managed, so interim speech is replaced by the final text (no dupes).
- **Tool-call status** — a compact line for what the agent is doing.

## Architecture

```
LiveKit worker  (apps/voice-worker/)
  ├─ talks to Home Assistant over MCP  → voice control ("turn on the light")
  └─ streams tool-execution events on the "ha.tool_call" data channel

custom_components/backend_butler/  (thin glue integration)
  ├─ token.py    → POST /api/backend_butler/token: mints a LiveKit token for the
  │                logged-in HA user + explicitly dispatches the worker (agent_name)
  ├─ tasks.py    → /api/backend_butler/tasks|settings|chat…: proxies the scheduler and the
  │                worker's text chat as the logged-in person (settings: admins only)
  ├─ progress.py → POST /api/backend_butler/progress: a turn's progress on a phone
  ├─ media_player.py → a media player for an optional music server
  └─ __init__.py → serves the built card and registers it as a frontend module

apps/dashboard-card/  (React + @livekit/components-react, bundled with Vite → a single ESM web component)
  ├─ mounts React in a shadow root, given HA's `hass` object
  ├─ device tiles from hass.states: tap = hass.callService, long-press = hass-more-info
  └─ voice / chat / transcript / tool status via @livekit/components-react
```

Two independent control paths that both end at HA and reflect back into the card:
**voice → worker → MCP → HA**, and **tap → card → `hass.callService` → HA**.

## Install with Marketplace

Home Assistant **2026.11.1 or newer** includes Marketplace under **Settings → Marketplace**. Sign in as a Home Assistant administrator. A separate HACS installation is not needed. Existing HACS installations and custom repositories migrate when Home Assistant is upgraded; keep your existing Butler integration entry and settings.

[![Open Backend Butler in the Home Assistant Marketplace](https://my.home-assistant.io/badges/marketplace_repository.svg)](https://my.home-assistant.io/redirect/marketplace_repository/?owner=taylorsegell&repository=backend-butler&category=integration)

1. Use the button above, or open **Settings → Marketplace → Add from link** and enter `https://github.com/taylorsegell/backend-butler`.
2. Review and accept the Marketplace warning, and connect GitHub when prompted. A GitHub connection is required to add and update a custom repository. Select **Integration** if Marketplace asks for a content type, then select **Add**.
3. Open **Backend Butler** and choose **Install**. Review the version and install it, then restart Home Assistant. For a published beta, see [Beta versions and updates](#beta-versions-and-updates) below.
4. Open **Settings → Devices & services → Add integration → Backend Butler**, then enter:

   | Field | Value |
   |---|---|
   | LiveKit server URL | `wss://your-livekit-host` |
   | LiveKit API key / secret | your LiveKit project credentials |
   | Agent name | `ha-agent` (must match `AGENT_NAME` in the worker's `.env`) |
   | Scheduler URL / token | `http://<docker-host>:8951` and `SCHEDULER_TOKEN` |
   | Agent chat URL / token | `http://<docker-host>:8952` and `TEXT_API_TOKEN` |

5. Start the **worker and scheduler** with `docker compose up -d --build` at the repository root, with the matching `.env` settings. Marketplace installs the HA integration and bundled card; the worker, scheduler, LiveKit server and inference credentials are configured separately. The optional configuration app is also installed separately.
6. Add **Backend Butler** to a dashboard through **Edit dashboard → Add card**, or use the YAML options below. The integration serves and registers its bundled card; no separate dashboard repository or `/hacsfiles/` resource is needed.
7. Open the dashboard in Companion with the [native bridge](native-audio.md) enabled, or in a browser over HTTPS/localhost, and tap **Call**.

### Beta versions and updates

Marketplace normally offers stable releases. To receive Butler betas:

1. Open Butler’s repository page in **Settings → Marketplace**. To select a published beta for the initial install, open **⋮ → Install another version** and choose the desired published version.
2. After installation, open **Settings → Devices & services → Marketplace**, then the **Backend Butler** device page. Its **Pre-release** switch entity is disabled by default: enable the entity, then turn on the switch to receive beta updates.
3. Select the desired published beta on the repository page with **⋮ → Install another version** if it is not already selected. Review the release notes, install it, restart Home Assistant and reload the dashboard. Updates also appear under **Settings → Updates**.

The stable `v1.1.0` release does not require the Pre-release switch. Use a published version from the [releases page](https://github.com/taylorsegell/backend-butler/releases); a merge, tag or draft alone does not publish it. Beta.4 remains withdrawn. For `v1.1.0`, upgrade the worker, integration and card together and follow the [release notes](release-notes.md).

Keep the GitHub connection active for custom-repository updates. Newly published releases can take time to appear. Back up your deployment configuration/history and follow the [beta upgrade guidance](public-beta.md) before updating the separately deployed worker or scheduler.

The supported installation steps follow the official [Marketplace guide](https://www.home-assistant.io/integrations/marketplace/) and [release/prerelease documentation](https://contributors.home-assistant.io/marketplace/guides/releases/).

## Card options

```yaml
type: custom:backend-butler-card
title: Voice Assistant        # optional header title
input_mode: push_to_talk      # push_to_talk (default) | auto
audio_output: false           # default false: agent replies in text only (toggle in the header)
start_on_connect: false       # default false: stay dormant (no STT) until you tap to talk
auto_connect: false           # default false: stay static until the first send/speak, then connect lazily
height: 720                   # card height in px (default 720; capped to the viewport)
areas:                        # optional: show all entities in these areas as tiles
  - Living Room
  - Master Bedroom
entities:                     # optional: always show these specific entities
  - light.study_spotlight
  - climate.bedroom_ac
follow_agent: true            # default true: also surface tiles for areas the agent looks at
recent_minutes: 60            # default 60: pin devices changed in the last N minutes, whatever changed them (0 = off)
music_entity: media_player.x  # optional: the player the now-playing bar shows (default: this integration's)
```

All fields are optional. **By default the card is text-only and dormant**: it stays static
until you send or speak, then connects with STT and TTS off, so it's free to leave on any
dashboard. Tap the mic to talk — which spins STT up just for that turn and tears it back down once you're idle — or flip
the header speaker to hear replies. Set `audio_output: true` and/or `start_on_connect: true`
to speak and start listening the moment it connects; `input_mode: auto` makes it hands-free.
`areas`/`entities` pin a fixed set of tiles that are always visible (like any native HA card).

The setup and Configure forms do not expose a music server URL. Existing installations
with a saved music-server connection retain that value when other settings are edited.
Their existing media player and now-playing controls continue to use it.

## Why tiles render by `entity_id`/area, not by device name

Matching the worker's spoken device *names* back to entities is unreliable in a typical
setup: registry aliases are often absent, one device name can map to many entities
(multi-gang switches, or climate devices that also expose a `switch`/`light`), and real
`friendly_name`s carry channel suffixes. The card renders from `hass.states` keyed by
`entity_id`, **scoped by area** via HA's own area registry. State stays correct for free:
HA pushes state changes into the card's `hass` object, so tiles update themselves.

## Roadmap

- ✅ Voice (push-to-talk / auto), transcript, agent state.
- ✅ Native device tiles from `hass.states` (tap-to-toggle, more-info), text chat, tool status.
- ⏳ Per-device highlight of exactly what the agent just controlled.
- ⏳ Voice-driven navigation of your existing Lovelace views.

## Caveats

- **Browser microphones need a secure context.** Open browser voice over HTTPS (or `localhost`); Companion can use the configured native bridge over HTTP. A
  browser opened at a LAN-IP `http://…:8123` address cannot use its microphone.
- **Reload requires a restart.** HA has no runtime unregister for HTTP views / static
  paths / frontend modules, so reconfiguring updates the token config live, but fully
  removing the integration needs a restart.

## Manual install (without Marketplace)

The built card bundle is committed, so no Node toolchain is needed on the HA host — just
copy the integration into your HA config's `custom_components/` and restart:

```bash
rsync -a custom_components/backend_butler/ \
  <user>@<your-ha-host>:/config/custom_components/backend_butler/   # adjust to your config path
```

## Development

Card source is `apps/dashboard-card/src/` (React + TypeScript). CI rebuilds and verifies the committed bundle on
push to `main`, and cuts a GitHub release on a `v*` tag; to build locally:

```bash
cd apps/dashboard-card
pnpm install
pnpm build     # → ../../custom_components/backend_butler/frontend/backend-butler-card.js
pnpm watch     # rebuild on change
```

Commit the rebuilt bundle so Marketplace and manual installs serve it directly. The integration
Python is in `custom_components/backend_butler/` (`token.py` = token endpoint, `tasks.py` =
scheduler and chat proxies, `progress.py` = phone progress, `__init__.py` =
setup/registration, `config_flow.py` = setup UI). `pnpm typecheck` checks the card.

## Upgrading from LiveKit Voice Assistant

This integration used to be called LiveKit Voice Assistant (domain `livekit_voice`). Its domain
is now `backend_butler`, so Home Assistant treats it as a new integration. Do the steps in
this order:

1. Back up Home Assistant.
2. Install or update **Backend Butler** (Marketplace, or copy `custom_components/backend_butler/`).
3. A previous HACS/manual install may leave the old folder in place; delete `custom_components/livekit_voice/` if it is still there.
4. Restart Home Assistant.
5. Settings → Devices & Services → **Add Integration** → **Backend Butler** → Submit. The fields
   are pre-filled from the old entry.
6. The music player is a new entity, so its entity_id may change. Update any automations or
   dashboards that name it, or set the old entity_id back in Settings → Entities.
7. Delete the old "LiveKit Voice Assistant" entry (it shows as not loaded). Delete it only after
   step 5, or you lose the pre-fill.
8. On the worker host, run `docker compose up -d --build`. The containers have new names; state
   lives in bind mounts. Between steps 4 and 8 the scheduler's progress posts get a 404, which is harmless.

Dashboards that use `type: custom:livekit-voice-card` keep working (the browser console shows a
warning). Change them to `type: custom:backend-butler-card`.

## Talk directly from a dashboard

Add **Backend Butler Voice** from the card picker, or use:

```yaml
type: custom:backend-butler-voice-card
title: Talk to Butler
```

Tap **Start call** and speak when the widget shows **Listening**. The call runs hands-free
in the dashboard. Use **Cancel call** during startup or **End call** to disconnect and
release the microphone. Browser capture requires HTTPS and microphone permission. The
Companion app can use the enabled native microphone bridge over HTTP.

The widget sizes to its content, including in existing configurations with a `height`
setting. `layout: voice` on `custom:backend-butler-card` also uses the widget. Both accept
an optional `title` and default to spoken replies. Set `audio_output: false` for silent
replies. If playback is blocked, tap **Enable reply audio**.

Open the full-page Butler interface for transcripts, typing, approvals, history, and
settings. Use `layout: card` to embed that workspace in a dashboard. Use one Butler
session card per dashboard view. The widget and workspace share the voice session.
