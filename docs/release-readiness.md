# Public snapshot handoff

The development repository must remain private. Publish a new repository from the
reviewed snapshot, without copying `.git`, discussions, Actions logs/artifacts,
wiki content, private deployment configuration, task archives, or promo captures.
A clean pattern-based secret scan does not establish that all content is public.

## Local preparation

- Code remains MIT licensed; both Python and both JavaScript manifests declare MIT.
- JavaScript development targets Node.js 22, matching CI; lockfiles stay committed.
- External CI actions are pinned to full commits. Checkouts do not retain tokens.
- Dependabot checks Actions, npm and uv weekly, grouping updates by ecosystem.
  npm and uv version updates wait seven days; security audits remain required.
- Editor defaults and community conduct guidelines are included.
- HTTP API documentation is in [Text chat](text-chat.md); installation and developer
  instructions are in the README, Home Assistant guide and CONTRIBUTING.

## New repository setup

1. Keep the final repository URL `https://github.com/taylorsegell/backend-butler`
   consistent across package metadata, badges, HACS links and security links.
   Validate temporary staging before the approved repository-name swap.
2. Review every exported file for private information. Use synthetic fixtures.
   Confirm rights to redistribute code, fonts and branding; keep LICENSE/NOTICE.
3. Initialize a new Git repository inside the snapshot, commit the reviewed tree,
   and push only that new history to the new repository.
4. Enable private vulnerability reporting, secret scanning and push protection.
   Confirm the private reporting button works before inviting reports.
5. Require PR review and `CI required` on the default branch; disallow force pushes.
6. Run the full CI pipeline in the new repository, including public-only HACS.
7. Perform [real Home Assistant smoke tests](smoke-tests.md), capture deployment
   backups, and verify rollback. Create a beta tag only after those checks pass.

The local snapshot does not create a remote, change visibility, create a release,
or certify deployment behavior. Semver tags intentionally remain absent until
validation is complete. The release workflow validates tags and creates drafts.

## Deliberate limits

The repository is an application stack, not a published npm or PyPI library.
Package publication, registry accounts and generated library API sites are not
required for this beta. API documentation is maintained as Markdown. Hosted docs
can be enabled in the new repository after its destination is selected.

Existing TypeScript and Ruff checks remain in place. A repository-wide formatter,
additional static analysis and broader Python/platform matrices need a separately
reviewed baseline; this snapshot does not reformat application code or claim
untested Python versions are validated. CI currently validates Python 3.13 and
Linux AMD64 images. ARM64 and declared older Python versions require additional
validation before support claims expand.
