# Proposal

## Why

Feature requests need a durable acceptance record and independent verification so a PR, passing tests and a Home Assistant deployment are reported accurately. Natural-language requests should enter that workflow without requiring the requester to learn commands.

## What Changes

- Configure OpenSpec for proportional Butler change records and revision-specific evidence.
- Add a public feature-request form with one required outcome field and a contributor workflow guide.
- Extend PR guidance with the request/change link, relevant verification and achieved delivery state.
- Install a local Butler feature skill and persistent natural-language routing outside the public repository; verify both independently.

## Capabilities

### New Capabilities

None. This is contributor tooling and documentation; no application behavior changes. This bootstrap change uses `skip_specs: true` rather than inventing runtime requirements.

### Modified Capabilities

None.

## Impact

Public templates, contributor documentation and `openspec/config.yaml`; local OpenSpec installation and agent configuration. No card, integration, worker, scheduler, release or deployed instance changes. This record documents bootstrap setup, including steps completed before its artifacts were authored. Publishing the form on the default branch requires a separate merge; setup does not itself authorize that action.
