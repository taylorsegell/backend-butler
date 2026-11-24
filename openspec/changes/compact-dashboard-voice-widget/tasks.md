## 1. Dashboard widget

- [x] 1.1 Reproduce the oversized registered card and verify compact rendering for both voice configurations and the dedicated workspace.
- [x] 1.2 Wire start, cancel, end, and retry to the existing browser and Companion session lifecycle and verify both paths with isolated fixtures.
- [x] 1.3 Update the dashboard card instructions and rebuild the packaged card. Verify the bundle through the registered card and affected frontend checks.

## 2. Verification

- [x] 2.1 Independently compare the implementation and browser evidence with the spec and review the native end and recovery path.

## Verification

- The original registered card rendered at 640 px with the legacy height. The compact layout passed registered-card tests in Chromium and WebKit at 320, 390, and 1200 px across the supported voice configurations.
- Browser and Companion fixtures verified hands-free start, permission or connection recovery, cancellation, and microphone release on End. The Companion fixture verified the shared save-and-release path and retry after a conversation error.
- The build, type check, unit tests, and copied Home Assistant package check passed. Independent review covered both widget layouts and the call lifecycle. Physical iPhone acceptance is tracked separately.
