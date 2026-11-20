# Requesting and delivering a Butler feature

Start with the result you want: “I want Butler to …, so I can …”. Use the [feature-request form](https://github.com/taylorsegell/backend-butler/issues/new?template=feature_request.yml) or describe it naturally in a maintainer's configured Codex workspace. Only the desired outcome is required in the form. Current pain, examples, device context and constraints help, but you do not need to design the implementation or write tests yourself.

For a reproducible failure in existing behavior, use a [bug report](https://github.com/taylorsegell/backend-butler/issues/new?template=bug_report.md). A small, well-understood fix can remain a focused issue and PR; it does not require converting the existing application into a new specification project.

## From request to a clear brief

The maintainer and coding agent turn the request into a short brief: desired behavior, what is out of scope, relevant constraints and concrete acceptance examples. Ask about an ambiguity when it changes the outcome; reuse decisions and authorization already given rather than asking again between routine tasks.

The agents identify the affected pieces: dashboard card, HA integration, voice worker, scheduler or optional configuration app. They record the current behavior and compatibility boundaries before proposing a change. The requester supplies the goal; the agents fill in the technical details and relevant verification plan.

In a maintainer's configured Codex workspace, a natural-language feature request is the usual entry point. The machine-wide `butler-feature` skill coordinates this workflow; invoke `$butler-feature` explicitly if routing does not select it. Skills and routing live in local agent configuration, so cloning this repository alone does not install or activate them.

## Keep the feature record with the code

Use OpenSpec for substantive features. A change lives under `openspec/changes/<name>/` with the artifacts required by the installed schema: the proposal, requirement scenarios, technical design and task list. Keep the brief and tasks consistent when scope changes. Completed changes are archived and their specification updates are synchronized into `openspec/specs/`.

OpenSpec and the Butler feature workflow complement the existing planning, TDD, debugging and review skills. Use Impeccable for user-facing design and audit work. OpenSpec records the agreed behavior; it does not replace runtime tests, required GitHub checks or physical-device evidence. Follow the workflows supported by the installed version rather than assuming commands from another version apply.

Commit reviewed, public-safe OpenSpec artifacts. Agent skills and local routing belong outside the public repository. Do not commit local `.agents`, `.codex`, task archives or internal planning captures; preserve the repository's existing hygiene rules. Keep household data, credentials and private deployment details out of issues, specs, test fixtures, previews and logs. Use synthetic examples and the [private security reporting process](../SECURITY.md) when appropriate.

## Implement and review against the acceptance checks

Use separate agents for independent pieces and an independent review of the combined result. Give implementation agents a clear scope, disjoint file ownership and the shared requirements; keep one owner responsible for integration. Review both the requirement coverage and the actual diff rather than accepting an agent's success summary.

Turn acceptance examples into meaningful tests. A regression test should reproduce the reported behavior before the fix and pass afterward. Prefer observable behavior over assertions that mirror the implementation. Select checks for the parts changed, then run the repository's required CI; keep existing security and quality gates intact.

For UI work, cover relevant empty, loading, active, error and recovery states. Include realistic phone widths, focus, keyboard opening/dismissal, long text and reduced motion where the feature touches them. Exercise the real custom card when viewport or HA embedding matters; a component-only fixture can miss those boundaries. For native audio or session changes, cover affected start/end, late-response, microphone release, reconnect and saved-history paths. Tests involving ownership or persistence must preserve their isolation and data guarantees.

Use a screenshot or interactive preview when it helps evaluate the result. Identify the revision and state shown, use synthetic content, and say whether the evidence comes from an emulated browser or a physical device. A preview is supporting evidence, not a substitute for behavior checks. State any device or integration checks that remain unverified.

## Report the actual delivery state

Open a reviewable PR linking the request and OpenSpec change when applicable. Include relevant test commands/results, previews, compatibility notes and remaining gaps in the [PR template](../.github/PULL_REQUEST_TEMPLATE.md). Report only the states reached:

| State | Evidence |
| --- | --- |
| Proposed | Brief and specification artifacts exist; implementation has not been claimed. |
| Implemented | A reviewable code diff exists. |
| Verified | Named checks passed for a stated revision and scope; physical-device gaps remain explicit. |
| PR open | PR link, current head and CI state. |
| Merged | Confirmed commit on the target branch. |
| Released | Published tag/release and matching version; distinguish a draft or prerelease. |
| Deployed | The installed revision or artifact and relevant runtime checks were verified in the target environment. |

For example: “PR open; Chromium and WebKit checks pass. Physical iPhone keyboard behavior is unverified. No release or deployment performed.” An archived OpenSpec change, passing CI, merge or published release does not establish that an existing Home Assistant installation has been updated.

## Keep authorization in scope

Carry out the requested implementation, reversible local checks and PR preparation without repeated permission prompts. Reuse explicit authorization already present in the request or session. Do not infer permission for household device actions, paid inference, external messages, release publication, merging or deployment when that action has not been authorized. Ask only for the missing decision or authorization, after making the result concrete and reviewable. Preserve unrelated work and existing history throughout.
