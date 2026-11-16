# Beta.4 iPhone checks

Use the existing isolated candidate in Home Assistant Companion on Wi-Fi/local
HTTP. Keep synthetic conversations and do not request household actions. The user
has already confirmed that the logo renders correctly and continuous calls work.
Do not repeat those as uncompleted gates.

| Remaining check | Action | Pass condition |
| --- | --- | --- |
| Pause/Resume/End | During a call, Pause, Resume, then End. | Pause/End clear the OS microphone indicator; Resume restarts only after the tap. |
| Interrupt and sound | Ask for a longer reply; Interrupt, then speak again. Also toggle Silence/Sound. | Interrupt stops reply audio while keeping capture open; the next spoken turn works; sound settings behave as labeled. |
| Transcript and draft | Open Transcript during capture/reply; type an unsent draft and toggle Live/Transcript. Scroll older messages and return. | Voice continues; draft and reading position remain. |
| History after app restart | In a test conversation, remember a made-up label. End, quit/reopen Companion, resume that conversation and ask for the label. | Saved context and transcript remain; existing conversations are intact. |
| Idle expiry | After the reply finishes, leave it untouched for about two minutes; then Call again. | Distinct inactivity-ended state, capture stopped, explicit restart retains the conversation. |
| Background/network recovery | Background or lock/unlock the phone; separately interrupt Wi-Fi during a test call and reconnect to the lab. | Honest stopped/recovery state, no stuck microphone or repeated old reply, saved history remains. Cellular need not reach this LAN-only lab. |
| Permission recovery | If still unverified, deny Companion microphone access, try Call, restore permission and retry. | Clear recoverable error, typing remains usable, retry captures only after a tap. |

Report PASS/FAIL with iOS and Companion versions. For failures, include the step
and redacted diagnostic text. Never include tokens, household transcripts or other
people's conversations. Bluetooth/headset behavior is optional unless it is to be
claimed as supported. Automated two-user tests cover cross-user isolation; no
second phone login is required for this checklist.

A passing checklist is acceptance evidence, not automatic permission to publish or
upgrade the household installation. Before that update, back up actual deployed
history and configuration and retain the previous worker/integration versions.
