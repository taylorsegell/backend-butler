"""Native JS audits with one approved, expiring build/test-only exception."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess

ADVISORY = 'GHSA-fc5q-39xc-vjpf'
URL = f'https://github.com/advisories/{ADVISORY}'
# Seven days from maintainer approval; production findings are never excepted.
EXPIRES = datetime(2026, 11, 24, 19, 32, 35, tzinfo=timezone.utc)
SEVERITIES = {'info', 'low', 'moderate', 'high', 'critical'}
BLOCKING = {'high', 'critical'}


def findings(manager, report):
    if not isinstance(report, dict) or report.get('error'):
        raise ValueError('Audit failed or returned an invalid report')
    counts = report.get('metadata', {}).get('vulnerabilities', {})
    if any(type(counts.get(level)) is not int or counts[level] < 0 for level in SEVERITIES):
        raise ValueError('Audit vulnerability counts are missing or invalid')
    key = 'vulnerabilities' if manager == 'npm' else 'advisories'
    rows = report.get(key)
    if not isinstance(rows, dict) or (manager == 'npm' and report.get('auditReportVersion') != 2):
        raise ValueError('Unsupported audit report schema')
    if any(not isinstance(row, dict) or row.get('severity') not in SEVERITIES for row in rows.values()):
        raise ValueError('Invalid audit finding')
    if any(sum(row['severity'] == level for row in rows.values()) != counts[level] for level in SEVERITIES):
        raise ValueError('Audit counts do not match its findings')
    return rows


def audit(manager, production):
    command = [manager, 'audit', '--json', '--audit-level', 'high']
    if production:
        command.append('--omit=dev' if manager == 'npm' else '--prod')
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=45, check=False)
        report = json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        raise ValueError(f'Native {manager} audit could not complete: {exc}') from exc
    rows = findings(manager, report)
    has_blocking = any(row['severity'] in BLOCKING for row in rows.values())
    if result.returncode not in (0, 1) or (result.returncode == 1) != has_blocking:
        raise ValueError(f'Native {manager} audit failed unexpectedly: {result.stderr.strip()}')
    return report


def npm_causes(name, rows, trail=()):
    if name in trail or name not in rows:
        raise ValueError(f'Unresolved npm advisory dependency: {name}')
    via = rows[name].get('via')
    if not isinstance(via, list) or not via:
        raise ValueError(f'Missing npm advisory cause: {name}')
    causes = []
    for cause in via:
        if isinstance(cause, str):
            causes.extend(npm_causes(cause, rows, (*trail, name)))
        elif isinstance(cause, dict):
            causes.append(cause)
        else:
            raise ValueError(f'Invalid npm advisory cause: {name}')
    return causes


def approved(manager, name, row, rows, now):
    if now >= EXPIRES or row['severity'] != 'high':
        return False
    if manager == 'npm':
        return all(cause.get('name') == 'picomatch' and cause.get('url') == URL
                   and cause.get('severity') == 'high' for cause in npm_causes(name, rows))
    paths = row.get('findings')
    return (row.get('module_name') == 'picomatch' and row.get('github_advisory_id') == ADVISORY
            and row.get('url') == URL and isinstance(paths, list) and bool(paths)
            and all(isinstance(path, dict) and path.get('dev') is True for path in paths))


def validate(manager, full, production, now):
    production_rows = findings(manager, production)
    if any(row['severity'] in BLOCKING for row in production_rows.values()):
        raise ValueError('Production audit has high/critical findings; no exceptions apply')
    rows = findings(manager, full)
    for name, row in rows.items():
        if row['severity'] in BLOCKING and not approved(manager, name, row, rows, now):
            raise ValueError(f'Unapproved or expired {row["severity"]} finding: {name}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manager', choices=['npm', 'pnpm'])
    manager = parser.parse_args().manager
    projects = {'npm': 'configuration-app', 'pnpm': 'dashboard-card'}
    if Path.cwd().name != projects[manager]:
        parser.error('Run from the matching JavaScript application directory')
    try:
        production = audit(manager, production=True)
        full = audit(manager, production=False)
        validate(manager, full, production, datetime.now(timezone.utc))
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    print(f'{manager}: production audit passed; complete audit passed under the documented policy.')
    if any(row['severity'] in BLOCKING for row in findings(manager, full).values()):
        print(f'Temporary build/test exception: {ADVISORY}; expires {EXPIRES.isoformat()}')


if __name__ == '__main__':
    main()
