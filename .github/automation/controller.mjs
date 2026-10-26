#!/usr/bin/env node
/** Trusted, stdlib-only controller. Never imports or executes candidate code.
 * Candidate execution belongs exclusively to authenticated secretless workers.
 * CLI: node .github/automation/controller.mjs preflight|scan
 * Always upload evidence/ (including on failure); serialize scheduled scan runs.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import * as github from './github.mjs';
import { worker as dispatchWorker } from './artifacts.mjs';
import * as aiAdapter from './ai.mjs';
import * as vercelAdapter from './vercel.mjs';
import * as dependencies from './dependencies.mjs';
import {
  REQUIRED_CHECKS, changedLockEntries, validateCandidateDiff, validateLockfile,
  validatePackageUpgrade, validatePromotionVerdict, timestamp, packageNameFromPath, publicationEligibility,
} from './policy.mjs';
import { deriveCveProofs, discoverDependencyUpdates, exactTargets, necessaryCveFix } from './discovery.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CHECK_NAMES = Object.freeze([...new Set([...REQUIRED_CHECKS, 'research', 'review'])]);
export const CHECK_CONTEXTS = Object.freeze(CHECK_NAMES.map(name => `security/${name}`));
const ROUTES = ['/', '/news', '/anmeldung', '/chronik', '/impressum', '/datenschutz', '/anfahrt/solarcity', '/anfahrt/auhof'];
const VARIANTS = [360, 768, 1280].flatMap(width => ['de', 'en'].flatMap(lang => ['light', 'dark'].map(theme => `${width}-${lang}-${theme}`)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = path => /^src\/(?:[\w-]+\/)*[\w.-]+\.(?:[cm]?[jt]sx?|css)$/.test(path) &&
  !/(?:test|spec|qa|deploy|access|auth|permission|security|config|agent)/i.test(path);

export class Blocked extends Error {
  constructor(code) { super(code); this.name = 'Blocked'; }
}
function requireSafe(condition, code) { if (!condition) throw new Blocked(code); }
function requireOK(result, code) { requireSafe(result?.ok === true, code); return result; }
function oldestTime(values) { return values.reduce((oldest, value) => timestamp(value) < timestamp(oldest) ? value : oldest); }

/** GitHub strict required checks close the base race that the merge endpoint's
 * head-only SHA parameter cannot close. No environment switch disables this.
 * See https://docs.github.com/en/rest/branches/branch-protection .
 */
export function validateMainProtection(protection, requiredContexts = CHECK_CONTEXTS) {
  const checks = protection?.required_status_checks;
  const contexts = new Set([...(checks?.contexts ?? []), ...(checks?.checks ?? []).map(check => check.context)]);
  const bypass = protection?.required_pull_request_reviews?.bypass_pull_request_allowances;
  return checks?.strict === true && protection.enforce_admins?.enabled === true &&
    protection.allow_force_pushes?.enabled === false && protection.allow_deletions?.enabled === false &&
    Array.isArray(requiredContexts) && requiredContexts.length > 0 && requiredContexts.every(context => contexts.has(context)) &&
    (!bypass || ['users', 'teams', 'apps'].every(key => Array.isArray(bypass[key]) && bypass[key].length === 0));
}

/** A baseline with vulnerabilities is useful research, never a clean gate. */
export function auditEvidence(worker, lock, { baseline = false } = {}) {
  return [['audit', 'all'], ['auditProduction', 'production']].map(([key, scope]) => {
    const input = worker?.[key];
    const verdict = dependencies.inspectNpmAudit(input?.report, { scope, exitCode: input?.exitCode, lock });
    requireSafe(baseline ? verdict.errors.every(error => error === 'npm audit reports vulnerabilities') : verdict.ok, `audit-${scope}-blocked`);
    return verdict;
  });
}

export function artifactJSON(worker, path) {
  const bytes = worker?.files?.get(path);
  requireSafe(Buffer.isBuffer(bytes) && bytes.length <= 20_000_000, 'missing-worker-json');
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw new Blocked('invalid-worker-json'); }
}

/** Only hash-checked bytes from the authenticated artifact reach vision. */
export function checkedArtifact(worker, path, hashes) {
  requireSafe(typeof path === 'string' && /^[\w./-]+$/.test(path) && !path.split('/').includes('..'), 'unsafe-qa-artifact-path');
  const bytes = worker.files?.get(`qa/${path}`);
  requireSafe(Buffer.isBuffer(bytes) && digest(bytes) === hashes?.[path], 'qa-artifact-integrity-failed');
  return bytes;
}

function completeSite(site, requireFunctional = true) {
  return site?.variants?.length === VARIANTS.length && VARIANTS.every(key => {
    const variant = site.variants.find(item => item.key === key);
    return (!requireFunctional || variant?.functional) && isDeepStrictEqual(variant?.routes?.map(route => route.path), ROUTES);
  });
}

/** Concrete application assertions, not transport/timeouts/browser startup.
 * A functional comparison only proves regression when the candidate completed
 * its functional checks; null from a timed-out probe is infrastructure evidence.
 */
