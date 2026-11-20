# Setup verification

This is contributor tooling and documentation; application specification coverage is not applicable (`skip_specs: true`). Bootstrap implementation was split between skill and form/documentation agents, followed by separate independent workflow and public-source reviews.

## Executed checks

- OpenSpec 2.1.1 runs locally; package and lockfile declarations use the exact version. Seven configured workflows include verification. The Butler skill passes the skill creator's structural validator.
- A fresh read-only Codex session received a synthetic natural-language conversation-pinning request without naming a skill. Its command trace read the installed Butler skill and verified the public remote; its response selected the feature workflow.
- Two additional fresh read-only sessions kept a status question outside feature routing and preserved a requested UI-preview approval before implementation. These are bounded routing checks, not proof of every future prompt or feature implementation.
- An independent disposable OpenSpec fixture exercised proposal/spec/design/task dependencies and configured artifact/operation guidance. Strict validation accepted a valid synthetic change and rejected a scenario missing its THEN clause.
- Strict validation accepts this tooling-only bootstrap record. Structural validation does not prove runtime behavior or task completion.
- Independent review checked public form fields, unique IDs, optional dropdown default, local documentation links, config compatibility, privacy, authorization and delivery-state wording. Only the desired-outcome field is required.

## Findings addressed

Independent review found the local package declaration initially allowed compatible version updates despite an exact-pin design decision. The package and lockfile declarations were changed to exact 2.1.1; installed CLI output was checked again.

## Evidence limits and delivery

No runtime source or frontend bundle changes are part of this change. Home Assistant, real phone interaction, application releases and deployment were not exercised or changed. The public form was checked structurally; GitHub-hosted form rendering remains unverified until the template is available on the default branch. Local skill routing is configured on the maintainer workspace and is not distributed by cloning this repository.

Final whitespace, repository hygiene and staged secret checks passed; the staged scope excludes application source, dependency manifests and bundles. The PR reports its own CI and delivery state; this verification record does not claim a merge, release or deployment.
