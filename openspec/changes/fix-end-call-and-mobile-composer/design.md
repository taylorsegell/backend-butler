# Design

## Context

PR #20 already contains the candidate source, regression tests, and packaged custom card. Use that revision for comparison with the previous card and make further edits only for gaps the audit or verification identifies. The maintainer approved the centered-logo mobile preview on November 20, 2026.

## Goals / Non-Goals

Keep teardown and recovery scoped to the originating session. Preserve text and conversation identity, and keep the mobile composer and actions within the visible viewport. The integration and worker protocol and the storage format stay compatible.

## Decisions

- Invalidate call work synchronously before updating the End state. Share cleanup across End, idle timeout, and unmount. Scope asynchronous results to their originating session so a late settings or playback result cannot change a later call. Keep durable save or close failures distinct from discarded session callbacks.
- Use one call recovery notice. Select its draft reassurance from the trimmed composer value and preserve the original text for editing.
- Use the same short placeholder in paused composers. Use neutral surface and foreground colors for enabled Send, with a distinct inactive appearance and native disabled semantics.
- Keep the existing Butler mark centered in the empty conversation area. Group suggested requests above the composer. Remove repeated idle instructions and collapse their rows while retaining the Live view typing action, meaningful state feedback, and recovery. Balance any fixed copy that still needs multiple lines.
- Bound the active card surface to the visual viewport and clipping ancestors while the keyboard is present. Keep the surrounding Home Assistant layout in document flow.
- Exercise the packaged custom element against synthetic authenticated HA/native microphone responses. Run the viewport and native lifecycle regressions in Chromium and WebKit alongside the isolated Home Assistant package test.

## Risks / Trade-offs

Closing and rapidly reopening a call can interleave asynchronous callbacks. Exercise cancellation and new-call ordering in the lifecycle regressions. Browser visual-viewport fixtures can emulate keyboard geometry. Actual iPhone Companion focus, keyboard transitions, microphone, and speaker require physical verification.
