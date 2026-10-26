import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as dependencies from './dependencies.mjs';
import { createController, CHECK_CONTEXTS, validateMainProtection, reviewBrowserImages, auditEvidence } from './controller.mjs';

// All fixtures are synthetic. No git, processes, real network, deployment or
// candidate code execution is used. Keep the real deterministic policy gates.
const now = Date.parse('2026-10-26T12:00:00Z');
const iso = new Date(now).toISOString();
const baseSHA = 'a'.repeat(40), unrelatedSHA = 'b'.repeat(40);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
const runtime = { nodeVersion: '24.22.1', npmVersion: '11.6.0', supportedLtsMajors: [24],
  semver: dependencies.loadNpmSemver(resolve(dirname(process.execPath), '../lib/node_modules/npm')) };
const entry = (name, version) => ({ version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, integrity });
const manifest = { name: 'synthetic-app', version: '0.0.0', dependencies: { synthetic: '1.0.0' }, devDependencies: {},
  scripts: { lint: 'eslint .', build: 'vite build' }, engines: { node: '>=24.22.1 <25' } };
function lockFor(manifest, version = manifest.dependencies.synthetic, helper = '1.0.0') {
  const root = Object.fromEntries(['name', 'version', 'dependencies', 'devDependencies', 'engines'].map(key => [key, structuredClone(manifest[key])]));
  return { name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
    packages: { '': root, 'node_modules/synthetic': entry('synthetic', version), 'node_modules/helper': entry('helper', helper) } };
}
function registry(name, versions = { '1.0.0': 30, '2.0.0': 8 }) {
  return { name, time: Object.fromEntries(Object.entries(versions).map(([version, days]) => [version, new Date(now - days * 86400000).toISOString()])),
    versions: Object.fromEntries(Object.keys(versions).map(version => [version, { name, version, dist: { tarball: entry(name, version).resolved, integrity } }])) };
}
function protection() {
  return { required_status_checks: { strict: true, contexts: [...CHECK_CONTEXTS] }, enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false } };
}
function audit(lock) {
  return { exitCode: 0, report: { auditReportVersion: 2, vulnerabilities: {}, metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
    dependencies: { prod: 2, dev: 0, optional: 0, peer: 0, peerOptional: 0, total: Object.keys(lock.packages).length - 1 },
  } } };
}
const routes = ['/', '/news', '/anmeldung', '/chronik', '/impressum', '/datenschutz', '/anfahrt/solarcity', '/anfahrt/auhof'];
const variants = [360, 768, 1280].flatMap(width => ['de', 'en'].flatMap(lang => ['light', 'dark'].map(theme => `${width}-${lang}-${theme}`)));
function site(label) {
  return { variants: variants.map(key => ({ key, functional: { passed: true }, routes: routes.map((path, index) =>
    ({ path, screenshot: `${label}/${key}-${index}.png` })) })), pdfs: ['de', 'en'].map(lang => ({ file: `${label}/${lang}.pdf` })) };
}
function captureResult() {
  const baseline = site('baseline'), files = new Map(), artifacts = {};
  for (const path of ['teams-fixture.json', ...baseline.pdfs.map(pdf => pdf.file), ...baseline.variants.flatMap(v => v.routes.map(r => r.screenshot))]) {
    const bytes = path.endsWith('.png') ? png : Buffer.from('{}');
    files.set(`qa/${path}`, bytes); artifacts[path] = hash(bytes);
  }
  const qa = { schema: 1, pass: true, captureOnly: true, baseline, artifacts, metadata: { synthetic: 'pinned-harness' }, checks: [], errors: [] };
  files.set('qa/result.json', Buffer.from(JSON.stringify(qa)));
  return { qa, files };
}
function comparisonResult(capture, { regression = false, substitution = false } = {}) {
  const candidate = site('candidate'), artifacts = {}, files = new Map();
  for (const path of candidate.variants.flatMap(v => v.routes.map(r => r.screenshot))) {
    files.set(`qa/${path}`, png); artifacts[path] = hash(png);
  }
  const qa = { schema: 1, pass: !regression, captureOnly: false, candidate, baseline: capture.qa.baseline,
    baselineManifestSha256: substitution ? '0'.repeat(64) : hash(capture.files.get('qa/result.json')),
    artifacts, metadata: capture.qa.metadata, checks: [{ name: '360-de-light / pixels', pass: !regression }],
    errors: regression ? [{ check: '360-de-light / pixels', changed: 10 }] : [] };
  files.set('qa/result.json', Buffer.from(JSON.stringify(qa)));
  return { qa, files };
}

