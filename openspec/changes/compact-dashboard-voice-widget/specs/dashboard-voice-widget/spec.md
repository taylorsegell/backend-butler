## Purpose

Let Home Assistant dashboard users start and end a hands-free call from a compact Butler widget.

## ADDED Requirements

### Requirement: Compact embedded voice surface

The registered Butler voice card and the `voice` layout SHALL render a content-sized widget with one primary call control and a status line. The existing conversation workspace SHALL remain available through its other layouts.

#### Scenario: Existing dashboard configuration

- **WHEN** either voice-card configuration loads, including a configuration with a legacy height
- **THEN** the dashboard shows a compact voice widget with a start control and status

#### Scenario: Dedicated conversation workspace

- **WHEN** the full-page Butler configuration loads
- **THEN** it renders the conversation workspace and its controls

### Requirement: Hands-free calls in place

The widget SHALL use the existing browser or Companion voice transport in the current dashboard and start capture on an explicit user action. Its call control SHALL support cancelling startup, ending an active call, and retrying a failure.

#### Scenario: Start and end a call

- **WHEN** the person starts a call and its transport is ready
- **THEN** the widget listens hands-free and uses the same control to end the call and release the microphone
- **AND** ending a Companion call uses the existing save and release path

#### Scenario: Cancel during startup

- **WHEN** the person cancels before startup completes
- **THEN** the widget returns to idle and ignores late results from the cancelled attempt

#### Scenario: Microphone or connection failure

- **WHEN** the microphone cannot start or a call cannot connect
- **THEN** the widget stays compact and offers a retry with a visible failure status
