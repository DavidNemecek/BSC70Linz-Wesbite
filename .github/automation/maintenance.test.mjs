import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_ACTIONS, MAINTENANCE_SCHEMA_VERSION, QA_NODE_PATH,
  assertCandidateBytes, createMaintenancePlan, snapshotTrustedBase,
  validateCveWaivers, validateMaintenancePlan,
} from './maintenance.mjs';

const now = Date.parse('2026-10-26T12:00:00.000Z');
const old = days => new Date(now - days * 86_400_000).toISOString();
const sha = letter => letter.repeat(40);
const digest = 'a'.repeat(64);
const nodeIndex = [
  { version: 'v24.22.1', date: old(30), lts: 'Krypton' },
  { version: 'v24.22.2', date: old(8), lts: 'Krypton' },
  { version: 'v24.22.3', date: old(1), lts: 'Krypton' },
];
const shasums = `${digest}  node-v24.22.2-linux-x64.tar.gz\n`;
const packageJson = JSON.stringify({
  name: 'fixture', version: '0.0.0', private: true,
  scripts: { build: 'vite build' },
  dependencies: { fixture: '^1.0.0' }, devDependencies: {},
  engines: { node: '>=24.22.1 <25' },
}, null, 2) + '\n';
const lockJson = JSON.stringify({ name: 'fixture', version: '0.0.0', lockfileVersion: 3, requires: true,
  packages: { '': { name: 'fixture', version: '0.0.0', engines: { node: '>=24.22.1 <25' } } },
}, null, 2) + '\n';
const sandbox = "export const NODE_VERSION = '24.22.1';\nexport function run() { return NODE_VERSION; }\n";
const workflow = `name: fixture\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@${sha('a')} # v7.0.1\n      - uses: actions/setup-node@${sha('b')} # v6.0.1\n      - uses: actions/upload-artifact@${sha('c')} # v5.0.1\n      - uses: actions/download-artifact@${sha('d')} # v4.0.1\n`;
const baseFiles = {
  '.nvmrc': '24.22.1\n', 'package.json': packageJson, 'package-lock.json': lockJson,
  '.github/automation/dependency-sandbox.mjs': sandbox, [QA_NODE_PATH]: '24.22.1\n',
  '.github/workflows/fixture.yml': workflow,
};
const releases = Object.fromEntries(ALLOWED_ACTIONS.map((action, index) => [action, [{
  tag_name: `v${7 - index}.0.2`, published_at: old(10), prerelease: false, draft: false,
  repository: { full_name: action }, ref: { object: { type: 'commit', sha: sha(String.fromCharCode(98 + index)) } },
}]]));
const targets = [
  { kind: 'node', name: 'node', version: '24.22.2' },
  ...ALLOWED_ACTIONS.map((action, index) => ({ kind: 'action', name: action, version: `v${7 - index}.0.2` })),
];
const research = targets.map(target => {
  const source = target.kind === 'node' ? 'https://nodejs.org/en/blog/vulnerability/security' : `https://github.com/${target.name}/security/advisories/ghsa-fixture`;
  return { target, pass: true, findings: [], evidence: [source], security: { status: 'clear', advisories: [] },
    provenance: { searches: [{ queries: [`${target.name} ${target.version} official security`], sources: [source] }] } };
});
const metadata = { nodeIndex, shasums, shasumsSignature: 'signed fixture', actionReleases: releases,
  actionCommits: Object.fromEntries(ALLOWED_ACTIONS.map((action, index) => [action, sha(String.fromCharCode(98 + index))])), fetchedAt: old(1) };

function planInput(overrides = {}) {
  return { baseFiles, now, metadata, researchresults: research, ...overrides };
}

test('snapshotTrustedBase requests only trusted paths and returns an immutable complete snapshot', async () => {
  let requested;
  const snapshot = await snapshotTrustedBase({ fetchFiles: async paths => { requested = paths; return baseFiles; } });
  assert.deepEqual(requested, ['.nvmrc', 'package.json', 'package-lock.json', '.github/automation/dependency-sandbox.mjs', QA_NODE_PATH]);
  assert.equal(snapshot.files.get('.nvmrc'), '24.22.1\n');
  assert(Object.isFrozen(snapshot));
});

test('createMaintenancePlan emits coordinated deterministic Node and action bytes', async () => {
  const plan = await createMaintenancePlan(planInput());
  assert.equal(plan.schemaVersion, MAINTENANCE_SCHEMA_VERSION);
  assert.deepEqual(plan.files.map(file => file.path), [
    '.github/automation/dependency-sandbox.mjs', '.github/workflows/fixture.yml', '.nvmrc', 'package-lock.json', 'package.json',
  ]);
  assert.match(plan.files.find(file => file.path === '.nvmrc').content, /^24\.22\.2\n$/);
  assert.match(plan.files.find(file => file.path === 'package.json').content, />=24\.22\.2 <25/);
  assert.match(plan.files.find(file => file.path === 'package-lock.json').content, />=24\.22\.2 <25/);
  assert.match(plan.files.find(file => file.path === '.github/automation/dependency-sandbox.mjs').content, /NODE_VERSION = '24\.22\.2'/);
  assert.equal(plan.integration.qaNodePin, '24.22.1');
  assert.equal(validateMaintenancePlan(baseFiles, plan, { now }).ok, true);
});

test('exact candidate byte gate rejects tampering, downgrade and hidden workflow edits', async () => {
  const plan = await createMaintenancePlan(planInput());
  const head = new Map(Object.entries(baseFiles));
  for (const file of plan.files) head.set(file.path, file.content);
  assert.equal(assertCandidateBytes(baseFiles, head, plan).ok, true);
  const tampered = new Map(head); tampered.set('package.json', `${tampered.get('package.json')}\n`);
  assert.equal(assertCandidateBytes(baseFiles, tampered, plan).ok, false);
  const downgrade = new Map(head); downgrade.set('.nvmrc', '24.22.0\n');
  assert.equal(assertCandidateBytes(baseFiles, downgrade, plan).ok, false);
  const hidden = new Map(head); hidden.set('.github/workflows/fixture.yml', `${hidden.get('.github/workflows/fixture.yml')}\n# hidden edit\n`);
  assert.equal(assertCandidateBytes(baseFiles, hidden, plan).ok, false);
  const qa = new Map(head); qa.set(QA_NODE_PATH, '24.22.2\n');
  assert.equal(assertCandidateBytes(baseFiles, qa, plan).ok, false);
});

test('CVE waivers require an independent exact first fix and reject blanket scope', () => {
  const target = { kind: 'action', name: 'actions/setup-node', version: 'v6.0.2' };
  const advisory = { id: 'GHSA-fixture', aliases: ['CVE-2026-0001'], affectedRange: '<6.0.2', firstFixedVersion: 'v6.0.2', source: 'https://api.github.com/advisories/GHSA-fixture' };
  const proof = { target, advisory, fromVersion: 'v6.0.1', independent: true, fetchedAt: old(1) };
  assert.equal(validateCveWaivers([proof], { targets: [target], now }).ok, true);
  assert.equal(validateCveWaivers([{ ...proof, blanket: true }], { targets: [target], now }).ok, false);
  assert.equal(validateCveWaivers([{ ...proof, advisory: { ...advisory, source: 'https://evil.example/advisory' } }], { targets: [target], now }).ok, false);
});

test('unrelated young release cannot be waived without exact independent evidence', async () => {
  const young = structuredClone(metadata);
  young.nodeIndex = [{ version: 'v24.22.3', date: old(1), lts: 'Krypton' }];
  await assert.rejects(createMaintenancePlan(planInput({ metadata: young })));
});

