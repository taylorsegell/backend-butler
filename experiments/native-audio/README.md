# Native microphone and isolated Butler speech lab

Keep Butler's existing UI and use native iPhone Companion microphone capture over ordinary LAN HTTP. The user confirmed both a visible transcript and an audible assistant reply on 2026-11-14. This remains an isolated experiment: no beta deployment, household tools, household credentials, household data, DNS changes, certificates, or native Assist screen.

There are two explicitly selected modes:

- **Transport mode** (default): actual WebRTC audio is measured and fed into a LiveKit AudioSource; Send shows a receipt. There is no recognizer or reply engine.
- **Speech mode** (`run.py --speech`): the same receiver streams PCM to a separate loopback process running a real LiveKit AgentSession with Butler's configured STT/LLM/TTS services. The existing UI displays real transcripts and answers, and plays real reply PCM through WebAudio. No LiveKit room or production worker is joined. This uses a lab session adapter and a tool-free Butler prompt, rather than the household agent's tool registrations.

Phone-to-lab transport uses local HTTP. Speech/model services use their configured remote APIs over TLS. This does not make cloud speech recognition work offline. User audio and conversation history are kept in memory only; the lab does not record user audio or persist conversations. The synthetic test utterance is generated separately under `/tmp`.

## Phone use

Retain the existing household server. Add the disposable lab as a second server inside the iOS Home Assistant Companion app; use its generated test account. Select the lab, then **☰ → Overview**. Its only view opens Butler. No URL path needs typing inside the app.

For speech mode, tap the microphone, speak a short question, then Send. Expect your recognized words, a text answer, and spoken playback. Cancel discards a turn. Stop reply audio mutes current playback. If iOS blocks playback, the existing Enable reply audio control can unlock it; the text conversation remains available.

Safari/Chrome do not expose the native Companion bridge. The exact `webrtc.hasCameraMicrophoneStream` capability must be present in Companion; “latest” alone is not a capability check. The current lab login remains valid when switching between experiment modes.

Acceptance:

- Existing Butler Start/Send/Cancel controls and conversation UI remain visible.
- Real native audio over HTTP reaches speech recognition; real assistant text and synthesized replies reach that same UI.
- No browser microphone capture or native Assist launch substitutes for native capture.
- Cancel/unmount/late grants release capture; disconnected services produce errors rather than invented success.
- All execution stays in a marked disposable configuration, with no home controls or household state.
- Browser bridge emulation, genuine WebRTC/model processing, and physical iPhone results remain distinct evidence.

## Prepare the disposable environment

Use Linux, Python 3.14 for HA, Node 22, and the dashboard card's installed dependencies (`npm ci` inside `apps/dashboard-card`). Use the voice worker's locked Python environment separately for the model process. Never install lab dependencies into household HA or change an existing worker environment.

```sh
python3.14 -m venv /tmp/butler-native-audio-venv
/tmp/butler-native-audio-venv/bin/python -m pip install -r experiments/native-audio/requirements.txt
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --bind <LAN_IP>
```

HA may install component dependencies on first boot; some native dependencies require a C++ toolchain where wheels are unavailable. The launcher creates `/tmp/butler-native-audio-lab`, uses port 18123, and builds only the experiment asset there. It rejects unmarked existing directories, ports below 18123 and concurrent runtime preparation. Its HTTP storage initialization is pinned to HA 2026.11.1.

In another terminal:

```sh
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/onboard.py
```

The generated synthetic account and lab tokens stay in mode-0600 `/tmp/butler-native-audio-lab/test-auth.json`. Use only its username/password to log in. Do not copy tokens into chat or source. In the currently prepared lab, `phone-login.txt` contains only the disposable login without tokens.

To enable speech, prepare a model-only file using the separate worker Python environment and an explicitly supplied environment file (or exported model variables):

```sh
<worker-python> experiments/native-audio/prepare_speech.py --env-file <model-settings-file>
<worker-python> experiments/native-audio/model_session.py --config /tmp/butler-native-audio-lab/model-config.json
```

The preparer allowlists speech/model configuration, generates an independent service token, writes mode 0600, excludes HA/scheduler/tool credentials and refuses overwriting an existing configuration. No credentials reach the browser. The service listens only on `127.0.0.1:18952`, requires its token, permits up to eight independent connections and has no tool registrations. It uses the same SDK and model configuration as the Butler worker with a lab-specific conversational prompt.

