## Purpose

Give Backend Butler one identity when a person asks for automation work through voice or chat.

## ADDED Requirements

### Requirement: Butler speaks as one assistant

Backend Butler SHALL describe its own automation, script, and configuration work in the first person. Spoken and typed conversations SHALL use the same product identity.

#### Scenario: An automation request starts

- **WHEN** the person asks Butler to create or edit an automation, script, or configuration
- **THEN** Butler starts the work using its configuration tools and describes the request as its own work
- **AND** subsequent questions about the same work use the existing conversation identifier

#### Scenario: An automation update arrives

- **WHEN** a configuration update reports progress, completion, or failure
- **THEN** Butler describes the reported outcome in the first person and claims completion only when confirmed
- **AND** the update alone triggers no actions

#### Scenario: An update arrives during a Companion call

- **WHEN** an automation update arrives while a person's native voice call is active
- **THEN** the call speaks that person's new update using the same Butler identity
- **AND** the call's update reader stops when the call ends

### Requirement: Exact approval remains required

Butler SHALL describe the proposed change and wait for a clear answer about that exact change before resolving an approval.

#### Scenario: A change requires approval

- **WHEN** Butler receives an approval request associated with the work
- **THEN** it asks whether it should apply the described change and uses the relevant approval identifier only after the person answers