function harness(options = {}) {
  const calls = [], evidence = [], issues = [], statuses = [], commits = new Map();
  const initialFiles = new Map([['package.json', JSON.stringify(manifest)], ['package-lock.json', JSON.stringify(lockFor(manifest))],
    ['.nvmrc', '24.22.1\n'], ['src/app.ts', 'export const value = 1;\n']]);
  commits.set(baseSHA, { files: initialFiles, parents: [] });
  commits.set(unrelatedSHA, { files: initialFiles, parents: [] });
  const refs = { main: baseSHA, updates: options.unrelatedUpdates ? unrelatedSHA : baseSHA };
  let count = 10, runId = 100, capture, clockNow = now;
  const records = options.records ?? { synthetic: registry('synthetic'), helper: registry('helper', { '1.0.0': 30 }) };
  function ancestor(a, b) { return a === b || (commits.get(b)?.parents ?? []).some(parent => ancestor(a, parent)); }
  function commit(parent, files, extra = {}) {
    const sha = (count++).toString(16).padStart(40, '0');
    commits.set(sha, { files: new Map([...commits.get(parent).files, ...files.map(file => [file.path, file.content])]), parents: [parent], ...extra });
    return sha;
  }
  const gh = {
    repository: 'owner/repo', ref: async branch => refs[branch], file: async (path, sha) => commits.get(sha).files.get(path),
    commitFiles: async (parent, files) => { calls.push('commit'); return commit(parent, files); },
    createBranch: async (branch, sha) => { calls.push('branch'); refs[branch] = sha; },
    fastForward: async (branch, expected, target) => {
      calls.push(`ff:${branch}`);
      assert.equal(refs[branch], expected); assert(ancestor(expected, target)); refs[branch] = target;
    },
    changes: async (base, head) => [...commits.get(head).files].filter(([path, content]) => commits.get(base).files.get(path) !== content)
      .map(([filename]) => ({ filename, status: 'modified', additions: options.largeRepair && filename.startsWith('src/') ? 121 : 1, deletions: 1 })),
    repoApi: async (path, opts) => {
      if (path === '/branches/main/protection') {
        const p = options.protection ?? protection();
        if (options.standardRequiredChecks) p.required_status_checks.contexts.push(...options.standardRequiredChecks);
        return p;
      }
      if (/^\/actions\/workflows\/(?:automation-checks|pr-review)\.yml\/dispatches$/.test(path)) {
        assert.equal(opts.method, 'POST'); calls.push(`dispatch:${path.split('/')[3]}`);
        if (options.dispatchFailure) throw Error('Workflow dispatch denied');
        if (options.expireDuringChecks) clockNow = now + 25 * 3600000;
        return null;
      }
      if (path.includes('/check-runs?')) {
        const sha = path.split('/')[2];
        const check_runs = (options.standardRequiredChecks ?? []).map(name => ({ name, head_sha: sha, app: { id: 15368 },
          status: 'completed', conclusion: options.requiredCheckFailure ? 'failure' : 'success' }));
        return { total_count: check_runs.length, check_runs };
      }
      if (/\/commits\/[a-f0-9]+\/status\?/.test(path)) return { statuses: [...statuses].reverse().filter((status, index, all) =>
        all.findIndex(item => item.context === status.context) === index).map(status => ({ context: status.context, state: status.success ? 'success' : 'failure', creator: { login: 'github-actions[bot]' } })) };
      if (path.startsWith('/git/commits/')) return { tree: { sha: path.split('/').at(-1) } };
      if (path.startsWith('/git/trees/')) {
        const sha = path.split('/').at(-1).split('?')[0];
        return { truncated: false, tree: [...commits.get(sha).files.keys()].map(path => ({ path, type: 'blob', mode: options.symlink && path === options.symlink ? '120000' : '100644' })) };
      }
      if (path.startsWith('/compare/')) {
        if (opts?.accept) return 'diff --git a/package.json b/package.json\n+ synthetic dependency upgrade';
        const [base, head] = path.slice('/compare/'.length).split('...');
        return { status: base === head ? 'identical' : ancestor(base, head) ? 'ahead' : 'diverged' };
      }
      if (path === '/pulls/1') return { number: 1, state: 'open', head: { ref: options.ordinaryPR ? 'feature/ordinary' : 'updates', sha: refs.updates, repo: { full_name: 'owner/repo' } },
        base: { ref: 'main', sha: refs.main } };
      if (path === '/git/commits' && opts?.method === 'POST') {
        const sha = commit(opts.body.parents[0], [...commits.get(opts.body.tree).files].map(([path, content]) => ({ path, content })));
        return { sha };
      }
      throw Error(`Unexpected fake GitHub path ${path}`);
    },
    openPR: async () => { calls.push('openPR'); return { number: 1 }; },
    mergePR: async (number, head, base) => {
      calls.push('mergePR'); assert.equal(number, 1); assert.equal(refs.main, base); assert.equal(refs.updates, head);
      if (options.mergeRace) { refs.main = commit(base, [{ path: 'src/unrelated.ts', content: 'unrelated' }]); throw Error('Strict protection rejected stale base'); }
      const merged = commit(head, [], { parents: [base, head] }); refs.main = merged; return merged;
    },
    setStatus: async (sha, context, success) => { statuses.push({ sha, context, success }); },
    ensureLabels: async () => {}, issue: async (...args) => { issues.push(args); },
  };
  let reviews = 0, validations = 0, researchCalls = 0;
  const ai = {
    preflight: async () => ({ pass: !options.preflightFailure }),
    researchPackages: async input => {
      researchCalls++; calls.push(`research:${input.packages.map(p => `${p.name}@${p.version}`).join(',')}`);
      if (options.researchFailure) throw Error('synthetic research transport failure');
      if (options.transitiveResearchFailure && input.packages.some(p => p.name === 'helper')) throw Error('Transitive research failed');
      return { ...input, pass: true, timestamp: options.staleResearch ? new Date(now - 25 * 3600000).toISOString() : iso, packages: input.packages };
    },
    reviewPullRequest: async input => {
      calls.push('review'); reviews++;
      const fail = options.reviewFailure && !input.context.stage;
      return { pass: !fail, baseSHA: input.baseSHA, headSHA: input.headSHA, provenance: { timestamp: iso }, findings: fail ?
        [{ path: 'src/app.ts', severity: 'high', message: 'compatibility defect', evidence: ['synthetic code finding'] }] : [] };
    },
    proposeRepairs: async ({ files }) => { calls.push('builder'); return options.badRepair ? [{ path: '.github/workflows/pwn.yml', content: 'pwn' }] :
      files.map(file => ({ ...file, content: `${file.content}\nexport const repair${reviews} = true;` })); },
    reviewVisualEvidence: async input => {
      calls.push('vision'); assert(input.images.length > 0 && input.images.length <= 12); assert(input.images.every(image => image.startsWith('data:image/png;base64,')));
      return { pass: !options.visionFailure && !options.postRegression, imageIndexes: input.images.map((_, i) => i), findings: options.postRegression ?
        [{ severity: 'high', message: 'Candidate screenshot visibly clips navigation', evidence: ['Image 1, mobile viewport'] }] : [] };
    },
  };
  const vercel = {
    preflight: async () => ({ projectId: 'prj_synthetic', updatesHostname: 'updates.dev.bsc70linz.at', productionHostname: 'www.bsc70linz.at' }),
    getProductionDeployment: async () => ({ id: 'dpl_old', sha: baseSHA, branch: 'main', projectId: 'prj_synthetic', url: 'https://old.vercel.app' }),
    verifyAlias: async () => { calls.push('alias'); }, verifyRuntime: async () => {},
    waitForDeployment: async ({ sha, branch }) => {
      calls.push(`deploy:${branch}`);
      if (options.postInfrastructureFailure && branch === 'main') throw Error('Deployment API unavailable');
      return { id: `dpl_${branch}`, sha, branch, readyState: 'READY', projectId: 'prj_synthetic', url: `https://${branch}.vercel.app` };
    },
    rollback: async () => { calls.push('rollback'); return { verified: true }; },
  };
  const dep = { ...dependencies,
    fetchRegistryMetadata: async names => Object.fromEntries(names.map(name => [name, records[name]])),
    queryOsvLockfile: async lock => typeof options.osv === 'function' ? options.osv(lock) : options.osv ?? [],
    fetchOsvAdvisory: async id => options.advisories[id],
  };
  async function worker(input) {
    calls.push(`worker:${input.phase}`);
    if (input.phase === 'resolve' && options.expectUrgent !== undefined) assert.equal(input.urgent, options.expectUrgent);
    const result = { ...input, request: 'synthetic', runId: runId++, artifactId: runId + 100, completedAt: iso, pass: true, nodeVersion: 'v24.22.1', files: new Map() };
    const currentManifest = JSON.parse(commits.get(input.headSHA).files.get('package.json'));
    const lock = input.phase === 'inspect' ? lockFor(manifest) : lockFor(currentManifest, currentManifest.dependencies.synthetic, options.helperTarget ?? (options.youngTransitive ? '1.0.1' : '1.0.0'));
    result.audit = audit(lock); result.auditProduction = audit(lock);
    if (input.phase === 'resolve') {
      result.files.set('worker.json', Buffer.from(JSON.stringify({ ...input, files: [{ path: 'package-lock.json', content: JSON.stringify(lock) }] })));
      if (options.mainAdvance) refs.main = commit(baseSHA, [{ path: 'src/unrelated.ts', content: 'unrelated update' }]);
    }
    if (input.phase === 'validate') {
      validations++;
      result.pass = !options.validationFailure && !(options.repairOnce && validations === 1);
      result.checks = ['install', 'tree', 'lint', 'build'].map(name => ({ name, pass: true, exitCode: 0 }));
      result.files.set('build.log', Buffer.from('src/app.ts(1,1): compatibility error'));
      if (options.badAudit) result.auditProduction = { exitCode: 2, report: {} };
    }
    if (input.phase === 'capture') { capture = captureResult(); Object.assign(result, capture); }
    if (input.phase === 'browser') {
      const post = input.headSHA === refs.main;
      const comparison = comparisonResult(capture, { regression: post && options.postRegression, substitution: options.baselineSubstitution });
      Object.assign(result, comparison); result.pass = comparison.qa.pass;
      // Only production vision is negative for the regression fixture.
      if (!post && options.postRegression) ai.reviewVisualEvidence = async input => {
        calls.push('vision');
        return { pass: true, imageIndexes: input.images.map((_, i) => i), findings: [] };
      };
      if (post && options.postRegression) ai.reviewVisualEvidence = async input => {
        calls.push('vision'); return { pass: false, imageIndexes: input.images.map((_, i) => i),
          findings: [{ severity: 'high', message: 'Navigation clipped', evidence: ['Image 1 mobile'] }] };
      };
    }
    if (options.wrongWorkerHead && input.phase === 'validate') result.headSHA = unrelatedSHA;
    if (options.wrongRuntime && input.phase === 'validate') result.nodeVersion = 'v24.22.0';
    if (options.failedCapture && input.phase === 'capture') result.pass = false;
    return result;
  }
  if (options.standardRequiredChecks) {
    gh.REQUIRED_SECURITY_CHECKS = options.standardRequiredChecks;
    gh.assertProtection = async () => { calls.push('assertProtection'); return gh.repoApi('/branches/main/protection'); };
  }
  const controller = createController({ gh, ai, dep, vercel, worker, now: () => clockNow, toolchain: async () => runtime, sleep: async () => {},
    env: { GITHUB_RUN_ID: 'synthetic-run', AI_API_KEY: 'private-test-value' },
    nonce: () => 'synthetic-run', persist: async (name, value) => evidence.push({ name, value }) });
  return { controller, calls, refs, commits, evidence, issues, statuses, ai, worker, gh, get researchCalls() { return researchCalls; } };
}

