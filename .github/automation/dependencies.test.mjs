import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadNpmSemver, mapConcurrent, fetchRegistryMetadata, fetchOsvAdvisory, queryOsvLockfile,
  chooseEligibleStable, validateCveFix, validateManifestLock, validateLockResolutions, preflightLockUpdate,
  auditCommandPlans, inspectNpmAudit,
} from './dependencies.mjs';
import { COOLDOWN_MS, DAY_MS } from './policy.mjs';

// SYNTHETIC fixtures: no identifier or affected/fixed version asserts a real CVE.
const now = Date.parse('2026-10-26T12:00:00.000Z');
const date = age => new Date(now - age).toISOString();
const semver = loadNpmSemver();
const toolchain = { nodeVersion: '24.22.1', npmVersion: '11.16.0', supportedLtsMajors: [24], semver };
const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
function entry(name, version) {
  return { version, resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`, integrity };
}
function packument(name, releases) {
  return { name, versions: Object.fromEntries(Object.keys(releases).map(version => [version, { name, version,
    dist: { integrity, tarball: entry(name, version).resolved }, engines: { node: '>=24 <25' } }])), time: releases };
}
function lock(version = '1.0.0') {
  return { name: 'synthetic-app', version: '1.0.0', lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic': entry('synthetic', version) } };
}
function advisory() {
  return { id: 'GHSA-2345-2345-2345', aliases: ['CVE-2099-123456'], modified: date(DAY_MS), affected: [
    { package: { ecosystem: 'npm', name: 'synthetic' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] },
  ] };
}
function scenario() {
  return { baseLock: lock(), headLock: lock('1.0.1'), metadata: { synthetic: packument('synthetic', { '1.0.0': date(30 * DAY_MS), '1.0.1': date(8 * DAY_MS) }) },
    now, ...toolchain };
}
function urgentScenario() {
  const input = scenario();
  input.metadata.synthetic.time['1.0.1'] = date(DAY_MS);
  const source = advisory();
  input.advisories = { [source.id]: source };
  input.proofs = [{ path: 'node_modules/synthetic', fromPath: 'node_modules/synthetic', advisoryId: source.id }];
  return input;
}

test('npm bundled semver works without installing a project dependency', () => {
  assert.equal(semver.satisfies('24.22.1', '^24.0.0'), true);
  assert.throws(() => loadNpmSemver('relative/candidate/node_modules'));
});

test('candidate discovery sorts numerically and skips young, deprecated, prerelease or engine-incompatible releases', () => {
  const metadata = packument('synthetic', {
    '1.0.0': date(90 * DAY_MS), '1.9.0': date(40 * DAY_MS), '1.10.0': date(COOLDOWN_MS),
    '1.11.0': date(COOLDOWN_MS - 1), '2.0.0': date(20 * DAY_MS), '3.0.0': date(20 * DAY_MS),
    '4.0.0-beta.1': date(20 * DAY_MS), '5.0.0': date(-1), '6.0.0': null,
  });
  metadata.versions['2.0.0'].engines.node = '>=26';
  metadata.versions['3.0.0'].deprecated = 'synthetic deprecation';
  assert.equal(chooseEligibleStable(metadata, { currentVersion: '1.0.0', now, ...toolchain }), '1.10.0');
  assert.equal(chooseEligibleStable(metadata, { currentVersion: '1.0.0', now, ...toolchain, supportedLtsMajors: [22] }), null);
  metadata.versions['1.10.0'].engines.npm = '>=12';
  assert.equal(chooseEligibleStable(metadata, { currentVersion: '1.0.0', now, ...toolchain }), '1.9.0');
  assert.equal(chooseEligibleStable(metadata, { currentVersion: '1.0.0', now, ...toolchain, semver: null }), null);
});

test('normal update passes at exactly seven days; missing/invalid/future timestamps fail', () => {
  const input = scenario(); input.metadata.synthetic.time['1.0.1'] = date(COOLDOWN_MS);
  assert.equal(preflightLockUpdate(input).ok, true);
  for (const published of [undefined, null, 'invalid', '2026-02-30T00:00:00Z', date(-1), date(COOLDOWN_MS - 1)]) {
    input.metadata.synthetic.time['1.0.1'] = published;
    assert.equal(preflightLockUpdate(input).ok, false, String(published));
  }
});

test('new and changed transitive, optional and platform-specific entries all obey cooldown', () => {
  for (const path of ['node_modules/child', 'node_modules/synthetic/node_modules/child']) {
    const input = scenario();
    input.headLock.packages[path] = { ...entry('child', '2.0.0'), optional: true, os: ['darwin'] };
    input.metadata.child = packument('child', { '2.0.0': date(DAY_MS) });
    const output = preflightLockUpdate(input);
    assert.equal(output.ok, false);
    assert.ok(output.errors.some(error => error.includes(`cooldown: ${path}`)));
    input.baseLock.packages[path] = entry('child', '1.0.0');
    input.metadata.child.versions['1.0.0'] = { name: 'child', version: '1.0.0' };
    assert.equal(preflightLockUpdate(input).ok, false);
  }
});

test('confirmed source CVE exact fix waives only that valid recent package/version', () => {
  const input = urgentScenario(), output = preflightLockUpdate(input);
  assert.equal(output.ok, true, output.errors.join('\n'));
  assert.deepEqual(output.exemptions[0].cves, ['CVE-2099-123456']);
  for (const time of [undefined, 'invalid', date(-1)]) {
    const broken = urgentScenario(); broken.metadata.synthetic.time['1.0.1'] = time;
    assert.equal(preflightLockUpdate(broken).ok, false);
  }
});

test('security fix bundled with unrelated fresh package still fails, including transitive introductions', () => {
  const input = urgentScenario();
  input.headLock.packages['node_modules/synthetic/node_modules/child'] = entry('child', '1.0.0');
  input.metadata.child = packument('child', { '1.0.0': date(DAY_MS) });
  const output = preflightLockUpdate(input);
  assert.equal(output.ok, false);
  assert.equal(output.exemptions.length, 1);
  assert.ok(output.errors.some(error => error.includes('cooldown: node_modules/synthetic/node_modules/child')));
});

test('forged labels, GHSA-only audit advice, wrong affected version and unrelated fix chains cannot waive cooldown', () => {
  const mutations = [
    source => { source.aliases = []; source.security = true; source.confirmedCve = true; source.fixAvailable = true; },
    source => { source.affected[0].package.name = 'other'; },
    source => { source.affected[0].package.ecosystem = 'PyPI'; },
    source => { source.affected[0].ranges[0].events[0].introduced = '1.0.1'; },
    source => { source.affected[0].ranges[0].events[1].fixed = '1.0.2'; },
    source => { source.affected[0].ranges[0].events = [{ fixed: '1.0.1' }]; },
    source => { source.affected[0].ranges[0].events = [{ introduced: '0', fixed: '1.0.1' }]; },
    source => { source.affected[0].ranges[0].type = 'GIT'; },
    source => { source.withdrawn = date(DAY_MS); },
    source => { source.modified = date(-1); },
    source => { source.affected[0].versions = ['1.0.1']; },
    source => { source.affected[0].versions = { forged: true }; },
    source => { source.affected[0].ranges[0].events.push({ introduced: '1.0.1' }); },
  ];
  for (const edit of mutations) {
    const input = urgentScenario(); edit(input.advisories[input.proofs[0].advisoryId]);
    assert.equal(preflightLockUpdate(input).ok, false, edit.toString());
  }
  const input = urgentScenario(); input.proofs[0].fromPath = 'node_modules/missing';
  assert.equal(preflightLockUpdate(input).ok, false);
  input.proofs.push({ ...input.proofs[0] }); assert.equal(preflightLockUpdate(input).ok, false);
});

test('source ranges support separate release lines but do not treat a later release as the necessary fix', () => {
  const source = advisory();
  source.affected[0].ranges[0].events = [{ introduced: '0' }, { fixed: '1.0.1' }, { introduced: '2.0.0' }, { fixed: '2.0.2' }];
  const validate = (fromVersion, toVersion) => validateCveFix({ name: 'synthetic', fromVersion, toVersion, advisory: source, semver, now }).ok;
  assert.equal(validate('1.0.0', '1.0.1'), true);
  assert.equal(validate('2.0.1', '2.0.2'), true);
  assert.equal(validate('1.0.0', '2.0.2'), false);
  assert.equal(validate('1.0.1', '1.0.2'), false);
});

test('registry artifact substitution, unsupported engines, metadata edits and same-version integrity changes block', () => {
  for (const edit of [
    input => { input.headLock.packages['node_modules/synthetic'].resolved = 'https://evil.test/a.tgz'; },
    input => { input.metadata.synthetic.versions['1.0.1'].dist.integrity = 'sha512-forged'; },
    input => { input.metadata.synthetic.versions['1.0.1'].engines.node = '>=26'; },
    input => { input.headLock.name = 'forged-app'; },
    input => { input.headLock.packages[''].scripts = { install: 'evil' }; },
    input => { delete input.metadata.synthetic; },
  ]) {
    const input = scenario(); edit(input); assert.equal(preflightLockUpdate(input).ok, false);
  }
  const input = scenario(); input.headLock = lock();
  const changed = `sha512-${Buffer.alloc(64, 2).toString('base64')}`;
  input.headLock.packages['node_modules/synthetic'].integrity = changed;
  input.metadata.synthetic.versions['1.0.0'].dist.integrity = changed;
  assert.equal(preflightLockUpdate(input).ok, false);
});

test('new lifecycle scripts are highlighted independently of cooldown success', () => {
  const input = scenario();
  input.metadata.synthetic.versions['1.0.1'].scripts = { postinstall: 'node synthetic-install.js', test: 'synthetic-test' };
  input.headLock.packages['node_modules/synthetic'].hasInstallScript = true;
  const output = preflightLockUpdate(input);
  assert.equal(output.ok, true);
  assert.equal(output.requiresLifecycleReview, true);
  assert.deepEqual(output.lifecycleChanges[0].scripts, { postinstall: 'node synthetic-install.js' });
});

test('unchanged bundles are accepted, but changed parent tarballs invalidate bundled evidence too', () => {
  const input = scenario();
  input.baseLock.packages['node_modules/synthetic'].bundleDependencies = ['child'];
  input.baseLock.packages['node_modules/synthetic/node_modules/child'] = { version: '1.0.0', inBundle: true };
  input.headLock = structuredClone(input.baseLock);
  assert.equal(preflightLockUpdate(input).ok, true);
  input.headLock.packages['node_modules/synthetic'] = entry('synthetic', '1.0.1');
  input.headLock.packages['node_modules/synthetic'].bundleDependencies = ['child'];
  const output = preflightLockUpdate(input);
  assert.equal(output.ok, false);
  assert.ok(output.errors.some(error => error.includes('independent tarball inspection')));
  assert.equal(output.requiresLifecycleReview, true);
});

test('manifest lock consistency rejects missing root declarations and unresolved direct ranges', () => {
  const manifest = { name: 'synthetic-app', version: '1.0.0', dependencies: { synthetic: '^1.0.0' } }, candidate = lock();
  candidate.packages[''] = structuredClone(manifest);
  assert.equal(validateManifestLock(manifest, candidate, semver).ok, true);
  candidate.packages[''].dependencies.synthetic = '^2.0.0';
  assert.equal(validateManifestLock(manifest, candidate, semver).ok, false);
  manifest.dependencies.synthetic = '^2.0.0';
  assert.equal(validateManifestLock(manifest, candidate, semver).ok, false);
});

test('required peer conflicts and missing transitives fail without forced resolution', () => {
  const candidate = lock();
  candidate.packages['node_modules/synthetic'].peerDependencies = { child: '^2.0.0' };
  candidate.packages['node_modules/child'] = entry('child', '1.0.0');
  assert.equal(validateLockResolutions(candidate, semver).ok, false);
  candidate.packages['node_modules/child'] = entry('child', '2.1.0');
  assert.equal(validateLockResolutions(candidate, semver).ok, true);
  delete candidate.packages['node_modules/child'];
  assert.equal(validateLockResolutions(candidate, semver).ok, false);
  candidate.packages['node_modules/synthetic'].peerDependenciesMeta = { child: { optional: true } };
  assert.equal(validateLockResolutions(candidate, semver).ok, true);
  candidate.packages['node_modules/synthetic'].dependencies = { missing: '^1.0.0' };
  assert.equal(validateLockResolutions(candidate, semver).ok, false);
});

const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('registry metadata network requests are bounded, deduplicated and registry-only', async () => {
  let active = 0, peak = 0;
  const urls = [];
  const names = ['synthetic-a', '@synthetic/b', 'synthetic-c', 'synthetic-d'];
  const output = await fetchRegistryMetadata([...names, names[0]], { concurrency: 2, fetchImpl: async (url, init) => {
    active++; peak = Math.max(peak, active); urls.push(url);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(Object.hasOwn(init.headers, 'authorization'), false);
    await new Promise(resolve => setTimeout(resolve, 3)); active--;
    const name = decodeURIComponent(new URL(url).pathname.slice(1));
    return jsonResponse(packument(name, { '1.0.0': date(8 * DAY_MS) }));
  } });
  assert.equal(peak, 2); assert.equal(urls.length, 4); assert.deepEqual(Object.keys(output), names);
  assert.ok(urls.every(url => new URL(url).origin === 'https://registry.npmjs.org'));
  await assert.rejects(fetchRegistryMetadata(['https://evil.test']));
  await assert.rejects(mapConcurrent([1], async () => 1, 9));
});

test('network failures, wrong identity, oversized bodies, redirects and malformed JSON fail closed', async () => {
  const bodies = [
    async () => new Response('denied', { status: 403 }),
    async () => new Response('html', { headers: { 'content-type': 'text/html' } }),
    async () => new Response('{bad', { headers: { 'content-type': 'application/json' } }),
    async () => jsonResponse({ name: 'other', versions: {}, time: {} }),
    async () => { throw new Error('redirect rejected'); },
  ];
  for (const fetchImpl of bodies) await assert.rejects(fetchRegistryMetadata(['synthetic'], { fetchImpl }));
  await assert.rejects(fetchRegistryMetadata(['synthetic'], { maxBytes: 8, fetchImpl: async () => jsonResponse(packument('synthetic', {})) }));
});

test('optional OSV scan includes unique transitive versions and verifies advisory identity', async () => {
  const candidate = lock(); candidate.packages['node_modules/child'] = entry('child', '2.0.0');
  candidate.packages['node_modules/synthetic/node_modules/child'] = entry('child', '2.0.0');
  const queried = [];
  const output = await queryOsvLockfile(candidate, { fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.osv.dev/v1/query');
    queried.push(JSON.parse(init.body)); return jsonResponse({});
  } });
  assert.equal(output.length, 2); assert.equal(queried.length, 2);
  assert.ok(queried.some(query => query.package.name === 'child' && query.version === '2.0.0'));
  assert.equal((await fetchOsvAdvisory(advisory().id, { fetchImpl: async () => jsonResponse(advisory()) })).id, advisory().id);
  await assert.rejects(fetchOsvAdvisory(advisory().id, { fetchImpl: async () => jsonResponse({ id: 'other', affected: [] }) }));
  await assert.rejects(queryOsvLockfile(candidate, { fetchImpl: async () => jsonResponse({ next_page_token: 'more' }) }));
});

function audit() {
  return { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }, dependencies: { prod: 1, dev: 1, optional: 0, peer: 0, peerOptional: 0, total: 2 } } };
}

test('audit plans include whole graph and production independently without forced peer resolution', () => {
  const plans = auditCommandPlans();
  assert.deepEqual(plans.map(plan => plan.scope), ['all', 'production']);
  assert.ok(plans[0].args.includes('--include=dev'));
  assert.ok(plans[0].args.includes('--include=optional'));
  assert.ok(plans[1].args.includes('--omit=dev'));
  assert.ok(plans.every(plan => plan.args.includes('--ignore-scripts') && !plan.args.includes('--force') && !plan.args.includes('--legacy-peer-deps')));
});

test('audit parser rejects errors, malformed evidence, nonzero exit and even low transitive GHSA-only findings', () => {
  assert.equal(inspectNpmAudit(audit(), { exitCode: 0 }).ok, true);
  assert.equal(inspectNpmAudit(audit(), { exitCode: 0, lock: lock() }).ok, false);
  const matching = audit(); matching.metadata.dependencies.total = 1;
  assert.equal(inspectNpmAudit(matching, { exitCode: 0, lock: lock() }).ok, true);
  for (const value of [undefined, {}, { error: { code: 'EAUDITNOLOCK' } }, [], { ...audit(), metadata: {} }]) assert.equal(inspectNpmAudit(value, { exitCode: 0 }).ok, false);
  assert.equal(inspectNpmAudit(audit(), { exitCode: 1 }).ok, false);
  assert.equal(inspectNpmAudit(audit()).ok, false);
  const report = audit();
  report.vulnerabilities.child = { name: 'child', severity: 'low', isDirect: false, nodes: ['node_modules/synthetic/node_modules/child'],
    via: [{ name: 'child', url: 'https://github.com/advisories/GHSA-2345-2345-2345', range: '<2.0.0' }], fixAvailable: true };
  report.metadata.vulnerabilities.low = 1; report.metadata.vulnerabilities.total = 1;
  const output = inspectNpmAudit(report, { exitCode: 1 });
  assert.equal(output.ok, false); assert.equal(output.findings[0].isDirect, false);
  assert.equal(output.findings[0].via[0].name, 'child');
  report.metadata.vulnerabilities.total = 0; assert.equal(inspectNpmAudit(report, { exitCode: 0 }).ok, false);
});
