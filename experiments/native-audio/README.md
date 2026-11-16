# Native microphone and isolated Butler speech lab

Keep Butler's existing UI and use native iPhone Companion microphone capture over ordinary LAN HTTP. The user confirmed both a visible transcript and an audible assistant reply on 2026-11-14. This remains an isolated experiment: no beta deployment, household tools, household credentials, household data, DNS changes, certificates, or native Assist screen.

There are three explicitly selected modes:

- **Transport mode** (default): actual WebRTC audio is measured and fed into a LiveKit AudioSource; Send shows a receipt. There is no recognizer or reply engine.
- **Speech mode** (`run.py --speech`): the same receiver streams PCM to a separate loopback process running a real LiveKit AgentSession with Butler's configured STT/LLM/TTS services. The existing UI displays real transcripts and answers, and plays real reply PCM through WebAudio. No LiveKit room or production worker is joined. This uses a lab session adapter and a tool-free Butler prompt, rather than the household agent's tool registrations.

- **Real worker/history mode** (`--speech` plus server-side `LAB_WORKER_URL`): the same UI and HA-authenticated bridge connect to the actual worker's opt-in `/chat/native` endpoint, actual `HomeAssistantAgent`, configured speech services and existing `RemoteSession`/`VoiceAuthority` persistence. The lab runs a separate real worker with a fresh history directory and a read-only synthetic HA tool endpoint. This does not connect to the household worker or its database.

Phone-to-lab transport uses local HTTP. Speech/model services use their configured remote APIs over TLS. This does not make cloud speech recognition work offline. Transport and prototype speech modes keep conversations in memory. Real worker mode persists conversation snapshots and ownership using the existing worker store, under a new disposable path; no user audio is recorded by this transport. The synthetic test utterance is generated separately under `/tmp`.

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

Recognition is disabled between turns. Capture has a 90-second lease; model sessions have a 20-minute maximum lifetime. Input and output queues are bounded. In prototype speech mode history is temporary and a new connection starts a new session. In real worker mode the selected owner-checked conversation survives disconnect and worker restart; bridge IDs are still replaced on reconnect. Speech mode also wires the SDK's STT endpoint mode for continuous turns, but the verified phone path is explicit tap-to-talk and Send.

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

Speech mode retains the actual Butler Root/components/styles, while replacing the React session transport with an experiment adapter over authenticated HA messages. It does not alter the beta bundle, production integration or worker. Household actions, notifications, scheduler, memory services and external tools are disconnected by construction. Real worker mode connects persistent history only in its fresh disposable directory.

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


## Real worker and history integration

The new worker route is disabled unless `NATIVE_AUDIO_ENABLED=1` and `TEXT_API_TOKEN` is configured. HA sends that service token and the immutable authenticated user ID in the WebSocket handshake; it never accepts a client user override. The optional selected conversation is checked by the existing authority. The service token is trusted to act for users, like the existing worker chat integration, and stays on the server. The prototype `/session` service remains available separately.

`HistoryProxy` forwards only allowlisted conversation operations and always assigns the actual HA user. The existing drawer lists, previews, creates, resumes and deletes through the normal worker history API. Native sessions acquire the same SQLite-backed history leases as the existing RTC worker. Text-session warmup is intentionally skipped by the native card adapter to avoid racing that voice lease. Bridge close waits for the final SDK save and lease release before acknowledging, including overlapping cleanup calls. Late settings cannot reopen a closed session. Save/heartbeat failure stops the agent and disables input. Usage totals follow the worker's existing persistence scheme.

Use the previously prepared candidate accounts/model-only configuration, then start the separate worker fixture:

```sh
<worker-python> experiments/native-audio/start_worker_lab.py
/tmp/butler-native-audio-venv/bin/python experiments/native-audio/run.py --state /tmp/butler-native-users-lab --port 18124 --speech
```

Stop the candidate first if it is already running, so its runtime integration is recopied. Do not stop the original phone lab. The helper starts only its marked `/tmp/butler-native-worker-lab` fixture and worker, with loopback ports 18955 and 18954, a unique worker registration name, no idle job processes, model-only credentials, synthetic HA credentials and a fresh `history/` directory. It writes `LAB_WORKER_URL` into the candidate's mode-0600 model configuration. No production store is copied or migrated. The helper currently uses the existing worker interpreter read-only; adjust that explicit path on another machine rather than installing into a running worker environment.

