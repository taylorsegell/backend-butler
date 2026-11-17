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

## Local code mitigation

The repository now requires the [pinned local parser patch](../apps/configuration-app/vendor/README.md) in both toolchains. Its tokenizer-based guard handles the reviewed repeated-extglob attacks and alternate-branch evasions, while retaining ordinary matching compatibility. Clean npm/pnpm installs use the same integrity-pinned archive without install scripts. The audit CLI verifies every installed copy’s bytes and actual Vite resolution before any version-based finding may be accepted.

The upstream version remains 4.0.7, so native scanners still report the advisory. The existing exception deadline is unchanged; this local mitigation does not silently extend the seven-day approval. No new upstream patched release is claimed.

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

Because native pnpm auditing omits findings for local tarballs, the audit CLI also generates a temporary, script-free npm lockfile for registry picomatch 4.0.7 and audits that version. This preserves visibility of new upstream advisories; unknown high/critical findings and audit errors remain blocking. The temporary lockfile is not an installation source or a competing project lockfile.
