# Verification

The approved UI and End Call behavior were verified on runtime commit `b8aeada22deaf69d1e2b6d971b8af8b62a243e9d`, card SHA-256 `8a6930737e525dbc3092a2e425e9dbf2e609ec2e55ec3892c951195c8c3bba3b`. The committed card matched an offline, frozen-lockfile build.

| Acceptance scenario | Candidate evidence |
| --- | --- |
| Old operation returns after End | Independent Chromium and WebKit checks on the compiled custom card passed normal End and delayed settings and playback cases. The isolated HA test injected a delayed card-side rejection after real disconnect acknowledgement. It failed against the previous card with the original false alerts and passed on the candidate. |
| Cancel or start another call during teardown | Independent actual-card checks in both engines passed cancellation during native prepare and connect. A new call remained active after the held failure from the previous session was delivered. The native lifecycle suite also covered overlapping End, idle, and unmount. |
| Save or close cannot be confirmed | Both engines showed a single recovery notice when save or close was unconfirmed and capture stopped. |
| Genuine failure with empty or whitespace-only input | Both browsers showed one alert and omitted draft reassurance for blank and whitespace-only inputs. |
| Genuine failure with an unsent draft | Both browsers kept the text editable and acknowledged the draft in one alert. |
| Narrow text view | Independent compiled-card checks at 320 and 402 CSS pixels measured a one-line input, neutral enabled Send, distinct disabled Send, at least 44 CSS pixel touch targets, and no horizontal overflow. |
| Idle instructions and line breaks | The real card kept the Butler mark centered and prompts above the composer at both widths. Redundant status rows were absent, prompts had no orphaned words, and active voice feedback still appeared. The layout regression failed on the previous card. |
| Software keyboard focuses the composer | In both engines, the compiled card kept input and Send visible during simulated keyboard movement and preserved the draft through dismissal. The viewport suite covered scrolling through nested Home Assistant-style containers. |

Local card typecheck, seven unit suites, the Chromium browser suite, the WebKit voice and viewport suite, 20 HA tests, and the isolated Home Assistant package test passed. See [PR #20 checks](https://github.com/taylorsegell/backend-butler/pull/20/checks) for the published head and CI status.

Physical iPhone Companion keyboard, microphone, and speaker acceptance remains pending.
