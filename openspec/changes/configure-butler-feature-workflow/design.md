# Design

## Context

See proposal.md for motivation and scope. Public repository hygiene excludes local agent instructions and internal task captures. Contributors can review durable OpenSpec records without installing the maintainer's agent configuration.

## Goals / Non-Goals

Keep a low-friction natural-language entry point and independent acceptance review. Do not add application dependencies or modify runtime behavior or CI gates.

## Decisions

- Keep the Butler skill, Codex routing and generated OpenSpec skills in machine-level agent configuration. Committing them would conflict with repository hygiene; cloning the repository therefore does not activate them.
- Pin the locally installed OpenSpec CLI to 2.1.1 and enable verification alongside propose/apply/archive workflows. Use current generated instructions and a project-level config instead of relying on legacy commands.
- Keep the public form to one required desired-outcome field. Technical scope, acceptance scenarios and tests are agent/maintainer work; optional examples and device context reduce avoidable questions.
- Require separate implementation and verification ownership when agents are available. Structural OpenSpec validation checks record consistency; actual feature tests, CI and device evidence establish behavior.
- Preserve explicit approvals. A request and an archived record do not grant merge, release, deployment, paid calls or household-action permission.
- Use the CLI-supported tooling-only `skip_specs` marker for this bootstrap; future application behavior changes still need acceptance scenarios and required schema artifacts.

## Risks / Trade-offs

- Local skill routing is machine-specific -> document the configured-workspace boundary and explicit skill fallback; forward-test a fresh natural-language request.
- A form is unavailable on the default branch until merge -> provide the reviewable setup PR and report publication separately.
- More ceremony can slow small requests -> keep artifact detail proportional and exclude questions, status checks and mechanical edits from feature routing.

## Migration Plan

Review and merge the contributor-only files through existing CI when authorized. Reverting that change removes the public form/config/docs; local skill and CLI configuration are independent. No Home Assistant upgrade, release or migration is involved.
