import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { authorize, resolveRequest, recheckIdentity, auditVerdict, validateApplication, finalize, APPLICATION_CONTEXT } from './recovery-checks.mjs';

// Synthetic identities/advisory only; no live API/deployment or vulnerability.
const original = '1'.repeat(40), failed = '2'.repeat(40), head = '3'.repeat(40);
const oldTree = '4'.repeat(40), failedTree = '5'.repeat(40), other = '6'.repeat(40);
const repository = 'owner/site';
const marker = `<!-- dependency-restore:v1 failed=${failed} original=${original} -->`;
const env = { GITHUB_REPOSITORY: repository, GITHUB_WORKFLOW_SHA: failed,
  GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/application-checks.yml@refs/heads/main`, GITHUB_EVENT_NAME: 'workflow_dispatch' };
const request = { number: 3, headSHA: head };

function fixture() {
  const state = {
    main: failed,
    pr: { number: 3, state: 'open', draft: false, body: marker, user: { login: 'github-actions[bot]', type: 'Bot' },
      head: { sha: head, ref: 'automation/restore-123', repo: { full_name: repository } },
      base: { sha: failed, ref: 'main', repo: { full_name: repository } } },
    commits: {
      [head]: { sha: head, tree: { sha: oldTree }, parents: [{ sha: failed }] },
      [failed]: { sha: failed, tree: { sha: failedTree }, parents: [{ sha: original }, { sha: other }] },
      [original]: { sha: original, tree: { sha: oldTree }, parents: [] },
    },
    serving: { id: 'dpl_previous', projectId: 'prj_fixed', hostname: 'www.example.org', sha: original, branch: 'main', readyState: 'READY' },
    mutations: [], calls: [],
  };
  const gh = { repository, ref: async ref => { assert(['main', 'updates'].includes(ref)); return state.main; },
    repoApi: async (path, options) => {
      state.calls.push(path);
      if (options) { state.mutations.push({ path, ...options }); return { id: 123 }; }
      if (path === '/pulls/3') return structuredClone(state.pr);
      if (path.startsWith('/git/commits/')) return structuredClone(state.commits[path.split('/').at(-1)]);
      if (path.startsWith('/pulls?')) return structuredClone(state.pulls || [state.pr]);
      if (path === '/check-runs/123') return { name: APPLICATION_CONTEXT, head_sha: head, app: { id: 15368 },
        external_id: `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`, ...state.checkOverride };
      throw Error(`Unexpected API ${path}`);
    } };
  let productionReads = 0;
  return { state, gh, production: async () => { productionReads++; return structuredClone(state.serving); },
    productionReads: () => productionReads };
}

test('actual rolled-back production + exact old tree + one failed-main parent authorizes vulnerable-baseline restoration', async () => {
  const f = fixture();
  const proof = await authorize(request, f);
  assert.deepEqual(proof.recovery, { originalSHA: original, failedSHA: failed, treeSHA: oldTree,
    deploymentId: 'dpl_previous', projectId: 'prj_fixed', hostname: 'www.example.org' });
  assert.equal(proof.headSHA, head);
  assert.equal(proof.baseSHA, failed);
  assert.equal(proof.treeSHA, oldTree);
  assert.equal(f.productionReads(), 1);
  assert.equal(f.state.mutations.length, 0);
  await recheckIdentity(proof, f.gh);
});

test('forged body/branch/label, non-bot author and unrolled-back production never authorize audit exception', async t => {
  const changes = {
    'human forged exact body': f => { f.state.pr.user = { login: 'attacker', type: 'User' }; },
    'bot label alone': f => { f.state.pr.body = ''; f.state.pr.labels = [{ name: 'recovery' }]; },
    'marker alone': f => { f.state.pr.head.ref = 'feature'; },
    'bot display name': f => { f.state.pr.user.type = 'User'; },
    'duplicate markers': f => { f.state.pr.body += marker; },
    'fork restore': f => { f.state.pr.head.repo.full_name = 'attacker/site'; },
    'old tree without rollback': f => { f.state.serving.sha = failed; },
    'other deployed commit with same tree': f => { f.state.serving.sha = other; },
    'deployment from updates': f => { f.state.serving.branch = 'updates'; },
    'production not ready': f => { f.state.serving.readyState = 'ERROR'; },
    'ordinary sibling borrowing recovery head': f => { f.state.pulls = [f.state.pr, { ...f.state.pr, number: 4 }]; },
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => {
    const f = fixture(); change(f);
    await assert.rejects(authorize(request, f));
    assert.equal(f.state.mutations.length, 0);
  });
});

test('head, parent, base, main and Git tree changes reject the exact restoration proof', async t => {
  const changes = {
    head: f => { f.state.pr.head.sha = other; },
    tree: f => { f.state.commits[head].tree.sha = other; },
    parent: f => { f.state.commits[head].parents = [{ sha: original }]; },
    'extra parent': f => { f.state.commits[head].parents.push({ sha: other }); },
    'no parent': f => { f.state.commits[head].parents = []; },
    'base ref': f => { f.state.pr.base.ref = 'updates'; },
    'base SHA': f => { f.state.pr.base.sha = other; },
    'current main': f => { f.state.main = other; },
    'failed merge original parent': f => { f.state.commits[failed].parents[0].sha = other; },
    'closed PR': f => { f.state.pr.state = 'closed'; },
    'draft PR': f => { f.state.pr.draft = true; },
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => {
    const f = fixture(); change(f); await assert.rejects(authorize(request, f));
  });
  const f = fixture();
  await assert.rejects(authorize(request, { gh: f.gh, production: async () => { f.state.main = other; return f.state.serving; } }), /base changed/);
});

function lock() {
  return { lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic': { version: '1.0.0',
    resolved: 'https://registry.npmjs.org/synthetic/-/synthetic-1.0.0.tgz', integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` } } };
}
function audit(findings = false) {
  return { auditReportVersion: 2,
    vulnerabilities: findings ? { synthetic: { name: 'synthetic', severity: 'low', isDirect: false,
      nodes: ['node_modules/synthetic'], via: ['synthetic-advisory'], fixAvailable: true } } : {},
    metadata: { vulnerabilities: { info: 0, low: findings ? 1 : 0, moderate: 0, high: 0, critical: 0, total: findings ? 1 : 0 },
      dependencies: { prod: 1, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: 1 } } };
}