test('protection fails closed for missing strict checks, admin bypass and force push', () => {
  assert.equal(validateMainProtection(protection()), true);
  for (const change of [p => { p.required_status_checks.strict = false; }, p => { p.enforce_admins.enabled = false; },
    p => { p.required_status_checks.contexts.pop(); }, p => { p.allow_force_pushes.enabled = true; },
    p => { p.required_pull_request_reviews = { bypass_pull_request_allowances: { users: ['admin'], teams: [], apps: [] } }; }]) {
    const p = protection(); change(p); assert.equal(validateMainProtection(p), false);
  }
  assert.equal(validateMainProtection(null), false);
});

test('preflight performs no candidate execution or branch writes', async () => {
  const h = harness(); const result = await h.controller.run('preflight');
  assert.equal(result.outcome, 'preflight-passed');
  assert.equal(h.calls.some(call => call.startsWith('worker:') || call.startsWith('ff:') || call === 'commit'), false);
});

test('happy path researches before resolution, reviews before execution and promotes exact SHAs', async () => {
  const h = harness(); const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', JSON.stringify(result));
  assert(h.calls.indexOf('research:synthetic@2.0.0') < h.calls.indexOf('worker:resolve'));
  assert(h.calls.indexOf('review') < h.calls.indexOf('worker:validate'));
  assert(h.calls.indexOf('worker:capture') < h.calls.indexOf('ff:updates'));
  assert(h.calls.indexOf('vision') < h.calls.indexOf('mergePR'));
  assert(h.calls.indexOf('worker:validate') < h.calls.indexOf('ff:updates'));
  assert.equal(h.refs.main, result.mergedSHA);
  assert(h.statuses.filter(s => s.success).every(s => CHECK_CONTEXTS.includes(s.context)));
  assert.equal(new Set(h.statuses.filter(s => s.success).map(s => s.context)).size, CHECK_CONTEXTS.length);
  assert.equal(h.calls.filter(call => call === 'worker:capture').length, 1);
});

