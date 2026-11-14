# Public beta smoke tests

Run the portable read-only HA checks with your own dedicated token file:

```sh
cd apps/configuration-app
HA_SMOKE=1 HA_URL=https://your-home-assistant.example.com HA_TOKEN_FILE=/path/to/ha-token npm run test:live
```

The suite reads states and registries and submits valid/invalid configuration to HA's validator. It does not install configuration or call device actions. It is skipped unless explicitly enabled and does not assert private entity names, rooms or inventory sizes.

## Recorded evidence

- All three read-only checks pass against a running Home Assistant instance.
- The candidate worker and scheduler Docker images build from allowlisted, secret-scanned source contexts on a separate worker host.
- The worker has 43 passing tests, including owner-bound leases, expiry, voice/text exclusion, service-only persistence, recovery and the patched OpenTelemetry parser/SDK.
- The scheduler has 24 passing tests; the separate app has 385 unit tests; the card passes typecheck/build, unit checks and Chromium responsive voice controls/reduced-motion tests.

## Recovery checks completed without production credentials

- A real saved conversation was closed, backed up, removed from its original location, and restored in a fresh Python process. History, usage totals and ownership survived; foreign ownership and stale process leases were rejected.
- An isolated scheduler container with networking disabled accepted a synthetic future task, rejected unauthenticated and cross-owner requests, preserved the task across a stop/start outage, and restored it in a replacement container from a closed-state backup. The disposable task and temporary container/data were removed afterward.
- The portable three-test read-only HA suite was rerun successfully. It reads states and registries and validates configuration without installing changes or calling device actions.

These checks cover storage and scheduler recovery. They do not verify LiveKit transport, real speech or a physical mobile microphone.

## Candidate live-session gate

Real LiveKit voice input/output, mute/stop, reconnect, worker restart, cross-user persistence, and scheduler-outage/recovery must be verified against the isolated candidate stack. Use synthetic speech and test users, unique worker dispatch name, isolated state and random client tokens. Do not stop household services, perform device actions, publish raw transcripts or copy production state. Remove the temporary stack and credentials afterward.

Physical microphone/speaker behavior in the HA mobile app still requires a person on the target device. Programmatic audio tests can verify the transport/inference path but do not certify phone permissions or acoustic quality.

## Automated voice checks — November 14, 2026

The public candidate's worker source was exercised in a separate, resource-limited
stack with a unique LiveKit worker name, synthetic users/state, a synthetic HA MCP
fixture, and no household HA credentials or notification targets. LiveKit transport,
STT, model responses and TTS used real providers with synthetic utterances.

Passed:

- Manual speech input reaches STT/model responses and persists its transcript.
- Idle input/output are gated; muted replies remain text-only; enabling audio yields
  non-silent output; reply mute stops received audio; cancel restores the idle gate.
- Automatic turn detection recognizes speech and answers without a manual send.
- Voice → text → voice retains the same conversation across a candidate-worker
  restart; disconnect/rejoin restores its saved context.
- Foreign-user HTTP and RTC resumes are denied without exposing the transcript;
  personal tokens cannot call the service-only voice persistence API.
- A stopped candidate scheduler does not prevent ordinary chat/history; its
  synthetic future task survives restart and is removed before firing. Unauthenticated
  and cross-owner scheduler access are rejected.
- The HA-served card matches the candidate bundle byte-for-byte. Mobile-sized Chromium
  companion, conversation-first and audio-feedback fixtures pass. Live read-only HA
  checks pass; the worker now has 43 passing tests.

The denied-resume live check found an error-path crash: the worker registered its RPC
before joining the room. It now connects before registering/publishing the error.
Regression cases cover missing/foreign conversations, busy sessions and storage errors.

A fresh image export on the worker host hit its Docker storage limit. Live tests used
cached test dependency images whose lockfiles match the candidate, with candidate
application source mounted read-only. This is distinct from the successful full image
builds in CI. Resolve deployment-host capacity before attempting an on-host rebuild.

Only candidate containers were stopped/restarted; household container identities,
start times and restart counts are checked afterward. No device actions, household
notifications, production-state copies, beta tag or deployment are part of these checks.
Physical phone results are still pending; use the [phone checklist](phone-beta-checklist.md).
