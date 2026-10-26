import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as dependencies from './dependencies.mjs';
import * as maintenanceAdapter from './maintenance.mjs';
import { NODE_SECURITY_INDEX, NODE_SECURITY_FEED } from './toolchain-security.mjs';
import { createController, CHECK_CONTEXTS, validateMainProtection, reviewBrowserImages, auditEvidence, confirmRepeatedRegression, regressionSignals } from './controller.mjs';
import { reviewMarker, createReviewEvidence } from './review-evidence.mjs';
import { authorize as authorizeApplication, auditVerdict as applicationAuditVerdict } from './recovery-checks.mjs';

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
function baselineAudit(lock) {
  const result = audit(lock);
  result.exitCode = 1;
  result.report.vulnerabilities.synthetic = { name: 'synthetic', severity: 'low', isDirect: true,
    nodes: ['node_modules/synthetic'], via: ['synthetic-advisory'], fixAvailable: true };
  Object.assign(result.report.metadata.vulnerabilities, { low: 1, total: 1 });
  return result;
}
const routes = ['/', '/news', '/anmeldung', '/chronik', '/impressum', '/datenschutz', '/anfahrt/solarcity', '/anfahrt/auhof'];
const variants = [360, 768, 1280].flatMap(width => ['de', 'en'].flatMap(lang => ['light', 'dark'].map(theme => `${width}-${lang}-${theme}`)));
function site(label) {
  return { url: label === 'baseline' ? 'https://www.bsc70linz.at' : 'https://updates.dev.bsc70linz.at', runtime: [],
    completion: { pdfs: Object.fromEntries(['de', 'en'].map(lang => [lang, { attempted: true, retrieved: true, parsed: true, validated: true }])) },
    variants: variants.map(key => ({ key, functional: { passed: true }, routes: routes.map((path, index) =>
      ({ path, screenshot: `${label}/${key}-${index}.png` })) })),
    pdfs: ['de', 'en'].map(lang => ({ lang, file: `${label}/${lang}.pdf`, text: `Parsed ${lang} membership PDF`, bytes: 2 })) };
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
  for (const path of [...candidate.pdfs.map(pdf => pdf.file), ...candidate.variants.flatMap(v => v.routes.map(r => r.screenshot))]) {
    const bytes = path.endsWith('.png') ? png : Buffer.from('{}');
    files.set(`qa/${path}`, bytes); artifacts[path] = hash(bytes);
  }
  const qa = { schema: 1, pass: !regression, captureOnly: false, candidate, baseline: capture.qa.baseline,
    baselineManifestSha256: substitution ? '0'.repeat(64) : hash(capture.files.get('qa/result.json')),
    artifacts, metadata: capture.qa.metadata, checks: [{ name: '360-de-light / pixels', pass: !regression }],
    errors: regression ? [{ check: '360-de-light / pixels', changed: 10 }] : [] };
  files.set('qa/result.json', Buffer.from(JSON.stringify(qa)));
  return { qa, files };
}

function runtimeEvent(type, origin = 'https://www.bsc70linz.at', path = '/assets/secondary-feature.js') {
  const source = `${origin}${path}`;
  return type === 'http' ? { phase: '360-de-light/functional', type, status: 404, url: source, frameURL: `${origin}/news`, resourceType: 'script' } :
    { phase: '360-de-light/functional', type: 'pageerror', message: 'secondaryFeature is not defined',
      stack: `ReferenceError: secondaryFeature is not defined\n    at feature (${source}:21:7)`, scriptURL: source, line: 21, column: 7,
      url: `${origin}/news` };
}

// Primary upstream metadata and search provenance are synthetic, but the real
// maintenance planner and independent byte validators run in every fixture.
function maintenanceInput(options = {}) {
  const node = options.maintenance && !options.actionOnly ? '24.22.2' : '24.22.1';
  const tag = options.maintenance && !options.nodeOnly ? 'v6.0.1' : 'v6.0.0';
  const sha = tag === 'v6.0.0' ? 'c'.repeat(40) : 'd'.repeat(40);
  const old = new Date(now - (options.youngMaintenance ? 1 : 8) * 86400000).toISOString();
  const targets = [{ kind: 'node', name: 'node', version: node }, { kind: 'action', name: 'actions/checkout', version: tag }];
  const input = {
    metadata: { fetchedAt: options.staleMaintenance ? new Date(now - 25 * 3600000).toISOString() : iso,
      nodeIndex: [{ version: `v${node}`, date: old, lts: 'Krypton' }],
      shasums: `${'a'.repeat(64)}  node-v${node}-linux-x64.tar.gz\n`, shasumsSignature: 'signed fixture',
      actionReleases: { 'actions/checkout': [{ tag_name: tag, published_at: old, prerelease: false, draft: false,
        repository: { full_name: 'actions/checkout' }, ref: { object: { type: 'commit', sha } } }] },
      actionCommits: { 'actions/checkout': sha } },
    researchresults: { researchedAt: iso, results: targets.map(target => {
      const source = target.kind === 'node' ? 'https://nodejs.org/en/blog/vulnerability/security' : 'https://github.com/actions/checkout/security/advisories';
      return { target, pass: true, findings: [], evidence: [source], security: { status: 'clear', advisories: [] },
        provenance: { timestamp: iso, searches: [{ queries: [`${target.name} ${target.version} official security`], sources: [source] }] } };
    }) },
  };
  if (options.extraYoungMaintenance) {
    input.metadata.nodeIndex.push({ version: 'v24.22.3', date: new Date(now - 3600000).toISOString(), lts: 'Krypton' });
    input.metadata.actionReleases['actions/checkout'].push({ tag_name: 'v6.0.2', published_at: new Date(now - 3600000).toISOString(),
      prerelease: false, draft: false, repository: { full_name: 'actions/checkout' },
      ref: { object: { type: 'commit', sha: 'e'.repeat(40) } } });
  }
  return input;
}

// Synthetic primary HTTPS responses go through the production fetch adapter;
// neither fixture objects nor serialized independent:true fields are authority.
function primarySecurityFixture(options, calls) {
  return async url => {
    calls.push(url);
    if (options.primaryUnavailable) throw Error('Synthetic primary source unavailable');
    const withdrawn = options.withdrawToolchainCve;
    let body;
    if (url === NODE_SECURITY_INDEX) body = options.urgentNode && !withdrawn ? {
      1: { cve: ['CVE-2099-123456'], vulnerable: '24.x', patched: '^24.22.2',
        ref: 'https://nodejs.org/en/blog/vulnerability/synthetic-security' },
    } : {};
    else if (url === NODE_SECURITY_FEED) body = '<rss><channel></channel></rss>';
    else if (url === 'https://api.github.com/repos/actions/checkout/security-advisories?state=published&per_page=100&page=1') {
      body = options.urgentAction && !withdrawn ? [{
        ghsa_id: 'GHSA-2345-2345-2345', cve_id: 'CVE-2099-123457', state: 'published', withdrawn_at: null,
        url: 'https://api.github.com/repos/actions/checkout/security-advisories/GHSA-2345-2345-2345',
        identifiers: [{ type: 'CVE', value: 'CVE-2099-123457' }],
        vulnerabilities: [{ package: { ecosystem: 'actions', name: 'actions/checkout' },
          vulnerable_version_range: '>= 6.0.0, < 6.0.1', patched_versions: '6.0.1' }],
      }] : [];
    } else if (url === 'https://api.github.com/repos/actions/checkout/git/ref/tags/v6.0.0') {
      body = { object: { type: 'commit', sha: 'c'.repeat(40) } };
    }
    assert.notEqual(body, undefined, `Unexpected primary fixture request: ${url}`);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  };
}

// Apply only maintenance's real trusted-minimum substitution to the production
// modules in memory, so controller restore tests exercise the promoted parser.
const applicationHarnesses = new Map();
async function applicationHarness(version) {
  if (!applicationHarnesses.has(version)) applicationHarnesses.set(version, (async () => {
    const source = await readFile(new URL('./dependency-sandbox.mjs', import.meta.url), 'utf8');
    const pin = "export const NODE_VERSION = '24.22.1';";
    assert.equal(source.split(pin).length, 2);
    const url = 'data:text/javascript;base64,' + Buffer.from(source.replace(pin, `export const NODE_VERSION = '${version}';`)).toString('base64');
    const recoverySource = (await readFile(new URL('./recovery-checks.mjs', import.meta.url), 'utf8'))
      .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${path === './dependency-sandbox.mjs' ? url : new URL(path, import.meta.url).href}'`);
    return { sandbox: await import(url), recovery: await import('data:text/javascript;base64,' + Buffer.from(recoverySource).toString('base64')) };
  })());
  return applicationHarnesses.get(version);
}

