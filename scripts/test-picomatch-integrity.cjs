'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { loadManifest, verifyPackage, verifyApp } = require('./verify-picomatch-patch.cjs');
const root = path.resolve(__dirname, '..');
const manifest = loadManifest(root);
const app = fs.existsSync(path.join(process.cwd(), 'package.json')) ? process.cwd() : path.join(root, 'apps/configuration-app');
const appRequire = createRequire(path.join(app, 'package.json'));
const packageDir = path.dirname(createRequire(appRequire.resolve('vite/package.json')).resolve('picomatch/package.json'));

function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'butler-picomatch-integrity-'));
  try {
    for (const name of Object.keys(manifest.files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.copyFileSync(path.join(packageDir, name), path.join(dir, name));
    }
    callback(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('accepts the exact pinned patched package', () => fixture(dir => verifyPackage(dir, manifest)));
test('rejects changed parser bytes', () => fixture(dir => {
  fs.appendFileSync(path.join(dir, 'lib/parse.js'), '\n// changed\n');
  assert.throws(() => verifyPackage(dir, manifest), /integrity|hash/i);
}));
test('rejects a replaced entry point', () => fixture(dir => {
  fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = () => () => true;');
  assert.throws(() => verifyPackage(dir, manifest), /integrity|hash/i);
}));
test('rejects missing runtime files', () => fixture(dir => {
  fs.unlinkSync(path.join(dir, 'lib/utils.js'));
  assert.throws(() => verifyPackage(dir, manifest));
}));
test('rejects altered package metadata', () => fixture(dir => {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'picomatch', version: '4.0.7', main: 'other.js' }));
  assert.throws(() => verifyPackage(dir, manifest), /integrity|hash/i);
}));
test('checks every installed copy and actual Vite resolution', () => assert.ok(verifyApp(app, manifest) >= 1));

function vendorFixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'butler-picomatch-vendor-'));
  const destination = path.join(dir, 'apps/configuration-app/vendor');
  try {
    fs.mkdirSync(destination, { recursive: true });
    fs.cpSync(path.join(root, 'apps/configuration-app/vendor'), destination, { recursive: true });
    callback(dir, destination);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('rejects a modified vendored archive', () => vendorFixture((repo, vendor) => {
  fs.appendFileSync(path.join(vendor, manifest.archive), 'changed');
  assert.throws(() => loadManifest(repo), /Archive integrity/);
}));
test('rejects a modified reviewable patch', () => vendorFixture((repo, vendor) => {
  fs.appendFileSync(path.join(vendor, 'picomatch-4.0.7.patch'), 'changed');
  assert.throws(() => loadManifest(repo), /Patch integrity/);
}));
test('rejects a manifest which omits a runtime entry point', () => vendorFixture((repo, vendor) => {
  const file = path.join(vendor, 'picomatch-patch.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete data.files['index.js']; fs.writeFileSync(file, JSON.stringify(data));
  assert.throws(() => loadManifest(repo), /Incomplete/);
}));