Stop the existing lab, then start it in speech mode:

```sh
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --stop
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --bind <LAN_IP> --speech
```

This retains the disposable account and existing server entry. Fully close/reopen Companion to load a freshly built card. Nothing is installed as a system service or enabled at boot. The current prepared speech process runs independently of the test terminal; its PID and logs are in the same disposable directory.

Recognition is disabled between turns. Capture has a 90-second lease; model sessions have a 20-minute maximum lifetime. Input and output queues are bounded. History is temporary and a new connection starts a new session. Speech mode also wires the SDK's STT endpoint mode for continuous turns, but the verified phone path is explicit tap-to-talk and Send.

## Verification

Card and playback checks:

```sh
npm --prefix apps/dashboard-card test
npm --prefix apps/dashboard-card run typecheck
node experiments/native-audio/tests/reply-player.cjs
```

Run receiver/launcher checks with the HA environment, and model-service checks with the worker environment:

```sh
/tmp/butler-native-audio-venv/bin/python -m pytest -q experiments/native-audio/tests/test_receiver.py experiments/native-audio/tests/test_launcher.py
<worker-python> -m pytest -q experiments/native-audio/tests/test_model_session.py experiments/native-audio/tests/test_prepare_speech.py
```

The original `test_ha_protocol.py` and `browser.cjs` target transport mode. For the opt-in real speech check, run the prepared speech-mode lab and generate a synthetic sample, then:

```sh
<worker-python> experiments/native-audio/make_speech.py
node experiments/native-audio/speech-browser.cjs
```

The speech browser check uses a real authenticated HA connection and real WebRTC, recognition, model replies and TTS. Only native hardware capture is emulated by a paced synthetic speech peer. The browser uses an insecure HTTP hostname with `navigator.mediaDevices` absent. It checks the retained mobile UI, actual transcripts/answers, scheduling of actual TTS PCM for playback, cancellation after partial speech, and no Assist launch. Automated playback scheduling does not establish physical speaker audibility.

Evidence on 2026-11-14:

- The original physical native transport test received 371 decoded/SDK frames and 356,160 samples at 48 kHz (7.42 seconds), and the user confirmed the receipt.
- Real speech integration transcribed the synthetic question and returned “Two plus two is four” with synthesized PCM. The complete HTTP card/browser test passed with real services and Cancel cleanup.
- Card typecheck/unit checks, seven HA receiver/launcher tests, three speech-service tests, model-configuration isolation and playback lifecycle tests passed.
- **The user subsequently confirmed “Transcript and spoken reply both work” inside iPhone Companion on local HTTP.** This verifies the basic phone-to-assistant-to-phone path. Physical background interruption, Bluetooth routing, continuous mode and broad app/platform compatibility remain unverified.

## Experimental boundaries

The upstream native bridge uses camera-specific HA signaling. Each lab session now owns a separate audio-only `camera.butler_native_audio_<session_id>` endpoint. Every command and subscription checks the actual authenticated active, non-system HA user; ordinary users are supported and administrators receive no cross-user bypass. The disposable adapter guards the installed camera signaling handlers, preserves unrelated-camera behavior, and propagates a request principal to receiver callbacks, which reject unguarded calls. This is a version-pinned candidate integration and must not be installed in household HA or shipped as a general upstream interface. There are no STUN servers or camera images/video in the lab. A missing optional `libturbojpeg` may produce an unrelated snapshot-library warning.

Speech mode retains the actual Butler Root/components/styles, while replacing the React session transport with an experiment adapter over authenticated HA messages. It does not alter the beta bundle, production integration or worker. Household actions, notifications, scheduler, memory services, external tools and persistent history are disconnected by construction.

Production still needs an approved native audio interface, user/session authorization at the signaling boundary, lifecycle hardening and compatibility testing. Do not ship these lab adapters as a general iOS/Android/browser feature.

Sources:

- https://github.com/home-assistant/iOS/pull/5942
- https://github.com/home-assistant/core/blob/2026.11.1/homeassistant/components/camera/webrtc.py
- https://github.com/home-assistant/core/blob/2026.11.1/homeassistant/components/camera/entity.py
- The installed voice worker SDK's `AgentSession`, `AudioInput` and `AudioOutput` interfaces, pinned by `apps/voice-worker/uv.lock`.


## Per-user boundary verified on 2026-11-15