function harness(options = {}) {
  const calls = [], evidence = [], issues = [], statuses = [], commits = new Map();
  const primaryCalls = [], proofInputs = [];
  const fetchPrimary = primarySecurityFixture(options, primaryCalls);
  const workerInputs = [], reviewInputs = [];
  const prs = new Map(), remote = new Map(), workflowRuns = new Map(), remoteArtifacts = new Map();
  const initialFiles = new Map([['package.json', JSON.stringify(manifest)], ['package-lock.json', JSON.stringify(lockFor(manifest))],
    ['.nvmrc', '24.22.1\n'], ['.github/qa/.nvmrc', '24.22.1\n'],
    ['.github/automation/dependency-sandbox.mjs', "export const NODE_VERSION = '24.22.1';\n"],
    ['.github/workflows/fixture.yml', `name: fixture\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@${'c'.repeat(40)} # v6.0.0\n`],
    ['src/app.ts', 'export const value = 1;\n']]);
  commits.set(baseSHA, { files: initialFiles, parents: [], treeSHA: baseSHA });
  commits.set(unrelatedSHA, { files: initialFiles, parents: [], treeSHA: unrelatedSHA });
  const refs = { main: baseSHA, updates: options.unrelatedUpdates ? unrelatedSHA : baseSHA };
  let count = 10, runId = 100, capture, clockNow = now, activeRunId = '900', activeControlSHA = baseSHA, rolledBack = false;
  const records = options.records ?? { synthetic: registry('synthetic'), helper: registry('helper', { '1.0.0': 30 }) };
  function ancestor(a, b) { return a === b || (commits.get(b)?.parents ?? []).some(parent => ancestor(a, parent)); }
  function commit(parent, files, extra = {}) {
    const sha = (count++).toString(16).padStart(40, '0');
    commits.set(sha, { files: new Map([...commits.get(parent).files, ...files.map(file => [file.path, file.content])]), parents: [parent], treeSHA: sha, ...extra });
    return sha;
  }
  const gh = {
    repository: 'owner/repo', ref: async branch => refs[branch], file: async (path, sha) => commits.get(sha).files.get(path),
    api: async path => {
      const tree = /^\/repos\/owner\/repo\/git\/trees\/([a-f0-9]{40})$/.exec(path);
      if (tree) return { sha: tree[1], truncated: false, tree: [{ path: '.nvmrc', type: 'blob', mode: '100644', sha: tree[1] }] };
      const blob = /^\/repos\/owner\/repo\/git\/blobs\/([a-f0-9]{40})$/.exec(path);
      if (blob) {
        const bytes = Buffer.from(commits.get(blob[1]).files.get('.nvmrc'));
        return { sha: blob[1], encoding: 'base64', size: bytes.length, content: bytes.toString('base64') };
      }
      throw Error(`Unexpected fake GitHub API ${path}`);
    },
    commitFiles: async (parent, files) => {
      calls.push('commit');
      if (options.tamperMaintenance && files.some(file => file.path === '.nvmrc' || file.path.endsWith('fixture.yml'))) {
        files = structuredClone(files);
        const path = options.tamperMaintenance;
        const file = files.find(file => file.path === path);
        if (file) file.content += '\n# unplanned edit\n';
        else files.push({ path, content: (commits.get(parent).files.get(path) ?? '') + '\n// extra edit\n' });
      }
      return commit(parent, files);
    },
    createBranch: async (branch, sha) => { calls.push('branch'); refs[branch] = sha; },
    fastForward: async (branch, expected, target) => {
      calls.push(`ff:${branch}`);
      assert.equal(refs[branch], expected); assert(ancestor(expected, target)); refs[branch] = target;
    },
    changes: async (base, head) => [...commits.get(head).files].filter(([path, content]) => commits.get(base).files.get(path) !== content)
      .map(([filename]) => ({ filename, status: 'modified', additions: options.largeRepair && filename.startsWith('src/') ? 121 : 1, deletions: 1 })),
    repoApi: async (path, opts) => {
      if (path.startsWith('/pulls?')) return [...prs.keys()].map(number => prInfo(number));
      const pull = /^\/pulls\/(\d+)$/.exec(path);
      if (pull) {
        const number = Number(pull[1]);
        if (opts?.method === 'PATCH') Object.assign(prs.get(number), opts.body);
        return prInfo(number);
      }
      const history = /^\/pulls\/(\d+)\/reviews\?/.exec(path);
      if (history) {
        const pr = prInfo(Number(history[1]));
        if (options.missingSiblingReview && pr.title === 'shared sibling') return [];
        const ids = { repository: 'owner/repo', number: options.forgedReview ? 999 : pr.number, baseRef: 'main', baseSHA: refs.main, headSHA: pr.head.sha };
        const reviewRun = 2000 + pr.number, reviewID = 3000 + pr.number, artifactID = 4000 + pr.number;
        const body = reviewMarker(ids, !options.failedReviewVerdict, options.legacyReviewMarker ? undefined : reviewRun) + '\nIndependent verdict.';
        const record = createReviewEvidence({ ids, verdict: !options.failedReviewVerdict, reviewID, runID: reviewRun, controlSHA: refs.main,
          event: 'workflow_dispatch', actor: 'github-actions[bot]', reviewBody: body });
        const bytes = Buffer.from(JSON.stringify(record));
        workflowRuns.set(reviewRun, { id: reviewRun, path: options.foreignReviewWorkflow ? '.github/workflows/foreign.yml' : '.github/workflows/pr-review.yml',
          event: 'workflow_dispatch', head_branch: 'main', head_sha: refs.main, run_attempt: 1,
          status: options.unfinishedReview ? 'in_progress' : 'completed', conclusion: 'success',
          repository: { full_name: 'owner/repo' }, head_repository: { full_name: 'owner/repo' }, actor: { login: 'github-actions[bot]', type: 'Bot' } });
        remoteArtifacts.set(reviewRun, options.missingReviewArtifact ? [] : [{ id: artifactID, name: `review-evidence-${reviewRun}`, expired: false,
          size_in_bytes: bytes.length, workflow_run: { id: reviewRun, head_sha: refs.main, head_branch: 'main' } }]);
        remote.set(artifactID, new Map([['review-evidence.json', bytes]]));
        return [{ id: reviewID, user: { login: 'github-actions[bot]', type: 'Bot' }, commit_id: pr.head.sha, state: 'COMMENTED', body }];
      }
      if (path === '/actions/workflows/pr-review.yml/runs?event=workflow_dispatch&per_page=100') return { workflow_runs: [{
        path: '.github/workflows/pr-review.yml', event: 'workflow_dispatch', head_branch: 'main', head_sha: refs.main,
        run_attempt: 1, status: 'completed', conclusion: 'success', repository: { full_name: 'owner/repo' },
        head_repository: { full_name: 'owner/repo' }, actor: { login: 'github-actions[bot]' }, created_at: new Date(clockNow).toISOString(),
      }] };
      const workflow = /^\/actions\/runs\/(\d+)$/.exec(path);
      if (workflow) return workflowRuns.get(Number(workflow[1]));
      const artifacts = /^\/actions\/runs\/(\d+)\/artifacts\?/.exec(path);
      if (artifacts) return { artifacts: remoteArtifacts.get(Number(artifacts[1])) };
      if (path === '/branches/main/protection') {
        const p = options.protection ?? protection();
        if (options.standardRequiredChecks) p.required_status_checks.contexts.push(...options.standardRequiredChecks);
        return p;
      }
      if (/^\/actions\/workflows\/(?:automation-checks|application-checks|pr-review)\.yml\/dispatches$/.test(path)) {
        assert.equal(opts.method, 'POST'); calls.push(`dispatch:${path.split('/')[3]}`);
        if (!path.includes('/pr-review.yml/')) {
          const pr = prInfo(Number(opts.body.inputs.pr_number));
          assert.equal(opts.body.inputs.head_sha, pr.head.sha);
          assert.equal(opts.body.ref, path.includes('/application-checks.yml/') ? 'main' : pr.head.ref);
          if (options.verifyApplicationRuntime && path.includes('/application-checks.yml/')) {
            const trustedPin = commits.get(refs.main).files.get('.nvmrc').trim();
            const { sandbox, recovery } = await applicationHarness(trustedPin);
            const proof = await recovery.authorize({ number: pr.number, headSHA: pr.head.sha }, { gh, production: vercel.getProductionDeployment });
            const authorization = await recovery.recheckIdentity(proof, gh);
            assert.equal(sandbox.assertCandidateNodeVersion(proof.candidateNodeVersion, authorization), proof.candidateNodeVersion);
            calls.push(`application-runtime:${trustedPin}:${proof.candidateNodeVersion}:${proof.recovery ? 'recovery' : 'ordinary'}`);
            if (proof.recovery) assert.throws(() => sandbox.assertCandidateNodeVersion(proof.candidateNodeVersion), /at least trusted Node/);
          }
          if (options.vulnerableBaseline && path.includes('/application-checks.yml/')) {
            const proof = await authorizeApplication({ number: pr.number, headSHA: pr.head.sha }, { gh, production: vercel.getProductionDeployment });
            const current = JSON.parse(commits.get(pr.head.sha).files.get('package-lock.json'));
            const input = current.packages['node_modules/synthetic'].version === '1.0.0' ? baselineAudit(current) : audit(current);
            for (const scope of ['all', 'production']) {
              const result = applicationAuditVerdict(input.report, input.exitCode, scope, current, proof);
              assert.equal(result.pass, true);
              if (proof.recovery) { assert.equal(result.clean, false); assert.equal(result.acceptedBaselineFindings, true); }
            }
            calls.push(proof.recovery ? 'authorized-baseline-findings' : 'ordinary-clean-application-audit');
          }
        }
        if (options.missingSiblingReview && path.includes('/pr-review.yml/') && ![...prs.values()].some(pr => pr.title === 'shared sibling')) {
          const number = prs.size + 1;
          prs.set(number, { number, headRef: 'updates', title: 'shared sibling', body: '', state: 'open', merged: false });
        }
        if (options.dispatchFailure) throw Error('Workflow dispatch denied');
        if (options.expireDuringChecks) clockNow = now + 25 * 3600000;
        return null;
      }
      if (path.includes('/check-runs?')) {
        const sha = path.split('/')[2];
        const check_runs = (options.standardRequiredChecks ?? CHECK_CONTEXTS).map(name => ({ name, head_sha: sha, app: { id: 15368 },
          status: 'completed', conclusion: options.requiredCheckFailure ? 'failure' : 'success' }));
        return { total_count: check_runs.length, check_runs };
      }
      if (/\/commits\/[a-f0-9]+\/status\?/.test(path)) return { statuses: [...statuses].reverse().filter((status, index, all) =>
        all.findIndex(item => item.context === status.context) === index).map(status => ({ context: status.context, state: status.success ? 'success' : 'failure', creator: { login: 'github-actions[bot]' } })) };
      if (path.startsWith('/git/commits/')) {
        const sha = path.split('/').at(-1), value = commits.get(sha);
        return { sha, tree: { sha: value.treeSHA }, parents: value.parents.map(sha => ({ sha })) };
      }
      if (path.startsWith('/git/trees/')) {
        const sha = path.split('/').at(-1).split('?')[0];
        return { truncated: false, tree: [...commits.get(sha).files].map(([path, content]) => ({ path, type: 'blob',
          sha: createHash('sha1').update(content).digest('hex'), mode: options.symlink && path === options.symlink ? '120000' : '100644' })) };
      }
      if (path.startsWith('/compare/')) {
        const [base, head] = path.slice('/compare/'.length).split('...');
        if (opts?.accept) return [...commits.get(head).files].filter(([file, content]) => commits.get(base).files.get(file) !== content)
          .filter(([file]) => !options.incompleteMaintenanceDiff || file !== '.nvmrc')
          .map(([file, content]) => `diff --git a/${file} b/${file}\n-${commits.get(base).files.get(file)}\n+${content}`).join('\n');
        return { status: base === head ? 'identical' : ancestor(base, head) ? 'ahead' : 'diverged' };
      }
      if (path === '/git/commits' && opts?.method === 'POST') {
        const sha = commit(opts.body.parents[0], [...commits.get(opts.body.tree).files].map(([path, content]) => ({ path, content })),
          { parents: opts.body.parents, treeSHA: opts.body.tree });
        return { sha };
      }
      throw Error(`Unexpected fake GitHub path ${path}`);
    },
    openPR: async ({ head, body, title }) => {
      calls.push('openPR');
      const number = prs.size + 1;
      prs.set(number, { number, headRef: head, body, title, state: 'open', merged: false });
      return prInfo(number);
    },
    mergePR: async (number, head, base) => {
      calls.push('mergePR'); assert.equal(refs.main, base); assert.equal(refs[prs.get(number).headRef], head);
      if (options.mergeRace) { refs.main = commit(base, [{ path: 'src/unrelated.ts', content: 'unrelated' }]); throw Error('Strict protection rejected stale base'); }
      const merged = commit(head, [], { parents: [base, head], treeSHA: commits.get(head).treeSHA }); refs.main = merged;
      Object.assign(prs.get(number), { merged: true, merge_commit_sha: merged, state: 'closed' }); return merged;
    },
    setStatus: async (sha, context, success) => { statuses.push({ sha, context, success }); },
    ensureLabels: async () => {}, issue: async (...args) => { if (options.issueFailure) throw Error('Issue API unavailable'); issues.push(args); },
  };
  function prInfo(number) {
    const pr = prs.get(number);
    assert(pr, `Missing fake PR ${number}`);
    return { ...pr, user: { login: 'github-actions[bot]', type: 'Bot' }, draft: false,
      head: { ref: options.ordinaryPR && pr.headRef === 'updates' ? 'feature/ordinary' : pr.headRef,
        sha: refs[pr.headRef], repo: { full_name: 'owner/repo' } },
      base: { ref: 'main', sha: refs.main, repo: { full_name: 'owner/repo' } } };
  }
  let reviews = 0, validations = 0, researchCalls = 0;
  const researchOptions = [];
  const ai = {
    preflight: async () => ({ pass: !options.preflightFailure }),
    researchPackages: async (input, researchOptionsArg) => {
      researchCalls++; calls.push(`research:${input.packages.map(p => `${p.name}@${p.version}`).join(',')}`);
      researchOptions.push(researchOptionsArg);
      if (options.researchFailure) throw Error('synthetic research transport failure');
      if (options.transitiveResearchFailure && input.packages.some(p => p.name === 'helper')) throw Error('Transitive research failed');
      return { ...input, pass: true, timestamp: options.staleResearch ? new Date(now - 25 * 3600000).toISOString() : iso, packages: input.packages };
    },
    reviewPullRequest: async input => {
      calls.push('review'); reviews++; reviewInputs.push(input);
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
    getProductionDeployment: async () => ({ id: rolledBack || refs.main === baseSHA ? 'dpl_old' : 'dpl_main',
      sha: options.productionMismatch ? unrelatedSHA : rolledBack ? baseSHA : refs.main,
      branch: 'main', readyState: 'READY', hostname: 'www.bsc70linz.at', projectId: 'prj_synthetic', url: 'https://old.vercel.app' }),
    verifyAlias: async () => { calls.push('alias'); }, verifyRuntime: async input => {
      calls.push(`runtime:${input.minimumNodeVersion}`);
      if (options.platformRuntimeTooOld && input.minimumNodeVersion === '24.22.2') throw Error('Platform runtime below minimum');
    },
    waitForDeployment: async ({ sha, branch }) => {
      calls.push(`deploy:${branch}`);
      if (options.postInfrastructureFailure && branch === 'main') throw Error('Deployment API unavailable');
      if (options.restoreDeploymentFailure && branch === 'main' && JSON.parse(commits.get(sha).files.get('package.json')).dependencies.synthetic === '1.0.0') throw Error('Restore deployment unavailable');
      if (branch === 'main') rolledBack = false;
      return { id: `dpl_${branch}`, sha, branch, readyState: 'READY', projectId: 'prj_synthetic', url: `https://${branch}.vercel.app` };
    },
    rollback: async () => { calls.push('rollback'); rolledBack = true; if (options.interruptAfterRollback) throw Error('Runner lost after rollback'); return { verified: true }; },
  };
  const dep = { ...dependencies,
    fetchRegistryMetadata: async names => Object.fromEntries(names.map(name => [name, records[name]])),
    queryOsvLockfile: async lock => typeof options.osv === 'function' ? options.osv(lock) : options.osv ?? [],
    fetchOsvAdvisory: async id => options.advisories[id],
  };
  async function worker(input) {
    workerInputs.push(input);
    calls.push(`worker:${input.phase}`);
    if (input.phase === 'resolve' && options.expectUrgent !== undefined) assert.equal(input.urgent, options.expectUrgent);
    const candidateNode = commits.get(input.headSHA).files.get('.nvmrc').trim();
    const result = { ...input, expectedNodeVersion: options.wrongExpectedRuntime ? '24.22.1' : candidateNode, request: 'synthetic', controlSHA: activeControlSHA, runId: runId++, artifactId: runId + 100, completedAt: iso, pass: true, nodeVersion: `v${candidateNode}`, files: new Map() };
    const currentManifest = JSON.parse(commits.get(input.headSHA).files.get('package.json'));
    const lock = input.phase === 'inspect' ? lockFor(manifest) : lockFor(currentManifest, currentManifest.dependencies.synthetic, options.helperTarget ?? (options.youngTransitive ? '1.0.1' : '1.0.0'));
    result.audit = audit(lock); result.auditProduction = audit(lock);
    if (options.vulnerableBaseline && input.phase === 'inspect') result.audit = result.auditProduction = baselineAudit(lock);
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
    if (input.phase === 'capture') {
      capture = captureResult();
      if (options.baselineRuntime) {
        capture.qa.baseline.runtime = [runtimeEvent(options.baselineRuntime)];
        capture.files.set('qa/result.json', Buffer.from(JSON.stringify(capture.qa)));
      }
      Object.assign(result, capture);
    }
    if (input.phase === 'browser') {
      const post = input.headSHA === refs.main;
      const failedProduction = post && (currentManifest.dependencies.synthetic !== '1.0.0' || candidateNode !== '24.22.1');
      const comparison = comparisonResult(capture, { regression: failedProduction && options.postRegression, substitution: options.baselineSubstitution });
      if (failedProduction && options.postBehavior) {
        const messages = { functional: ['candidate 360-de-light functional', 'Fee disclosure did not open after click'],
          api: ['candidate API /api/teams', 'HTTP 500'], pdf: ['candidate 360-de-light functional', 'PDF text/content missing'],
          'malformed-pdf': ['candidate 360-de-light functional', 'Downloaded artifact is not a complete PDF'],
          infrastructure: ['candidate 360-de-light functional', 'page.waitForURL: Timeout 30000ms exceeded'],
          'external-reset': ['candidate 360-de-light functional', 'page.goto: net::ERR_CONNECTION_RESET at https://formular.vereinsplaner.com/'],
          'firstparty-timeout': ['candidate 360-de-light functional', 'page.goto: Timeout 30000ms exceeded at https://www.bsc70linz.at/anmeldung'] };
        comparison.qa.candidate.url = 'https://www.bsc70linz.at';
        comparison.qa.pass = false; comparison.qa.errors = messages[options.postBehavior] ? [{ check: messages[options.postBehavior][0], message: messages[options.postBehavior][1] }] : [];
        comparison.qa.checks = [];
        if (['api', 'infrastructure', 'external-reset', 'firstparty-timeout'].includes(options.postBehavior)) comparison.qa.candidate.variants[0].routes = [];
        if (['external-reset', 'firstparty-timeout', 'missing-pdf'].includes(options.postBehavior)) {
          // Exactly the old comparator's output after the functional download
          // never ran, including failed content checks and incomplete pictures.
          comparison.qa.candidate.pdfs = [];
          comparison.qa.candidate.completion.pdfs = {};
          comparison.qa.candidate.variants[0].functional = null;
          comparison.qa.checks = ['de', 'en'].map(lang => ({ name: `PDF ${lang} content comparison`, pass: false }));
        }
        if (options.postBehavior === 'pdf-content') {
          comparison.qa.candidate.pdfs[0].text = 'Changed parsed PDF text';
          comparison.qa.checks = [{ name: 'PDF de content comparison', pass: false }];
        }
        if (['runtime', 'asset404', 'external-runtime', 'unproven-runtime', 'runtime-timeout'].includes(options.postBehavior)) {
          const event = runtimeEvent(options.postBehavior === 'asset404' ? 'http' : 'pageerror',
            options.postBehavior === 'external-runtime' ? 'https://formular.vereinsplaner.com' : 'https://www.bsc70linz.at');
          if (options.postBehavior === 'unproven-runtime') { delete event.scriptURL; delete event.stack; }
          if (options.postBehavior === 'runtime-timeout') event.message = 'Timeout 30000ms exceeded';
          if (options.differentRepeat && workerInputs.filter(item => item.phase === 'browser').length > 2) event.scriptURL += '.different';
          comparison.qa.candidate.runtime = [event];
          comparison.qa.checks = [{ name: 'candidate runtime clean', pass: false, events: [event] }];
        }
        comparison.files.set('qa/result.json', Buffer.from(JSON.stringify(comparison.qa)));
      }
      Object.assign(result, comparison); result.pass = comparison.qa.pass;
      // Only production vision is negative for the regression fixture.
      if (!post && options.postRegression) ai.reviewVisualEvidence = async input => {
        calls.push('vision');
        return { pass: true, imageIndexes: input.images.map((_, i) => i), findings: [] };
      };
      if (post && options.postRegression) ai.reviewVisualEvidence = async input => {
        calls.push('vision'); return { pass: !failedProduction, imageIndexes: input.images.map((_, i) => i),
          findings: failedProduction ? [{ severity: 'high', message: 'Navigation clipped', evidence: ['Image 1 mobile'] }] : [] };
      };
      if (options.postBehavior) ai.reviewVisualEvidence = async input => { calls.push('vision'); return { pass: true, imageIndexes: input.images.map((_, i) => i), findings: [] }; };
    }
    if (options.wrongWorkerHead && input.phase === 'validate') result.headSHA = unrelatedSHA;
    if (options.wrongRuntime && input.phase === 'validate') result.nodeVersion = 'v24.22.0';
    if (options.failedCapture && input.phase === 'capture') result.pass = false;
    if (input.phase !== 'resolve') result.files.set('worker.json', Buffer.from(JSON.stringify({ ...result, files: undefined })));
    workflowRuns.set(result.runId, { id: result.runId, path: '.github/workflows/dependency-worker.yml', event: 'workflow_dispatch',
      head_sha: activeControlSHA, head_branch: 'main', run_attempt: 1, conclusion: 'success', status: 'completed',
      repository: { full_name: 'owner/repo' }, head_repository: { full_name: 'owner/repo' }, actor: { login: 'github-actions[bot]' },
      display_title: 'Dependency worker synthetic' });
    remoteArtifacts.set(result.runId, [{ id: result.artifactId, name: 'dependency-worker-synthetic', expired: false,
      workflow_run: { id: result.runId, head_sha: activeControlSHA, head_branch: 'main' } }]);
    remote.set(result.artifactId, new Map(result.files));
    return result;
  }
  if (options.standardRequiredChecks) {
    gh.REQUIRED_SECURITY_CHECKS = options.standardRequiredChecks;
    gh.assertProtection = async () => { calls.push('assertProtection'); return gh.repoApi('/branches/main/protection'); };
  }
  function newController(id = '900') {
    activeRunId = id; activeControlSHA = refs.main;
    return createController({ gh, ai, dep, vercel, worker,
      maintenance: { createMaintenancePlan: async input => {
        calls.push('maintenance');
        assert.equal(input.semver, runtime.semver);
        if (options.maintenanceFailure) throw Error('Unrelated maintenance adapter unavailable');
        const plan = await maintenanceAdapter.createMaintenancePlan({ ...input, ...maintenanceInput(options), fetchImpl: fetchPrimary });
        if (options.tamperPlan) plan.files[0].content += '\n# forged plan\n';
        return options.serializedMaintenance ? structuredClone(plan) : plan;
      }, fetchOfficialSecurityMetadata: async input => {
        proofInputs.push({ ...input, runId: id });
        return maintenanceAdapter.fetchOfficialSecurityMetadata({ ...input, fetchImpl: fetchPrimary });
      } }, now: () => clockNow, toolchain: async () => options.trustedRuntimeFromMain ? { ...runtime, nodeVersion: commits.get(refs.main).files.get('.nvmrc').trim() } : runtime, sleep: async () => {},
      env: { GITHUB_RUN_ID: id, GITHUB_SHA: activeControlSHA, AI_API_KEY: 'private-test-value' },
      loadArtifact: async id => remote.get(id), nonce: () => `synthetic-run-${id}`,
      loadReviewArtifact: async id => remote.get(id),
      persist: async (name, value) => evidence.push({ name, value, runId: id }) });
  }
  function uploadEvidence(id = activeRunId) {
    const checkpoint = evidence.filter(item => item.runId === id).at(-1).value;
    workflowRuns.set(Number(id), { id: Number(id), path: '.github/workflows/dependency-updates.yml', event: 'workflow_dispatch',
      head_branch: 'main', head_sha: checkpoint.controlSHA, repository: { full_name: 'owner/repo' },
      head_repository: { full_name: 'owner/repo' }, run_attempt: 1, status: 'completed' });
    const artifactId = Number(id) * 10;
    remoteArtifacts.set(Number(id), [{ id: artifactId, name: `dependency-controller-${id}`, expired: false,
      workflow_run: { id: Number(id), head_sha: checkpoint.controlSHA, head_branch: 'main' } }]);
    remote.set(artifactId, new Map(evidence.filter(item => item.runId === id).map(item => [item.name, Buffer.from(JSON.stringify(item.value))])));
  }
  const controller = newController();
  return { controller, newController, uploadEvidence, calls, primaryCalls, proofInputs, workerInputs, reviewInputs, researchOptions, refs, commits, evidence, issues, statuses, ai, worker, gh, prs, remote, workflowRuns, remoteArtifacts,
    setNow: time => { clockNow = time; },
    get researchCalls() { return researchCalls; } };
}

// Model the real shared commit status separately from per-PR run/artifact
// completion. The production verifier still authenticates every fixture record.
function pendingReviewHarness({ race = false, settle = true, applicationPending = false, nonMainProof = false, ...options } = {}) {
  const h = harness({ ...options, standardRequiredChecks: ['Automation tests', 'Application lint, build and audit', 'security/ai-review'] });
  const api = h.gh.repoApi, dispatches = [], observations = [], artifactReads = [];
  const counts = new Map();
  let polls = 0, refreshAt = null, sibling;
  h.gh.repoApi = async (path, opts) => {
    if (path === '/actions/workflows/pr-review.yml/dispatches') {
      const number = Number(opts.body.inputs.pr_number);
      assert.equal(opts.body.ref, 'main');
      dispatches.push({ number, poll: polls });
      counts.set(number, (counts.get(number) ?? 0) + 1);
      if (counts.get(number) > 1) refreshAt = polls;
      const result = await api(path, opts);
      if (!sibling) {
        sibling = h.prs.size + 1;
        h.prs.set(sibling, { number: sibling, headRef: 'updates', title: 'pending sibling', body: '', state: 'open', merged: false });
      }
      return result;
    }
    if (path.includes('/check-runs?')) {
      polls++;
      const result = await api(path, opts);
      result.check_runs = result.check_runs.filter(check => check.name !== 'security/ai-review');
      if (applicationPending) result.check_runs.find(check => check.name === 'Application lint, build and audit').status = 'in_progress';
      result.total_count = result.check_runs.length;
      return result;
    }
    if (/\/commits\/[a-f0-9]+\/status\?/.test(path)) {
      const result = await api(path, opts);
      const ready = race ? refreshAt !== null && polls > refreshAt && settle : counts.has(sibling) && polls > 1;
      const state = ready ? 'success' : 'pending';
      observations.push({ poll: polls, state });
      result.statuses = result.statuses.filter(status => status.context !== 'security/ai-review');
      result.statuses.push({ context: 'security/ai-review', state, creator: { login: 'github-actions[bot]' } });
      return result;
    }
    const history = /^\/pulls\/(\d+)\/reviews\?/.exec(path);
    if (history) {
      const number = Number(history[1]);
      if (!race && !counts.has(number)) return [];
      const reviews = await api(path, opts);
      if (!reviews.length) return reviews;
      const originalRun = 2000 + number, originalArtifact = 4000 + number;
      const previous = JSON.parse(h.remote.get(originalArtifact).get('review-evidence.json'));
      // Each dispatch creates a distinct fresh record/run, including refresh.
      const generation = Math.max(0, (counts.get(number) ?? 1) - 1) * 10000;
      const runID = originalRun + generation, artifactID = originalArtifact + generation, reviewID = 3000 + number + generation;
      const ids = { repository: previous.repository, number: previous.number, baseRef: nonMainProof ? 'feature' : 'main', baseSHA: previous.baseSHA, headSHA: previous.headSHA };
      const body = reviewMarker(ids, previous.verdict === 'pass', options.legacyReviewMarker ? undefined : runID) + '\nIndependent verdict.';
      const record = createReviewEvidence({ ids, verdict: previous.verdict === 'pass', reviewID, runID, controlSHA: previous.controlSHA,
        event: 'workflow_dispatch', actor: 'github-actions[bot]', reviewBody: body });
      const bytes = Buffer.from(JSON.stringify(record));
      const running = race && (polls === 1 || generation > 0 && polls === refreshAt);
      h.workflowRuns.set(runID, { ...h.workflowRuns.get(originalRun), id: runID,
        status: running || options.unfinishedReview ? 'in_progress' : 'completed' });
      h.remoteArtifacts.set(runID, options.missingReviewArtifact || running ? [] : [{ id: artifactID, name: `review-evidence-${runID}`, expired: false,
        size_in_bytes: bytes.length, workflow_run: { id: runID, head_sha: h.refs.main, head_branch: 'main' } }]);
      h.remote.set(artifactID, new Map([['review-evidence.json', bytes]]));
      artifactReads.push({ number, poll: polls, running });
      return [{ ...reviews[0], id: reviewID, body }];
    }
    return api(path, opts);
  };
  return { ...h, dispatches, observations, artifactReads };
}

test('protection fails closed for missing strict checks, admin bypass and force push', () => {
  assert.equal(validateMainProtection(protection()), true);
  for (const change of [p => { p.required_status_checks.strict = false; }, p => { p.enforce_admins.enabled = false; },
    p => { p.required_status_checks.contexts.pop(); }, p => { p.allow_force_pushes.enabled = true; },
    p => { p.required_pull_request_reviews = { bypass_pull_request_allowances: { users: ['admin'], teams: [], apps: [] } }; }]) {
    const p = protection(); change(p); assert.equal(validateMainProtection(p), false);
  }
  assert.equal(validateMainProtection(null), false);
  const callerBound = protection();
  callerBound.current_user_can_bypass = 'never'; callerBound.enforce_admins.enabled = null;
  callerBound.required_pull_request_reviews = { bypass_pull_request_allowances: null };
  assert.equal(validateMainProtection(callerBound), true);
  callerBound.current_user_can_bypass = 'always';
  assert.equal(validateMainProtection(callerBound), false);
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
  assert.equal(h.researchOptions.length > 0, true);
  assert.deepEqual(h.researchOptions[0].applicationContext, {
    applicationType: 'vite-react-spa', bundler: 'vite', framework: 'react', usesNext: false, usesVitest: false,
    usesReactServerComponents: false, usesServerFunctions: false,
  });
  assert.deepEqual(h.researchOptions[0].verifiedScannerEvidence, []);
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
  assert.equal(result.reason, 'automation-pr-ownership-required');
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
  assert(h.calls.includes('rollback')); assert.equal(h.calls.includes('ff:main'), false);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 2);
  assert.equal(result.recoveryComplete, true);
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
  for (const workflow of ['automation-checks.yml', 'application-checks.yml', 'pr-review.yml']) assert(h.calls.indexOf(`dispatch:${workflow}`) < h.calls.indexOf('mergePR'));
});