test('ordinary PR, including a recovery label, requires zero findings and does not read Vercel', async () => {
  const f = fixture(); f.state.pr.body = 'Ordinary update'; f.state.pr.head.ref = 'updates';
  f.state.pr.labels = [{ name: 'recovery' }];
  const proof = await authorize(request, f);
  assert.equal(proof.recovery, null); assert.equal(f.productionReads(), 0);
  assert.equal(auditVerdict(audit(), 0, 'all', lock(), proof).pass, true);
  assert.equal(auditVerdict(audit(true), 1, 'all', lock(), proof).pass, false);
  assert.equal(auditVerdict(audit(true), 1, 'production', lock(), proof).pass, false);
});

test('verified restoration records vulnerabilities without calling audit clean, but malformed/failed audits always block', async () => {
  const proof = await authorize(request, fixture());
  const accepted = auditVerdict(audit(true), 1, 'all', lock(), proof);
  assert.equal(accepted.pass, true); assert.equal(accepted.ok, false); assert.equal(accepted.clean, false);
  assert.equal(accepted.acceptedBaselineFindings, true); assert.equal(accepted.findings.length, 1);
  for (const [report, code] of [[{ error: { code: 'ENETWORK' } }, 1], [audit(true), 2], [audit(true), 0], [audit(), 1],
    [{ ...audit(true), metadata: {} }, 1], [{ ...audit(true), error: {} }, 1]]) {
    assert.equal(auditVerdict(report, code, 'all', lock(), proof).pass, false);
  }
  const badCount = audit(true); badCount.metadata.dependencies.total = 2;
  assert.equal(auditVerdict(badCount, 1, 'all', lock(), proof).pass, false);
});

