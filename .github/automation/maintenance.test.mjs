import test from 'node:test';
import assert from 'node:assert/strict';
import { loadNpmSemver } from './dependencies.mjs';
import { NODE_SECURITY_INDEX, NODE_SECURITY_FEED } from './toolchain-security.mjs';
import {
  ALLOWED_ACTIONS, MAINTENANCE_SCHEMA_VERSION, QA_NODE_PATH,
  assertCandidateBytes, createMaintenancePlan, snapshotTrustedBase,
  validateCveWaivers, validateMaintenancePlan, fetchOfficialSecurityMetadata, usedToolchainTargets,
} from './maintenance.mjs';

const semver = loadNpmSemver();
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
  return { baseFiles, now, metadata, researchresults: research, semver, fetchImpl: primaryFixture(), ...overrides };
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
  assert.equal(validateCveWaivers([proof], { targets: [target], now }).ok, false);
  assert.equal(validateCveWaivers([{ ...proof, blanket: true }], { targets: [target], now }).ok, false);
  assert.equal(validateCveWaivers([{ ...proof, advisory: { ...advisory, source: 'https://evil.example/advisory' } }], { targets: [target], now }).ok, false);
});

test('unrelated young release cannot be waived without exact independent evidence', async () => {
  const young = structuredClone(metadata);
  young.nodeIndex = [{ version: 'v24.22.3', date: old(1), lts: 'Krypton' }];
  await assert.rejects(createMaintenancePlan(planInput({ metadata: young })));
});


