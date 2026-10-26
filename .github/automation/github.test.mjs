import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, repoApi, repository, assertSHA, ref, file, changes, output, event, setStatus, ensureLabels, issue,
  fastForward, commitFiles, createBranch, openPR, mergePR, readProtection, assertProtection, REQUIRED_SECURITY_CHECKS } from './github.mjs';

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), MERGE = 'c'.repeat(40);
const originalFetch = globalThis.fetch;
let savedEnv;
beforeEach(() => {
  savedEnv = { ...process.env }; process.env.GH_TOKEN = 'synthetic-test-token';
  globalThis.fetch = async () => { throw Error('Unexpected network request'); };
});
afterEach(() => { globalThis.fetch = originalFetch; process.env = savedEnv; });
const json = (value, status = 200) => new Response(status === 204 ? null : JSON.stringify(value), { status });
function mock(steps) {
  let index = 0;
  globalThis.fetch = async (url, init) => {
    const step = steps[index++];
    assert.ok(step, 'Unexpected fetch'); assert.equal(url, `https://api.github.com/repos/${repository}${step.path}`);
    assert.equal(init.method, step.method || 'GET'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, 'Bearer synthetic-test-token');
    if (step.body) assert.deepEqual(JSON.parse(init.body), step.body);
    return json(step.response, step.status);
  };
  return () => assert.equal(index, steps.length);
}
const ruleset = (branch = 'main') => ({ id: 42, target: 'branch', source_type: 'Repository', source: repository,
  enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
  rules: [
    { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true,
      required_status_checks: [...REQUIRED_SECURITY_CHECKS, 'security/review'].map(context => ({ context, integration_id: 15368 })) } },
    { type: 'non_fast_forward' }, { type: 'deletion' },
    { type: 'pull_request', parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: true,
      require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: true } },
  ] });
const effectiveRules = value => structuredClone(value.rules).map(rule => ({ ...rule, ruleset_id: value.id,
  ruleset_source_type: value.source_type, ruleset_source: value.source }));
const ruleReads = (value = ruleset(), branch = 'main') => [
  { path: `/rules/branches/${branch}?per_page=100&page=1`, response: effectiveRules(value) },
  ...(value.rules.length ? [{ path: `/rulesets/${value.id}`, response: value }] : []),
];
const protection = () => ({ required_status_checks: { strict: true,
  contexts: [...REQUIRED_SECURITY_CHECKS, 'security/review'],
  checks: [...REQUIRED_SECURITY_CHECKS, 'security/review'].map(context => ({ context, app_id: 15368 })) },
  enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
  required_pull_request_reviews: { required_approving_review_count: 0, dismiss_stale_reviews: true,
    require_code_owner_reviews: false, require_last_push_approval: false,
    bypass_pull_request_allowances: { users: [], teams: [], apps: [] } } });
const pr = () => ({ state: 'open', draft: false, head: { sha: HEAD, repo: { full_name: repository } },
  base: { sha: BASE, ref: 'main', repo: { full_name: repository } } });

test('API paths, token presence and immutable SHA inputs fail before fetch', async () => {
  for (const path of [null, '', '//evil.test', '/\\evil', '/repos/../secret', '/x#fragment', '/x\n']) await assert.rejects(api(path));
  for (const path of ['//x', '', null, 'relative']) assert.throws(() => repoApi(path));
  for (const sha of [null, undefined, 'main', 'a'.repeat(39), HEAD.toUpperCase(), { toString: () => HEAD }]) assert.throws(() => assertSHA(sha));
  assert.equal(assertSHA(HEAD), HEAD);
  delete process.env.GH_TOKEN; delete process.env.GITHUB_TOKEN;
  await assert.rejects(api('/user'), /token is missing/);
});

test('API errors contain no body or token; diff and 204 retain their response types', async () => {
  globalThis.fetch = async () => new Response('synthetic-sensitive-body', { status: 403 });
  await assert.rejects(api('/user'), error => error.message === 'GitHub GET request failed (403)');
  globalThis.fetch = async () => new Response('diff text');
  assert.equal(await api('/test', { accept: 'application/vnd.github.diff' }), 'diff text');
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.equal(await api('/test'), null);
});

test('references reject Git path aliases, invalid branch names and mutable responses', async () => {
  for (const branch of ['development', 'automation/../main', 'automation/x//y', 'automation/.hidden', 'automation/x.lock', 'automation/x.', 'automation/x?ref=main']) await assert.rejects(ref(branch));
  let done = mock([{ path: '/git/ref/heads/automation/synthetic', response: { object: { sha: HEAD } } }]);
  assert.equal(await ref('automation/synthetic'), HEAD); done();
  done = mock([{ path: '/git/ref/heads/main', response: { object: { sha: 'mutable' } } }]);
  await assert.rejects(ref('main')); done();
});

