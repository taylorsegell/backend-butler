"""Release-gate regressions: one temporary development-only advisory exception."""
import importlib.util
import json
from pathlib import Path
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
import subprocess

spec = importlib.util.spec_from_file_location('audit_gate', Path(__file__).with_name('audit-javascript.py'))
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
NOW = datetime(2026, 11, 17, 20, tzinfo=timezone.utc)
URL = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf'


def report(manager, severity='high', url=URL, dev=True):
    counts = dict(info=0, low=0, moderate=0, high=0, critical=0)
    counts[severity] = 1
    result = {'metadata': {'vulnerabilities': counts}}
    if manager == 'npm':
        result['auditReportVersion'] = 2
        result['vulnerabilities'] = {'picomatch': {'name': 'picomatch', 'severity': severity, 'via': [
            {'name': 'picomatch', 'url': url, 'severity': severity}]}}
    else:
        result['advisories'] = {'1': {'module_name': 'picomatch', 'severity': severity, 'url': url,
            'github_advisory_id': url.rsplit('/', 1)[-1], 'findings': [{'dev': dev}]}}
    return result


def clean(manager):
    result = report(manager)
    result['metadata']['vulnerabilities']['high'] = 0
    result['vulnerabilities' if manager == 'npm' else 'advisories'] = {}
    return result


class AuditGateTests(unittest.TestCase):
    def test_allows_only_the_approved_development_advisory(self):
        for manager in ['npm', 'pnpm']:
            gate.validate(manager, report(manager), clean(manager), NOW)

    def test_follows_npm_meta_advisories_to_the_actual_cause(self):
        full = report('npm')
        full['vulnerabilities']['vite'] = {'name': 'vite', 'severity': 'high', 'via': ['picomatch']}
        full['metadata']['vulnerabilities']['high'] = 2
        gate.validate('npm', full, clean('npm'), NOW)

    def test_blocks_unrelated_findings_and_severity_escalation(self):
        for manager in ['npm', 'pnpm']:
            for full in [report(manager, url='https://github.com/advisories/GHSA-other'), report(manager, severity='critical')]:
                with self.assertRaises(ValueError):
                    gate.validate(manager, full, clean(manager), NOW)

    def test_blocks_the_same_advisory_in_production(self):
        for manager in ['npm', 'pnpm']:
            with self.assertRaises(ValueError):
                gate.validate(manager, report(manager), report(manager), NOW)
        with self.assertRaises(ValueError):
            gate.validate('pnpm', report('pnpm', dev=False), clean('pnpm'), NOW)

    def test_exception_expires_at_the_exact_boundary(self):
        for manager in ['npm', 'pnpm']:
            with self.assertRaises(ValueError):
                gate.validate(manager, report(manager), clean(manager), gate.EXPIRES)
            gate.validate(manager, clean(manager), clean(manager), gate.EXPIRES)

    def test_fails_closed_on_missing_or_inconsistent_report_data(self):
        cases = [{}, {'error': {'code': 'EAI_AGAIN'}}, clean('npm')]
        cases[-1]['metadata']['vulnerabilities']['high'] = 1
        for full in cases:
            with self.assertRaises(ValueError):
                gate.validate('npm', full, clean('npm'), NOW)

    def test_unknown_and_cyclic_npm_dependency_paths_are_blocked(self):
        for via in [['missing'], ['picomatch'], []]:
            full = report('npm')
            full['vulnerabilities']['picomatch']['via'] = via
            with self.assertRaises(ValueError):
                gate.validate('npm', full, clean('npm'), NOW)

    def test_audit_transport_failures_cannot_be_waived(self):
        for code, output in [(2, '{}'), (1, '{}'), (0, 'invalid JSON')]:
            with patch.object(gate.subprocess, 'run', return_value=subprocess.CompletedProcess([], code, output, 'network error')):
                with self.assertRaises(ValueError):
                    gate.audit('npm', production=False)

    def test_registry_witness_uses_native_script_free_locking(self):
        def install(command, **kwargs):
            self.assertIn('--ignore-scripts', command)
            self.assertIn('--package-lock-only', command)
            data = json.loads((Path(kwargs['cwd']) / 'package.json').read_text())
            self.assertEqual(data['devDependencies'], {'picomatch': '4.0.7'})
            return subprocess.CompletedProcess(command, 0, '', '')
        with patch.object(gate.subprocess, 'run', side_effect=install):
            with patch.object(gate, 'audit', side_effect=[report('npm'), clean('npm')]):
                full, production = gate.registry_audit()
                gate.validate('npm', full, production, NOW)

    def test_registry_witness_install_errors_are_not_ignored(self):
        with patch.object(gate.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['npm'])):
            with self.assertRaises(subprocess.CalledProcessError):
                gate.registry_audit()


if __name__ == '__main__':
    unittest.main()
