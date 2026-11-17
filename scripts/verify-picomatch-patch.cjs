/** Fail closed if a clean install restores any unpatched picomatch copy. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function loadManifest(repository = root) {
  const vendor = path.join(repository, 'apps/configuration-app/vendor');
  const manifest = JSON.parse(fs.readFileSync(path.join(vendor, 'picomatch-patch.json'), 'utf8'));
  if (manifest.package !== 'picomatch' || manifest.version !== '4.0.7' || manifest.advisory !== 'GHSA-fc5q-39xc-vjpf') {
    throw Error('Unsupported picomatch patch manifest');
  }
  const required = ['LICENSE', 'README.md', 'index.js', 'posix.js', 'package.json',
    'lib/constants.js', 'lib/parse.js', 'lib/picomatch.js', 'lib/scan.js', 'lib/utils.js'];
  if (required.some(name => !/^[a-f0-9]{64}$/.test(manifest.files?.[name]))) throw Error('Incomplete patch file hashes');
  for (const name of [manifest.archive, ...Object.keys(manifest.files)]) {
    if (typeof name !== 'string' || path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw Error('Invalid patch file path');
  }
  if (digest(path.join(vendor, manifest.archive)) !== manifest.archiveSha256) throw Error('Archive integrity mismatch');
  if (digest(path.join(vendor, 'picomatch-4.0.7.patch')) !== manifest.patchSha256) throw Error('Patch integrity mismatch');
  if (!manifest.files['lib/parse.js'] || manifest.files['lib/parse.js'] === manifest.upstreamParserSha256) {
    throw Error('Patch manifest still names the unpatched parser');
  }
  return manifest;
}

function verifyPackage(directory, manifest) {
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (digest(path.join(directory, name)) !== expected) throw Error(`picomatch integrity mismatch: ${name} in ${directory}`);
  }
}

function verifyApp(directory, manifest = loadManifest()) {
  const copies = new Set();
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      // pnpm's real packages live beneath .pnpm; do not follow symlink cycles.
      if (!entry.isDirectory()) continue;
      const child = path.join(current, entry.name);
      if (entry.name === 'picomatch' && fs.existsSync(path.join(child, 'package.json'))) {
        verifyPackage(child, manifest);
        copies.add(fs.realpathSync(child));
      } else { walk(child); }
    }
  }
  walk(path.join(directory, 'node_modules'));
  const requireApp = createRequire(path.join(directory, 'package.json'));
  const requireVite = createRequire(requireApp.resolve('vite/package.json'));
  const used = fs.realpathSync(path.dirname(requireVite.resolve('picomatch/package.json')));
  if (!copies.size || !copies.has(used)) throw Error('Vite is not using a verified local picomatch patch');
  return copies.size;
}

if (require.main === module) {
  console.log(`Verified pinned picomatch patch in ${verifyApp(process.cwd())} installed copy/copies.`);
}
module.exports = { loadManifest, verifyPackage, verifyApp };
