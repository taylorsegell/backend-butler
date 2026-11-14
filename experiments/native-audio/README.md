# Native microphone transport proof

Scope: preserve Butler's current card UI and prove native Companion microphone audio can reach an isolated receiver over ordinary LAN HTTP. No Assist screen, DNS changes, certificates, beta changes, household credentials, device control or production deployment.

The experiment uses the camera-specific bridge in Home Assistant iOS PR #5942. A clearly labelled, audio-only experimental camera endpoint exists solely because that upstream bridge currently requires camera WebRTC signaling. It is not a proposed production camera feature. Native capture capability must be detected, not inferred from an app version.

Acceptance:

- The existing card's Start/Send/Cancel controls drive native capture; the Butler card remains visible.
- Real audio frames reach a receiver and a LiveKit-compatible audio input; report measured frame/sample counts and levels, not invented transcripts.
- No browser getUserMedia or native Assist launch is used on this path.
- Cancellation, late permission grants, native interruption, unsupported apps and unmount do not leave capture running.
- A separate disposable Home Assistant instance provides authentic frontend authentication and camera signaling. No existing HA instance is changed.
- Automated bridge emulation, actual WebRTC audio, and actual iPhone capture are recorded as separate evidence. A bridge emulator cannot establish iPhone success.

Implementation order: native bus contract and tests; real audio receiver and tests; opt-in card transport; isolated HA fixture and browser integration; physical phone check.

Sources:
- https://github.com/home-assistant/iOS/pull/5942
- https://github.com/home-assistant/core/blob/2026.11.1/homeassistant/components/camera/webrtc.py
- https://github.com/home-assistant/core/blob/2026.11.1/homeassistant/components/camera/entity.py

Local Python environment (isolated under /tmp): `/tmp/butler-native-audio-venv/bin/python`. Tests will use pytest; card checks use the existing TypeScript and Playwright suites. Runtime state and generated assets belong in a separate /tmp directory and must never be copied from household state. No new visual design is planned; existing components/styles remain the visual baseline.

## Run the disposable lab

Use Linux, Python 3.14, Node 22, and the dashboard card's installed dependencies (`npm ci` from `apps/dashboard-card`). Create a separate Python environment and install this directory's `requirements.txt`. HA may install additional component dependencies on first boot; native audio dependencies can require a C++ toolchain where wheels are unavailable. Do not reuse a household Python environment or HA configuration.

```sh
python3.14 -m venv /tmp/butler-native-audio-venv
/tmp/butler-native-audio-venv/bin/python -m pip install -r experiments/native-audio/requirements.txt
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --bind <LAN_IP>
```

The launcher creates only `/tmp/butler-native-audio-lab`, binds port 18123, and builds only the experimental card asset there. It refuses an unmarked existing directory, ports below 18123, and an already running lab. HTTP storage initialization is specifically pinned to HA 2026.11.1. No production configuration, credentials, workers, repository bundles, or persistent data paths are used.

In another terminal, create the disposable account:

```sh
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/onboard.py
```

Its generated username/password and lab tokens stay in a mode-0600 file at `/tmp/butler-native-audio-lab/test-auth.json`. Use only its username/password to log in; never copy tokens into chat, source, or a household configuration. In the current prepared lab a separate `phone-login.txt` contains the login without any tokens.

Add `http://<LAN_IP>:18123` as a **second** server in the iOS Companion app and open `/lovelace/butler`. Retain the existing household server. Safari does not expose the native Companion bridge. The exact `webrtc.hasCameraMicrophoneStream` capability must be present in the app; “latest” alone does not establish availability.

Phone acceptance checks:

1. Tap the existing microphone button, speak for 3–5 seconds, then Send. Butler must remain visible; the audio receipt must report nonzero duration and LiveKit PCM frames. No Assist screen should open.
2. Start again and Cancel. The iOS microphone indicator should turn off and the lab should stop receiving frames.
3. During another capture, background the app, switch server, or navigate away. Verify the microphone indicator clears; retry on return. Native interruption must not leave the UI listening indefinitely.
4. Revoke microphone permission on this test app only if deliberately testing denial; restore it afterward. Unsupported capability or denied capture must produce an honest error, never a false success.

This is a **transport proof**, not a voice assistant session. The experiment substitutes a small lab session adapter for the LiveKit React session package while mounting the real Butler Root/components/styles. It receives and measures actual WebRTC audio and feeds a real `livekit.rtc.AudioSource`, but has no LiveKit room connection, STT, model, reply audio, tools, typed-message responses, or household controls. The receipt is measured telemetry, not a transcription. No raw audio is recorded.

## Verification and current evidence

```sh
npm --prefix apps/dashboard-card test
npm --prefix apps/dashboard-card run typecheck
BUTLER_NATIVE_LAB=1 /tmp/butler-native-audio-venv/bin/python -m pytest -q experiments/native-audio/tests
node experiments/native-audio/browser.cjs
```

The browser script expects the default `/tmp` environment and running loopback lab. It emulates the native bus with a synthetic tone peer using **real authenticated HA signaling and real WebRTC**, not browser `getUserMedia`. Its HTTP hostname is an insecure context with `navigator.mediaDevices` absent. It checks measured decoded/LiveKit frames, Send, Cancel, no Assist launch, retained UI and mobile overflow. This cannot verify iPhone hardware or native app behavior.

On 2026-11-14, receiver and live HA protocol tests passed; the complete card passed on insecure HTTP with real decoded audio and LiveKit PCM frames through the emulated bridge. Actual HA login and Lovelace rendering also passed at 402px width with no page errors. Card lifecycle tests/typecheck passed. **Physical iPhone microphone, background interruption and installed-app capability remain unverified until the phone check.**

A missing optional `libturbojpeg` library may log a camera snapshot warning in this audio-only lab. No camera images or video are requested. The stock HA onboarding flow may add stock integrations to this disposable instance only.

## Boundaries before production

The current upstream bridge is camera-specific. This lab's `camera.butler_native_audio_poc` entity exists only to prove feasibility and must never be installed in a household. Prepare/status/stop require an admin and bind a single test owner; core camera offer callbacks do not provide that request user's identity. This is **not production multi-user authorization**. Capture is audio-only, limited to one input and a 90-second lease, uses no STUN servers, and cleans up peer connections and SDK sources on stop.

Production needs an approved native audio interface, authenticated owner/session binding at the signaling boundary, and a relay into the real Butler worker/session. It also needs actual-device acceptance and lifecycle testing. Do not ship the lab session adapter or claim that normal iOS/Android/browser users are supported by this proof.

Stop only this lab with:

```sh
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --stop
```

The stop command verifies that its recorded PID is the exact disposable HA process before signaling it. No service, cron entry, or boot configuration is installed. Runtime state under `/tmp` is disposable and is never committed.