async function validationFixture(t, { recovery = true, findings = true, failCommand, mutateHost, mutateIdentity, failVerify } = {}) {
  const f = fixture();
  if (!recovery) { f.state.pr.body = ''; f.state.pr.head.ref = 'updates'; }
  const proof = await authorize(request, f), root = await mkdtemp(join(tmpdir(), 'bsc70-recovery-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package-lock.json'), JSON.stringify(lock()));
  await writeFile(join(root, 'package.json'), '{}');
  const evidence = root + '-evidence'; t.after(() => rm(evidence, { recursive: true, force: true }));
  const calls = []; let closed = 0, verified = 0, localChecks = 0;
  const result = await validateApplication({ proof, candidate: root, evidence, gh: f.gh,
    verifyLocal: async () => { localChecks++; },
    sandboxFactory: async () => ({
      run: async (args, options) => {
        const name = args[0] === 'run' ? args[1] : args[0]; calls.push({ name, args, options });
        if (mutateHost && name === 'lint') await writeFile(join(root, 'package.json'), '{"tampered":true}');
        if (mutateIdentity && name === 'build') f.state.main = other;
        return { code: name === failCommand ? 2 : name === 'audit' && findings ? 1 : 0,
          stdout: name === 'audit' ? JSON.stringify(audit(findings)) : '::set-output name=pass::true', stderr: '' };
      },
      verify: async () => { verified++; if (failVerify && calls.some(c => c.name === 'build')) throw Error('Sandbox source changed'); return {}; },
      close: async () => { closed++; },
    }),
  });
  return { result, calls, closed, verified, localChecks, evidence };
}

test('CVE fix regression restoration retains both non-clean audits and still requires install/tree/lint/build', async t => {
  const f = await validationFixture(t);
  assert.equal(f.result.pass, true);
  assert.deepEqual(f.calls.map(c => c.name), ['audit', 'audit', 'ci', 'ls', 'lint', 'build']);
  assert(f.calls.slice(0, 2).every(c => c.options.network && c.options.writable === false));
  assert.equal(f.closed, 1); assert(f.verified >= 7); assert.equal(f.localChecks, 2);
  assert(f.result.audits.every(a => a.clean === false && a.acceptedBaselineFindings && a.exitCode === 1));
  const saved = JSON.parse(await readFile(join(f.evidence, 'application.json'), 'utf8'));
  assert.deepEqual(saved.proof, f.result.proof); assert.equal(saved.pass, true);
  assert.equal(JSON.parse(await readFile(join(f.evidence, 'audit-production.json'), 'utf8')).metadata.vulnerabilities.total, 1);
});

test('normal PR with findings blocks before executing plugins; normal clean PR runs all checks', async t => {
  const bad = await validationFixture(t, { recovery: false });
  assert.equal(bad.result.pass, false); assert.deepEqual(bad.calls.map(c => c.name), ['audit', 'audit']);
  const good = await validationFixture(t, { recovery: false, findings: false });
  assert.equal(good.result.pass, true); assert.equal(good.calls.length, 6);
});

test('recovery does not waive install, tree, lint, build, host/sandbox immutability or identity races', async t => {
  for (const failCommand of ['ci', 'ls', 'lint', 'build']) await t.test(failCommand, async t => {
    const f = await validationFixture(t, { failCommand }); assert.equal(f.result.pass, false); assert.equal(f.closed, 1);
  });
  for (const option of ['mutateHost', 'mutateIdentity', 'failVerify']) await t.test(option, async t => {
    const f = await validationFixture(t, { [option]: true }); assert.equal(f.result.pass, false);
  });
});

test('before/after identity check rejects head/tree/parent/main moves even with the old authorization object', async () => {
  for (const mutate of [f => { f.state.pr.head.sha = other; }, f => { f.state.commits[head].tree.sha = other; },
    f => { f.state.commits[head].parents.push({ sha: other }); }, f => { f.state.main = other; },
    f => { f.state.pulls = [f.state.pr, { ...f.state.pr, number: 4 }]; }]) {
    const f = fixture(), proof = await authorize(request, f); mutate(f);
    await assert.rejects(recheckIdentity(proof, f.gh));
  }
});

