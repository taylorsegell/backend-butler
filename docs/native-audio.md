# Companion native audio in the standard integration

The standard `backend_butler` integration now includes the per-user audio bridge.
The existing Butler card captures through the Home Assistant Companion app and
plays the worker's replies inside the same UI, including when HA is opened over
local HTTP. It does not open Assist or require local DNS/certificate setup.

This opt-in beta.4 candidate requires HA 2026.11.1 or newer and a Companion app
that advertises the native WebRTC microphone capability. The standard integration
was tested in an isolated installation with the existing login and history. The
iPhone tester confirmed the corrected logo and continuous call; the remaining
[phone checks](phone-beta-checklist.md) still require signoff. This is not a
published release or approval to upgrade a household installation.

## Enable on a candidate installation

1. Install the standard `custom_components/backend_butler` directory, including its
   compiled frontend and `native_audio` package. No experimental integration, lab
   card, marker files, secondary HA login, or prototype model service is required.
2. Use the matching Butler worker source/image from this candidate commit and
   enable `NATIVE_AUDIO_ENABLED=true`. The HA-only ZIP does not update the worker.
   Keep the existing
   history volume/data directory and `TEXT_API_TOKEN`. Do not create another worker
   against the same writable history store.
3. In **Settings → Devices & services → Backend Butler → Configure**, set the
   existing agent chat URL/token and scheduler URL/token, then enable **Companion
   native microphone**. HA must be able to reach the worker over HTTP(S) and the
   worker native WebSocket must be enabled. The chat token is the worker's service
   `TEXT_API_TOKEN`, not a per-person token. It stays on the HA server.
4. In Butler Settings, link each HA login to its person. Native voice, RTC voice,
   and text use that same person ID and existing saved history. An unlinked account
   cannot open a native session.
5. Reload the HA frontend in Companion after enabling the option. Keep the normal
   Butler card. Set `audio_output: true` or enable spoken replies in the existing UI.

The worker's current defaults remain `TTS_MODEL=xai/tts-1`, `TTS_VOICE=rex`, and
`TTS_LANGUAGE=en`, using Grok speech through LiveKit Inference. The bridge does not
change explicit worker voice settings, STT, model, tools, or history paths.
LiveKit's AgentSession and inference remain responsible for the conversation.

## Support and behavior

Verified against HA **2026.11.1**, aiortc **1.14.0**, and the supported Companion
native WebRTC microphone capability (`hasCameraMicrophoneStream`). A supported
Companion app selects this transport when the integration option is enabled.
Browsers retain the RTC transport and their normal microphone secure-context
requirements; this does not enable microphone capture on arbitrary HTTP web pages.
Older HA/app versions without the required camera APIs are not supported by this
native path. Missing signaling handlers fail setup rather than exposing a receiver.
The native bridge is disabled by default; enabling it is an integration option.

Native capture negotiates an audio-only local WebRTC connection to HA. The HA host
must be reachable for the negotiated UDP media path; HA then relays mono 48 kHz PCM
and reply events through an authenticated worker WebSocket. No audio files are
written on HA. Keep the worker service token private, and restrict its HTTP listener
to HA/trusted network access as with the existing chat service.

Only an explicit Call or typed send connects. Continuous conversation is the
default after Call: the worker detects turn endings without per-utterance Send.
Pause/Resume, Interrupt, mute, playback recovery, new conversation, preview and
resume use the same UI. Manual Send/Cancel remains an explicit option.
Native history changes suppress text-session warmup so two transports do not race
for the same persistence lease. Ending a session awaits the worker's save/release
acknowledgement. Saved history remains available after ending or idling.

Cloud audio recording remains off by default; native worker sessions explicitly
use `record=False`. `VOICE_IDLE_TIMEOUT=120` closes inactive worker sessions; active
speech, generation, and tools suspend that timer. Worker idle also revokes the HA
bridge. Capture is bounded to 90 seconds per arm, the bridge to 20 minutes, and
sessions to two per HA user/eight total. The next explicit tap creates a new bridge
and resumes the selected saved conversation. Polling does not prolong a session.

## Ownership and lifecycle contract

Each random bridge ID and camera entity belongs to the authenticated, active,
non-system HA user who opened it. The person/history identity is resolved server
side. Knowing another user's session, entity, conversation, or peer ID does not
permit events, controls, capture preparation, offers, candidates, or disconnect.
The worker independently enforces conversation ownership using the immutable
person header and the requested conversation at handshake.

The reserved camera prefix is guarded before core HA signaling handlers run;
entity callbacks additionally require the owner context. Unrelated cameras retain
their original handlers. A process-long gate avoids nested wrappers on reload and
denies reserved entities while unloaded. Session IDs are revoked before cleanup
waits for in-flight operations. HA connection loss, idle, unload, and integration
removal close receivers. Saving settings freezes new opens and revokes existing
sessions before account links change; failed or concurrent mapping updates cannot
keep an earlier session authorized.

## Repeatable verification

Use an isolated Python 3.14 environment with `tests/ha/requirements.txt`, and install
the card's locked dependencies and Playwright Chromium. Run from the repository:

```sh
python -m pytest tests/ha -q
BUTLER_PACKAGE_BROWSER=1 python tests/ha/package_check.py
```

The package check copies only the standard HACS component into a fresh private
`/tmp/butler-standard-package-*` HA configuration, uses loopback ports 18125/18964,
creates two ordinary synthetic users, and stops its own HA child on exit. It never
loads household credentials, data, tools, or a cloud model. The compiled production
card runs in Chromium on insecure HTTP with browser microphone APIs unavailable;
only the Companion hardware peer is emulated with a paced synthetic WebRTC tone.
The worker/scheduler fixture implements the protocol with in-memory synthetic
history and reply PCM. This proves packaging/signaling/UI, not provider voice
quality or physical iOS hardware. Existing worker tests cover persistence and
idle/recording policy separately.

Covered: config entry install, owner-bound PCM, 30 known-ID cross-user attacks,
saved-history person mapping, close acknowledgement, normal card Send/Cancel and
playback, new/preview/resume, no text warmup, reload revocation, idle expiry,
account-remapping revocation, and uninstall. A new CI job runs the same checks.

Before release, repeat on the iPhone using the standard candidate installation:
Wi-Fi/local HTTP; Start talking → Send → transcript and audible Rex reply; Cancel;
new/preview/resume context; idle until disconnected → explicit reconnect retaining
history; quit/reopen. Confirm no separate Assist screen and no second lab login.
The normal browser RTC checks must continue passing. Do not promote or replace the
existing beta until that packaged-path phone pass is recorded.
