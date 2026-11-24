## Why

A typed follow-up after a voice exchange can appear twice in the Companion transcript, making it unclear how many times Butler received it. See [GitHub issue #31](https://github.com/taylorsegell/backend-butler/issues/31).

## What Changes

- Render one transcript entry per accepted typed message, including after voice use and when reopening saved history.
- Keep separate deliberate sends of identical text visible as separate entries.

## Capabilities

### New Capabilities

- `typed-followup-transcript`: Correct transcript reconciliation for typed messages in the voice conversation.

### Modified Capabilities

None.

## Impact

Dashboard card transcript handling and the Companion native-session regression fixture.
