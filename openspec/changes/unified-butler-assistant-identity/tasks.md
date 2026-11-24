## 1. Model-facing wording

- [x] 1.1 Reproduce the two-assistant wording from the runtime prompt and MCP tool catalog, then verify that both describe automation work as part of Butler.
- [x] 1.2 Verify progress, approval, completion, and failure wording with synthetic callbacks and check that an update alone cannot call any tools.
- [x] 1.3 Run affected worker and configuration bridge tests, then independently verify the implementation against the spec.

## Verification

- The new runtime prompt and tool-catalog regressions failed on public `main` and passed after the changes.
- Native and route fixtures verified that an active call receives only new updates for its owner, generates replies with tools disabled, and stops its reader before releasing the conversation. The text path records callbacks during an active voice lease.
- All 88 worker tests and 386 configuration app tests passed, along with worker lint, the app's type check and build, and strict OpenSpec validation. Independent review confirmed the approval and callback boundaries.
