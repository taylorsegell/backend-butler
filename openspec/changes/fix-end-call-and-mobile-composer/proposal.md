# End Call and mobile composer

Tracking issue [#24](https://github.com/taylorsegell/backend-butler/issues/24). Candidate [PR #20](https://github.com/taylorsegell/backend-butler/pull/20).

## Why

Ending a native call can surface a late control error and incorrectly claim there is a typed draft. On narrow screens the paused composer wraps, and viewport movement when the keyboard opens can hide the input and Send.

## What Changes

- Make deliberate End reliable while preserving visible feedback for active-session failures and unconfirmed save or close.
- Preserve existing draft text and mention it in recovery only when the input contains a nonblank draft.
- Use a short, single-line placeholder in paused composers, a neutral Send control, and keep the focused input and Send visible during mobile keyboard use.
- Remove the repeated idle and microphone instructions. Keep the centered Butler logo and useful prompts, and balance fixed interface copy to prevent orphaned words.
- Reuse the open candidate. Review its UI with the maintainer before adding UI changes. Verify the actual custom card with synthetic external responses and record physical Companion acceptance separately.

## Capabilities

### New Capabilities

- `dashboard-card-voice`: Native call termination, truthful recovery, and mobile call composition in the dashboard card.

### Modified Capabilities

## Impact

The work covers the dashboard card, its packaged frontend bundle, and its regression tests. The Home Assistant API and worker protocol remain compatible. Voice processing, release, and deployment are outside this change.