test('no updates produces a harmless summary and never publishes', async () => {
  const h = harness({ records: { synthetic: registry('synthetic', { '1.0.0': 30, '2.0.0': 1 }), helper: registry('helper', { '1.0.0': 30 }) } });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'no-updates', JSON.stringify(result));
  assert.equal(h.refs.main, baseSHA); assert.equal(h.refs.updates, baseSHA);
  assert.equal(h.calls.includes('worker:validate'), false);
  assert.equal(h.calls.includes('openPR'), false);
});

test('missing live research cannot resolve, validate, publish or merge', async () => {
  const h = harness({ researchFailure: true }); const result = await h.controller.run();
  assert.equal(result.outcome, 'blocked'); assert.equal(h.issues.length, 1);
  assert.equal(h.calls.includes('worker:resolve'), false); assert.equal(h.calls.includes('worker:validate'), false);
  assert.equal(h.refs.updates, baseSHA); assert.equal(h.calls.includes('mergePR'), false);
});

test('an ordinary young transitive blocks before candidate code execution', async () => {
  const h = harness({ youngTransitive: true, records: { synthetic: registry('synthetic'), helper: registry('helper', { '1.0.0': 30, '1.0.1': 1 }) } });
  const result = await h.controller.run();
  assert.equal(result.reason, 'whole-lock-policy-blocked');
  assert.equal(h.calls.includes('worker:validate'), false); assert.equal(h.refs.updates, baseSHA);
});