export function regressionSignals(qa) {
  const signals = new Set();
  for (const check of qa?.checks ?? []) {
    if (check.pass !== false) continue;
    if (/(?:semantic comparison|content comparison)$/.test(check.name)) signals.add(check.name);
    if (/functional comparison$/.test(check.name) && qa.candidate?.variants?.every(variant => variant.functional)) signals.add(check.name);
  }
  for (const error of qa?.errors ?? []) {
    const message = error.message ?? '';
    if (/^candidate API /.test(error.check) && /^HTTP (?:4(?!08|29)\d\d|500)$/.test(message)) signals.add(`${error.check}:${message}`);
    if (/^candidate .* functional$/.test(error.check) && /^(?:Toggle or persisted state failed|SPA navigation failed|Anchor .* did not reach|Fee disclosure|Drawer did not close|Short drawer did not close|Real teams UI differs|PDF text\/content missing|Downloaded artifact is not a complete PDF)/.test(message))
      signals.add(`${error.check}:${message}`);
  }
  return [...signals].sort();
}

export function confirmRepeatedRegression(first, second) {
  const repeated = new Set(regressionSignals(second));
  return regressionSignals(first).some(signal => repeated.has(signal));
}

export function verifyCapture(capture) {
  const qa = artifactJSON(capture, 'qa/result.json');
  requireSafe(capture.pass === true && qa.schema === 1 && qa.pass === true && qa.captureOnly === true && completeSite(qa.baseline), 'baseline-capture-incomplete');
  requireSafe(qa.baseline.pdfs?.length === 2 && Object.keys(qa.artifacts ?? {}).length >= 99, 'baseline-artifacts-incomplete');
  for (const path of ['teams-fixture.json', ...qa.baseline.pdfs.map(pdf => pdf.file), ...qa.baseline.variants.flatMap(variant => variant.routes.map(route => route.screenshot))])
    checkedArtifact(capture, path, qa.artifacts);
  return qa;
}

/** Compare to the saved immutable capture, never a freshly recaptured production.
 * Review all 96 pairs, bounded to <=12 images and 6 MiB per fresh vision call.
 * Large screenshots fail closed; the worker may supply smaller lossless images
 * in a future separately reviewed harness revision.
 */
export async function reviewBrowserImages({ capture, comparison, baseSHA, headSHA, deploymentId, ai = aiAdapter }) {
  const baseline = verifyCapture(capture), qa = artifactJSON(comparison, 'qa/result.json');
  requireSafe(qa.schema === 1 && qa.captureOnly === false, 'candidate-comparison-malformed');
  requireSafe(qa.baselineManifestSha256 === digest(capture.files.get('qa/result.json')), 'baseline-manifest-substituted');
  requireSafe(isDeepStrictEqual(qa.baseline, baseline.baseline) && isDeepStrictEqual(qa.metadata, baseline.metadata), 'baseline-or-harness-substituted');
  if (!completeSite(qa.candidate, false)) return { pass: false, confirmedRegression: false, reviews: [], qa,
    incompleteCaptures: true, regressionSignals: regressionSignals(qa) };
  const reviews = [];
  let images = [], labels = [], bytes = 0;
  async function flush() {
    if (!images.length) return;
    reviews.push(await ai.reviewVisualEvidence({ baseSHA, headSHA, deploymentId,
      summary: JSON.stringify({ imageOrder: labels, checks: qa.checks, errors: qa.errors }), images }));
    images = []; labels = []; bytes = 0;
  }
  for (const variant of baseline.baseline.variants) {
    const next = qa.candidate.variants.find(item => item.key === variant.key);
    for (const route of variant.routes) {
      const candidate = next.routes.find(item => item.path === route.path);
      const pair = [checkedArtifact(capture, route.screenshot, baseline.artifacts), checkedArtifact(comparison, candidate.screenshot, qa.artifacts)];
      const pairBytes = pair.reduce((n, image) => n + image.length, 0);
      requireSafe(pairBytes <= 6 * 1024 * 1024, 'vision-pair-too-large');
      if (images.length + 2 > 12 || bytes + pairBytes > 6 * 1024 * 1024) await flush();
      images.push(...pair.map(image => `data:image/png;base64,${image.toString('base64')}`));
      labels.push({ index: images.length - 2, site: 'saved production baseline', variant: variant.key, route: route.path },
        { index: images.length - 1, site: 'candidate', variant: variant.key, route: route.path });
      bytes += pairBytes;
    }
  }
  await flush();
  const visualPass = reviews.length > 0 && reviews.every(review => review.pass === true);
  const comparisonFailure = qa.checks?.some(check => check.pass === false && /(?:pixels|semantic comparison|functional comparison|content comparison)$/.test(check.name));
  // A transport error, fatal harness error, missing screenshot or vague model
  // refusal never authorizes rollback. Require both completed comparison and an
  // independent concrete high/critical visual finding.
  const confirmedRegression = comparisonFailure === true && !qa.errors?.some(error => error.check === 'fatal') && reviews.some(review => review.pass === false &&
    review.findings?.some(finding => ['high', 'critical'].includes(finding.severity) && finding.evidence?.length));
  return { pass: comparison.pass === true && qa.pass === true && visualPass, confirmedRegression, reviews, qa };
}

