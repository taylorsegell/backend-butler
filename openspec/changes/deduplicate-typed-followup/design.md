## Context

The full conversation panel appends a local transcript entry when a typed send succeeds. Native Companion also publishes that message in its authoritative conversation snapshot under a different message ID. The transcript merges both entries by ID.

## Goals

Use one source of transcript entries for native typed messages while retaining the browser voice transport’s immediate local echo. Keep separate IDs for distinct sends.

## Decisions

Use the existing native session indicator to defer display to the native conversation snapshot. Continue local echo on the browser transport, which uses a different delivery path. Keep the current send guard and avoid deduplication by message text.

## Risks

Native transcript display follows the existing snapshot refresh. The regression should exercise both live delivery and saved history and observe the number of text commands separately from the UI.