test('unrelated updates are never overwritten or implicitly promoted', async () => {
  const h = harness({ unrelatedUpdates: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'updates-has-unpromoted-or-unrelated-work');
  assert.equal(h.refs.updates, unrelatedSHA); assert.equal(h.calls.includes('branch'), false);
});

test('main advancing blocks publication without erasing unrelated main work', async () => {
  const h = harness({ mainAdvance: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'main-advanced-restart-required');
  assert.notEqual(h.refs.main, baseSHA); assert.equal(h.refs.updates, baseSHA);
  assert.equal(h.calls.includes('mergePR'), false);
});

test('main racing at merge is rejected by strict protection; controller does not reset it', async () => {
  const h = harness({ mergeRace: true }); const result = await h.controller.run();
  assert.equal(result.outcome, 'blocked'); assert.notEqual(h.refs.main, baseSHA);
  assert.equal(h.calls.includes('rollback'), false);
  assert.equal(h.commits.get(h.refs.main).files.get('src/unrelated.ts'), 'unrelated');
});

test('ordinary PR identity cannot become an automatic merge target', async () => {
  const h = harness({ ordinaryPR: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'promotion-pr-identity-mismatch');
  assert.equal(h.calls.includes('mergePR'), false); assert.equal(h.refs.main, baseSHA);
});

test('both audits must parse successfully, even when worker pass is true', async () => {
  const h = harness({ badAudit: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'audit-production-blocked'); assert.equal(h.refs.updates, baseSHA);
  assert.throws(() => auditEvidence({ audit: audit(lockFor(manifest)), auditProduction: { exitCode: 2, report: {} } }, lockFor(manifest), { baseline: true }));
});

test('builder repairs stay bounded and receive fresh independent review before revalidation', async () => {
  const h = harness({ repairOnce: true }); const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', JSON.stringify(result));
  const builder = h.calls.indexOf('builder'), after = h.calls.slice(builder + 1);
  assert(after.indexOf('review') < after.indexOf('worker:validate'));
  assert.equal(h.calls.filter(call => call === 'builder').length, 1);
});

test('maximum three repairs; persistent failures never publish', async () => {
  const h = harness({ validationFailure: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'repair-limit-reached');
  assert.equal(h.calls.filter(call => call === 'builder').length, 3);
  assert.equal(h.calls.filter(call => call === 'worker:validate').length, 4);
  assert.equal(h.refs.updates, baseSHA);
});

test('builder cannot change workflows, and overlarge source changes fail before revalidation', async () => {
  for (const options of [{ repairOnce: true, badRepair: true }, { repairOnce: true, largeRepair: true }]) {
    const h = harness(options); const result = await h.controller.run();
    assert(['repair-proposal-out-of-scope', 'candidate-scope-blocked'].includes(result.reason), JSON.stringify(result));
    assert.equal(h.calls.filter(call => call === 'worker:validate').length, 1);
    assert.equal(h.refs.updates, baseSHA);
  }
});

test('symlink candidate files cannot pass trusted content inspection', async () => {
  const h = harness({ symlink: 'package.json' }); const result = await h.controller.run();
  assert.equal(result.reason, 'candidate-file-is-not-regular'); assert.equal(h.calls.includes('worker:validate'), false);
});

test('baseline substitution or negative vision blocks promotion', async () => {
  for (const options of [{ baselineSubstitution: true }, { visionFailure: true }]) {
    const h = harness(options); const result = await h.controller.run();
    assert.equal(result.outcome, 'blocked'); assert.equal(h.calls.includes('mergePR'), false);
    assert.equal(h.refs.main, baseSHA);
  }
});

test('postproduction infrastructure failure reports and blocks without rollback', async () => {
  const h = harness({ postInfrastructureFailure: true }); const result = await h.controller.run();
  assert.equal(result.outcome, 'blocked'); assert(h.calls.includes('mergePR'));
  assert.equal(h.calls.includes('rollback'), false); assert.equal(h.refs.main, result.mergedSHA);
});

test('confirmed production regression rolls back Vercel then safely restores only failed main', async () => {
  const h = harness({ postRegression: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'confirmed-regression-rolled-back', JSON.stringify(result));
  assert(h.calls.includes('rollback')); assert(h.calls.includes('ff:main'));
  assert.notEqual(h.refs.main, result.mergedSHA);
  assert.equal(h.commits.get(h.refs.main).files.get('package.json'), JSON.stringify(manifest));
});

test('vision consumes every real screenshot payload and rejects modified artifact bytes', async () => {
  const capture = { ...captureResult(), pass: true }, comparison = { ...comparisonResult(captureResult()), pass: true };
  let images = 0;
  const result = await reviewBrowserImages({ capture, comparison, baseSHA, headSHA: unrelatedSHA, deploymentId: 'dpl_test',
    ai: { reviewVisualEvidence: async input => { images += input.images.length; return { pass: true, findings: [] }; } } });
  assert.equal(result.pass, true); assert.equal(images, 192);
  comparison.files.set('qa/candidate/360-de-light-0.png', Buffer.from('tampered'));
  await assert.rejects(reviewBrowserImages({ capture, comparison, baseSHA, headSHA: unrelatedSHA, deploymentId: 'dpl_test' }), /qa-artifact-integrity-failed/);
});

test('controller source has no candidate process execution or dynamic imports', async () => {
  const source = await readFile(new URL('./controller.mjs', import.meta.url), 'utf8');
  assert.equal(/node:child_process|\bexecFile\b|\bspawn\(|\beval\(|\bimport\(/.test(source), false);
});

test('all changed transitives get exact live research before validation', async () => {
  const h = harness({ helperTarget: '2.0.0', records: { synthetic: registry('synthetic'), helper: registry('helper') } });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', JSON.stringify(result));
  assert(h.calls.findIndex(call => call.includes('helper@2.0.0')) < h.calls.indexOf('worker:validate'));
  const blocked = harness({ helperTarget: '2.0.0', transitiveResearchFailure: true,
    records: { synthetic: registry('synthetic'), helper: registry('helper') } });
  assert.equal((await blocked.controller.run()).outcome, 'blocked');
  assert.equal(blocked.calls.includes('worker:validate'), false);
  assert.equal(blocked.refs.updates, baseSHA);
});

test('exact transitive CVE fix enables lock-only urgent resolution but no batch waiver', async () => {
  const advisory = { id: 'CVE-2026-12345', modified: iso, affected: [{ package: { ecosystem: 'npm', name: 'helper' },
    ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] };
  const h = harness({ helperTarget: '1.0.1', expectUrgent: true,
    records: { synthetic: registry('synthetic', { '1.0.0': 30 }), helper: registry('helper', { '1.0.0': 30, '1.0.1': 1 }) },
    advisories: { [advisory.id]: advisory }, osv: lock => lock.packages['node_modules/helper'].version === '1.0.0' ?
      [{ name: 'helper', version: '1.0.0', advisories: [{ id: advisory.id }] }] : [] });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', JSON.stringify(result));
  assert(h.calls.indexOf('research:helper@1.0.1') < h.calls.indexOf('worker:resolve'));
  const proof = h.evidence.find(item => item.name.includes('lock-policy')).value.proofs;
  assert.deepEqual(proof, [{ path: 'node_modules/helper', fromPath: 'node_modules/helper', advisoryId: advisory.id }]);
});

test('ordinary resolution never enables a blanket urgent flag', async () => {
  const h = harness({ expectUrgent: false });
  assert.equal((await h.controller.run()).outcome, 'promoted');
});

test('worker identity, runtime and failed baseline capture all block before publishing updates', async () => {
  for (const options of [{ wrongWorkerHead: true }, { wrongRuntime: true }, { failedCapture: true }]) {
    const h = harness(options); const result = await h.controller.run();
    assert.equal(result.outcome, 'blocked'); assert.equal(h.refs.updates, baseSHA);
    assert.equal(h.calls.includes('mergePR'), false);
  }
});

test('stale research is rejected before resolution and cannot be refreshed by verdict creation', async () => {
  const h = harness({ staleResearch: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'live-package-research-stale');
  assert.equal(h.calls.includes('worker:resolve'), false);
  assert.equal(h.refs.updates, baseSHA);
});

test('required ordinary PR workflows are dispatched and verified through the ruleset adapter', async () => {
  const h = harness({ standardRequiredChecks: ['security/ai-review', 'Automation tests', 'Application lint, build and audit'] });
  assert.equal((await h.controller.run()).outcome, 'promoted');
  assert(h.calls.includes('assertProtection'));
  for (const workflow of ['automation-checks.yml', 'pr-review.yml']) assert(h.calls.indexOf(`dispatch:${workflow}`) < h.calls.indexOf('mergePR'));
});

test('required-check failures and dispatch denial never trigger merge or rollback', async () => {
  for (const options of [{ dispatchFailure: true }, { requiredCheckFailure: true,
    standardRequiredChecks: ['security/ai-review', 'Automation tests', 'Application lint, build and audit'] }]) {
    const h = harness(options); const result = await h.controller.run();
    assert.equal(result.outcome, 'blocked'); assert.equal(h.calls.includes('mergePR'), false);
    assert.equal(h.calls.includes('rollback'), false); assert.equal(h.refs.main, baseSHA);
  }
});

test('waiting for checks cannot freshen expired promotion evidence', async () => {
  const h = harness({ expireDuringChecks: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'promotion-evidence-expired-before-merge');
  assert.equal(h.calls.includes('mergePR'), false);
});