export async function trustedToolchain() {
  const pin = (await readFile(resolve(ROOT, '.nvmrc'), 'utf8')).trim();
  requireSafe(/^24\.\d+\.\d+$/.test(pin) && process.versions.node === pin, 'controller-runtime-must-match-nvmrc');
  const npmRoot = resolve(dirname(process.execPath), '../lib/node_modules/npm');
  const npm = JSON.parse(await readFile(resolve(npmRoot, 'package.json'), 'utf8'));
  return { nodeVersion: pin, npmVersion: npm.version, supportedLtsMajors: [24], semver: dependencies.loadNpmSemver(npmRoot) };
}

/** Dependency injection is for focused tests and trusted callers only. Never
 * construct adapters/options from candidate contents or PR metadata.
 */
export function createController({ gh = github, worker = dispatchWorker, ai = aiAdapter,
  vercel = vercelAdapter, dep = dependencies, env = process.env, now = Date.now,
  toolchain = trustedToolchain, evidenceDir = resolve(ROOT, 'evidence'), persist,
  nonce = randomUUID, sleep = delay } = {}) {
  const state = { schemaVersion: 1, stage: 'starting', outcome: 'running', createdAt: new Date(now()).toISOString() };
  let sequence = 0;
  const trees = new Map();
  const secrets = ['GH_TOKEN', 'GITHUB_TOKEN', 'AI_API_KEY', 'AI_BASE_URL', 'VERCEL_TOKEN'].map(key => env[key]).filter(Boolean);
  function redact(value) {
    return JSON.stringify(value, (key, item) => {
      if (key === 'files' && item instanceof Map) return Object.fromEntries([...item].map(([path, bytes]) => [path, digest(bytes)]));
      if (typeof item !== 'string') return item;
      for (const secret of secrets) item = item.split(secret).join('[REDACTED]');
      return item.replace(/\b(?:bearer\s+|authorization\s*[:=]\s*)[^\s,"}]+/gi, '[REDACTED]');
    }, 2) + '\n';
  }
  async function save(name, value) {
    const text = redact(value), file = `${String(sequence++).padStart(3, '0')}-${name}.json`;
    if (persist) return persist(file, JSON.parse(text));
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(resolve(evidenceDir, file), text, { flag: 'wx' });
  }
  async function checkpoint(stage) { state.stage = stage; await save('checkpoint', state); }
  async function protection() {
    // The GitHub adapter may normalize effective repository rulesets and bind
    // required ordinary-PR checks to the GitHub Actions integration. Promotion
    // checks below remain mandatory internally, without imposing them on every
    // unrelated PR in the repository.
    const protection = typeof gh.assertProtection === 'function' ? await gh.assertProtection('main') : await gh.repoApi('/branches/main/protection');
    requireSafe(validateMainProtection(protection, gh.REQUIRED_SECURITY_CHECKS ?? CHECK_CONTEXTS), 'main-strict-protection-required');
  }
  async function current(baseSHA, updatesSHA) {
    requireSafe(await gh.ref('main') === baseSHA, 'main-advanced-restart-required');
    if (updatesSHA) requireSafe(await gh.ref('updates') === updatesSHA, 'updates-changed-restart-required');
  }
  async function tree(sha) {
    if (!trees.has(sha)) {
      const commit = await gh.repoApi(`/git/commits/${sha}`);
      const result = await gh.repoApi(`/git/trees/${commit.tree.sha}?recursive=1`);
      requireSafe(result.truncated === false && Array.isArray(result.tree), 'incomplete-git-tree');
      trees.set(sha, new Map(result.tree.map(entry => [entry.path, entry])));
    }
    return trees.get(sha);
  }
  async function regularFile(path, sha) {
    const entry = (await tree(sha)).get(path);
    requireSafe(entry?.type === 'blob' && entry.mode === '100644', 'candidate-file-is-not-regular');
    return gh.file(path, sha);
  }
  async function snapshot(sha) {
    let manifest, lock;
    try {
      manifest = JSON.parse(await regularFile('package.json', sha));
      lock = JSON.parse(await regularFile('package-lock.json', sha));
    } catch (error) { if (error instanceof Blocked) throw error; throw new Blocked('invalid-manifest-or-lock-json'); }
    requireOK(validateLockfile(lock), 'invalid-lockfile');
    return { manifest, lock };
  }
  async function dispatched(phase, baseSHA, headSHA, extra = {}) {
    const evidence = await worker({ phase, baseSHA, headSHA, ...extra });
    requireSafe(evidence?.phase === phase && evidence.baseSHA === baseSHA && evidence.headSHA === headSHA &&
      Number.isSafeInteger(evidence.runId) && Number.isSafeInteger(evidence.artifactId), 'worker-evidence-identity-mismatch');
    requireSafe(Number.isFinite(timestamp(evidence.completedAt)) && timestamp(evidence.completedAt) <= now() &&
      now() - timestamp(evidence.completedAt) < 86400000, 'worker-evidence-stale');
    await save(`worker-${phase}`, evidence);
    return evidence;
  }
  async function research(packages, baseSHA, headSHA) {
    requireSafe(packages.length <= 2000, 'research-target-limit');
    const results = [];
    for (let offset = 0; offset < packages.length; offset += 100) {
      const result = await ai.researchPackages({ packages: packages.slice(offset, offset + 100), baseSHA, headSHA });
      await save('research', result);
      requireSafe(result.pass === true && result.baseSHA === baseSHA && result.headSHA === headSHA, 'live-package-research-blocked');
      requireSafe(Number.isFinite(timestamp(result.timestamp)) && timestamp(result.timestamp) <= now() && now() - timestamp(result.timestamp) <= 86400000, 'live-package-research-stale');
      results.push(result);
    }
    return results;
  }
  async function advisorySources(lock) {
    const queries = await dep.queryOsvLockfile(lock);
    const ids = [...new Set(queries.flatMap(query => query.advisories.map(advisory => advisory.id)))].filter(id =>
      /^(?:CVE-\d{4}-\d{4,}|GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4})$/.test(id));
    requireSafe(ids.length <= 200, 'advisory-source-limit');
    const entries = await dep.mapConcurrent(ids, async id => [id, await dep.fetchOsvAdvisory(id)]);
    const advisories = Object.fromEntries(entries);
    await save('osv-baseline', { queries, advisories });
    return { queries, advisories };
  }
  async function preflight() {
    await checkpoint('preflight');
    const runtime = await toolchain();
    await protection();
    const baseSHA = await gh.ref('main'), updatesSHA = await gh.ref('updates');
    requireSafe((await gh.file('.nvmrc', baseSHA)).trim() === runtime.nodeVersion, 'main-runtime-pin-differs');
    const configuration = await vercel.preflight();
    const production = await vercel.getProductionDeployment();
    requireSafe(production.sha === baseSHA && production.branch === 'main' && production.projectId === configuration.projectId, 'production-does-not-match-main');
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: baseSHA, deploymentId: production.id });
    await vercel.verifyRuntime({ deploymentId: production.id });
    const readiness = await ai.preflight();
    await save('ai-preflight', readiness);
    requireSafe(readiness.pass === true, 'ai-websearch-preflight-blocked');
    Object.assign(state, { baseSHA, updatesSHA, production, configuration });
    await current(baseSHA, updatesSHA);
    return { runtime, baseSHA, updatesSHA, configuration, production };
  }
  async function candidateDiff(baseSHA, headSHA, compatibilityPaths) {
    const files = await gh.changes(baseSHA, headSHA);
    const changes = files.map(file => ({ path: file.filename, status: file.status === 'modified' ? 'M' : file.status,
      oldPath: file.previous_filename, addedLines: file.additions, deletedLines: file.deletions }));
    requireOK(validateCandidateDiff(changes, { compatibilityPaths }), 'candidate-scope-blocked');
    for (const change of changes) await regularFile(change.path, headSHA);
    const diff = await gh.repoApi(`/compare/${baseSHA}...${headSHA}`, { accept: 'application/vnd.github.diff' });
    requireSafe(typeof diff === 'string' && diff.length > 0 && Buffer.byteLength(diff) <= 8_000_000, 'candidate-diff-incomplete');
    return { changes, diff };
  }
  async function repair({ baseSHA, headSHA, findings, validation, compatibilityPaths }) {
    // Paths originate in a failure, then an independent reviewer authorizes the
    // bounded scope before a fresh stateless builder sees replacement files.
    const text = JSON.stringify(findings) + '\n' + (validation ? [...(validation.files ?? [])]
      .filter(([path]) => /^(?:lint|build)\.log$/.test(path)).map(([, bytes]) => bytes.toString('utf8')).join('\n') : '');
    const paths = [...new Set([...(findings ?? []).map(finding => finding.path).filter(Boolean),
      ...text.matchAll(/\bsrc\/(?:[\w-]+\/)*[\w.-]+\.(?:[cm]?[jt]sx?|css)\b/g)].map(item => typeof item === 'string' ? item : item[0]))].filter(sourcePath);
    requireSafe(paths.length > 0 && new Set([...compatibilityPaths, ...paths]).size <= 5, 'repair-has-no-bounded-source-scope');
    const files = await Promise.all(paths.map(async path => ({ path, content: await regularFile(path, headSHA) })));
    const scope = await ai.reviewPullRequest({ baseSHA, headSHA, diff: 'Review the proposed compatibility repair scope before any builder changes.',
      context: { stage: 'authorize-repair-scope', paths, files, findings, validationLog: text.slice(0, 150000),
        constraint: 'Only minimal source compatibility fixes; no functionality, security boundaries, tests, toolchain or policy changes.' } });
    await save('repair-scope-review', scope);
    requireSafe(scope.pass === true, 'repair-scope-review-blocked');
    const proposed = await ai.proposeRepairs({ baseSHA, headSHA, files, findings, validationLog: text.slice(0, 150000) });
    requireSafe(Array.isArray(proposed) && proposed.length > 0 && proposed.length <= files.length &&
      new Set(proposed.map(file => file.path)).size === proposed.length && proposed.every(file =>
        paths.includes(file.path) && typeof file.content === 'string' && Buffer.byteLength(file.content) <= 500000), 'repair-proposal-out-of-scope');
    const changed = proposed.filter(file => file.content !== files.find(previous => previous.path === file.path).content);
    requireSafe(changed.length > 0, 'repair-proposal-empty');
    await save('builder-proposal', changed);
    return { headSHA: await gh.commitFiles(headSHA, changed, 'fix: bounded dependency compatibility repair'),
      compatibilityPaths: [...new Set([...compatibilityPaths, ...paths])] };
  }
  async function validatedCandidate({ baseSHA, headSHA, branch, base, advisories, runtime }) {
    let compatibilityPaths = [];
    for (let attempt = 0; attempt <= 3; attempt++) {
      state.headSHA = headSHA;
      await checkpoint('candidate-policy-and-research');
      const head = await snapshot(headSHA);
      requireOK(validatePackageUpgrade(base.manifest, head.manifest), 'manifest-upgrade-policy-blocked');
      requireOK(dep.validateManifestLock(head.manifest, head.lock, runtime.semver), 'manifest-lock-mismatch');
      const changes = changedLockEntries(base.lock, head.lock);
      const metadata = await dep.fetchRegistryMetadata([...new Set(changes.map(change => change.name))]);
      const proofs = deriveCveProofs({ baseLock: base.lock, headLock: head.lock, metadata, advisories, now: now(), semver: runtime.semver });
      const policy = dep.preflightLockUpdate({ baseLock: base.lock, headLock: head.lock, metadata, advisories, proofs, now: now(), ...runtime });
      const policyAt = new Date(now()).toISOString();
      await save('lock-policy', { policy, metadata, proofs });
      requireOK(policy, 'whole-lock-policy-blocked');
      const researched = await research(exactTargets(changes), baseSHA, headSHA);
      const osv = await dep.queryOsvLockfile(head.lock);
      await save('osv-candidate', osv);
      requireSafe(osv.every(query => query.advisories.length === 0), 'candidate-osv-advisory-blocked');
      const dependenciesAt = new Date(now()).toISOString();
      const diff = await candidateDiff(baseSHA, headSHA, compatibilityPaths);
      const review = await ai.reviewPullRequest({ baseSHA, headSHA, diff: diff.diff,
        context: { manifest: head.manifest, lock: head.lock, research: researched, lockPolicy: policy,
          lifecycleChanges: policy.lifecycleChanges, requiresLifecycleReview: policy.requiresLifecycleReview,
          instruction: 'Explicitly review every lifecycle change; install scripts remain disabled in all workers.' } });
      await save('independent-code-review', review);
      requireSafe(review.baseSHA === baseSHA && review.headSHA === headSHA, 'independent-code-review-identity-mismatch');
      requireSafe(Number.isFinite(timestamp(review.provenance?.timestamp)) && timestamp(review.provenance.timestamp) <= now() &&
        now() - timestamp(review.provenance.timestamp) <= 86400000, 'independent-code-review-stale');
      let validation;
      if (review.pass === true) {
        await checkpoint('secretless-validation');
        validation = await dispatched('validate', baseSHA, headSHA);
        if (validation.pass === true) {
          requireSafe(validation.nodeVersion === `v${runtime.nodeVersion}`, 'validation-runtime-mismatch');
          requireSafe(['install', 'tree', 'lint', 'build'].every(name => validation.checks?.some(check => check.name === name && check.pass === true && check.exitCode === 0)), 'validation-checks-incomplete');
          auditEvidence(validation, head.lock);
          return { headSHA, head, policy, researched, review, validation, compatibilityPaths,
            evidenceTimes: { policy: policyAt, dependencies: dependenciesAt, audit: validation.completedAt, build: validation.completedAt,
              research: researched.length ? oldestTime(researched.map(result => result.timestamp)) : policyAt,
              review: review.provenance?.timestamp } };
        }
      }
      requireSafe(attempt < 3, 'repair-limit-reached');
      const findings = review.pass === true ? [{ severity: 'high', message: 'Secretless validation failed', evidence: ['See authenticated validation artifact.'] }] : review.findings;
      const repaired = await repair({ baseSHA, headSHA, findings, validation, compatibilityPaths });
      await gh.fastForward(branch, headSHA, repaired.headSHA);
      headSHA = repaired.headSHA; compatibilityPaths = repaired.compatibilityPaths;
    }
    throw new Blocked('repair-limit-reached');
  }
  async function statuses(headSHA, names, success) {
    for (const name of names) await gh.setStatus(headSHA, `security/${name}`, success, success ? 'Trusted dependency controller evidence passed' : 'Automation blocked; inspect controller evidence');
  }
  async function requiredPRChecks({ baseSHA, headSHA, number, headBranch = 'updates' }) {
    // GITHUB_TOKEN-originated updates/PRs do not trigger push or PR workflows.
    // Dispatch only installed, trusted workflow names. The candidate cannot
    // change either workflow under validateCandidateDiff.
    await gh.repoApi('/actions/workflows/automation-checks.yml/dispatches', { method: 'POST', body: { ref: headBranch } });
    await gh.repoApi('/actions/workflows/pr-review.yml/dispatches', { method: 'POST', body: { ref: 'main', inputs: { pr_number: String(number) } } });
    const contexts = gh.REQUIRED_SECURITY_CHECKS ?? CHECK_CONTEXTS;
    for (let poll = 0; poll < 210; poll++) {
      await current(baseSHA);
      requireSafe(await gh.ref(headBranch) === headSHA, 'checked-pr-head-changed');
      const checks = await gh.repoApi(`/commits/${headSHA}/check-runs?per_page=100`);
      const statuses = await gh.repoApi(`/commits/${headSHA}/status?per_page=100`);
      requireSafe(Array.isArray(checks.check_runs) && checks.total_count < 100 && Array.isArray(statuses.statuses) && statuses.statuses.length < 100, 'required-checks-incomplete');
      const observations = contexts.map(context => {
        const check = checks.check_runs.find(item => item.name === context && item.head_sha === headSHA && item.app?.id === 15368);
        // Combined status returns the latest status per context. The ruleset
        // independently requires the GitHub Actions integration at merge time.
        const status = statuses.statuses.find(item => item.context === context && item.creator?.login === 'github-actions[bot]');
        return { context, pass: check?.status === 'completed' && check.conclusion === 'success' || status?.state === 'success',
          failed: check?.status === 'completed' && !['success', 'neutral', 'skipped'].includes(check.conclusion) || ['failure', 'error'].includes(status?.state) };
      });
      if (observations.every(item => item.pass)) { await save('required-pr-checks', { headSHA, observations }); return; }
      requireSafe(!observations.some(item => item.failed), 'required-pr-check-failed');
      if (poll < 209) await sleep(10000);
    }
    throw new Blocked('required-pr-checks-timeout');
  }
  async function verifyProduction({ baseSHA, headSHA, mergedSHA, capture, production, configuration }) {
    state.mergedSHA = mergedSHA;
    await checkpoint('verify-production');
    // Exceptions here are infrastructure failures: caller reports and blocks,
    // with no automatic rollback unless a completed comparison proves regression.
    const deployed = await vercel.waitForDeployment({ sha: mergedSHA, branch: 'main', production: true });
    requireSafe(deployed.sha === mergedSHA && deployed.branch === 'main' && deployed.projectId === configuration.projectId && deployed.readyState === 'READY', 'production-deployment-identity-mismatch');
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
    await vercel.verifyRuntime({ deploymentId: deployed.id });
    const comparison = await dispatched('browser', baseSHA, mergedSHA, { baselineRun: String(capture.runId),
      baselineURL: `https://${configuration.productionHostname}`, candidateURL: `https://${configuration.productionHostname}` });
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
    const visual = await reviewBrowserImages({ capture, comparison, baseSHA, headSHA: mergedSHA, deploymentId: deployed.id, ai });
    if (!visual.pass && !visual.confirmedRegression && regressionSignals(visual.qa).length > 0) {
      // A new independently dispatched worker, not a repeated interpretation of
      // the same screenshots, confirms behavior/API/PDF failures. Vision may pass.
      await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
      const rerun = await dispatched('browser', baseSHA, mergedSHA, { baselineRun: String(capture.runId),
        baselineURL: `https://${configuration.productionHostname}`, candidateURL: `https://${configuration.productionHostname}` });
      const repeat = await reviewBrowserImages({ capture, comparison: rerun, baseSHA, headSHA: mergedSHA, deploymentId: deployed.id, ai });
      await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
      visual.confirmedRegression = confirmRepeatedRegression(visual.qa, repeat.qa);
      await save('production-independent-browser-confirmation', repeat);
    }
    await save('production-browser-review', visual);
    if (visual.confirmedRegression) {
      await checkpoint('confirmed-production-regression');
      const rollback = await vercel.rollback({ failedDeploymentId: deployed.id, previousDeploymentId: production.id, expectedFailedSHA: mergedSHA });
      await save('vercel-rollback', rollback);
      await gh.ensureLabels();
      await gh.issue('Dependency automation: confirmed production regression',
        `Deployment ${deployed.id} (${mergedSHA}) failed saved-baseline browser and independent vision review. Vercel rollback was verified. Git restore is attempted only while main still equals the failed merge.`, 'dependency-production-regression');
      if (await gh.ref('main') === mergedSHA) {
        const original = await gh.repoApi(`/git/commits/${baseSHA}`);
        const restore = await gh.repoApi('/git/commits', { method: 'POST', body: { message: 'revert: dependency update after confirmed production regression', tree: original.tree.sha, parents: [mergedSHA] } });
        await gh.fastForward('main', mergedSHA, restore.sha);
        state.restoreSHA = restore.sha;
      }
      throw new Blocked('confirmed-regression-rolled-back');
    }
    requireSafe(visual.pass === true, 'postproduction-check-blocked-without-confirmed-regression');
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
    requireSafe(await gh.ref('main') === mergedSHA, 'production-main-advanced');
    return { deployed, visual };
  }
  async function scan() {
    const context = await preflight();
    const { baseSHA, updatesSHA, runtime, configuration, production } = context;
    // Unpublished/resumable work is never reset or merged implicitly. A later
    // scan blocks for reconciliation if updates contains work absent from main.
    const ancestry = await gh.repoApi(`/compare/${updatesSHA}...${baseSHA}`);
    requireSafe(['ahead', 'identical'].includes(ancestry.status), 'updates-has-unpromoted-or-unrelated-work');
    const base = await snapshot(baseSHA);
    requireOK(dep.validateManifestLock(base.manifest, base.lock, runtime.semver), 'baseline-manifest-lock-mismatch');
    const inspection = await dispatched('inspect', baseSHA, baseSHA);
    requireSafe(inspection.pass === true && inspection.nodeVersion === `v${runtime.nodeVersion}`, 'baseline-inspection-failed');
    const baselineAudits = auditEvidence(inspection, base.lock, { baseline: true });
    const { queries: baselineOsv, advisories } = await advisorySources(base.lock);
    const necessaryFixes = Object.entries(base.lock.packages).filter(([path]) => path).flatMap(([path, entry]) => {
      const name = packageNameFromPath(path);
      const fix = necessaryCveFix({ name, fromVersion: entry.version, advisories, semver: runtime.semver, now: now() });
      return fix ? [{ name, ...fix }] : [];
    });
    const names = [...new Set([...Object.keys(base.manifest.dependencies ?? {}), ...Object.keys(base.manifest.devDependencies ?? {}), ...necessaryFixes.map(fix => fix.name)])];
    const metadata = await dep.fetchRegistryMetadata(names);
    const discovery = discoverDependencyUpdates({ ...base, metadata, advisories, now: now(), ...runtime });
    await save('discovery', { selections: discovery.selections, metadata, baselineAudits });
    const branch = `automation/dependencies-${nonce()}`;
    let headSHA = discovery.changed ? await gh.commitFiles(baseSHA, [{ path: 'package.json', content: JSON.stringify(discovery.manifest, null, 2) + '\n' }], 'chore: discover dependency releases') : baseSHA;
    if (discovery.changed) await gh.createBranch(branch, headSHA);
    Object.assign(state, { branch, headSHA });
    // Direct exact targets are researched before even lock-only resolution.
    const preliminaryTargets = [...new Map([...discovery.selections, ...necessaryFixes].map(({ name, version }) => [`${name}@${version}`, { name, version }])).values()];
    await research(preliminaryTargets, baseSHA, headSHA);
    await checkpoint('secretless-lock-resolution');
    const urgent = necessaryFixes.some(fix => {
      const age = publicationEligibility(metadata[fix.name]?.time?.[fix.version], now());
      return !age.ok && Number.isFinite(age.ageMs) && metadata[fix.name]?.versions?.[fix.version]?.name === fix.name;
    });
    const resolution = await dispatched('resolve', baseSHA, headSHA, { urgent });
    const resolvedFiles = artifactJSON(resolution, 'worker.json').files;
    requireSafe(resolution.pass === true && Array.isArray(resolvedFiles) && resolvedFiles.length === 1 &&
      resolvedFiles[0].path === 'package-lock.json' && typeof resolvedFiles[0].content === 'string', 'lock-resolution-failed');
    let resolvedLock;
    try { resolvedLock = JSON.parse(resolvedFiles[0].content); } catch { throw new Blocked('resolved-lock-is-invalid-json'); }
    requireOK(validateLockfile(resolvedLock), 'resolved-lock-is-invalid');
    auditEvidence(resolution, resolvedLock, { baseline: true });
    if (isDeepStrictEqual(base.manifest, discovery.manifest) && isDeepStrictEqual(base.lock, resolvedLock)) {
      requireSafe(baselineAudits.every(audit => audit.ok) && baselineOsv.every(query => query.advisories.length === 0), 'no-available-fix-for-baseline-findings');
      state.outcome = 'no-updates';
      await checkpoint('complete');
      return { ...state, summary: 'No eligible dependency changes. Main, updates and production are unchanged.' };
    }
    const resolvedSHA = await gh.commitFiles(headSHA, resolvedFiles, 'chore: resolve dependency lock without scripts');
    if (discovery.changed) await gh.fastForward(branch, headSHA, resolvedSHA);
    else await gh.createBranch(branch, resolvedSHA);
    headSHA = resolvedSHA;
    const candidate = await validatedCandidate({ baseSHA, headSHA, branch, base, advisories, runtime });
    headSHA = candidate.headSHA; state.headSHA = headSHA;
    // Capture once, before publishing updates or touching main, and bind its
    // immutable artifact to the original production deployment and main SHA.
    await current(baseSHA, updatesSHA);
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: baseSHA, deploymentId: production.id });
    const capture = await dispatched('capture', baseSHA, baseSHA, { baselineURL: `https://${configuration.productionHostname}` });
    verifyCapture(capture);
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: baseSHA, deploymentId: production.id });
    state.baseline = { runId: capture.runId, artifactId: capture.artifactId, manifestSHA256: digest(capture.files.get('qa/result.json')) };
    await statuses(headSHA, ['policy', 'dependencies', 'audit', 'build', 'research', 'review'], true);
    await checkpoint('publish-validated-updates');
    await current(baseSHA, updatesSHA);
    await gh.fastForward('updates', updatesSHA, headSHA);
    const deployed = await vercel.waitForDeployment({ sha: headSHA, branch: 'updates' });
    requireSafe(deployed.sha === headSHA && deployed.projectId === configuration.projectId && deployed.readyState === 'READY', 'updates-deployment-identity-mismatch');
    await vercel.verifyAlias({ hostname: configuration.updatesHostname, sha: headSHA, deploymentId: deployed.id });
    await vercel.verifyRuntime({ deploymentId: deployed.id });
    const browser = await dispatched('browser', baseSHA, headSHA, { baselineRun: String(capture.runId), baselineURL: `https://${configuration.productionHostname}`, candidateURL: `https://${configuration.updatesHostname}` });
    await vercel.verifyAlias({ hostname: configuration.updatesHostname, sha: headSHA, deploymentId: deployed.id });
    const visual = await reviewBrowserImages({ capture, comparison: browser, baseSHA, headSHA, deploymentId: deployed.id, ai });
    await save('updates-browser-review', visual);
    requireSafe(visual.pass === true, 'updates-browser-or-vision-blocked');
    await statuses(headSHA, ['qa', 'live'], true);
    await current(baseSHA, headSHA);
    await vercel.verifyAlias({ hostname: configuration.updatesHostname, sha: headSHA, deploymentId: deployed.id });
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: baseSHA, deploymentId: production.id });
    const createdAt = new Date(now()).toISOString();
    // Preserve the original gate times. Creating a verdict must never refresh
    // old research, validation, or review evidence into an apparently fresh pass.
    const times = { ...candidate.evidenceTimes, qa: browser.completedAt, live: createdAt };
    const evidence = name => ({ status: 'pass', checkedAt: times[name], baseSHA, headSHA, deploymentID: deployed.id });
    const verdict = { schemaVersion: 1, baseSHA, headSHA, mainSHA: baseSHA, deploymentID: deployed.id, createdAt,
      research: evidence('research'), checks: Object.fromEntries(CHECK_NAMES.map(name => [name, evidence(name)])) };
    requireOK(validatePromotionVerdict(verdict, { baseSHA, headSHA, deploymentID: deployed.id, currentMainSHA: await gh.ref('main') }, now()), 'promotion-evidence-blocked');
    requireSafe(CHECK_NAMES.every(name => Number.isFinite(timestamp(times[name])) && timestamp(times[name]) <= now() && now() - timestamp(times[name]) <= 86400000), 'promotion-review-evidence-stale');
    await save('promotion-verdict', verdict);
    await protection();
    const pr = await gh.openPR({ base: 'main', head: 'updates', title: 'chore: promote validated dependency updates',
      body: `<!-- dependency-promotion:${baseSHA}:${headSHA} -->\nHourly dependency promotion. All changed direct/transitive releases were researched live and passed whole-lock age/CVE policy, independent code review, both audits, build, browser comparison and screenshot vision review.\n\nBase: ${baseSHA}\nHead: ${headSHA}\nBaseline worker: ${capture.runId}\nEvidence: https://github.com/${gh.repository}/actions/runs/${env.GITHUB_RUN_ID}` });
    // This controller never consumes ordinary pull_request event metadata and
    // never turns an arbitrary PR number into an automatic merge target.
    const freshPR = await gh.repoApi(`/pulls/${pr.number}`);
    requireSafe(freshPR.head?.ref === 'updates' && freshPR.base?.ref === 'main' && freshPR.head.sha === headSHA &&
      freshPR.base.sha === baseSHA && freshPR.head.repo?.full_name === gh.repository, 'promotion-pr-identity-mismatch');
    state.pr = pr.number;
    await checkpoint('required-pr-checks');
    await requiredPRChecks({ baseSHA, headSHA, number: pr.number });
    // The wait above cannot freshen earlier promotion evidence. Revalidate
    // its original timestamps against main immediately before merge.
    requireOK(validatePromotionVerdict(verdict, { baseSHA, headSHA, deploymentID: deployed.id, currentMainSHA: await gh.ref('main') }, now()), 'promotion-evidence-expired-before-merge');
    await protection();
    await checkpoint('merge-protected-promotion');
    await current(baseSHA, headSHA);
    const mergedSHA = await gh.mergePR(pr.number, headSHA, baseSHA);
    state.mergedSHA = mergedSHA;
    await save('merged', state);
    const verified = await verifyProduction({ baseSHA, headSHA, mergedSHA, capture, production, configuration });
    state.outcome = 'promoted'; state.productionDeploymentId = verified.deployed.id;
    await checkpoint('complete');
    return { ...state, summary: 'Dependencies promoted and production verified against the saved baseline.' };
  }
  async function run(mode = 'scan') {
    requireSafe(['scan', 'preflight'].includes(mode), 'unsupported-controller-mode');
    try {
      if (mode === 'scan') return await scan();
      await preflight(); state.outcome = 'preflight-passed'; await checkpoint('complete');
      return { ...state, summary: 'Trusted runtime, strict main protection, Vercel and live AI search are ready.' };
    } catch (error) {
      state.outcome = 'blocked'; state.reason = error instanceof Blocked ? error.message : 'controller-infrastructure-failure';
      await save('blocked', state);
      if (state.headSHA && state.headSHA !== state.baseSHA) {
        try { await statuses(state.headSHA, CHECK_NAMES, false); } catch { /* preserve original failure */ }
      }
      try {
        await gh.ensureLabels();
        await gh.issue('Dependency automation blocked', `Stage: ${state.stage}\nReason: ${state.reason}\nBase: ${state.baseSHA ?? 'unavailable'}\nHead: ${state.headSHA ?? 'unavailable'}\nMerge: ${state.mergedSHA ?? 'none'}\n\nExisting updates are retained. Inspect authenticated evidence before resuming. Infrastructure failures do not authorize production rollback.`, 'dependency-controller-blocked');
      } catch { state.issueReportingFailed = true; await save('issue-report-failed', state); }
      return { ...state, summary: 'Dependency automation blocked safely; inspect the issue and workflow evidence.' };
    }
  }
  return { run, verifyProduction };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await createController().run(process.argv[2] ?? 'scan');
  console.log(JSON.stringify({ outcome: result.outcome, summary: result.summary, reason: result.reason }));
  if (result.outcome === 'blocked') process.exitCode = 1;
}
