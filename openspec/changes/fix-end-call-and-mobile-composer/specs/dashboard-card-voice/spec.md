# Dashboard card voice

## Purpose

Define how the dashboard card terminates voice sessions, reports recovery information, and keeps the text composer usable on narrow screens.

## ADDED Requirements

### Requirement: Deliberate call termination

The card SHALL stop local capture and clear the active call when the user ends it. It SHALL disregard late settings and playback results from the intentionally ended session and keep the existing conversation accessible. A genuine error closing or saving the conversation SHALL remain visible.

#### Scenario: Old operation returns after End

- **WHEN** the user presses End and a pending native settings or playback operation returns a failure after termination
- **THEN** capture stops once, the card returns to ready, and the existing conversation remains accessible without a recovery alert from the stale operation.

#### Scenario: Cancel or start another call during teardown

- **WHEN** the user cancels during startup, presses End repeatedly, or starts a new call as the previous call finishes closing
- **THEN** cleanup runs once for the old session and late results from it do not alter the new call.

#### Scenario: Save or close cannot be confirmed

- **WHEN** the native session fails to confirm save or close during End
- **THEN** the card stops local capture and displays one recovery notice explaining that save or close could not be confirmed.

### Requirement: Accurate draft recovery

The card SHALL keep a typed draft editable through End and voice recovery, and SHALL describe it as retained only when it contains nonblank text. An active-session failure SHALL remain visible.

#### Scenario: Genuine failure with empty or whitespace-only input

- **WHEN** a real voice failure occurs while the input contains no nonblank text
- **THEN** the card displays one actionable recovery notice without a draft claim.

#### Scenario: Genuine failure with an unsent draft

- **WHEN** a real voice failure occurs while the input contains a nonblank draft
- **THEN** the recovery notice acknowledges the draft and the same text remains editable.

### Requirement: Compact mobile composer

The card SHALL keep the empty composer compact at narrow phone widths and allow nonempty drafts to grow. Send SHALL use a neutral appearance with a visibly distinct disabled state when submission is unavailable. Call controls SHALL remain reachable. The idle layout SHALL omit redundant instructions and avoid orphaned words in fixed interface copy.

#### Scenario: Narrow text view

- **WHEN** the user opens the paused text composer at 320 or 402 CSS pixels
- **THEN** the short placeholder fits on one line, Send is neutral and visibly inactive with an empty draft, the card has no horizontal overflow, and call controls retain touch targets of at least 44 CSS pixels.

#### Scenario: Idle instructions and line breaks

- **WHEN** the user sees the empty call transcript or disconnected call controls at 320 or 402 CSS pixels
- **THEN** the repeated Ready to talk and microphone instructions are absent, their rows use no layout space, the Butler logo stays centered in the empty conversation area, the call and typing actions remain easy to find, and visible fixed interface copy has no single-word final line.

#### Scenario: Software keyboard focuses the composer

- **WHEN** the user focuses the composer and the software keyboard reduces or pans the visible area, including inside a scrolling Home Assistant container
- **THEN** the editable input and Send stay in the visible area, and dismissing the keyboard restores the layout while retaining the draft.