test('repository files are bounded, have canonical paths, and match the decoded size', async () => {
  for (const path of ['../file', '/file', 'a//b', 'a/./b', 'a\\b', 'é.txt']) await assert.rejects(file(path, BASE));
  let done = mock([{ path: `/contents/package.json?ref=${BASE}`, response: { type: 'file', encoding: 'base64', content: 'e30=\n', size: 2 } }]);
  assert.equal(await file('package.json', BASE), '{}'); done();
  for (const response of [{ type: 'dir' }, { type: 'file', encoding: 'base64', content: 'e30=', size: 3 },
    { type: 'file', encoding: 'base64', content: '!e30=', size: 2 }, { type: 'file', encoding: 'base64', content: '', size: 4_000_001 }]) {
    done = mock([{ path: `/contents/package.json?ref=${BASE}`, response }]); await assert.rejects(file('package.json', BASE)); done();
  }
});

test('comparisons reject incomplete file lists and diverged histories', async () => {
  for (const response of [{ status: 'diverged', files: [] }, { status: 'ahead' }, { status: 'ahead', files: Array(300).fill({}) }]) {
    const done = mock([{ path: `/compare/${BASE}...${HEAD}?per_page=100`, response }]); await assert.rejects(changes(BASE, HEAD)); done();
  }
  const done = mock([{ path: `/compare/${BASE}...${HEAD}?per_page=100`, response: { status: 'ahead', files: [{ filename: 'package.json' }] } }]);
  assert.equal((await changes(BASE, HEAD))[0].filename, 'package.json'); done();
});