test('vulnerable baseline restores through exact-tree production authorization and records findings separately from clean audits', async () => {
  const h = harness({ vulnerableBaseline: true, postRegression: true,
    standardRequiredChecks: ['security/ai-review', 'Automation tests', 'Application lint, build and audit'] });
  const result = await h.controller.run();
  assert.equal(result.reason, 'confirmed-regression-rolled-back', JSON.stringify(result));
  assert.equal(result.recoveryComplete, true);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 2);
  assert.equal(h.calls.filter(call => call === 'authorized-baseline-findings').length, 1);
  assert.equal(h.calls.filter(call => call === 'ordinary-clean-application-audit').length, 1);
  assert.equal(h.calls.includes('ff:main'), false);
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

test('functional, API and PDF regressions confirm with a new browser worker even when vision passes', async () => {
  for (const postBehavior of ['functional', 'api', 'pdf', 'malformed-pdf']) {
    const h = harness({ postBehavior }); const result = await h.controller.run();
    assert.equal(result.reason, 'confirmed-regression-rolled-back', JSON.stringify(result));
    assert.equal(result.recoveryComplete, true);
    assert(h.calls.includes('rollback'));
    assert.equal(h.calls.filter(call => call === 'worker:browser').length, 4); // updates, production, independent confirmation, restored production
  }
});

test('incomplete timeout captures and repeatable transport failures never authorize rollback', async () => {
  const h = harness({ postBehavior: 'infrastructure' }); const result = await h.controller.run();
  assert.equal(result.reason, 'postproduction-check-blocked-without-confirmed-regression');
  assert.equal(h.calls.includes('rollback'), false);
  const timeout = { errors: [{ check: 'candidate 360-de-light functional', message: 'page.goto: net::ERR_CONNECTION_RESET' }] };
  assert.deepEqual(regressionSignals(timeout), []); assert.equal(confirmRepeatedRegression(timeout, timeout), false);
});

test('repeated transport failures with missing PDFs and incomplete screenshots cannot confirm content regression', async () => {
  for (const postBehavior of ['external-reset', 'firstparty-timeout', 'missing-pdf']) {
    const h = harness({ postBehavior }); const result = await h.controller.run();
    assert.equal(result.reason, 'postproduction-check-blocked-without-confirmed-regression', JSON.stringify(result));
    assert.equal(h.calls.includes('rollback'), false);
    assert.equal(h.calls.filter(call => call === 'worker:browser').length, 2);
    const report = h.evidence.find(item => item.name.endsWith('production-browser-review.json')).value;
    assert.deepEqual(regressionSignals(report.qa), []);
    assert.equal(confirmRepeatedRegression(report.qa, report.qa), false);
  }
});

test('only two actually retrieved and parsed PDFs authorize a content signal; malformed PDF assertions remain eligible', async () => {
  const h = harness({ postBehavior: 'pdf-content' });
  assert.equal((await h.controller.run()).reason, 'confirmed-regression-rolled-back');
  assert.equal(h.calls.filter(call => call === 'worker:browser').length, 4);
  const capture = captureResult(), comparison = comparisonResult(capture);
  comparison.qa.checks = [{ name: 'PDF de content comparison', pass: false }];
  for (const target of [comparison.qa.baseline, comparison.qa.candidate]) {
    target.completion.pdfs.de.parsed = false;
    assert.deepEqual(regressionSignals(comparison.qa), []);
    target.completion.pdfs.de.parsed = true;
  }
  comparison.qa.candidate.pdfs = [];
  comparison.qa.candidate.variants[0].functional = null;
  comparison.qa.checks.push({ name: '360-de-light functional comparison', pass: false });
  comparison.files.set('qa/result.json', Buffer.from(JSON.stringify(comparison.qa)));
  const reviewed = await reviewBrowserImages({ capture: { ...capture, pass: true }, comparison: { ...comparison, pass: false }, baseSHA, headSHA: unrelatedSHA,
    ai: { reviewVisualEvidence: async () => ({ pass: false, findings: [{ severity: 'high', evidence: ['vague model concern'] }] }) } });
  assert.equal(reviewed.confirmedRegression, false);
  const malformed = { errors: [{ check: 'candidate 360-de-light functional', message: 'Downloaded artifact is not a complete PDF' }] };
  assert.equal(confirmRepeatedRegression(malformed, malformed), true);
});

test('new first-party runtime exceptions and asset 404s confirm on a fresh browser with unchanged pixels', async () => {
  for (const postBehavior of ['runtime', 'asset404']) {
    const h = harness({ postBehavior }); const result = await h.controller.run();
    assert.equal(result.reason, 'confirmed-regression-rolled-back', JSON.stringify(result));
    assert.equal(result.recoveryComplete, true);
    assert.equal(h.calls.filter(call => call === 'worker:browser').length, 4);
  }
});

test('external, unproven, transport, preexisting and nonrepeated runtime events cannot authorize rollback', async () => {
  for (const options of [{ postBehavior: 'external-runtime' }, { postBehavior: 'unproven-runtime' }, { postBehavior: 'runtime-timeout' },
    { postBehavior: 'runtime', baselineRuntime: 'pageerror' }, { postBehavior: 'asset404', baselineRuntime: 'http' },
    { postBehavior: 'runtime', differentRepeat: true }]) {
    const h = harness(options); const result = await h.controller.run();
    assert.equal(result.reason, 'postproduction-check-blocked-without-confirmed-regression', JSON.stringify(result));
    assert.equal(h.calls.includes('rollback'), false);
  }
});

test('runtime identity compares actual paths/status/signatures and ignores containing-page origin', () => {
  const baseline = site('baseline'), candidate = site('candidate');
  candidate.runtime = [runtimeEvent('pageerror', candidate.url)];
  const qa = { baseline, candidate };
  assert.equal(regressionSignals(qa).length, 1);
  baseline.runtime = [runtimeEvent('pageerror', baseline.url)];
  assert.deepEqual(regressionSignals(qa), []); // public host difference is normalized
  candidate.runtime[0] = runtimeEvent('pageerror', candidate.url, '/assets/other-feature.js');
  assert.equal(regressionSignals(qa).length, 1);
  baseline.runtime = [];
  candidate.runtime[0] = { ...runtimeEvent('pageerror', 'https://formular.vereinsplaner.com'), url: candidate.url };
  assert.deepEqual(regressionSignals(qa), []);
  candidate.runtime[0] = { ...runtimeEvent('http', candidate.url), frameURL: 'https://formular.vereinsplaner.com/form' };
  assert.deepEqual(regressionSignals(qa), []);
  candidate.runtime[0] = { ...runtimeEvent('http', candidate.url), status: 408 };
  assert.deepEqual(regressionSignals(qa), []);
});

test('post-merge interruption resumes from authenticated immutable evidence and original capture', async () => {
  const options = { postInfrastructureFailure: true }, h = harness(options);
  const first = await h.controller.run(); assert.equal(first.outcome, 'blocked');
  const merged = h.refs.main; h.uploadEvidence(); options.postInfrastructureFailure = false;
  const resumed = await h.newController('901').run();
  assert.equal(resumed.outcome, 'promoted', JSON.stringify(resumed)); assert.equal(h.refs.main, merged);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
  assert.equal(h.calls.filter(call => call === 'worker:capture').length, 1);
});

test('three-run recovery keeps the original claim usable after a resumed upload disappears', async () => {
  const options = { postInfrastructureFailure: true }, h = harness(options);
  const first = await h.controller.run(); h.uploadEvidence();
  const original = h.prs.get(first.ownerPR).body;
  await h.newController('901').run(); h.uploadEvidence(); h.remoteArtifacts.set(901, []);
  const chain = h.prs.get(first.ownerPR).body;
  assert(chain.startsWith(original));
  assert.match(chain, /run=901 predecessor=900/);
  options.postInfrastructureFailure = false;
  const third = await h.newController('902').run();
  assert.equal(third.outcome, 'promoted', JSON.stringify(third));
  assert.equal(h.calls.filter(call => call === 'rollback').length, 0);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
  assert.equal(h.calls.filter(call => call === 'worker:capture').length, 1);
  assert(h.prs.get(first.ownerPR).body.startsWith(chain));
  assert.match(h.prs.get(first.ownerPR).body, /run=902 predecessor=901/);
  h.uploadEvidence();
  assert.equal((await h.newController('903').run()).outcome, 'no-updates');
});

test('missing resumed uploads after an already checkpointed rollback/restore never repeat either mutation', async () => {
  const options = { postRegression: true, restoreDeploymentFailure: true }, h = harness(options);
  const first = await h.controller.run(); h.uploadEvidence();
  assert(first.rollbackVerified && first.restorePR);
  await h.newController('901').run(); h.uploadEvidence(); h.remoteArtifacts.set(901, []);
  options.restoreDeploymentFailure = false;
  const third = await h.newController('902').run();
  assert.equal(third.outcome, 'recovered', JSON.stringify(third));
  assert.equal(h.calls.filter(call => call === 'rollback').length, 1);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 2);
});

