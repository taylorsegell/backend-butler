# Temporary build/test audit exception

## Approval and expiry

The repository maintainer explicitly approved a seven-day exception on November 17, 2026 to unblock reviewed PRs #1, #10 and #14 and prepare publication.

- Advisory: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).
- Package: `picomatch`; current reviewed affected version: 4.0.7.
- Scope: high-severity findings for this advisory only, in the card and configuration app’s development/build/test dependency trees.
- Expires: **2026-11-24 at 19:32:35 UTC** (12:32:35 p.m. America/Denver).
- Review owner: repository maintainer. Recheck upstream releases and the advisory before publication and before expiry; remove the exception when a verified fix is available. An extension requires a new explicit decision.

## Exposure and mitigation

The affected paths are Vite/tinyglobby/fdir/picomatch and Vitest’s tooling graph. Production-only native audits report no high/critical findings for either application; production dependency listings contain no picomatch. The card is shipped as a browser bundle; the configuration-app runtime image prunes development dependencies. Glob patterns in these tooling paths come from project/build/test configuration, not the application's household HTTP inputs. Build or test untrusted contributions only in isolated CI without production credentials; avoid introducing externally supplied glob patterns. The advisory remains unresolved upstream, so this is accepted temporary tooling risk, not a claim that picomatch is fixed.

## Enforced behavior

`scripts/audit-javascript.py` runs each package manager’s native JSON audit against both the installed production tree and the full frozen dependency tree. Production high/critical findings have no exception. The complete audit accepts only the exact GHSA URL/package at high severity before the expiry; npm meta-advisories are traced to their root causes. pnpm findings must explicitly be development-only. Other advisories, critical severity, unknown schemas/count inconsistencies, incomplete results, timeouts, non-audit failures and expiry fail the job.

The native package-manager installs remain frozen and scripts disabled in the audit job. No lockfile or dependency has been hidden from audit, no blanket ignore is configured, and branch protection / `CI required` remain enforced. The policy’s regression tests run inside both JavaScript audit jobs.

Run locally from each application directory:

```sh
# apps/dashboard-card
python3 ../../scripts/audit-javascript.py pnpm
# apps/configuration-app
python3 ../../scripts/audit-javascript.py npm
```

Test the policy from the repository root:

```sh
python3 -m unittest discover -s scripts -p test_audit_javascript.py
```
