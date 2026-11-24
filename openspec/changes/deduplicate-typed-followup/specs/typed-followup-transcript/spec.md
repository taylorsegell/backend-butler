## Purpose

Keep transcript entries consistent with accepted typed messages when switching between speech and typing.

## ADDED Requirements

### Requirement: Typed follow-ups appear once per accepted send

The dashboard conversation SHALL show one user entry per accepted typed message. Live native updates and saved history SHALL represent the same message once. Independent sends with identical text SHALL remain distinct.

#### Scenario: One typed follow-up after using voice
- **WHEN** a Companion user speaks and then submits one typed follow-up
- **THEN** one text command is sent and the accepted follow-up appears once when the native transcript syncs and once when the saved conversation is reopened

#### Scenario: Intentional repeated text
- **WHEN** the same text is accepted in two separate sends
- **THEN** both entries appear under their distinct message IDs