test('missing resumed uploads cannot hide newer uncheckpointed rollback or restore actions', async () => {
  for (const mutation of ['rollback', 'restore']) {
    const options = { postInfrastructureFailure: true }, h = harness(options);
    await h.controller.run(); h.uploadEvidence();
    options.postInfrastructureFailure = false; options.postRegression = true;
    options.interruptAfterRollback = mutation === 'rollback';
    options.restoreDeploymentFailure = mutation === 'restore';
    const second = await h.newController('901').run(); h.uploadEvidence(); h.remoteArtifacts.set(901, []);
    assert.equal(h.calls.filter(call => call === 'rollback').length, 1);
    if (mutation === 'restore') assert(second.restorePR);
    const before = h.calls.filter(call => call === 'rollback' || call === 'mergePR').length;
    const third = await h.newController('902').run();
    assert.equal(third.reason, mutation === 'restore' ? 'resume-newer-recovery-actions-uncheckpointed' : 'resume-fallback-production-contradiction', JSON.stringify(third));
    assert.equal(h.calls.filter(call => call === 'rollback' || call === 'mergePR').length, before);
  }
});

test('fallback authenticates every predecessor and rejects changed refs, deployment, chain or newer durable evidence', async () => {
  for (const changed of ['workflow', 'main', 'updates', 'deployment', 'chain', 'checkpoint']) {
    const options = { postInfrastructureFailure: true }, h = harness(options);
    const first = await h.controller.run(); h.uploadEvidence();
    await h.newController('901').run(); h.uploadEvidence();
    if (changed !== 'checkpoint') h.remoteArtifacts.set(901, []);
    if (changed === 'workflow') h.workflowRuns.get(901).path = '.github/workflows/foreign.yml';
    if (changed === 'main') h.refs.main = unrelatedSHA;
    if (changed === 'updates') h.refs.updates = unrelatedSHA;
    if (changed === 'deployment') options.productionMismatch = true;
    if (changed === 'chain') h.prs.get(first.ownerPR).body = h.prs.get(first.ownerPR).body.replace('predecessor=900', 'predecessor=899');
    if (changed === 'checkpoint') {
      const files = h.remote.get(9010), path = [...files.keys()].filter(path => path.endsWith('-blocked.json')).at(-1);
      const checkpoint = JSON.parse(files.get(path)); checkpoint.headSHA = unrelatedSHA;
      files.set(path, Buffer.from(JSON.stringify(checkpoint)));
    }
    const before = h.calls.filter(call => call === 'rollback' || call === 'mergePR').length;
    const third = await h.newController('902').run();
    assert.equal(third.outcome, 'blocked', `${changed}: ${JSON.stringify(third)}`);
    assert.equal(h.calls.filter(call => call === 'rollback' || call === 'mergePR').length, before);
  }
});

