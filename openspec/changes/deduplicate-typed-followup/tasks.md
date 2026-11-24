## 1. Typed follow-up

- [x] Reproduce two native transcript entries for one text command with the full conversation panel.
- [x] Render one authoritative native entry per send, preserving separate intentional sends and browser echo.
- [x] Verify native lifecycle, transcript history, affected browser suites, and the packaged card.

## 2. Review

- [x] Independently verify the implementation and regression against the scenarios.

## Verification

- The previous packaged card submitted one native text command and rendered two entries in disposable Home Assistant. The fixed package submits one command and shows one entry live and after opening saved history.
- Chromium and WebKit cover authoritative snapshot replay and two intentional sends of identical text. Type checking, all card unit suites, and the frozen bundle build passed.
- Independent review confirmed the native and browser transcript paths match the requirements.