Run the actual owner/persistence tests with no other candidate sessions using those accounts:

```sh
/tmp/butler-native-audio-venv/bin/python -m pytest -q -s experiments/native-audio/tests/test_worker_history.py
/tmp/butler-native-audio-venv/bin/python -m pytest -q -s experiments/native-audio/tests/test_user_boundary.py
BUTLER_NATIVE_HISTORY=1 BUTLER_NATIVE_LAB_STATE=/tmp/butler-native-users-lab BUTLER_NATIVE_LAB_PORT=18124 BUTLER_NATIVE_AUTH_FILE=alice-auth.json node experiments/native-audio/speech-browser.cjs
```

The restart test verifies the marked worker's exact command line before restarting only that process. It demonstrates each ordinary user's own persisted context survives a worker restart and produces a real model answer using that context; known foreign conversation IDs fail list/read/select/delete/lease checks. The browser test exercises the existing history drawer along with actual WebRTC/STT/model/TTS on insecure HTTP. Native hardware is emulated in these automated tests. The earlier physical iPhone confirmation does not establish acceptance of this newer worker/history candidate. The beta, household services, original phone lab and original uncommitted changes remain outside this test deployment.


Verified on 2026-11-15 in real worker mode:

- 47 worker regression tests and 19 HA receiver/launcher/ownership/signaling/history-proxy tests passed.
- Three live tests passed: two-owner persisted history, controlled worker restart with model-context recall for both owners, and 34 known-ID cross-user/admin audio/signaling attacks denied.
- The existing drawer created a separate stored conversation, previewed the exact spoken conversation and resumed it. Real WebRTC/STT/model/TTS, scheduled reply playback and Cancel passed on insecure HTTP without browser microphone APIs or an Assist launch.
- Card/experiment TypeScript checks, session-client, worker API mapping and playback lifecycle checks passed.

Synthetic worker history remains under `/tmp/butler-native-worker-lab/history`; none of these results use or migrate household conversations. The five core physical iPhone acceptance checks passed, as confirmed by the user below. Background interruptions and Bluetooth routing remain separate unverified acceptance checks.


## Physical worker/history acceptance (2026-11-15)

At the user's explicit request, the existing phone lab at port 18123 was upgraded to candidate `f31d338`, retaining its original login and server entry. Its prior component/configuration was backed up under a marked `/tmp/butler-native-phone-before-history-*` directory; the exact path is recorded in the lab's `worker-history-rollback.txt`. The phone lab now connects to the isolated actual worker on loopback 18954 and its separate test history store. The prototype speech service was left available for rollback. The beta, household HA/worker, household data paths and unrelated uncommitted changes were not changed.

After setup, actual LAN Lovelace login and mobile controls passed using the retained credentials. Automated genuine WebRTC/STT/model/TTS and history new/preview/resume checks also passed through that login. Only smoke-created synthetic conversations were removed before handover.

The user then reported that all five requested checks passed on their iPhone 17 in Companion with Wi-Fi on, over local HTTP:

1. The retained lab login opened the existing Butler UI.
2. Native capture produced a transcript and spoken reply for a conversation-local sample label.
3. Cancel discarded the recording without a new message/reply and stopped capture.
4. A separate new conversation worked; the original history could be previewed and resumed, and the model recalled its sample label.
5. After fully quitting/reopening Companion, the saved conversation and its context were still available.

This is user-reported physical acceptance of the worker/history candidate, distinct from the automated peer emulation and automated worker-restart proof. Exact Companion/iOS build numbers were not supplied. Lock-screen/background interruption, Bluetooth routing, continuous mode and other device/platform combinations remain unverified. This result does not promote or publish the experimental camera-based bridge.


## Voice-quality correction (2026-11-15)

After core phone acceptance, the user reported an unexpected accented voice and a noisy-room sound. Inspection found both model-only lab configurations had no TTS overrides; the running worker therefore used `fishaudio/s2.1-pro` with the repository's old reference `5c353fdb312f4888836a9a5680099ef0` and an empty language. That reference is publicly listed as [女大学生](https://fish.audio/m/5c353fdb312f4888836a9a5680099ef0/); no evidence tied it to the user's intended Butler voice. Functional speech delivery did not establish voice quality.