test('owned published updates retry after temporary failure without force or loss of main history', async () => {
  const options = { visionFailure: true }, h = harness(options);
  const first = await h.controller.run(); assert.equal(first.outcome, 'blocked');
  const retained = h.refs.updates; h.uploadEvidence(); options.visionFailure = false;
  const resumed = await h.newController('901').run();
  assert.equal(resumed.outcome, 'promoted', JSON.stringify(resumed));
  assert.notEqual(h.refs.updates, retained); assert.equal(h.calls.includes('ff:main'), false);
  const parents = h.commits.get(h.refs.updates).parents;
  assert(parents.length > 0); assert.equal(resumed.resumedFromRun, '900');
});

test('resume ownership rejects missing artifacts and forged workflow provenance', async () => {
  for (const forged of [false, true]) {
    const options = { visionFailure: true }, h = harness(options);
    await h.controller.run(); h.uploadEvidence();
    const retained = h.refs.updates;
    if (forged) h.workflowRuns.get(900).path = '.github/workflows/foreign.yml';
    else h.remoteArtifacts.set(900, []);
    const result = await h.newController('901').run();
    assert.equal(result.outcome, 'blocked'); assert.equal(h.refs.updates, retained); assert.equal(h.refs.main, baseSHA);
  }
});

test('protected restore deployment failure resumes without a second rollback or direct main push', async () => {
  const options = { postRegression: true, restoreDeploymentFailure: true }, h = harness(options);
  const first = await h.controller.run(); assert.equal(first.outcome, 'blocked'); assert(first.restorePR);
  h.uploadEvidence(); options.restoreDeploymentFailure = false;
  const resumed = await h.newController('901').run();
  assert.equal(resumed.outcome, 'recovered', JSON.stringify(resumed)); assert.equal(resumed.recoveryComplete, true);
  assert.equal(h.calls.filter(call => call === 'rollback').length, 1); assert.equal(h.calls.includes('ff:main'), false);
});

