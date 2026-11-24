## Why

The embedded voice card uses dashboard space for a full conversation workspace. A compact card should let someone start talking to Butler with one tap.

## What Changes

- Render a content-sized widget with the Butler mark, call status, and one primary call control.
- Start a hands-free call in place. Use the call control to cancel startup, end the call, or retry a failure.
- Keep the conversation workspace available for chat, transcript, and settings.

## Capabilities

### New Capabilities

- `dashboard-voice-widget` covers embedded voice calls and their dashboard presentation.

### Modified Capabilities

## Impact

The dashboard card frontend and its packaged Home Assistant resource change. Existing browser and Companion call transports serve the widget. [Tracking issue #26](https://github.com/taylorsegell/backend-butler/issues/26)