The worktree's worker and prototype defaults now select Fish Audio **Selene**, `b347db033a6549378b48d00acb0d06cd`, and `en`, matching [LiveKit's English Fish Audio example](https://docs.livekit.io/agents/models/tts/fishaudio/). Explicit model/voice/language overrides remain authoritative; the prototype now forwards TTS_LANGUAGE instead of ignoring it. Selecting the voice is the accent correction; [Fish Audio's language parameter](https://docs.fish.audio/features/text-to-speech#language) affects text normalization and is not an accent/noise filter.

Two short synthetic provider samples were generated outside the conversation flow. Both were mono 24 kHz with no clipped samples; PCM passed through the real worker's ReplyOutput matched the provider bytes exactly. This excludes corruption in that tested relay step, but does not establish that iPhone/WebAudio playback is artifact-free or confirm the cause of the reported noisy-room sound. Sample files and non-secret measurements remain in `/tmp/butler-voice-quality`; no user recording was captured. The voice replacement needs a brief subjective phone check; core transport/history acceptance remains recorded separately.


The disposable phone/candidate model files now explicitly pin Selene/en, and only the marked real-worker lab was restarted. The lab HA/UI/login and history directory stayed in place. A direct actual-worker synthetic reply produced mono PCM and acknowledged durable close/release with the new settings. The updated worker/prototype regressions passed (55 tests total), including the previously failing defaults and language-forwarding checks. The beta and household worker were not reconfigured or restarted. Replacement voice quality on the physical phone remains pending user confirmation.


## Idle session policy (worktree only)

The worker/history candidate source now closes quiet sessions after `VOICE_IDLE_TIMEOUT` (120 seconds by default), while protecting speech, model replies and running tools. Native save/release precedes its idle event and socket close. HA revokes the corresponding camera/receiver without waiting for a browser, and the existing UI releases capture normally, retains history and resumes it on the next explicit action. See [voice session resource policy](../../docs/voice-session-policy.md) for exact behavior and limits. This policy has not been deployed to the currently running phone lab, beta or household worker. Its new physical iPhone idle acceptance is pending; prior five-check acceptance still describes the earlier candidate.


## Current voice: Grok Rex through LiveKit (2026-11-15)

At the user's request, the worker/prototype defaults now use `TTS_MODEL=xai/tts-1`, `TTS_VOICE=rex` and `TTS_LANGUAGE=en`. [LiveKit lists Rex](https://docs.livekit.io/agents/models/tts/spacexai/) as a clear, confident US English voice. Speech still goes through LiveKit Inference with the existing gateway credentials; no separate xAI key, new plugin, LLM switch or realtime-model migration is involved. Explicit speech overrides remain supported.

The running phone lab's model settings were changed to Rex and only its independent worker was restarted. Its HA/UI/login and history path were retained. To avoid accidentally deploying the newer idle backend without its matching HA/UI, this voice-only restart uses a private source snapshot of the previously phone-tested worker revision `31d8c39` under `/tmp/butler-native-worker-lab/phone-source-31d8c39`. The exact source pin and restart caveat are recorded in `phone-runtime-source.json` there. The default `start_worker_lab.py` loads the current worktree and is appropriate only for an intentional coordinated candidate update, not an automatic restart of this pinned phone deployment.

A short standalone Rex sample succeeded through the existing gateway. A separate synthetic identity then received an actual Butler model reply as mono PCM from the real lab worker and acknowledged a saved/released conversation. The existing phone login still reached its owned history after restart. The worker/prototype regressions passed (72 tests), including the updated Grok default and preserved custom overrides. Synthetic previews are under `/tmp/butler-voice-quality/grok-rex.wav` and `worker-grok-rex.wav`; no phone recording was captured.

Current acceptance: the earlier five core physical phone checks and per-user/history proof remain recorded. The new Rex voice quality needs a brief listen in Companion. The new recording/idle policy remains worktree-only, and physical idle/background/Bluetooth checks still precede promotion. The beta, household services and original checkout's uncommitted edits remain unchanged.