test('final authorizer rechecks actual production and updates the SAME exact-head required check', async () => {
  const f = fixture(), proof = await authorize(request, f);
  assert.equal(await finalize({ proof, checkId: 123, buildResult: 'success', ...f }), true);
  assert.equal(f.state.mutations.length, 1); assert.equal(f.state.mutations[0].method, 'PATCH');
  assert.equal(f.state.mutations[0].path, '/check-runs/123');
  assert.equal(f.state.mutations[0].body.conclusion, 'success');
  assert.match(f.state.mutations[0].body.output.summary, /baseline audit findings recorded/);
  for (const mutate of [f => { f.state.serving.sha = failed; }, f => { f.state.serving.id = 'dpl_another'; },
    f => { f.state.main = other; }, f => { f.state.commits[head].tree.sha = other; }]) {
    const changed = fixture(); mutate(changed);
    assert.equal(await finalize({ proof, checkId: 123, buildResult: 'success', ...changed }), false);
    assert.equal(changed.state.mutations[0].body.conclusion, 'failure');
  }
  for (const buildResult of ['failure', 'cancelled', 'skipped']) {
    const changed = fixture(); assert.equal(await finalize({ proof, checkId: 123, buildResult, ...changed }), false);
  }
  f.state.checkOverride = { head_sha: other };
  await assert.rejects(finalize({ proof, checkId: 123, buildResult: 'success', ...f }), /Check identity/);
});

test('explicit dispatch requires installed main workflow, exact PR and SHA; ignores recovery inputs', async () => {
  const f = fixture(), event = { repository: { full_name: repository, default_branch: 'main' },
    inputs: { pr_number: '3', head_sha: head, recovery: 'true' } };
  assert.deepEqual(await resolveRequest(event, env, f.gh), request);
  await assert.rejects(resolveRequest(event, { ...env, GITHUB_WORKFLOW_REF: env.GITHUB_WORKFLOW_REF.replace('heads/main', 'heads/feature') }, f.gh));
  for (const inputs of [{ pr_number: '3' }, { pr_number: 'bad', head_sha: head }, { pr_number: '3', head_sha: 'main' }])
    await assert.rejects(resolveRequest({ ...event, inputs }, env, f.gh));
});

test('branch workflow runs cannot implicitly start an application exception; require an explicit trusted-main PR dispatch', async () => {
  const f = fixture(), event = { repository: { full_name: repository, default_branch: 'main' }, workflow_run: { id: 9 } };
  const runEnv = { ...env, GITHUB_EVENT_NAME: 'workflow_run' };
  await assert.rejects(resolveRequest(event, runEnv, f.gh), /explicit main dispatch/);
  assert.equal(f.state.calls.length, 0);
});

test('workflow keeps the required context out of candidate jobs and secrets out of sandbox runner', async () => {
  const workflow = await readFile(new URL('../workflows/application-checks.yml', import.meta.url), 'utf8');
  const candidateWorkflow = await readFile(new URL('../workflows/automation-checks.yml', import.meta.url), 'utf8');
  assert(!candidateWorkflow.includes('name: Application lint, build and audit'));
  assert(candidateWorkflow.includes('name: Automation tests'));
  const build = workflow.split('\n  validate:\n')[1].split('\n  finalize:\n')[0];
  assert(!build.includes('secrets.') && !build.includes('checks: write'));
  assert(build.includes('trusted/.github/automation/recovery-checks.mjs validate'));
  assert(build.includes('needs.authorize.outputs.head_sha') && build.includes('persist-credentials: false'));
  const auth = workflow.split('\n  authorize:\n')[1].split('\n  validate:\n')[0];
  assert(!auth.includes('path: candidate') && !auth.includes('npm ci') && auth.includes('secrets.VERCEL_TOKEN'));
  const final = workflow.split('\n  finalize:\n')[1];
  assert(!final.includes('download-artifact') && !final.includes('path: candidate') && final.includes('secrets.VERCEL_TOKEN'));
});
