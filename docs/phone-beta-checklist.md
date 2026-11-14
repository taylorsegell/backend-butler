# Phone beta checks

Record the phone model, OS version, and whether you used the Home Assistant Companion
app or a browser. Test the Companion app first if that is how you normally use Butler;
repeat permission/audio/reconnect checks in your browser if you use that too.

The installed card has been verified against the candidate bundle. The candidate
worker is tested separately in an isolated stack; the household worker has not been
upgraded or restarted. These phone checks verify physical microphone, playback and
mobile connection behavior on your installation. Record the installed worker version
alongside results rather than claiming an unperformed candidate deployment.

Use a new disposable conversation and synthetic phrases. Do not request device
changes, send notifications, delete existing conversations, or stop shared services.
Stop testing if a voice control performs an unintended action.

| Check | Action | Pass condition |
| --- | --- | --- |
| Text-only idle | Play music on the phone, open Butler and send a typed greeting without enabling voice. | No microphone indicator or permission prompt; music remains uninterrupted. |
| Microphone permission | Deny microphone access, attempt voice, then restore permission and retry. | Clear recoverable microphone error; no false Listening state; typing still works; retry succeeds. |
| Manual speech and captions | Use manual/push-to-talk controls to say “Remember blue lantern.” Finish the turn with the card's send control. | First words are captured, captions are readable, and the reply is coherent. No stuck spinner or doubled reply. |
| Reply audio and stop | Enable spoken replies. Ask “Count from one to twenty,” then press **Stop reply audio** while it speaks. | Audible reply at normal phone volume, then prompt silence. Text may continue; stopping audio does not cancel unrelated actions. |
| Continuous mode and end | Enable continuous listening, ask a harmless question, then end voice mode. | Speech is detected automatically; the correct listening/speaking states appear; after ending, the OS microphone indicator clears. |
| Mobile reconnect | Switch Wi-Fi to cellular and back during the disposable conversation; also background/lock and reopen the app. | Honest reconnect/error state and recovery; the same conversation remains available; no duplicate send or replayed old audio. |
| History and text handoff | End voice, type “What phrase did I ask you to remember?”, then reopen the saved test conversation. | “Blue lantern” and the test transcript survive; older conversations remain intact. |
| Two accounts, if available | With a second account you control or a consenting test user, open Butler and attempt to resume only the disposable first-account conversation. | First-account history is unavailable; no transcript or audio is exposed. |

Bluetooth/headset routing is an additional check if you normally use it. Verify speech
comes from the expected output and capture stops when voice mode ends.

Return results as: `phone / OS / app or browser / worker version`, followed by PASS/FAIL
for the rows above. For failures, include the step and what happened. Do not include
service tokens, real household transcripts, private device inventories or other users'
conversations. Physical phone results must be recorded before beta signoff.
