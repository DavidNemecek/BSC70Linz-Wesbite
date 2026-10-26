import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { loadNpmSemver, preflightLockUpdate } from './dependencies.mjs';
import { discoverDependencyUpdates, deriveCveProofs, necessaryCveFix, exactTargets } from './discovery.mjs';

// Synthetic packages and advisory records; no network or installation in tests.
const now = Date.parse('2026-10-26T12:00:00Z');
const date = days => new Date(now - days * 86400000).toISOString();
const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const semver = loadNpmSemver(resolve(dirname(process.execPath), '../lib/node_modules/npm'));
const runtime = { semver, nodeVersion: '24.22.1', npmVersion: '11.6.0', supportedLtsMajors: [24] };
const entry = (name, version) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity });
const manifest = { name: 'synthetic-app', version: '0.0.0', dependencies: { synthetic: '^1.0.0' }, devDependencies: {} };
const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: {
  '': manifest, 'node_modules/synthetic': entry('synthetic', '1.0.0'), 'node_modules/helper': entry('helper', '1.0.0'),
} };
function pack(name, versions) {
  return { name, time: Object.fromEntries(Object.entries(versions).map(([version, age]) => [version, date(age)])),
    versions: Object.fromEntries(Object.keys(versions).map(version => [version, { name, version, dist: { tarball: entry(name, version).resolved, integrity } }])) };
}
const advisory = { id: 'CVE-2026-12345', modified: date(1), affected: [{ package: { name: 'synthetic', ecosystem: 'npm' },
  ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] };

test('discovers majors after seven full days and does not change protected manifest fields', () => {
  const metadata = { synthetic: pack('synthetic', { '1.0.0': 30, '2.0.0': 7, '3.0.0': 6.99 }) };
  const result = discoverDependencyUpdates({ manifest, lock, metadata, now, ...runtime });
  assert.equal(result.manifest.dependencies.synthetic, '2.0.0');
  assert.equal(manifest.dependencies.synthetic, '^1.0.0');
  assert.deepEqual(result.manifest.devDependencies, {});
  assert.equal(result.manifest.name, manifest.name);
});

test('an independently confirmed CVE selects only its exact necessary young fix', () => {
  const metadata = { synthetic: pack('synthetic', { '1.0.0': 30, '1.0.1': 1, '1.0.2': 1, '2.0.0': 10 }) };
  const result = discoverDependencyUpdates({ manifest, lock, metadata, advisories: { [advisory.id]: advisory }, now, ...runtime });
  assert.equal(result.manifest.dependencies.synthetic, '1.0.1');
  assert.equal(result.selections[0].urgent, true);
  for (const unproven of [{ ...advisory, id: 'GHSA-2345-2345-2345' }, { ...advisory, withdrawn: date(0) },
    { ...advisory, modified: date(-1) }]) {
    assert.equal(necessaryCveFix({ name: 'synthetic', fromVersion: '1.0.0', advisories: { x: unproven }, semver, now }), null);
  }
});

test('CVE must affect the actually used version; labels and fixAvailable are irrelevant', () => {
  assert.equal(necessaryCveFix({ name: 'synthetic', fromVersion: '1.0.1', advisories: { x: advisory }, semver, now }), null);
  const metadata = { synthetic: pack('synthetic', { '1.0.0': 30, '1.0.1': 1 }) };
  const result = discoverDependencyUpdates({ manifest, lock, metadata, advisories: {}, now, ...runtime });
  assert.equal(result.changed, false);
});

test('whole-lock cooldown still rejects an unrelated young transitive during urgent resolution', () => {
  const head = structuredClone(lock);
  head.packages['node_modules/synthetic'] = entry('synthetic', '1.0.1');
  head.packages['node_modules/helper'] = entry('helper', '1.0.1');
  const metadata = { synthetic: pack('synthetic', { '1.0.0': 30, '1.0.1': 1 }), helper: pack('helper', { '1.0.0': 30, '1.0.1': 1 }) };
  const advisories = { [advisory.id]: advisory };
  const proofs = deriveCveProofs({ baseLock: lock, headLock: head, metadata, advisories, now, semver });
  assert.deepEqual(proofs, [{ path: 'node_modules/synthetic', fromPath: 'node_modules/synthetic', advisoryId: advisory.id }]);
  const verdict = preflightLockUpdate({ baseLock: lock, headLock: head, metadata, advisories, proofs, now, ...runtime });
  assert.equal(verdict.ok, false);
  assert(verdict.errors.some(error => error.includes('cooldown: node_modules/helper')));
  assert.equal(verdict.errors.some(error => error.includes('cooldown: node_modules/synthetic')), false);
});

test('later young release cannot reuse an earlier CVE fix exemption', () => {
  const head = structuredClone(lock);
  head.packages['node_modules/synthetic'] = entry('synthetic', '1.0.2');
  const metadata = { synthetic: pack('synthetic', { '1.0.0': 30, '1.0.1': 1, '1.0.2': 1 }) };
  assert.deepEqual(deriveCveProofs({ baseLock: lock, headLock: head, metadata, advisories: { x: advisory }, now, semver }), []);
});

test('publication/engine defects block urgent fix, while exact targets deduplicate versions', () => {
  const metadata = { synthetic: pack('synthetic', { '1.0.0': 30, '1.0.1': -1 }) };
  assert.throws(() => discoverDependencyUpdates({ manifest, lock, metadata, advisories: { x: advisory }, now, ...runtime }));
  metadata.synthetic.time['1.0.1'] = date(1);
  metadata.synthetic.versions['1.0.1'].engines = { node: '>=26' };
  assert.throws(() => discoverDependencyUpdates({ manifest, lock, metadata, advisories: { x: advisory }, now, ...runtime }));
  assert.deepEqual(exactTargets([{ name: 'synthetic', entry: { version: '1.0.1' } },
    { name: 'synthetic', entry: { version: '1.0.1' } }]), [{ name: 'synthetic', version: '1.0.1' }]);
});
