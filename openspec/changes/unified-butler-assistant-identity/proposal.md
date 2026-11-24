## Why

Butler's voice responses describe automation work as a handoff to a second assistant. Voice should be another way to use the same Backend Butler product.

## What Changes

- Give Butler's voice prompt one product identity and first-person wording for automation requests, progress, approvals, and results.
- Describe automation tools and their results in terms of the work they perform.
- Keep request continuity and require explicit approval for the exact proposed change.

## Capabilities

### New Capabilities

- `butler-assistant-identity` covers how Butler represents its automation work across conversations.

### Modified Capabilities

## Impact

The voice worker's runtime prompt and update guidance and the configuration app's MCP tool descriptions and result wording. [Tracking issue #27](https://github.com/taylorsegell/backend-butler/issues/27)