test('issue API failure after verified rollback cannot prevent protected restoration', async () => {
  const h = harness({ postRegression: true, issueFailure: true }); const result = await h.controller.run();
  assert.equal(result.recoveryComplete, true, JSON.stringify(result));
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 2); assert.equal(h.calls.includes('ff:main'), false);
});

test('bare green status cannot replace an exact authenticated PR review', async () => {
  const h = harness({ forgedReview: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'required-pr-checks-timeout'); assert.equal(h.calls.includes('mergePR'), false);
});

test('exact bot markers from a foreign workflow, legacy markers, missing uploads, running reviews and FAIL artifacts never authorize merge', async () => {
  for (const options of [{ foreignReviewWorkflow: true }, { legacyReviewMarker: true }, { missingReviewArtifact: true },
    { unfinishedReview: true }, { failedReviewVerdict: true }]) {
    const h = harness(options); const result = await h.controller.run();
    assert.equal(result.reason, 'required-pr-checks-timeout', JSON.stringify(result));
    assert.equal(h.calls.includes('mergePR'), false);
    assert.equal(h.calls.includes('rollback'), false);
  }
});

test('browser acceptance uses public hosts while deployment SHA/alias identity remains separate', async () => {
  const h = harness(); const result = await h.controller.run(); assert.equal(result.outcome, 'promoted');
  const capture = h.workerInputs.find(input => input.phase === 'capture');
  assert.equal(capture.baselineURL, 'https://www.bsc70linz.at');
  const comparisons = h.workerInputs.filter(input => input.phase === 'browser');
  assert.equal(comparisons[0].candidateURL, 'https://updates.dev.bsc70linz.at');
  assert.equal(comparisons[1].candidateURL, 'https://www.bsc70linz.at');
  assert(comparisons.every(input => input.baselineRun === String(result.baseline.runId)));
});

test('every open main PR sharing the head needs its own exact review despite green shared statuses', async () => {
  const h = harness({ missingSiblingReview: true }); const result = await h.controller.run();
  assert.equal(result.reason, 'required-pr-checks-timeout'); assert.equal(h.calls.includes('mergePR'), false);
  assert.equal(h.calls.filter(call => call === 'dispatch:pr-review.yml').length, 2);
});

test('real pending AI commit status still dispatches a missing sibling and converges without early merge', async () => {
  const h = pendingReviewHarness();
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', JSON.stringify(result));
  const target = h.dispatches[0].number, sibling = target + 1;
  assert.deepEqual(h.dispatches, [{ number: target, poll: 0 }, { number: sibling, poll: 1 }]);
  assert.deepEqual(h.observations, [{ poll: 1, state: 'pending' }, { poll: 2, state: 'success' }]);
  assert(h.artifactReads.some(read => read.number === sibling && read.poll === 2 && !read.running));
  const gate = h.evidence.find(item => item.name.endsWith('required-pr-checks.json')).value;
  assert.equal(gate.exactReview, true);
  assert(gate.observations.every(item => item.pass));
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
});

test('two fresh running reviews with completed artifacts and a pending aggregate converge through one trusted refresh', async () => {
  const h = pendingReviewHarness({ race: true });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', JSON.stringify(result));
  const target = h.dispatches[0].number, sibling = target + 1;
  assert.deepEqual(h.dispatches, [{ number: target, poll: 0 }, { number: sibling, poll: 1 }, { number: target, poll: 2 }]);
  assert.deepEqual(h.artifactReads.filter(read => read.poll === 1).map(read => read.running), [true, true]);
  assert.deepEqual(h.artifactReads.filter(read => read.poll === 2).map(read => read.running), [false, false]);
  assert.deepEqual(h.observations.map(item => item.state), ['pending', 'pending', 'success']);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
});

test('pending aggregate refresh is finite and completed exact artifacts never bypass another pending required check', async () => {
  for (const options of [{ settle: false }, { applicationPending: true }]) {
    const h = pendingReviewHarness({ race: true, ...options });
    const result = await h.controller.run();
    assert.equal(result.reason, 'required-pr-checks-timeout', JSON.stringify(result));
    assert.equal(h.dispatches.length, 3);
    assert.equal(h.observations.length, 210);
    assert.equal(h.calls.includes('mergePR'), false);
    assert.equal(h.calls.includes('rollback'), false);
  }
});

test('pending AI status cannot promote non-main, foreign, missing, running, forged or negative exact proof', async () => {
  for (const options of [{ nonMainProof: true }, { foreignReviewWorkflow: true }, { missingReviewArtifact: true },
    { unfinishedReview: true }, { forgedReview: true }, { failedReviewVerdict: true }]) {
    const h = pendingReviewHarness({ race: true, ...options });
    const result = await h.controller.run();
    assert.equal(result.reason, 'required-pr-checks-timeout', JSON.stringify({ options, result }));
    assert.equal(h.calls.includes('mergePR'), false);
    assert.equal(h.calls.includes('rollback'), false);
    assert(h.dispatches.length <= 2, 'unverified or negative records must not trigger aggregate refresh');
    if (options.failedReviewVerdict) assert.equal(new Set(h.dispatches.map(item => item.number)).size, h.dispatches.length,
      'an authenticated failure must not trigger fresh AI retries');
  }
});


test('automatic maintenance-only promotion uses exact Node/action bytes and the existing public acceptance and protected merge gates', async () => {
  const h = harness({ maintenance: true });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', `${result.stage}: ${result.reason}`);
  assert.equal(result.candidateKind, 'maintenance');
  assert.equal(h.calls.includes('worker:resolve'), false);
  assert(h.calls.indexOf('maintenance') < h.calls.indexOf('commit'));
  assert(h.calls.includes('worker:validate'));
  const files = h.commits.get(result.headSHA).files;
  assert.equal(files.get('.nvmrc'), '24.22.2\n');
  assert.equal(files.get('.github/qa/.nvmrc'), '24.22.1\n');
  assert.equal(JSON.parse(files.get('package.json')).dependencies.synthetic, '1.0.0');
  assert.deepEqual(JSON.parse(files.get('package-lock.json')).packages['node_modules/synthetic'], lockFor(manifest).packages['node_modules/synthetic']);
  assert.equal(JSON.parse(files.get('package-lock.json')).packages[''].engines.node, '>=24.22.2 <25');
  assert.equal(JSON.parse(files.get('package.json')).engines.node, '>=24.22.2 <25');
  assert.equal(files.get('.github/automation/dependency-sandbox.mjs'), "export const NODE_VERSION = '24.22.2';\n");
  assert.match(files.get('.github/workflows/fixture.yml'), new RegExp(`actions/checkout@${'d'.repeat(40)} # v6.0.1`));
  assert.equal(h.calls.filter(call => call === 'runtime:24.22.2').length, 2);
  assert(h.calls.includes('dispatch:application-checks.yml'));
  assert(h.calls.includes('dispatch:pr-review.yml'));
  assert.equal(h.workerInputs.filter(input => input.phase === 'capture').length, 1);
  assert.equal(h.workerInputs.filter(input => input.phase === 'browser').length, 2);
  assert.equal(result.maintenance.identity, hash(JSON.stringify(result.maintenance.plan)));
  assert.deepEqual(result.maintenance.files, result.maintenance.plan.changes);
  const review = h.evidence.find(item => item.name.includes('independent-code-review'));
  assert(review);
  assert(h.reviewInputs[0].context.maintenancePlan);
  for (const file of result.maintenance.plan.files) assert(h.reviewInputs[0].diff.includes(`diff --git a/${file.path} b/${file.path}`));
});

test('Node-only and action-only maintenance retain distinct root/QA pins and skip package lock resolution', async () => {
  for (const mode of ['nodeOnly', 'actionOnly']) {
    const h = harness({ maintenance: true, [mode]: true });
    const result = await h.controller.run();
    assert.equal(result.outcome, 'promoted', `${result.stage}: ${result.reason}`);
    assert.equal(h.calls.includes('worker:resolve'), false);
    const files = h.commits.get(result.headSHA).files;
    if (mode === 'actionOnly') {
      assert.equal(files.get('package-lock.json'), h.commits.get(baseSHA).files.get('package-lock.json'));
      assert.equal(files.get('package.json'), h.commits.get(baseSHA).files.get('package.json'));
      assert.equal(files.get('.nvmrc'), '24.22.1\n');
    } else assert.equal(files.get('.github/workflows/fixture.yml'), h.commits.get(baseSHA).files.get('.github/workflows/fixture.yml'));
  }
});

test('maintenance bytes reject substituted workflow, Node pin/engine/lock/constant, QA pin and all extra edits before candidate execution', async () => {
  for (const path of ['.github/workflows/fixture.yml', '.nvmrc', 'package.json', 'package-lock.json',
    '.github/automation/dependency-sandbox.mjs', '.github/qa/.nvmrc', '.github/automation/policy.mjs', 'src/app.ts']) {
    const h = harness({ maintenance: true, tamperMaintenance: path });
    const result = await h.controller.run();
    assert.equal(result.outcome, 'blocked', `${path}: ${result.stage}: ${result.reason}`);
    assert.equal(h.calls.includes('worker:validate'), false, path);
    assert.equal(h.calls.includes('ff:updates'), false, path);
    assert.equal(h.calls.includes('mergePR'), false, path);
  }
});

test('a tampered deterministic plan is independently regenerated before any candidate commit', async () => {
  const h = harness({ maintenance: true, tamperPlan: true });
  const result = await h.controller.run();
  assert.equal(result.reason, 'maintenance-plan-invalid', `${result.stage}: ${result.reason}`);
  assert.equal(h.calls.includes('commit'), false);
});

test('young maintenance targets and stale metadata never authorize a candidate', async () => {
  for (const options of [{ youngMaintenance: true }, { staleMaintenance: true }]) {
    const h = harness({ maintenance: true, ...options });
    const result = await h.controller.run();
    assert.equal(result.outcome, 'blocked', `${result.stage}: ${result.reason}`);
    assert.equal(h.calls.includes('commit'), false);
    assert.equal(h.calls.includes('worker:validate'), false);
    assert.equal(h.refs.main, baseSHA);
  }
});

test('fresh primary proofs promote only the exact young Node and Action fixes through all existing gates', async () => {
  for (const mode of [{ urgentNode: true, nodeOnly: true }, { urgentAction: true, actionOnly: true },
    { urgentNode: true, urgentAction: true }]) {
    const h = harness({ maintenance: true, youngMaintenance: true, extraYoungMaintenance: true, serializedMaintenance: true, ...mode });
    const result = await h.controller.run();
    assert.equal(result.outcome, 'promoted', `${JSON.stringify(mode)}: ${result.stage}: ${result.reason}`);
    assert.equal(result.candidateKind, 'maintenance');
    assert.equal(h.calls.includes('worker:resolve'), false);
    assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
    assert.equal(h.workerInputs.filter(input => input.phase === 'browser').length, 2);
    assert(h.calls.includes('dispatch:application-checks.yml'));
    assert(h.calls.includes('dispatch:pr-review.yml'));
    const files = h.commits.get(result.headSHA).files;
    assert.equal(files.get('.nvmrc'), mode.urgentNode ? '24.22.2\n' : '24.22.1\n');
    assert.match(files.get('.github/workflows/fixture.yml'), mode.urgentAction ? /# v6\.0\.1\n/ : /# v6\.0\.0\n/);
    assert.equal(files.get('.github/qa/.nvmrc'), '24.22.1\n');
    assert.deepEqual(result.maintenance.plan.waivers.map(proof => proof.target.name).sort(),
      [mode.urgentNode && 'node', mode.urgentAction && 'actions/checkout'].filter(Boolean).sort());
    // Multiple byte gates share one fresh fetch per original base, never JSON authority.
    assert.equal(h.proofInputs.length, 1);
    assert.deepEqual(h.proofInputs[0].targets, maintenanceAdapter.usedToolchainTargets(h.commits.get(baseSHA).files));
    assert.equal(h.proofInputs[0].semver, runtime.semver);
    assert.equal(maintenanceAdapter.validateMaintenancePlan(h.commits.get(baseSHA).files,
      JSON.parse(JSON.stringify(result.maintenance.plan)), { now }).ok, false);
  }
});

test('primary toolchain source failure blocks before committing or executing candidate bytes', async () => {
  const h = harness({ maintenance: true, primaryUnavailable: true });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'blocked');
  assert.equal(h.calls.includes('commit'), false);
  assert.equal(h.calls.includes('worker:validate'), false);
  assert.equal(h.refs.main, baseSHA);
});

test('a necessary npm CVE fix entirely bypasses unavailable or young unrelated maintenance', async () => {
  const advisory = { id: 'CVE-2026-12345', modified: iso, affected: [{ package: { ecosystem: 'npm', name: 'helper' },
    ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] };
  const h = harness({ maintenance: true, maintenanceFailure: true, primaryUnavailable: true, youngMaintenance: true, helperTarget: '1.0.1', expectUrgent: true,
    records: { synthetic: registry('synthetic'), helper: registry('helper', { '1.0.0': 30, '1.0.1': 1 }) },
    advisories: { [advisory.id]: advisory }, osv: lock => lock.packages['node_modules/helper'].version === '1.0.0' ?
      [{ name: 'helper', version: '1.0.0', advisories: [{ id: advisory.id }] }] : [] });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', `${result.stage}: ${result.reason}`);
  assert.equal(result.candidateKind, 'dependencies');
  assert.equal(h.calls.includes('maintenance'), false);
  assert.equal(h.primaryCalls.length, 0);
  assert.equal(h.proofInputs.length, 0);
  const files = h.commits.get(result.headSHA).files;
  assert.equal(JSON.parse(files.get('package.json')).dependencies.synthetic, '1.0.0');
  assert.equal(JSON.parse(files.get('package-lock.json')).packages['node_modules/helper'].version, '1.0.1');
  assert.equal(files.get('.nvmrc'), '24.22.1\n');
});

test('maintenance validation requires both actual new Node and its independently bound expected pin', async () => {
  for (const options of [{ wrongRuntime: true }, { wrongExpectedRuntime: true }]) {
    const h = harness({ maintenance: true, ...options });
    const result = await h.controller.run();
    assert.equal(result.reason, 'validation-runtime-mismatch', `${result.stage}: ${result.reason}`);
    assert.equal(h.calls.includes('ff:updates'), false);
  }
  const h = harness({ maintenance: true, platformRuntimeTooOld: true });
  assert.equal((await h.controller.run()).outcome, 'blocked');
  assert.equal(h.calls.includes('mergePR'), false);
});

test('maintenance plans survive authenticated production resumption with the original saved baseline', async () => {
  const options = { maintenance: true, postInfrastructureFailure: true };
  const h = harness(options);
  const first = await h.controller.run();
  assert.equal(first.stage, 'verify-production', `${first.stage}: ${first.reason}`);
  h.uploadEvidence();
  options.postInfrastructureFailure = false;
  const resumed = await h.newController('901').run();
  assert.equal(resumed.outcome, 'promoted', `${resumed.stage}: ${resumed.reason}`);
  assert.equal(resumed.maintenance.identity, first.maintenance.identity);
  assert.equal(h.workerInputs.filter(input => input.phase === 'capture').length, 1);
  assert.equal(h.calls.filter(call => call === 'commit').length, 1);
});


test('maintenance compatibility fixes require separate scope authorization and preserve every planned tool byte', async () => {
  const h = harness({ maintenance: true, repairOnce: true });
  const result = await h.controller.run();
  assert.equal(result.outcome, 'promoted', `${result.stage}: ${result.reason}`);
  assert.equal(h.calls.filter(call => call === 'builder').length, 1);
  assert(h.calls.filter(call => call === 'review').length >= 3);
  assert.deepEqual(result.maintenance.compatibilityPaths, ['src/app.ts']);
  assert.equal(h.calls.includes('worker:resolve'), false);
  const before = h.commits.get(baseSHA).files, after = h.commits.get(result.headSHA).files;
  for (const file of result.maintenance.plan.files) assert.equal(after.get(file.path), file.content);
  assert.notEqual(after.get('src/app.ts'), before.get('src/app.ts'));
  for (const options of [{ badRepair: true }, { largeRepair: true }]) {
    const blocked = harness({ maintenance: true, repairOnce: true, ...options });
    assert.equal((await blocked.controller.run()).outcome, 'blocked');
    assert.equal(blocked.calls.includes('ff:updates'), false);
  }
});

test('maintenance confirmed production regression reuses rollback and exact protected baseline restoration', async () => {
  const h = harness({ maintenance: true, postBehavior: 'runtime' });
  const result = await h.controller.run();
  assert.equal(result.reason, 'confirmed-regression-rolled-back', `${result.stage}: ${result.reason}`);
  assert.equal(result.recoveryComplete, true);
  assert.equal(h.calls.filter(call => call === 'rollback').length, 1);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 2);
  assert.equal(h.calls.includes('worker:resolve'), false);
  assert.equal(h.commits.get(h.refs.main).files.get('.nvmrc'), '24.22.1\n');
  assert.equal(h.workerInputs.filter(input => input.phase === 'capture').length, 1);
  assert.equal(h.calls.filter(call => call.startsWith('runtime:')).at(-1), 'runtime:24.22.1');
});

test('young necessary Node and Action fixes retain exact protected restore under the promoted trusted Node minimum', async () => {
  const h = harness({ maintenance: true, youngMaintenance: true, urgentNode: true, urgentAction: true,
    trustedRuntimeFromMain: true, verifyApplicationRuntime: true, postBehavior: 'runtime' });
  const result = await h.controller.run();
  assert.equal(result.reason, 'confirmed-regression-rolled-back', `${result.stage}: ${result.reason}`);
  assert.equal(result.recoveryComplete, true);
  assert.equal(h.calls.filter(call => call === 'rollback').length, 1);
  assert.equal(h.calls.filter(call => call === 'mergePR').length, 2);
  assert.deepEqual(h.commits.get(h.refs.main).files, h.commits.get(baseSHA).files);
  assert(h.calls.includes('application-runtime:24.22.1:24.22.2:ordinary'));
  assert(h.calls.includes('application-runtime:24.22.2:24.22.1:recovery'));
  assert.equal(h.calls.filter(call => call === 'dispatch:application-checks.yml').length, 2);
  assert.equal(h.calls.filter(call => call === 'dispatch:pr-review.yml').length, 2);
  assert.equal(h.workerInputs.filter(input => input.phase === 'capture').length, 1);
  assert.equal(h.calls.filter(call => call.startsWith('runtime:')).at(-1), 'runtime:24.22.1');
});

test('young maintenance resumption refreshes proofs for the original used pins after Node promotion', async () => {
  const options = { maintenance: true, youngMaintenance: true, urgentNode: true, urgentAction: true,
    trustedRuntimeFromMain: true, postInfrastructureFailure: true };
  const h = harness(options), first = await h.controller.run();
  assert.equal(first.stage, 'verify-production', `${first.stage}: ${first.reason}`);
  h.uploadEvidence();
  options.postInfrastructureFailure = false;
  h.setNow(now + 3600000);
  const resumed = await h.newController('901').run();
  assert.equal(resumed.outcome, 'promoted', `${resumed.stage}: ${resumed.reason}`);
  assert.equal(resumed.maintenance.identity, first.maintenance.identity);
  assert.deepEqual(h.proofInputs.map(input => input.runId), ['900', '901']);
  assert.equal(h.proofInputs[1].now, now + 3600000);
  assert.deepEqual(h.proofInputs[1].targets, maintenanceAdapter.usedToolchainTargets(h.commits.get(baseSHA).files));
  assert.equal(h.proofInputs[1].targets[0].version, '24.22.1');
  assert.equal(h.commits.get(h.refs.main).files.get('.nvmrc'), '24.22.2\n');
  assert.equal(h.calls.filter(call => call === 'maintenance').length, 1);
  assert.equal(h.calls.filter(call => call === 'commit').length, 1);
  assert.equal(h.workerInputs.filter(input => input.phase === 'capture').length, 1);
});

test('resumed young plans reject tampered serialized proof claims and missing fresh primary confirmation', async () => {
  for (const tamper of ['advisory', 'fromVersion', 'fromSHA', 'withdrawn', 'unavailable']) {
    const options = { maintenance: true, youngMaintenance: true, urgentNode: true, urgentAction: true,
      trustedRuntimeFromMain: true, postInfrastructureFailure: true };
    const h = harness(options), first = await h.controller.run();
    assert.equal(first.stage, 'verify-production', `${tamper}: ${first.stage}: ${first.reason}`);
    h.uploadEvidence();
    const artifact = h.remote.get(9000), path = [...artifact.keys()].sort().at(-1);
    const saved = JSON.parse(artifact.get(path));
    // Recompute the public digest, keeping every planned byte unchanged. Only
    // the fresh primary proof validator can reject these forged CVE claims.
    for (const proof of [...saved.maintenance.plan.waivers, ...saved.maintenance.plan.toolchainPlan.securityProofs]) {
      proof.independent = true;
      if (tamper === 'advisory') proof.advisory.id = 'CVE-2099-999999';
      if (tamper === 'fromVersion') proof.fromVersion = proof.target.kind === 'node' ? '24.22.0' : 'v5.0.0';
      if (tamper === 'fromSHA' && proof.target.kind === 'action') proof.fromSHA = 'f'.repeat(40);
    }
    saved.maintenance.identity = hash(JSON.stringify(saved.maintenance.plan));
    artifact.set(path, Buffer.from(JSON.stringify(saved)));
    options.postInfrastructureFailure = false;
    options.withdrawToolchainCve = tamper === 'withdrawn';
    options.primaryUnavailable = tamper === 'unavailable';
    const resumed = await h.newController('901').run();
    assert.equal(resumed.outcome, 'blocked', `${tamper}: ${resumed.stage}: ${resumed.reason}`);
    if (tamper !== 'unavailable') assert.equal(resumed.reason, 'maintenance-plan-invalid');
    assert.equal(h.proofInputs.length, 2);
    assert.equal(h.calls.filter(call => call === 'commit').length, 1);
    assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
    assert.equal(h.workerInputs.filter(input => input.phase === 'browser').length, 1);
    assert.equal(h.calls.includes('rollback'), false);
  }
});

test('resumed maintenance authenticates saved plan identity and recomputes bytes even under the new controller Node pin', async () => {
  for (const tamper of [null, 'identity', 'bytes', 'hashes']) {
    const options = { maintenance: true, postInfrastructureFailure: true, trustedRuntimeFromMain: true };
    const h = harness(options);
    const first = await h.controller.run();
    assert.equal(first.stage, 'verify-production', `${first.stage}: ${first.reason}`);
    h.uploadEvidence();
    if (tamper) {
      const artifact = h.remote.get(9000);
      const path = [...artifact.keys()].sort().at(-1), saved = JSON.parse(artifact.get(path));
      if (tamper === 'identity') saved.maintenance.identity = '0'.repeat(64);
      if (tamper === 'bytes') {
        saved.maintenance.plan.files[0].content += '// tampered';
        saved.maintenance.identity = hash(JSON.stringify(saved.maintenance.plan));
      }
      if (tamper === 'hashes') saved.maintenance.files = [];
      artifact.set(path, Buffer.from(JSON.stringify(saved)));
    }
    options.postInfrastructureFailure = false;
    const resumed = await h.newController('901').run();
    assert.equal(resumed.outcome, tamper ? 'blocked' : 'promoted', `${tamper}: ${resumed.stage}: ${resumed.reason}`);
    assert.equal(h.calls.filter(call => call === 'mergePR').length, 1);
    assert.equal(h.calls.filter(call => call === 'worker:capture').length, 1);
    if (tamper) assert.equal(h.workerInputs.filter(input => input.phase === 'browser').length, 1);
  }
});


test('maintenance review receives every changed file and rejects an incomplete compare response', async () => {
  const h = harness({ maintenance: true, incompleteMaintenanceDiff: true });
  const result = await h.controller.run();
  assert.equal(result.reason, 'maintenance-review-diff-incomplete');
  assert.equal(h.calls.includes('worker:validate'), false);
  assert.equal(h.calls.includes('review'), false);
  assert.equal(h.calls.includes('ff:updates'), false);
});
