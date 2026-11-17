# Local picomatch 4.0.7 security patch

This directory contains a project-local MIT-licensed build of picomatch 4.0.7, mitigating [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). It is not an upstream release and keeps upstream version metadata unchanged. `LICENSE.picomatch` and the archive preserve the upstream copyright/license.

## Provenance and installation

- Upstream source: https://github.com/micromatch/picomatch/tree/6bb40679c218cefba5d4e9662408c5fdf699a8bb (tag 4.0.7).
- `picomatch-4.0.7.patch`: reviewable parser-only change against that commit.
- `picomatch-4.0.7-patched.1.tgz`: npm-pack archive containing the original runtime files plus the patched parser.
- `picomatch-patch.json`: upstream registry integrity, source commit, original parser hash, patch/archive hashes, and hashes of every shipped file.

The configuration app declares this archive as a development dependency and uses npm’s `$picomatch` override so every transitive consumer selects it. The card’s pnpm workspace override selects the same archive. Both lockfiles pin its SHA-512 integrity. Docker copies vendor inputs before `npm ci`. No postinstall hook or dependency script applies the patch, so `--ignore-scripts` installs remain supported.

## Behavior and limits

The tokenizer marks unbounded wildcard/quantifier tokens in every containing extglob. This uses the real parser’s quote/class/escape state and survives nested rewrites. Simple slash-free star sequences are collapsed to one copy (or an optional copy for zero-or-more), preserving their matching language. Disjoint single-letter alternatives beside a literal-prefix/star branch are rewritten without overlapping repetition. Other marked repeated groups use upstream’s existing literal fallback, including alternate-branch evasions. Quoted and escaped literal stars remain distinct from wildcards.

This is a targeted guard for the reviewed repeated-extglob cases, not a general proof that arbitrary regular expressions are safe. Keep the upstream default safeguards enabled: `maxExtglobRecursion: false` deliberately opts out. Do not pass untrusted raw regular expressions or deliberately disable safeguards.

## Verification

The patch passes the complete upstream 4.0.7 suite (1,983 tests) and lint. Project regressions cover matcher, makeRe, public parse and direct parser APIs, eight option combinations, lexical/quantifier/alternate-branch variants, and ordinary/Vitest file discovery. Timeout-bounded child processes prevent a regression from hanging CI. Short-input differential comparisons against pristine 4.0.7 check flat-pattern matching language; they do not certify every possible pattern.

After installation, `scripts/verify-picomatch-patch.cjs` verifies the archive, patch and all installed package bytes, rejects stale copies, and checks Vite’s actual resolution. Integrity tests exercise modified/missing files and archive/metadata tampering. The audit command requires that verification before running complete and production native audits. The existing advisory exception remains limited to November 24, 2026; version-based scanners still report upstream 4.0.7.

If an existing pnpm installation retains an orphaned registry copy, recreate only that application’s generated node_modules and run the frozen install. CI starts from a clean checkout.

## Rebuild and replace

Using Node 22 and npm 11.11.0, clone upstream, check out the exact commit above, and apply this directory’s `.patch` with `git apply`. Run `npm install --ignore-scripts --package-lock=false`, `npm run mocha`, and `npm run lint`. Create the runtime archive with `npm pack --ignore-scripts`, rename it to the local archive name, and compare its SHA-256 with the manifest. No registry publication is involved.

Any future local change must regenerate the archive, source hashes and both native lockfiles, then pass the integrity/security and complete project CI suites. When a suitable upstream fix is released, replace both overrides with that verified version, rerun all checks, and remove this archive/patch and the temporary exception. Do not remove a finding solely because an audit no longer recognizes a local package source.

Because native pnpm auditing omits findings for local tarballs, the audit CLI also generates a temporary, script-free npm lockfile for registry picomatch 4.0.7 and audits that version. This preserves visibility of new upstream advisories; unknown high/critical findings and audit errors remain blocking. The temporary lockfile is not an installation source or a competing project lockfile.