test('workflow outputs reject line injection and event files are parsed locally', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'github-helper-'));
  try {
    process.env.GITHUB_OUTPUT = join(dir, 'output');
    await output('run_id', 42);
    assert.equal(await readFile(process.env.GITHUB_OUTPUT, 'utf8'), 'run_id=42\n');
    await assert.rejects(output('run_id', '42\nadmin=true')); await assert.rejects(output('bad-name', '42'));
    process.env.GITHUB_EVENT_PATH = process.env.GITHUB_OUTPUT;
    await assert.rejects(event(), SyntaxError);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(process.env.GITHUB_EVENT_PATH, '{"synthetic":true}');
    assert.deepEqual(await event(), { synthetic: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('status creation is explicit and preserves the requested security review context', async () => {
  process.env.GITHUB_RUN_ID = '123';
  const done = mock([{ path: `/statuses/${HEAD}`, method: 'POST', body: { state: 'failure', context: 'security/review',
    description: 'blocked', target_url: `https://github.com/${repository}/actions/runs/123` }, response: { id: 1 } }]);
  await setStatus(HEAD, 'security/review', false, 'blocked'); done();
  await assert.rejects(setStatus(HEAD, 'ci/forged', true, 'x'));
  for (const verdict of ['false', 'true', null, 1]) await assert.rejects(setStatus(HEAD, 'security/review', verdict, 'x'));
});

test('labels and blocked issue deduplication retain existing behavior', async () => {
  let done = mock([{ path: '/labels?per_page=100', response: [{ name: 'automated-dependencies' }, { name: 'security' }] },
    { path: '/labels', method: 'POST', body: { name: 'automation-blocked', color: 'e4e669' }, response: {} }]);
  await ensureLabels(); done();
  process.env.GITHUB_RUN_ID = '123';
  done = mock([{ path: '/issues?state=open&labels=automation-blocked&per_page=100', response: [
    { number: 1, pull_request: {}, body: '<!-- synthetic -->' }, { number: 2, body: '<!-- synthetic -->' }] },
  { path: '/issues/2', method: 'PATCH', body: { title: 'blocked', body: `<!-- synthetic -->\nreason\n\nRun: https://github.com/${repository}/actions/runs/123` }, response: { number: 2 } }]);
  assert.equal((await issue('blocked', 'reason', 'synthetic')).number, 2); done();
});

test('fast-forward never forces a concurrent branch update', async () => {
  let done = mock([{ path: '/git/ref/heads/main', response: { object: { sha: HEAD } } }]);
  await assert.rejects(fastForward('main', BASE, HEAD), /changed/); done();
  done = mock([{ path: '/git/ref/heads/main', response: { object: { sha: BASE } } },
    { path: '/git/refs/heads/main', method: 'PATCH', body: { sha: HEAD, force: false }, response: { message: 'not fast forward' }, status: 422 }]);
  await assert.rejects(fastForward('main', BASE, HEAD), /422/); done();
});

test('commit creation has one immutable parent, only regular files, and no shell', async () => {
  const done = mock([{ path: `/git/commits/${BASE}`, response: { tree: { sha: MERGE } } },
    { path: '/git/trees', method: 'POST', body: { base_tree: MERGE, tree: [{ path: 'package.json', mode: '100644', type: 'blob', content: '{}' }] }, response: { sha: HEAD } },
    { path: '/git/commits', method: 'POST', body: { message: 'synthetic', tree: HEAD, parents: [BASE] }, response: { sha: MERGE } }]);
  assert.equal(await commitFiles(BASE, [{ path: 'package.json', content: '{}' }], 'synthetic'), MERGE); done();
  for (const files of [[null], [{ path: '../x', content: '' }], [{ path: 'a//b', content: '' }], [{ path: 'a', content: '' }, { path: 'a', content: '' }]]) {
    const done = mock([{ path: `/git/commits/${BASE}`, response: { tree: { sha: MERGE } } }]);
    await assert.rejects(commitFiles(BASE, files, 'synthetic')); done();
  }
});

test('candidate branch creation and PR reuse preserve existing exports', async () => {
  let done = mock([{ path: '/git/refs', method: 'POST', body: { ref: 'refs/heads/automation/synthetic', sha: HEAD }, response: {} }]);
  await createBranch('automation/synthetic', HEAD); done();
  await assert.rejects(createBranch('main', HEAD));
  done = mock([{ path: `/pulls?state=open&base=updates&head=${repository.split('/')[0]}:automation/synthetic&per_page=100`, response: [{ number: 1 }] }]);
  assert.equal((await openPR({ base: 'updates', head: 'automation/synthetic' })).number, 1); done();
  await assert.rejects(openPR({ base: 'main', head: 'automation/../main' }));
});

test('universal branch checks preserve the export name without requiring promotion-only contexts', () => {
  assert.deepEqual(REQUIRED_SECURITY_CHECKS, ['security/ai-review', 'Automation tests', 'Application lint, build and audit']);
  assert.ok(Object.isFrozen(REQUIRED_SECURITY_CHECKS));
});

test('ruleset reads normalize legacy fields and assertion uses the same read-only API', async () => {
  for (const read of [readProtection, assertProtection]) {
    const done = mock(ruleReads());
    assert.deepEqual(await read('main'), protection()); done();
  }
  const done = mock(ruleReads(ruleset('updates'), 'updates'));
  assert.deepEqual(await assertProtection('updates'), protection()); done();
  for (const branch of ['development', 'automation/synthetic', 'main?x=1', null]) {
    await assert.rejects(readProtection(branch), /Unapproved/);
    await assert.rejects(assertProtection(branch), /Unapproved/);
  }
});

test('effective policy requires each rule, strict updates, all universal checks and a zero-review PR rule', async () => {
  const mutations = [
    ...['required_status_checks', 'non_fast_forward', 'deletion', 'pull_request'].map(type => p => { p.rules = p.rules.filter(rule => rule.type !== type); }),
    p => { p.rules[0].parameters.strict_required_status_checks_policy = false; },
    p => { delete p.rules[0].parameters.strict_required_status_checks_policy; },
    p => { p.rules[0].parameters.required_status_checks = []; },
    p => { delete p.rules[0].parameters.required_status_checks; },
    ...REQUIRED_SECURITY_CHECKS.map(name => p => { p.rules[0].parameters.required_status_checks = p.rules[0].parameters.required_status_checks.filter(check => check.context !== name); }),
    p => { p.rules[3].parameters.required_approving_review_count = 1; },
    p => { delete p.rules[3].parameters.required_approving_review_count; },
    p => { p.rules[3].parameters.required_approving_review_count = '0'; },
  ];
  for (const mutate of mutations) {
    const value = ruleset(); mutate(value);
    const done = mock(ruleReads(value));
    await assert.rejects(assertProtection('main')); done();
  }
  const empty = ruleset(); empty.rules = [];
  let done = mock(ruleReads(empty));
  const absent = await readProtection('main');
  assert.equal(absent.required_status_checks.strict, false);
  assert.equal(absent.enforce_admins.enabled, false);
  assert.equal(absent.allow_force_pushes.enabled, true);
  assert.equal(absent.allow_deletions.enabled, true);
  assert.equal(absent.required_pull_request_reviews, null); done();
  done = mock(ruleReads(empty)); await assert.rejects(assertProtection('main'), /protection is missing/); done();
});

test('universal checks must be pinned to the verified GitHub Actions integration', async () => {
  for (const context of REQUIRED_SECURITY_CHECKS) {
    for (const integration of [undefined, null, -1, 0, 123, '15368']) {
      const value = ruleset();
      const check = value.rules[0].parameters.required_status_checks.find(check => check.context === context);
      if (integration === undefined) delete check.integration_id;
      else check.integration_id = integration;
      const done = mock(ruleReads(value));
      await assert.rejects(assertProtection('main'), /protection is missing/); done();
    }
  }
});

test('missing bypass visibility and every actor type or bypass mode fail closed', async () => {
  for (const bypass of [undefined, null, {}, 'none', ...['OrganizationAdmin', 'RepositoryRole', 'Integration', 'User', 'Team', 'DeployKey']
    .flatMap(actor_type => ['always', 'pull_request', 'exempt'].map(bypass_mode => [{ actor_type, actor_id: 1, bypass_mode }]))]) {
    const value = ruleset();
    if (bypass === undefined) delete value.bypass_actors;
    else value.bypass_actors = bypass;
    const done = mock(ruleReads(value));
    await assert.rejects(assertProtection('main'), /bypass actors/); done();
  }
});

test('disabled, evaluate, foreign, tag and unscoped rulesets cannot forge effective protection', async () => {
  const mutations = [p => { p.enforcement = 'disabled'; }, p => { p.enforcement = 'evaluate'; },
    p => { delete p.enforcement; }, p => { p.target = 'tag'; }, p => { p.target = 'push'; },
    p => { p.id++; }, p => { p.source = 'evil/repo'; }, p => { p.source_type = 'Organization'; },
    p => { delete p.conditions; }, p => { p.conditions.ref_name.include = ['refs/heads/updates']; },
    p => { p.conditions.ref_name.include = ['~DEFAULT_BRANCH']; },
    p => { p.conditions.ref_name.include = ['refs/heads/*']; },
    p => { p.conditions.ref_name.exclude = ['refs/heads/main']; },
    p => { p.conditions.ref_name.exclude = ['refs/heads/*']; },
    p => { delete p.conditions.ref_name.exclude; }, p => { delete p.rules; }];
  for (const mutate of mutations) {
    const steps = ruleReads(); mutate(steps[1].response);
    const done = mock(steps);
    await assert.rejects(readProtection('main'), /ruleset scope/); done();
  }
  const value = ruleset(); value.conditions.ref_name.include = ['~ALL'];
  const done = mock(ruleReads(value)); await assertProtection('main'); done();
});

test('effective provenance is checked before following any ruleset identifier', async () => {
  for (const mutate of [r => { r.ruleset_id = '../42'; }, r => { r.ruleset_id = 0; }, r => { r.ruleset_id = 1.5; },
    r => { delete r.ruleset_id; }, r => { r.ruleset_source_type = 'Organization'; },
    r => { r.ruleset_source = 'evil/repo'; }, r => { delete r.ruleset_source; }]) {
    const effective = effectiveRules(ruleset()); mutate(effective[0]);
    const done = mock([{ path: '/rules/branches/main?per_page=100&page=1', response: effective }]);
    await assert.rejects(readProtection('main'), /ruleset source/); done();
  }
});

test('ruleset definitions must match the effective rules, and cannot supply absent effective rules', async () => {
  for (const mutate of [p => { p.rules[0].parameters.strict_required_status_checks_policy = false; },
    p => { p.rules[0].parameters.required_status_checks[0].integration_id = 123; },
    p => { p.rules.shift(); }, p => { p.rules.push(structuredClone(p.rules[0])); }]) {
    const steps = ruleReads(); mutate(steps[1].response);
    const done = mock(steps);
    await assert.rejects(readProtection('main'), /differs from ruleset/); done();
  }
  const steps = ruleReads(); steps[0].response = steps[0].response.filter(rule => rule.type !== 'deletion');
  const done = mock(steps); await assert.rejects(assertProtection('main'), /protection is missing/); done();
});

test('effective rules can combine multiple verified rulesets but one bypass invalidates the result', async () => {
  for (const bypass of [false, true]) {
    const first = ruleset(), second = ruleset(); second.id = 43;
    second.rules = first.rules.splice(2);
    if (bypass) second.bypass_actors = [{ actor_type: 'Integration', actor_id: 15368, bypass_mode: 'always' }];
    const done = mock([{ path: '/rules/branches/main?per_page=100&page=1', response: [...effectiveRules(first), ...effectiveRules(second)] },
      { path: '/rulesets/42', response: first }, { path: '/rulesets/43', response: second }]);
    if (bypass) await assert.rejects(assertProtection('main'), /bypass actors/);
    else assert.deepEqual(await assertProtection('main'), protection());
    done();
  }
});

test('effective rule pagination is complete, bounded and rejects malformed lists', async () => {
  const value = ruleset();
  const effective = effectiveRules(value);
  const fillers = Array.from({ length: 99 }, () => ({ type: 'commit_message_pattern' }));
  let done = mock([{ path: '/rules/branches/main?per_page=100&page=1', response: [...fillers, effective[0]] },
    { path: '/rules/branches/main?per_page=100&page=2', response: effective.slice(1) }, { path: '/rulesets/42', response: value }]);
  assert.deepEqual(await assertProtection('main'), protection()); done();
  for (const response of [null, {}, { rules: effective }, Array(101).fill({})]) {
    done = mock([{ path: '/rules/branches/main?per_page=100&page=1', response }]);
    await assert.rejects(readProtection('main'), /Invalid effective/); done();
  }
  done = mock(Array.from({ length: 10 }, (_, index) => ({ path: `/rules/branches/main?per_page=100&page=${index + 1}`, response: Array(100).fill({}) })));
  await assert.rejects(readProtection('main'), /Incomplete effective/); done();
});

test('merge preserves expected head guard and checks enforced protection before writing', async () => {
  const done = mock([{ path: '/pulls/7', response: pr() }, { path: '/git/ref/heads/main', response: { object: { sha: BASE } } },
    ...ruleReads(),
    { path: '/pulls/7/merge', method: 'PUT', body: { sha: HEAD, merge_method: 'merge' }, response: { merged: true, sha: MERGE } }]);
  assert.equal(await mergePR(7, HEAD, BASE), MERGE); done();
});

test('merge blocks stale, foreign, closed and draft PRs without writing or approving reviews', async () => {
  for (const mutate of [p => { p.head.sha = MERGE; }, p => { p.base.sha = MERGE; }, p => { p.state = 'closed'; },
    p => { p.head.repo.full_name = 'evil/repo'; }, p => { p.base.repo.full_name = 'evil/repo'; }, p => { p.draft = true; }]) {
    const value = pr(); mutate(value); const done = mock([{ path: '/pulls/7', response: value }]);
    await assert.rejects(mergePR(7, HEAD, BASE), /PR changed/); done();
  }
  const done = mock([{ path: '/pulls/7', response: pr() }, { path: '/git/ref/heads/main', response: { object: { sha: MERGE } } }]);
  await assert.rejects(mergePR(7, HEAD, BASE), /Base branch changed/); done();
});

test('merge fails closed without protection and respects a strict server rejection after a base race', async () => {
  let done = mock([{ path: '/pulls/7', response: pr() }, { path: '/git/ref/heads/main', response: { object: { sha: BASE } } },
    { path: '/rules/branches/main?per_page=100&page=1', response: {}, status: 404 }]);
  await assert.rejects(mergePR(7, HEAD, BASE), /404/); done();
  // Both reads can pass before a concurrent base advance. The server is the
  // authority: strict protection rejects the now-behind PR at merge time.
  done = mock([{ path: '/pulls/7', response: pr() }, { path: '/git/ref/heads/main', response: { object: { sha: BASE } } },
    ...ruleReads(),
    { path: '/pulls/7/merge', method: 'PUT', response: { message: 'Base branch was modified. Review and try the merge again.' }, status: 405 }]);
  await assert.rejects(mergePR(7, HEAD, BASE), /405/); done();
});

test('merge never writes when bypass visibility or effective rules are unavailable, including updates', async () => {
  for (const branch of ['main', 'updates']) {
    for (const failure of ['empty', 'hidden-bypass', 'api-denied']) {
      const value = pr(); value.base.ref = branch;
      const settings = ruleset(branch);
      if (failure === 'hidden-bypass') delete settings.bypass_actors;
      const reads = failure === 'empty' ? [{ path: `/rules/branches/${branch}?per_page=100&page=1`, response: [] }] : ruleReads(settings, branch);
      if (failure === 'api-denied') { reads[1].status = 403; reads[1].response = {}; }
      const done = mock([{ path: '/pulls/7', response: value },
        { path: `/git/ref/heads/${branch}`, response: { object: { sha: BASE } } }, ...reads]);
      await assert.rejects(mergePR(7, HEAD, BASE)); done();
    }
  }
});