Sessions are server-created and owner-bound, with separate receivers, signaling peers, model connections, histories and reply listeners. There is a limit of two live sessions per user and eight total. Every protected API request carries a session ID; knowing one never grants access. The per-card client shares one open request between parallel microphone/session startup, closes once on overlapping end/unmount, and starts with a new ID after disconnect. The adapters use their own HA context rather than a global connection or transcript buffer. Closing, expiration and controller-WebSocket disconnection revoke that session and release its resources.

Live evidence from a separate disposable instance:

- Alice and Bob authenticated as ordinary non-admin users and simultaneously received genuine WebRTC audio in distinct receivers.
- 34 requests using known foreign session/entity/peer IDs were denied: prepare, status, stop, subscriptions, history, text/audio controls, disconnect, SDP negotiation and ICE candidates, in both directions; administrator cross-user requests were also denied.
- Both real model sessions produced independent synthetic transcripts and synthesized reply streams. Foreign markers never appeared in the other user's event stream/history.
- Stopping Alice left Bob receiving audio. Closed IDs were rejected, Alice's replacement had empty history, and Bob's original conversation remained available.
- Signaling callbacks without a matching principal failed closed; unrelated camera commands delegated unchanged. Missing upstream handlers failed setup.
- The existing speech card passed on insecure HTTP as an ordinary user with genuine STT/model/TTS and scheduled reply playback. The measurement view also passed Send/Cancel/unmount and unsupported-app checks; unmount now expects denied access to the revoked session. Neither path uses a browser microphone or Assist launch.
- Regression checks passed: 13 HA receiver/launcher/ownership/signaling tests, five backend/configuration tests, per-card lifecycle/playback tests, and card plus experiment TypeScript checks.

The updated per-user protocol was verified through real HA and an emulated native peer. The earlier physical iPhone speech confirmation applies to the preceding single-user lab; this candidate has not replaced that working phone lab. The beta and household services remain unchanged. See [SECURITY-BOUNDARY.md](SECURITY-BOUNDARY.md) for the attack model and limits.

To reproduce without touching the working phone lab, use a second marked directory and loopback ports:

```sh
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --state /tmp/butler-native-users-lab --port 18124 --prepare-only
<worker-python> experiments/native-audio/prepare_speech.py --state /tmp/butler-native-users-lab --speech-port 18953 --env-file <model-settings-file>
<worker-python> experiments/native-audio/model_session.py --config /tmp/butler-native-users-lab/model-config.json --port 18953
```

Keep the speech process in its own terminal, then start the candidate and provision only its synthetic accounts:

```sh
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --state /tmp/butler-native-users-lab --port 18124 --speech
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/onboard.py --state /tmp/butler-native-users-lab --port 18124
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/provision_users.py
/tmp/butler-native-audio-venv/bin/python -m pytest -q -s experiments/native-audio/tests/test_user_boundary.py
```

The live boundary test deliberately makes bounded real model requests for synthetic markers; it never uses household tools or recordings. Model credentials, synthetic HA logins and generated assets stay outside Git in mode-0600 runtime files. The new candidate is separate from the original `/tmp/butler-native-audio-lab` and ports 18123/18952.

Additional regression checks:

```sh
/tmp/butler-native-audio-venv/bin/python -m pytest -q experiments/native-audio/tests/test_receiver.py experiments/native-audio/tests/test_launcher.py experiments/native-audio/tests/test_sessions.py experiments/native-audio/tests/test_signaling.py
<worker-python> -m pytest -q experiments/native-audio/tests/test_model_session.py experiments/native-audio/tests/test_prepare_speech.py
node experiments/native-audio/tests/session-client.cjs
node experiments/native-audio/tests/reply-player.cjs
```

For the real speech browser check, put the synthetic sample in the candidate directory with `make_speech.py --state /tmp/butler-native-users-lab`, then:

```sh
BUTLER_NATIVE_LAB_STATE=/tmp/butler-native-users-lab BUTLER_NATIVE_LAB_PORT=18124 BUTLER_NATIVE_AUTH_FILE=alice-auth.json node experiments/native-audio/speech-browser.cjs
```

The experiment also typechecks with the card toolchain. Make its existing dependencies resolvable with an ignored `experiments/native-audio/node_modules` symlink to `../../apps/dashboard-card/node_modules`; include the experiment's TS/TSX and card src in a temporary configuration extending the card tsconfig. No dependency files or installed packages need changing.