// These are synthetic HTTPS response bytes, never assertions of real CVEs.
function primaryFixture({ node = {}, feed = '<rss><channel></channel></rss>', blogs = {}, actions = {}, releaseMetadata, calls = [] } = {}) {
  return async (url, options) => {
    calls.push({ url, options });
    let body;
    if (url === NODE_SECURITY_INDEX) body = node;
    else if (url === NODE_SECURITY_FEED) body = feed;
    else if (Object.hasOwn(blogs, url)) body = blogs[url];
    else if (url.includes('/security-advisories?')) {
      const action = new URL(url).pathname.match(/^\/repos\/(actions\/[^/]+)\/security-advisories$/)?.[1];
      assert(ALLOWED_ACTIONS.includes(action));
      body = actions[action] ?? [];
    } else if (url.includes('/git/ref/tags/')) {
      const action = new URL(url).pathname.match(/^\/repos\/(actions\/[^/]+)\//)?.[1];
      const index = ALLOWED_ACTIONS.indexOf(action);
      const currentTag = `v${7 - index}.0.1`;
      body = { object: { type: 'commit', sha: url.endsWith(currentTag) ? sha(String.fromCharCode(97 + index)) : releaseMetadata?.actionCommits[action] } };
    } else if (releaseMetadata) {
      if (url === 'https://nodejs.org/dist/index.json') body = releaseMetadata.nodeIndex;
      else if (url.endsWith('/SHASUMS256.txt')) body = releaseMetadata.shasums;
      else if (url.endsWith('/SHASUMS256.txt.sig')) body = releaseMetadata.shasumsSignature;
      else {
        const action = new URL(url).pathname.match(/^\/repos\/(actions\/[^/]+)\//)?.[1];
        if (url.endsWith('/releases')) body = releaseMetadata.actionReleases[action];
        else if (url.includes('/git/ref/tags/')) body = { object: { type: 'commit', sha: releaseMetadata.actionCommits[action] } };
      }
    }
    assert.notEqual(body, undefined, `Unexpected primary HTTP request: ${url}`);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  };
}
function nodeCve(overrides = {}) {
  return { cve: ['CVE-2099-123456'], vulnerable: '24.x', patched: '^24.22.3',
    ref: 'https://nodejs.org/en/blog/vulnerability/synthetic-security', ...overrides };
}
function actionCve(overrides = {}) {
  const id = 'GHSA-2345-2345-2345';
  return { ghsa_id: id, cve_id: 'CVE-2099-123457', state: 'published', withdrawn_at: null,
    url: `https://api.github.com/repos/actions/checkout/security-advisories/${id}`,
    identifiers: [{ type: 'CVE', value: 'CVE-2099-123457' }],
    vulnerabilities: [{ package: { ecosystem: 'actions', name: 'actions/checkout' },
      vulnerable_version_range: '>= 7.0.0, < 7.0.3', patched_versions: '7.0.3' }], ...overrides };
}
function urgentMetadata() {
  const data = structuredClone(metadata);
  data.shasums = `${digest}  node-v24.22.3-linux-x64.tar.gz\n`;
  data.nodeIndex.push({ version: 'v24.22.4', date: old(0.5), lts: 'Krypton' });
  data.actionReleases['actions/checkout'].push({ ...data.actionReleases['actions/checkout'][0], tag_name: 'v7.0.3', published_at: old(1) },
    { ...data.actionReleases['actions/checkout'][0], tag_name: 'v7.0.4', published_at: old(0.5) });
  return data;
}
function urgentResearch() {
  return research.map(item => {
    const copy = structuredClone(item);
    if (copy.target.kind === 'node') copy.target.version = '24.22.3';
    if (copy.target.name === 'actions/checkout') copy.target.version = 'v7.0.3';
    copy.provenance.searches[0].queries = [`${copy.target.name} ${copy.target.version} official security`];
    return copy;
  });
}

test('actual maintenance planner fetches primary records before discovering exact young fixes', async () => {
  const calls = [], data = urgentMetadata();
  const fetchImpl = primaryFixture({ node: { 1: nodeCve() }, actions: { 'actions/checkout': [actionCve()] }, releaseMetadata: data, calls });
  const plan = await createMaintenancePlan(planInput({ metadata: undefined, fetchImpl, researchresults: urgentResearch(), token: 'synthetic-token' }));
  assert.equal(plan.targetNodeVersion, '24.22.3');
  assert.equal(plan.toolchainPlan.pinnedActionRefs['actions/checkout'], sha('b'));
  assert.match(plan.files.find(file => file.path.endsWith('fixture.yml')).content, /# v7\.0\.3/);
  assert.deepEqual(plan.waivers.map(proof => proof.target.version).sort(), ['24.22.3', 'v7.0.3']);
  assert.equal(validateMaintenancePlan(baseFiles, plan, { now }).ok, true);
  const head = { ...baseFiles, ...Object.fromEntries(plan.files.map(file => [file.path, file.content])) };
  assert.equal(assertCandidateBytes(baseFiles, head, plan, { now }).ok, true);
  assert(calls.findIndex(call => call.url.includes('/security-advisories?')) < calls.findIndex(call => call.url.endsWith('/releases')));
  for (const { url, options } of calls) {
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, new URL(url).hostname === 'api.github.com' ? 'Bearer synthetic-token' : undefined);
  }
  const saved = structuredClone(plan);
  assert.equal(validateMaintenancePlan(baseFiles, saved, { now }).ok, false);
  const securityProofs = await fetchOfficialSecurityMetadata({ targets: usedToolchainTargets(baseFiles), semver, now, fetchImpl });
  assert.equal(validateMaintenancePlan(baseFiles, saved, { now, securityProofs }).ok, true);
});

test('wrong affected version, patched current pin, unrelated package and non-CVE records grant no waiver', async () => {
  for (const node of [nodeCve({ vulnerable: '22.x' }), nodeCve({ patched: '^24.0.0' }), nodeCve({ cve: ['GHSA-forged'] })]) {
    const plan = await createMaintenancePlan(planInput({ fetchImpl: primaryFixture({ node: { 1: node } }) }));
    assert.equal(plan.targetNodeVersion, '24.22.2'); assert.deepEqual(plan.waivers, []);
  }
  for (const advisory of [actionCve({ cve_id: 'GHSA-forged' }), actionCve({ withdrawn_at: old(1) }),
    actionCve({ vulnerabilities: [{ package: { ecosystem: 'npm', name: 'actions/checkout' }, vulnerable_version_range: '<8', patched_versions: '7.0.3' }] }),
    actionCve({ vulnerabilities: [{ package: { ecosystem: 'actions', name: 'actions/checkout' }, vulnerable_version_range: '<7.0.0', patched_versions: '7.0.3' }] })]) {
    const plan = await createMaintenancePlan(planInput({ fetchImpl: primaryFixture({ actions: { 'actions/checkout': [advisory] } }) }));
    assert.deepEqual(plan.waivers, []);
  }
});

test('forged caller metadata, wrong necessary endpoint and unresolved real finding block', async () => {
  await assert.rejects(createMaintenancePlan(planInput({ security: [{ independent: true }] })), /caller-authored/);
  for (const override of [
    { vulnerabilities: [{ package: { ecosystem: 'actions', name: 'actions/checkout' }, vulnerable_version_range: '<7.0.3', patched_versions: '7.0.4' }] },
    { identifiers: [{ type: 'CVE', value: 'CVE-2099-999999' }] },
    { url: 'https://evil.example/advisory' },
  ]) await assert.rejects(createMaintenancePlan(planInput({ fetchImpl: primaryFixture({ actions: { 'actions/checkout': [actionCve(override)] } }) })), /endpoint|identity/);
  await assert.rejects(createMaintenancePlan(planInput({ fetchImpl: primaryFixture({ node: { 1: nodeCve({ patched: '^24.22.9' }) } }) })), /unresolved/);
});

test('failed primary fetch blocks even when injected release metadata and AI research appear clear', async () => {
  await assert.rejects(createMaintenancePlan(planInput({ fetchImpl: async () => new Response('', { status: 503 }) })), /HTTP 503/);
  await assert.rejects(createMaintenancePlan(planInput({ semver: undefined })), /npm-bundled semver/);
});

test('ordinary no-CVE maintenance is unchanged and current young pins produce a no-op', async () => {
  const data = structuredClone(metadata);
  data.nodeIndex = [{ version: 'v24.22.1', date: old(1), lts: 'Krypton' }, ...nodeIndex.filter(item => item.date === old(1))];
  for (const [index, action] of ALLOWED_ACTIONS.entries()) {
    data.actionReleases[action] = [{ tag_name: `v${7 - index}.0.1`, published_at: old(1), ref: { object: { type: 'commit', sha: sha(String.fromCharCode(97 + index)) } } },
      { tag_name: `v${7 - index}.0.2`, published_at: old(0.5) }];
    data.actionCommits[action] = sha(String.fromCharCode(97 + index));
  }
  const currentResearch = research.map(item => { const copy = structuredClone(item); copy.target.version = copy.target.kind === 'node' ? '24.22.1' : copy.target.version.replace(/2$/, '1');
    copy.provenance.searches[0].queries = [`${copy.target.name} ${copy.target.version} security`]; return copy; });
  const plan = await createMaintenancePlan(planInput({ metadata: data, researchresults: currentResearch }));
  assert.deepEqual(plan.files, []); assert.deepEqual(plan.waivers, []);
});

test('official Node blog supplement uses CVE headings, explicit affected line and exact release link', async () => {
  const source = 'https://raw.githubusercontent.com/nodejs/nodejs.org/main/apps/site/pages/en/blog/vulnerability/synthetic-security.md';
  const feed = `<rss><channel><item><link>https://nodejs.org/en/blog/vulnerability/synthetic-security</link><pubDate>${old(1)}</pubDate></item></channel></rss>`;
  const markdown = '## Synthetic finding (CVE-2099-123458) - (low)\n\nThis vulnerability affects Node.js **26.x**, **24.x**, and **22.x**.\n\n## Downloads and release details\n\n- [Node.js v24.22.3](/blog/release/v24.22.3/)\n';
  const proofs = await fetchOfficialSecurityMetadata({ targets: [usedToolchainTargets(baseFiles)[0]], semver, now,
    fetchImpl: primaryFixture({ feed, blogs: { [source]: markdown } }) });
  assert.equal(proofs.length, 1); assert.equal(proofs[0].target.version, '24.22.3');
  assert.equal(proofs[0].advisory.source, source);
  const plan = await createMaintenancePlan(planInput({ metadata: { ...urgentMetadata(), actionReleases: releases },
    researchresults: urgentResearch().map((item, i) => i === 1 ? research[1] : item),
    fetchImpl: primaryFixture({ feed, blogs: { [source]: markdown } }) }));
  assert.equal(plan.targetNodeVersion, '24.22.3'); assert.equal(plan.waivers.length, 1);
});

test('unsupported legacy records unrelated to Node 24 never block ordinary maintenance', async () => {
  const plan = await createMaintenancePlan(planInput({ fetchImpl: primaryFixture({ node: {
    1: nodeCve({ vulnerable: '22.x', patched: null }),
    2: nodeCve({ vulnerable: 'legacy Node 10 format', patched: 'unknown' }),
    3: nodeCve({ vulnerable: '24.x', patched: '^24.0.0' }),
  } }) }));
  assert.equal(plan.targetNodeVersion, '24.22.2');
  await assert.rejects(createMaintenancePlan(planInput({ fetchImpl: primaryFixture({ node: { 1: nodeCve({ patched: 'unknown' }) } }) })), /relevant Node patched range/);
});

test('relevant Actions CVE cannot trust a mislabeled current SHA or reuse proof on another pin', async () => {
  const fetchImpl = primaryFixture({ actions: { 'actions/checkout': [actionCve()] } });
  const used = usedToolchainTargets(baseFiles);
  const wrong = used.map(target => target.kind === 'action' && target.name === 'actions/checkout' ? { ...target, sha: sha('f') } : target);
  await assert.rejects(fetchOfficialSecurityMetadata({ targets: wrong, now, semver, fetchImpl }), /actual official pinned SHA/);
  const proofs = await fetchOfficialSecurityMetadata({ targets: used, now, semver, fetchImpl });
  const proof = proofs[0];
  assert.equal(validateCveWaivers([proof], { targets: [proof.target], now }).ok, true);
  assert.equal(validateCveWaivers([{ ...proof, fromVersion: 'v7.0.0' }], { targets: [proof.target], now, securityProofs: proofs }).ok, false);
  assert.equal(validateCveWaivers([{ ...proof, fromSHA: sha('f') }], { targets: [proof.target], now, securityProofs: proofs }).ok, false);
  assert.equal(validateCveWaivers([{ ...proof, advisory: { ...proof.advisory, id: 'CVE-2099-999999' } }], { targets: [proof.target], now, securityProofs: proofs }).ok, false);
});

test('fresh relevant proof blocks an aged saved candidate that no longer fixes the current CVE', async () => {
  const plan = await createMaintenancePlan(planInput());
  const securityProofs = await fetchOfficialSecurityMetadata({ targets: usedToolchainTargets(baseFiles), now, semver,
    fetchImpl: primaryFixture({ node: { 1: nodeCve() } }) });
  const check = validateMaintenancePlan(baseFiles, structuredClone(plan), { now, securityProofs });
  assert.equal(check.ok, false); assert.match(check.errors.join(';'), /CVE remains unresolved/);
});

test('MDX fallback is limited to a primary Markdown HTTP 404', async () => {
  const calls = [], source = 'https://raw.githubusercontent.com/nodejs/nodejs.org/main/apps/site/pages/en/blog/vulnerability/synthetic-mdx.md';
  const feed = `<rss><channel><item><link>https://nodejs.org/en/blog/vulnerability/synthetic-mdx</link><pubDate>${old(1)}</pubDate></item></channel></rss>`;
  const fixture = primaryFixture({ feed, blogs: { [`${source}x`]: '## Incident update\n\nNo new CVE record.\n' }, calls });
  const fetchImpl = async (url, options) => url === source ? new Response('', { status: 404 }) : fixture(url, options);
  const proofs = await fetchOfficialSecurityMetadata({ targets: [usedToolchainTargets(baseFiles)[0]], now, semver, fetchImpl });
  assert.deepEqual(proofs, []); assert(calls.some(call => call.url === `${source}x`));
  await assert.rejects(fetchOfficialSecurityMetadata({ targets: [usedToolchainTargets(baseFiles)[0]], now, semver,
    fetchImpl: (url, options) => url === source ? new Response('', { status: 503 }) : fixture(url, options) }), /HTTP 503/);
});

test('saved young waiver removal and future release dates cannot bypass deterministic validation', async () => {
  const data = urgentMetadata(), fetchImpl = primaryFixture({ node: { 1: nodeCve() }, actions: { 'actions/checkout': [actionCve()] } });
  const plan = await createMaintenancePlan(planInput({ metadata: data, fetchImpl, researchresults: urgentResearch() }));
  assert.equal(validateMaintenancePlan(baseFiles, { ...plan, waivers: [] }, { now }).ok, false);
  const future = { ...plan, toolchainPlan: { ...plan.toolchainPlan, releases: plan.toolchainPlan.releases.map(release => release.kind === 'node'
    ? { ...release, releaseDate: new Date(now + 1000).toISOString() } : release) } };
  assert.equal(validateMaintenancePlan(baseFiles, future, { now }).ok, false);
});
