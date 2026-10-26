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
import { worker as dispatchWorker, readArtifactZip } from './artifacts.mjs';
import * as aiAdapter from './ai.mjs';
import * as vercelAdapter from './vercel.mjs';
import * as dependencies from './dependencies.mjs';
import * as maintenanceAdapter from './maintenance.mjs';
import {
  REQUIRED_CHECKS, changedLockEntries, validateCandidateDiff, validateLockfile,
  validatePackageUpgrade, validatePromotionVerdict, timestamp, packageNameFromPath, publicationEligibility,
} from './policy.mjs';
import { deriveCveProofs, discoverDependencyUpdates, exactTargets, necessaryCveFix } from './discovery.mjs';
import { verifiedReviewRecord, downloadReviewArtifact } from './review-evidence.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CHECK_NAMES = Object.freeze([...new Set([...REQUIRED_CHECKS, 'research', 'review'])]);
export const CHECK_CONTEXTS = Object.freeze(CHECK_NAMES.map(name => `security/${name}`));
const ROUTES = ['/', '/news', '/anmeldung', '/chronik', '/impressum', '/datenschutz', '/anfahrt/solarcity', '/anfahrt/auhof'];
const VARIANTS = [360, 768, 1280].flatMap(width => ['de', 'en'].flatMap(lang => ['light', 'dark'].map(theme => `${width}-${lang}-${theme}`)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePath = path => /^src\/(?:[\w-]+\/)*[\w.-]+\.(?:[cm]?[jt]sx?|css)$/.test(path) &&
  !/(?:test|spec|qa|deploy|access|auth|permission|security|config|agent)/i.test(path);
const bot = user => user?.login === 'github-actions[bot]' && user.type === 'Bot';
const claimPattern = /^<!-- dependency-controller:v1 base=([a-f0-9]{40}) head=([a-f0-9]{40}) control=([a-f0-9]{40}) run=([1-9]\d*) -->\n/;
const resumeClaimPattern = /^<!-- dependency-controller-resume:v1 control=([a-f0-9]{40}) run=([1-9]\d*) predecessor=([1-9]\d*) -->$/gm;

/** Authenticate the GitHub API redirect before downloading credential-free bytes.
 * ZIP bounds/path/CRC validation remain in the trusted artifacts reader.
 */
export async function downloadControllerArtifact(id, { env = process.env, repository = github.repository, fetchImpl = fetch } = {}) {
  requireSafe(Number.isSafeInteger(id) && id > 0 && /^[\w.-]+\/[\w.-]+$/.test(repository), 'invalid-resume-artifact');
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`, {
    headers: { authorization: `Bearer ${env.GH_TOKEN || env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
    redirect: 'manual', signal: AbortSignal.timeout(30000),
  });
  requireSafe([301, 302, 303, 307].includes(response.status), 'resume-artifact-download-denied');
  const url = new URL(response.headers.get('location'));
  requireSafe(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
    ['.blob.core.windows.net', '.actions.githubusercontent.com'].some(suffix => url.hostname.endsWith(suffix)), 'resume-artifact-storage-rejected');
  const stored = await fetchImpl(url.href, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60000) });
  const length = stored.headers.get('content-length');
  requireSafe(stored.ok && stored.body && (length === null || /^\d+$/.test(length) && Number(length) <= 512000000), 'resume-artifact-response-rejected');
  const chunks = []; let size = 0;
  for await (const chunk of stored.body) { size += chunk.length; requireSafe(size <= 512000000, 'resume-artifact-too-large'); chunks.push(chunk); }
  return readArtifactZip(Buffer.concat(chunks));
}

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
  const callerCannotBypass = protection?.current_user_can_bypass === 'never' ||
    protection?.current_user_can_bypass === undefined && protection?.enforce_admins?.enabled === true;
  return checks?.strict === true && callerCannotBypass &&
    protection.allow_force_pushes?.enabled === false && protection.allow_deletions?.enabled === false &&
    Array.isArray(requiredContexts) && requiredContexts.length > 0 && requiredContexts.every(context => contexts.has(context)) &&
    (!bypass || ['users', 'teams', 'apps'].every(key => Array.isArray(bypass[key]) && bypass[key].length === 0));
}

function registryEvidence(metadata, locks, targets = []) {
  const versions = new Map();
  for (const lock of locks) for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    const name = packageNameFromPath(path);
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(entry.version);
  }
  for (const { name, version } of targets) {
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name).add(version);
  }
  return Object.fromEntries(Object.entries(metadata).map(([name, packument]) => {
    const selected = [...(versions.get(name) ?? [])];
    return [name, { name, fetchedPackumentSHA256: digest(JSON.stringify(packument)),
      time: Object.fromEntries(selected.map(version => [version, packument.time[version]])),
      versions: Object.fromEntries(selected.map(version => [version, packument.versions[version]])) }];
  }));
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
  requireSafe(Buffer.isBuffer(bytes) && bytes.length <= 30_000_000, 'missing-worker-json');
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

function parsedPDF(site, lang) {
  const pdfs = site?.pdfs?.filter(item => item.lang === lang), pdf = pdfs?.[0], completion = site?.completion?.pdfs?.[lang];
  return completion?.retrieved === true && completion.parsed === true &&
    pdfs?.length === 1 && typeof pdf?.text === 'string' && typeof pdf.file === 'string' && Number.isSafeInteger(pdf.bytes) && pdf.bytes > 0;
}

function runtimeSignals(site) {
  const signals = new Set();
  let origin;
  try { origin = new URL(site.url).origin; } catch { return signals; }
  function firstParty(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password && url.origin === origin ? url.pathname : null;
    } catch { return null; }
  }
  for (const event of site.runtime ?? []) {
    if (typeof event.phase !== 'string' || !/^(?:360|768|1280)-(?:de|en)-(?:light|dark)\/(?:functional|visual)$/.test(event.phase)) continue;
    if (event.type === 'http' && event.status === 404 &&
      ['script', 'stylesheet', 'image', 'font', 'media'].includes(event.resourceType) && firstParty(event.frameURL)) {
      const path = firstParty(event.url);
      if (path) signals.add(`runtime:${event.phase}:http:404:${path}`);
    }
    if (event.type !== 'pageerror' || typeof event.message !== 'string' || !event.message ||
      /(?:\b(?:timeout|timed out|abort(?:ed|error)?|cancelled|canceled|networkerror)\b|ERR_(?:CONNECTION|NETWORK|TIMED_OUT|ABORTED)|failed to fetch|load failed)/i.test(event.message)) continue;
    // page.url() is only the containing document, and cannot establish the
    // throwing script's origin. Recheck the observer's exact first stack frame.
    const frame = typeof event.stack === 'string' ? event.stack.split('\n')[1] : '';
    const source = frame?.match(/^\s+at (?:[^()\r\n]* \()?(https?:\/\/[^\s()]+):(\d+):(\d+)\)?$/);
    const path = source && firstParty(source[1]);
    if (!path || event.scriptURL !== new URL(source[1]).href || event.line !== Number(source[2]) || event.column !== Number(source[3]) ||
      event.frameURL != null && !firstParty(event.frameURL)) continue;
    // Replace only actual origin URLs, preserving pathname, message, exception
    // type and throwing location. Different routes/status/signatures cannot
    // confirm each other, and query nonces cannot manufacture a new regression.
    const signature = event.message.replace(/https?:\/\/[^\s()]+/g, value => {
      try { const url = new URL(value); return url.origin === origin ? url.pathname : value; } catch { return value; }
    });
    const kind = event.stack.split('\n')[0].split(':')[0];
    if (!/^(?:Error|TypeError|ReferenceError|RangeError|SyntaxError|URIError|EvalError|AggregateError)$/.test(kind)) continue;
    signals.add(`runtime:${event.phase}:pageerror:${path}:${event.line}:${event.column}:${kind}:${signature}`);
  }
  return signals;
}

/** Concrete application assertions, not transport/timeouts/browser startup.
 * A functional comparison only proves regression when the candidate completed
 * its functional checks; null from a timed-out probe is infrastructure evidence.
 */
export function regressionSignals(qa) {
  const signals = new Set();
  for (const check of qa?.checks ?? []) {
    if (check.pass !== false) continue;
    if (/semantic comparison$/.test(check.name)) signals.add(check.name);
    const pdf = /^PDF (de|en) content comparison$/.exec(check.name);
    if (pdf && parsedPDF(qa.baseline, pdf[1]) && parsedPDF(qa.candidate, pdf[1])) signals.add(check.name);
    if (/functional comparison$/.test(check.name) && qa.candidate?.variants?.length === VARIANTS.length &&
      qa.candidate.variants.every(variant => variant.functional)) signals.add(check.name);
  }
  for (const error of qa?.errors ?? []) {
    const message = error.message ?? '';
    if (/^candidate API /.test(error.check) && /^HTTP (?:4(?!08|29)\d\d|500)$/.test(message)) signals.add(`${error.check}:${message}`);
    if (/^candidate API /.test(error.check) && /^(?:teams must be JSON|Invalid teams schema\/count|Missing teams update date|Invalid team|Invalid robots|robots sitemap must use response host|Invalid sitemap|sitemap routes\/response host mismatch)$/.test(message)) signals.add(`${error.check}:${message}`);
    if (/^candidate .* functional$/.test(error.check) && /^(?:Toggle or persisted state failed|SPA navigation failed|Anchor .* did not reach|Missing fee controls|Fee disclosure|Drawer did not close|Short drawer did not close|Real teams UI differs|PDF text\/content missing|Downloaded artifact is not a complete PDF)/.test(message))
      signals.add(`${error.check}:${message}`);
  }
  if (Array.isArray(qa?.baseline?.runtime)) {
    const baselineRuntime = runtimeSignals(qa.baseline);
    for (const signal of runtimeSignals(qa?.candidate)) if (!baselineRuntime.has(signal)) signals.add(signal);
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
  requireSafe(['de', 'en'].every(lang => parsedPDF(qa.baseline, lang)), 'baseline-pdfs-incomplete');
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
  for (const pdf of qa.candidate?.pdfs ?? []) if (parsedPDF(qa.candidate, pdf.lang))
    requireSafe(checkedArtifact(comparison, pdf.file, qa.artifacts).length === pdf.bytes, 'candidate-pdf-artifact-incomplete');
  if (!completeSite(qa.candidate, false)) return { pass: false, confirmedRegression: false, reviews: [], qa,
    incompleteCaptures: true, regressionSignals: regressionSignals(qa) };
  const reviews = [];
  let images = [], labels = [], bytes = 0;
  async function flush() {
    if (!images.length) return;
    reviews.push(await ai.reviewVisualEvidence({ baseSHA, headSHA, deploymentId,
      summary: JSON.stringify({ imageOrder: labels, checks: (qa.checks ?? []).map(({ name, pass }) => ({ name, pass })),
        errors: (qa.errors ?? []).map(({ check, message }) => ({ check, message })) }), images }));
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
  const signals = regressionSignals(qa);
  const comparisonFailure = qa.checks?.some(check => check.pass === false &&
    (/(?:pixels|semantic comparison)$/.test(check.name) || signals.includes(check.name)));
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
  vercel = vercelAdapter, dep = dependencies, maintenance = maintenanceAdapter, env = process.env, now = Date.now,
  toolchain = trustedToolchain, evidenceDir = resolve(ROOT, 'evidence'), persist,
  nonce = randomUUID, sleep = delay, loadArtifact = id => downloadControllerArtifact(id, { env, repository: gh.repository }),
  loadReviewArtifact = id => downloadReviewArtifact({ repository: gh.repository, artifactID: id, token: env.GH_TOKEN || env.GITHUB_TOKEN }) } = {}) {
  const state = { schemaVersion: 1, runId: String(env.GITHUB_RUN_ID), controlSHA: env.GITHUB_SHA,
    stage: 'starting', outcome: 'running', createdAt: new Date(now()).toISOString() };
  let sequence = 0;
  const trees = new Map();
  const maintenanceSecurity = new Map();
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
  function claimBody(note = '') {
    requireSafe(/^[1-9]\d*$/.test(state.runId) && /^[a-f0-9]{40}$/.test(state.controlSHA), 'controller-run-identity-required');
    return `<!-- dependency-controller:v1 base=${state.baseSHA} head=${state.headSHA} control=${state.controlSHA} run=${state.runId} -->\n${note}\n\nAuthenticated evidence: https://github.com/${gh.repository}/actions/runs/${state.runId}`;
  }
  async function ownedPR(head, title, note) {
    const pr = await gh.openPR({ base: 'main', head, title, body: claimBody(note) });
    const fresh = await gh.repoApi(`/pulls/${pr.number}`);
    requireSafe(bot(fresh.user) && fresh.head?.ref === head && fresh.head.sha === state.headSHA &&
      fresh.head.repo?.full_name === gh.repository, 'automation-pr-ownership-required');
    await gh.repoApi(`/pulls/${pr.number}`, { method: 'PATCH', body: { title, body: claimBody(note) } });
    return pr;
  }
  async function previousOwnedState() {
    const updatesSHA = await gh.ref('updates'), mainSHA = await gh.ref('main');
    const pulls = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await gh.repoApi(`/pulls?state=all&base=main&per_page=100&page=${page}`);
      requireSafe(Array.isArray(batch) && batch.length <= 100, 'resume-pr-list-invalid');
      pulls.push(...batch);
      if (batch.length < 100) break;
      requireSafe(page < 10, 'resume-pr-list-incomplete');
    }
    const roots = pulls.filter(pr => bot(pr.user) && pr.head?.repo?.full_name === gh.repository &&
      (pr.head.ref === 'updates' || /^automation\/dependencies-/.test(pr.head.ref)))
      .map(pr => ({ pr, match: claimPattern.exec(pr.body ?? '') })).filter(({ pr, match }) => match &&
        (match[2] === updatesSHA || pr.merge_commit_sha === mainSHA) && pr.head.sha === match[2]);
    const claims = roots.map(({ pr, match }) => {
      const [, baseSHA, headSHA, controlSHA, runId] = match;
      const chain = [{ controlSHA, runId }];
      requireSafe(Number.isSafeInteger(Number(runId)), 'resume-run-id-invalid');
      for (const [, controlSHA, runId, predecessor] of pr.body.matchAll(resumeClaimPattern)) {
        requireSafe(Number.isSafeInteger(Number(runId)) && predecessor === chain.at(-1).runId && BigInt(runId) > BigInt(predecessor), 'resume-predecessor-chain-invalid');
        chain.push({ controlSHA, runId, predecessor });
      }
      requireSafe(chain.length <= 100, 'resume-predecessor-chain-too-long');
      return { pr, baseSHA, headSHA, chain };
    }).sort((a, b) => Number(b.chain.at(-1).runId) - Number(a.chain.at(-1).runId));
    if (!claims.length) return null;
    const { pr, baseSHA, headSHA, chain } = claims[0];
    const missingResumeRuns = [];
    for (let index = chain.length - 1; index >= 0; index--) {
      const { controlSHA, runId } = chain[index];
      const run = await gh.repoApi(`/actions/runs/${runId}`);
      requireSafe(run.id === Number(runId) && run.path === '.github/workflows/dependency-updates.yml' &&
        ['schedule', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'main' && run.head_sha === controlSHA &&
        run.repository?.full_name === gh.repository && run.head_repository?.full_name === gh.repository && run.run_attempt === 1 &&
        run.status === 'completed', 'resume-controller-run-untrusted');
      const listed = await gh.repoApi(`/actions/runs/${runId}/artifacts?per_page=100`);
      requireSafe(Array.isArray(listed.artifacts) && listed.artifacts.length < 100, 'resume-controller-artifact-list-invalid');
      const matches = listed.artifacts.filter(artifact => artifact.name === `dependency-controller-${runId}` && artifact.expired === false);
      // A resumed attempt may lose its upload. Its append-only predecessor link
      // leaves the original usable pointer intact. Never skip malformed evidence
      // or a newer durable checkpoint, including a completed recovery/release.
      if (!matches.length && index > 0) { missingResumeRuns.push(runId); continue; }
      requireSafe(matches?.length === 1 && matches[0].workflow_run?.id === run.id && matches[0].workflow_run.head_sha === controlSHA &&
        matches[0].workflow_run.head_branch === 'main', 'resume-controller-artifact-untrusted');
      const files = await loadArtifact(matches[0].id);
      const checkpoints = [...files.keys()].filter(path => /^\d{3}-(?:checkpoint|blocked|merged)\.json$/.test(path)).sort();
      requireSafe(checkpoints.length > 0, 'resume-checkpoint-missing');
      const prior = JSON.parse(files.get(checkpoints.at(-1)).toString('utf8'));
      requireSafe(prior.schemaVersion === 1 && prior.runId === runId && prior.controlSHA === controlSHA && prior.baseSHA === baseSHA &&
        prior.headSHA === headSHA && Number.isSafeInteger(prior.baseline?.runId) && Number.isSafeInteger(prior.baseline?.artifactId), 'resume-checkpoint-identity-mismatch');
      if (index > 0) requireSafe(isDeepStrictEqual(prior.recoveryChain, chain.slice(0, index + 1)), 'resume-checkpoint-chain-mismatch');
      if (missingResumeRuns.length) {
        requireSafe(updatesSHA === headSHA, 'resume-fallback-updates-changed');
        const promotion = prior.pr && pulls.find(item => item.number === prior.pr);
        requireSafe(promotion && bot(promotion.user) && promotion.merged === true && promotion.head?.sha === headSHA &&
          promotion.head.repo?.full_name === gh.repository && promotion.base?.ref === 'main' &&
          (!prior.mergedSHA || prior.mergedSHA === promotion.merge_commit_sha), 'resume-fallback-promotion-changed');
        const mergedSHA = promotion.merge_commit_sha;
        const restores = pulls.filter(item => (item.body ?? '').startsWith(`<!-- dependency-restore:v1 failed=${mergedSHA} original=${baseSHA} -->\n`));
        requireSafe(restores.every(item => item.number === prior.restorePR), 'resume-newer-recovery-actions-uncheckpointed');
        if (prior.restorePR) {
          const restore = restores.find(item => item.number === prior.restorePR);
          requireSafe(restore && bot(restore.user) && restore.head?.ref === prior.restoreBranch && restore.head.sha === prior.restoreHeadSHA &&
            restore.head.repo?.full_name === gh.repository && restore.base?.ref === 'main' &&
            (restore.merged ? restore.merge_commit_sha === mainSHA : restore.state === 'open' && mainSHA === mergedSHA), 'resume-fallback-restore-changed');
        } else requireSafe(mainSHA === mergedSHA, 'resume-fallback-main-changed');
      }
      if (prior.outcome === 'promoted' || prior.outcome === 'recovered' || prior.recoveryComplete === true) return null;
      await save('authenticated-resume', { ownerPR: pr.number, runId, baseSHA, headSHA, missingResumeRuns });
      return { ...prior, recoveryChain: chain, missingResumeRuns };
    }
  }

  async function claimResume() {
    requireSafe(state.ownerPR && Array.isArray(state.recoveryChain), 'resume-owner-chain-missing');
    const pr = await gh.repoApi(`/pulls/${state.ownerPR}`), root = claimPattern.exec(pr.body ?? '');
    requireSafe(bot(pr.user) && root && root[1] === state.baseSHA && root[2] === state.headSHA &&
      pr.head?.sha === state.headSHA && pr.head.repo?.full_name === gh.repository, 'resume-owner-pr-changed');
    const actual = [{ controlSHA: root[3], runId: root[4] }, ...[...pr.body.matchAll(resumeClaimPattern)].map(([, controlSHA, runId, predecessor]) => ({ controlSHA, runId, predecessor }))];
    requireSafe(isDeepStrictEqual(actual, state.recoveryChain), 'resume-owner-chain-changed');
    const predecessor = actual.at(-1).runId;
    requireSafe(/^[1-9]\d*$/.test(state.runId) && BigInt(state.runId) > BigInt(predecessor), 'resume-run-order-invalid');
    const entry = { controlSHA: state.controlSHA, runId: state.runId, predecessor };
    const marker = `<!-- dependency-controller-resume:v1 control=${entry.controlSHA} run=${entry.runId} predecessor=${entry.predecessor} -->`;
    await gh.repoApi(`/pulls/${state.ownerPR}`, { method: 'PATCH', body: { body: `${pr.body}\n\n${marker}\n` } });
    state.recoveryChain.push(entry);
  }
  async function savedCapture(prior) {
    const { baseline } = prior;
    const run = await gh.repoApi(`/actions/runs/${baseline.runId}`);
    requireSafe(run.path === '.github/workflows/dependency-worker.yml' && run.event === 'workflow_dispatch' &&
      run.head_sha === baseline.controlSHA && run.head_branch === 'main' && run.run_attempt === 1 && run.conclusion === 'success' &&
      run.repository?.full_name === gh.repository && run.head_repository?.full_name === gh.repository &&
      run.actor?.login === (env.AUTOMATION_WORKER_ACTOR || 'github-actions[bot]'), 'resume-baseline-run-untrusted');
    const { artifacts } = await gh.repoApi(`/actions/runs/${baseline.runId}/artifacts?per_page=100`);
    const artifact = artifacts?.find(item => item.id === baseline.artifactId && item.name === `dependency-worker-${baseline.request}` &&
      item.expired === false && item.workflow_run?.id === run.id && item.workflow_run.head_sha === run.head_sha);
    requireSafe(artifact && run.display_title === `Dependency worker ${baseline.request}`, 'resume-baseline-artifact-untrusted');
    const files = await loadArtifact(artifact.id), envelope = artifactJSON({ files }, 'worker.json');
    requireSafe(envelope.phase === 'capture' && envelope.request === baseline.request && envelope.baseSHA === prior.baseSHA &&
      envelope.headSHA === prior.baseSHA && digest(files.get('qa/result.json')) === baseline.manifestSHA256, 'resume-baseline-identity-mismatch');
    const capture = { ...envelope, runId: baseline.runId, artifactId: baseline.artifactId, files };
    verifyCapture(capture);
    return capture;
  }
  async function protection() {
    // The GitHub adapter may normalize effective repository rulesets and bind
    // required ordinary-PR checks to the GitHub Actions integration. Promotion
    // checks below remain mandatory internally, without imposing them on every
    // unrelated PR in the repository.
    if (typeof gh.assertProtection === 'function') { await gh.assertProtection('main'); return; }
    requireSafe(validateMainProtection(await gh.repoApi('/branches/main/protection'), gh.REQUIRED_SECURITY_CHECKS ?? CHECK_CONTEXTS), 'main-strict-protection-required');
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
  // Read EVERY managed file from the authenticated Git tree, including unchanged
  // workflows and the independent QA pin. The candidate never supplies this list.
  async function maintenanceSnapshot(sha) {
    const entries = await tree(sha);
    const paths = [...new Set([...maintenanceAdapter.TRUSTED_BASE_PATHS,
      ...[...entries.keys()].filter(path => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))])].sort();
    return new Map(await Promise.all(paths.map(async path => [path, await regularFile(path, sha)])));
  }
  function maintenanceTimes(plan, fresh = true) {
    const values = [...Object.values(plan.evidenceTimes ?? {}), plan.research?.researchedAt,
      ...(plan.research?.results ?? []).map(item => item.provenance?.timestamp).filter(value => value !== undefined)];
    requireSafe(values.length >= 3 && values.every(value => Number.isFinite(timestamp(value)) && timestamp(value) <= now() &&
      (!fresh || now() - timestamp(value) <= 86400000)), 'maintenance-evidence-stale');
    return values;
  }
  async function maintenanceProofs(baseSHA, baseFiles) {
    const cached = maintenanceSecurity.get(baseSHA), time = now();
    if (cached && cached.fetchedAt <= time && time - cached.fetchedAt <= 86400000) return cached.proofs;
    const runtime = await toolchain();
    // Saved JSON has no primary-fetch authority. Refresh against the actual
    // original pins even when trusted main has already promoted the new pins.
    const proofs = await maintenance.fetchOfficialSecurityMetadata({
      targets: maintenanceAdapter.usedToolchainTargets(baseFiles), semver: runtime.semver,
      now: time, token: env.GH_TOKEN || env.GITHUB_TOKEN,
    });
    maintenanceSecurity.set(baseSHA, { proofs, fetchedAt: time });
    return proofs;
  }
  async function maintenanceBytes(baseSHA, headSHA, plan) {
    const before = await maintenanceSnapshot(baseSHA), after = await maintenanceSnapshot(headSHA);
    const securityProofs = await maintenanceProofs(baseSHA, before);
    const options = { now: now(), securityProofs };
    const checked = requireOK(maintenanceAdapter.validateMaintenancePlan(before, plan, options), 'maintenance-plan-invalid');
    // The validator regenerates the bytes. Compare that independent result,
    // not just hashes or contents asserted by the serialized plan.
    for (const file of checked.expectedFiles) requireSafe(after.get(file.path) === file.content &&
      digest(before.get(file.path)) === file.fromSHA256 && digest(after.get(file.path)) === file.toSHA256,
    'maintenance-candidate-bytes-mismatch');
    requireOK(maintenanceAdapter.assertCandidateBytes(before, after, plan, options), 'maintenance-candidate-bytes-blocked');
    return checked;
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
    await vercel.verifyRuntime({ deploymentId: production.id, minimumNodeVersion: runtime.nodeVersion });
    const readiness = await ai.preflight();
    await save('ai-preflight', readiness);
    requireSafe(readiness.pass === true, 'ai-websearch-preflight-blocked');
    Object.assign(state, { baseSHA, updatesSHA, production, configuration, controlSHA: env.GITHUB_SHA || baseSHA });
    await current(baseSHA, updatesSHA);
    return { runtime, baseSHA, updatesSHA, configuration, production };
  }
  async function candidateDiff(baseSHA, headSHA, compatibilityPaths, plan) {
    const files = await gh.changes(baseSHA, headSHA);
    const changes = files.map(file => ({ path: file.filename, status: file.status === 'modified' ? 'M' : file.status,
      oldPath: file.previous_filename, addedLines: file.additions, deletedLines: file.deletions }));
    if (plan) {
      await maintenanceBytes(baseSHA, headSHA, plan);
      const before = await tree(baseSHA), after = await tree(headSHA);
      const leaves = new Set([...before.keys(), ...after.keys()].filter(path => before.get(path)?.type !== 'tree' || after.get(path)?.type !== 'tree'));
      const actualPaths = [...leaves].filter(path => {
        const a = before.get(path), b = after.get(path);
        requireSafe([a, b].filter(Boolean).every(entry => /^[a-f0-9]{40}$/.test(entry.sha)), 'maintenance-tree-identity-incomplete');
        return !a || !b || a.sha !== b.sha || a.mode !== b.mode || a.type !== b.type;
      }).sort();
      requireSafe(isDeepStrictEqual(actualPaths, changes.map(change => change.path).sort()), 'maintenance-diff-tree-mismatch');
      const planned = new Set(plan.files.map(file => file.path));
      requireSafe(planned.size === plan.files.length && [...planned].every(path => changes.some(change => change.path === path)) &&
        changes.every(change => change.status === 'M' && (!change.oldPath || change.oldPath === change.path) &&
          (planned.has(change.path) || compatibilityPaths.includes(change.path))), 'maintenance-candidate-scope-blocked');
      const repairs = changes.filter(change => !planned.has(change.path));
      if (repairs.length) requireOK(validateCandidateDiff(repairs, { compatibilityPaths }), 'candidate-scope-blocked');
    } else requireOK(validateCandidateDiff(changes, { compatibilityPaths }), 'candidate-scope-blocked');
    for (const change of changes) await regularFile(change.path, headSHA);
    const diff = await gh.repoApi(`/compare/${baseSHA}...${headSHA}`, { accept: 'application/vnd.github.diff' });
    requireSafe(typeof diff === 'string' && diff.length > 0 && Buffer.byteLength(diff) <= 8_000_000, 'candidate-diff-incomplete');
    if (plan) {
      const headers = [...diff.matchAll(/^diff --git a\/([^\r\n]+) b\/([^\r\n]+)$/gm)];
      requireSafe(headers.every(([, before, after]) => before === after) &&
        isDeepStrictEqual(headers.map(([, path]) => path).sort(), changes.map(change => change.path).sort()),
      'maintenance-review-diff-incomplete');
    }
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
  async function validatedCandidate({ baseSHA, headSHA, branch, base, advisories, runtime, plan }) {
    let compatibilityPaths = [];
    for (let attempt = 0; attempt <= 3; attempt++) {
      state.headSHA = headSHA;
      await checkpoint('candidate-policy-and-research');
      const head = await snapshot(headSHA);
      if (plan) { maintenanceTimes(plan); await maintenanceBytes(baseSHA, headSHA, plan); }
      const approvedNodePatch = plan?.toolchainPlan.nodePlan.changed ? {
        from: base.manifest.engines.node, to: head.manifest.engines.node, supportedLtsMajors: runtime.supportedLtsMajors,
      } : undefined;
      requireOK(validatePackageUpgrade(base.manifest, head.manifest, { approvedNodePatch }), 'manifest-upgrade-policy-blocked');
      requireOK(dep.validateManifestLock(head.manifest, head.lock, runtime.semver), 'manifest-lock-mismatch');
      const changes = changedLockEntries(base.lock, head.lock);
      const metadata = await dep.fetchRegistryMetadata([...new Set(changes.map(change => change.name))]);
      const proofs = deriveCveProofs({ baseLock: base.lock, headLock: head.lock, metadata, advisories, now: now(), semver: runtime.semver });
      const policy = dep.preflightLockUpdate({ baseLock: base.lock, headLock: head.lock, metadata, advisories, proofs, now: now(), ...runtime, approvedNodePatch });
      const policyAt = new Date(now()).toISOString();
      await save('lock-policy', { policy, metadata: registryEvidence(metadata, [base.lock, head.lock]), proofs });
      requireOK(policy, 'whole-lock-policy-blocked');
      const researched = await research(exactTargets(changes), baseSHA, headSHA);
      const osv = await dep.queryOsvLockfile(head.lock);
      await save('osv-candidate', osv);
      requireSafe(osv.every(query => query.advisories.length === 0), 'candidate-osv-advisory-blocked');
      const dependenciesAt = new Date(now()).toISOString();
      const diff = await candidateDiff(baseSHA, headSHA, compatibilityPaths, plan);
      const review = await ai.reviewPullRequest({ baseSHA, headSHA, diff: diff.diff,
        context: { manifest: head.manifest, lock: head.lock, research: researched, lockPolicy: policy,
          lifecycleChanges: policy.lifecycleChanges, requiresLifecycleReview: policy.requiresLifecycleReview,
          maintenancePlan: plan,
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
          requireSafe(validation.nodeVersion === `v${plan?.targetNodeVersion ?? runtime.nodeVersion}` &&
            (!plan || validation.expectedNodeVersion === plan.targetNodeVersion), 'validation-runtime-mismatch');
          requireSafe(['install', 'tree', 'lint', 'build'].every(name => validation.checks?.some(check => check.name === name && check.pass === true && check.exitCode === 0)), 'validation-checks-incomplete');
          auditEvidence(validation, head.lock);
          return { headSHA, head, policy, researched, review, validation, compatibilityPaths,
            evidenceTimes: { policy: policyAt, dependencies: dependenciesAt, audit: validation.completedAt, build: validation.completedAt,
              research: oldestTime([...(researched.length ? researched.map(result => result.timestamp) : [policyAt]),
                ...(plan ? maintenanceTimes(plan) : [])]),
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
    // change either workflow; maintenance bytes are independently regenerated.
    const inputs = { pr_number: String(number), head_sha: headSHA };
    await gh.repoApi('/actions/workflows/automation-checks.yml/dispatches', { method: 'POST', body: { ref: headBranch, inputs } });
    await gh.repoApi('/actions/workflows/application-checks.yml/dispatches', { method: 'POST', body: { ref: 'main', inputs } });
    await gh.repoApi('/actions/workflows/pr-review.yml/dispatches', { method: 'POST', body: { ref: 'main', inputs: { pr_number: String(number) } } });
    const contexts = gh.REQUIRED_SECURITY_CHECKS ?? CHECK_CONTEXTS;
    const dispatchedReviews = new Set([number]);
    async function reviewHistory(prNumber) {
      const reviews = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await gh.repoApi(`/pulls/${prNumber}/reviews?per_page=100&page=${page}`);
        requireSafe(Array.isArray(batch) && batch.length <= 100, 'review-history-invalid');
        reviews.push(...batch);
        if (batch.length < 100) return reviews;
      }
      throw new Blocked('review-history-incomplete');
    }
    async function exactReview() {
      const fresh = await gh.repoApi(`/pulls/${number}`);
      requireSafe(fresh.state === 'open' && fresh.base?.ref === 'main' && fresh.base.sha === baseSHA &&
        fresh.head?.ref === headBranch && fresh.head.sha === headSHA, 'review-target-pr-changed');
      const pulls = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await gh.repoApi(`/pulls?state=open&base=main&per_page=100&page=${page}`);
        requireSafe(Array.isArray(batch) && batch.length <= 100, 'shared-head-pr-inventory-invalid');
        pulls.push(...batch.filter(pr => pr.state === 'open' && pr.head?.sha === headSHA));
        if (batch.length < 100) break;
        requireSafe(page < 20, 'shared-head-pr-inventory-incomplete');
      }
      requireSafe(pulls.some(pr => pr.number === number) && new Set(pulls.map(pr => pr.number)).size === pulls.length, 'shared-head-target-pr-missing');
      for (const pull of pulls) {
        requireSafe(Number.isSafeInteger(pull.number) && pull.number > 0 && pull.base?.ref === 'main' && pull.base.sha === baseSHA, 'shared-head-pr-base-changed');
        const record = await verifiedReviewRecord({ api: gh.repoApi, reviews: await reviewHistory(pull.number),
          ids: { repository: gh.repository, number: pull.number, baseRef: 'main', baseSHA, headSHA },
          controlSHA: baseSHA, downloadArtifact: loadReviewArtifact });
        if (record?.verdict !== 'pass') {
          if (!dispatchedReviews.has(pull.number)) {
            await gh.repoApi('/actions/workflows/pr-review.yml/dispatches', { method: 'POST', body: { ref: 'main', inputs: { pr_number: String(pull.number) } } });
            dispatchedReviews.add(pull.number);
          }
          return false;
        }
      }
      return true;
    }
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
      if (observations.every(item => item.pass) && await exactReview()) { await save('required-pr-checks', { headSHA, number, baseSHA, observations, exactReview: true }); return; }
      requireSafe(!observations.some(item => item.failed), 'required-pr-check-failed');
      if (poll < 209) await sleep(10000);
    }
    throw new Blocked('required-pr-checks-timeout');
  }
  async function reconcileRestore({ capture, production, configuration, failedMergeSHA }) {
    const mainSHA = await gh.ref('main');
    if (!state.restorePR) {
      requireSafe(mainSHA === failedMergeSHA, 'main-advanced-before-protected-restore');
      const original = await gh.repoApi(`/git/commits/${state.baseSHA}`);
      const restore = await gh.repoApi('/git/commits', { method: 'POST', body: { message: 'revert: dependency update after confirmed production regression', tree: original.tree.sha, parents: [failedMergeSHA] } });
      state.restoreBranch = `automation/restore-${nonce()}`; state.restoreHeadSHA = restore.sha;
      await gh.createBranch(state.restoreBranch, restore.sha);
      const pr = await gh.openPR({ base: 'main', head: state.restoreBranch, title: 'revert: restore production after confirmed dependency regression',
        body: `<!-- dependency-restore:v1 failed=${failedMergeSHA} original=${state.baseSHA} -->\nRestore the exact previously captured production tree. Vercel instant rollback was independently verified. Required CI and independent PR review must pass before protected merge.` });
      state.restorePR = pr.number;
      await checkpoint('protected-restore-pr');
    }
    let pr = await gh.repoApi(`/pulls/${state.restorePR}`);
    requireSafe(bot(pr.user) && pr.head?.ref === state.restoreBranch && pr.head.sha === state.restoreHeadSHA &&
      pr.head.repo?.full_name === gh.repository, 'restore-pr-identity-changed');
    if (!pr.merged) {
      requireSafe(pr.state === 'open' && pr.base?.sha === failedMergeSHA && await gh.ref('main') === failedMergeSHA, 'main-advanced-before-protected-restore');
      await requiredPRChecks({ baseSHA: failedMergeSHA, headSHA: state.restoreHeadSHA, number: pr.number, headBranch: state.restoreBranch });
      await protection();
      state.restoreSHA = await gh.mergePR(pr.number, state.restoreHeadSHA, failedMergeSHA);
      await checkpoint('restore-merged');
    } else {
      state.restoreSHA = pr.merge_commit_sha;
      requireSafe(await gh.ref('main') === state.restoreSHA, 'main-advanced-after-protected-restore');
    }
    const deployed = await vercel.waitForDeployment({ sha: state.restoreSHA, branch: 'main', production: true });
    requireSafe(deployed.sha === state.restoreSHA && deployed.projectId === configuration.projectId, 'restore-deployment-identity-mismatch');
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: state.restoreSHA, deploymentId: deployed.id });
    await vercel.verifyRuntime({ deploymentId: deployed.id, minimumNodeVersion: (await regularFile('.nvmrc', state.baseSHA)).trim() });
    const browser = await dispatched('browser', state.baseSHA, state.restoreSHA, { baselineRun: String(capture.runId),
      baselineURL: `https://${configuration.productionHostname}`, candidateURL: `https://${configuration.productionHostname}` });
    const review = await reviewBrowserImages({ capture, comparison: browser, baseSHA: state.baseSHA, headSHA: state.restoreSHA, deploymentId: deployed.id, ai });
    await save('restore-production-verification', review);
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: state.restoreSHA, deploymentId: deployed.id });
    requireSafe(review.pass === true && await gh.ref('main') === state.restoreSHA, 'restore-production-verification-blocked');
    state.recoveryComplete = true;
    await checkpoint('recovery-complete');
    try {
      await gh.ensureLabels();
      await gh.issue('Dependency regression recovered', `Instant rollback and protected restore PR #${state.restorePR} completed. Main ${state.restoreSHA} and its public production deployment passed the original saved baseline and independent screenshot review.`, 'dependency-production-regression');
    } catch { await save('recovery-issue-report-failed', { restoreSHA: state.restoreSHA }); }
    return { deployed, review };
  }
  async function verifyProduction({ baseSHA, headSHA, mergedSHA, capture, production, configuration }) {
    state.mergedSHA = mergedSHA;
    await checkpoint('verify-production');
    // Exceptions here are infrastructure failures: caller reports and blocks,
    // with no automatic rollback unless a completed comparison proves regression.
    const deployed = await vercel.waitForDeployment({ sha: mergedSHA, branch: 'main', production: true });
    requireSafe(deployed.sha === mergedSHA && deployed.branch === 'main' && deployed.projectId === configuration.projectId && deployed.readyState === 'READY', 'production-deployment-identity-mismatch');
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
    await vercel.verifyRuntime({ deploymentId: deployed.id, minimumNodeVersion: state.maintenance?.plan.targetNodeVersion ?? (await regularFile('.nvmrc', baseSHA)).trim() });
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
      state.rollbackRequested = true; state.failedMergeSHA = mergedSHA;
      await checkpoint('confirmed-production-regression');
      const rollback = await vercel.rollback({ failedDeploymentId: deployed.id, previousDeploymentId: production.id, expectedFailedSHA: mergedSHA });
      await save('vercel-rollback', rollback);
      state.rollbackVerified = true; state.failedMergeSHA = mergedSHA;
      await checkpoint('instant-rollback-verified');
      try {
        await gh.ensureLabels();
        await gh.issue('Dependency automation: confirmed production regression',
          `Deployment ${deployed.id} (${mergedSHA}) failed independently confirmed saved-baseline checks. Vercel rollback was verified. Reconciliation uses a separately checked and reviewed restore PR while main remains unchanged.`, 'dependency-production-regression');
      } catch { await save('rollback-issue-report-failed', { mergedSHA }); }
      await reconcileRestore({ capture, production, configuration, failedMergeSHA: mergedSHA });
      throw new Blocked('confirmed-regression-rolled-back');
    }
    requireSafe(visual.pass === true, 'postproduction-check-blocked-without-confirmed-regression');
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: mergedSHA, deploymentId: deployed.id });
    requireSafe(await gh.ref('main') === mergedSHA, 'production-main-advanced');
    return { deployed, visual };
  }
  async function scan() {
    const previous = await previousOwnedState();
    if (previous?.pr || previous?.restorePR || previous?.rollbackVerified || previous?.rollbackRequested) {
      const pr = previous.pr ? await gh.repoApi(`/pulls/${previous.pr}`) : null;
      const mergedSHA = previous.mergedSHA || (pr?.merged && pr.head?.sha === previous.headSHA ? pr.merge_commit_sha : null);
      if (previous.restorePR || previous.rollbackVerified || mergedSHA && await gh.ref('main') === mergedSHA) {
        const runtime = await toolchain(); await protection();
        const configuration = await vercel.preflight();
        requireSafe(configuration.projectId === previous.configuration?.projectId &&
          configuration.productionHostname === previous.configuration.productionHostname && configuration.updatesHostname === previous.configuration.updatesHostname,
        'recovery-configuration-changed');
        const originalNode = (await regularFile('.nvmrc', previous.baseSHA)).trim();
        if (previous.maintenance) {
          const saved = previous.maintenance;
          requireSafe(saved.baseSHA === previous.baseSHA && saved.identity === digest(JSON.stringify(saved.plan)) &&
            isDeepStrictEqual(saved.files, saved.plan.changes) && isDeepStrictEqual(saved.evidenceTimes, saved.plan.evidenceTimes) &&
            saved.plan.toolchainPlan.nodePlan.from === originalNode &&
            [originalNode, saved.plan.targetNodeVersion].includes(runtime.nodeVersion), 'recovery-maintenance-identity-mismatch');
          maintenanceTimes(saved.plan, false);
          await candidateDiff(previous.baseSHA, previous.headSHA, saved.compatibilityPaths ?? [], saved.plan);
        } else requireSafe(originalNode === runtime.nodeVersion, 'recovery-runtime-changed');
        const identity = { runId: state.runId, controlSHA: env.GITHUB_SHA || await gh.ref('main') };
        Object.assign(state, previous, identity, { outcome: 'running', mergedSHA });
        const capture = await savedCapture(previous);
        if (previous.missingResumeRuns?.length) {
          const deployed = await vercel.getProductionDeployment();
          const restored = previous.restorePR && await gh.repoApi(`/pulls/${previous.restorePR}`);
          const original = deployed.id === previous.production.id && deployed.sha === previous.baseSHA;
          requireSafe(deployed.projectId === configuration.projectId && deployed.branch === 'main' &&
            (deployed.sha === mergedSHA || restored?.merged && deployed.sha === restored.merge_commit_sha ||
              original && (previous.rollbackRequested || previous.rollbackVerified)), 'resume-fallback-production-contradiction');
          await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: deployed.sha, deploymentId: deployed.id });
        }
        await claimResume();
        await checkpoint('resume-production-reconciliation');
        if (previous.rollbackRequested && !previous.rollbackVerified) {
          const currentProduction = await vercel.getProductionDeployment();
          if (currentProduction.id === previous.production.id && currentProduction.sha === previous.baseSHA) state.rollbackVerified = true;
        }
        if (state.rollbackVerified || previous.restorePR) {
          await reconcileRestore({ capture, production: previous.production, configuration, failedMergeSHA: previous.failedMergeSHA || mergedSHA });
          state.outcome = 'recovered'; await checkpoint('complete');
          return { ...state, summary: 'Protected production recovery resumed and independently verified.' };
        }
        const verified = await verifyProduction({ baseSHA: previous.baseSHA, headSHA: previous.headSHA, mergedSHA,
          capture, production: previous.production, configuration });
        state.outcome = 'promoted'; state.productionDeploymentId = verified.deployed.id; await checkpoint('complete');
        return { ...state, summary: 'Interrupted production verification resumed against its original saved baseline.' };
      }
    }
    const context = await preflight();
    const { baseSHA, updatesSHA, runtime, configuration, production } = context;
    const ancestry = await gh.repoApi(`/compare/${updatesSHA}...${baseSHA}`);
    const ownedRestart = !['ahead', 'identical'].includes(ancestry.status);
    requireSafe(!ownedRestart || previous?.headSHA === updatesSHA, 'updates-has-unpromoted-or-unrelated-work');
    // Preserve both histories while restarting ONLY authenticated owned work
    // from the current main TREE. New main work is included byte for byte; no
    // force update or content carried from an unowned candidate is permitted.
    let startSHA = baseSHA;
    if (ownedRestart) {
      const commit = await gh.repoApi(`/git/commits/${baseSHA}`);
      startSHA = (await gh.repoApi('/git/commits', { method: 'POST', body: { message: 'chore: revalidate owned dependency work from current main', tree: commit.tree.sha, parents: [baseSHA, updatesSHA] } })).sha;
      state.resumedFromRun = previous.runId;
    }
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
    const branch = `automation/dependencies-${nonce()}`;
    let headSHA, candidate, plan;
    // A verified necessary npm CVE fix cannot wait for unrelated tool metadata,
    // AI research or maintenance cooldowns. Never merge two lockfile writers.
    if (!necessaryFixes.length) {
      await checkpoint('maintenance-discovery');
      const baseFiles = await maintenanceSnapshot(baseSHA);
      plan = await maintenance.createMaintenancePlan({ baseFiles, now: now(), ai,
        semver: runtime.semver, token: env.GH_TOKEN || env.GITHUB_TOKEN, supportedLtsMajors: runtime.supportedLtsMajors });
      const securityProofs = await maintenanceProofs(baseSHA, baseFiles);
      requireOK(maintenanceAdapter.validateMaintenancePlan(baseFiles, plan, { now: now(), securityProofs }), 'maintenance-plan-invalid');
      maintenanceTimes(plan);
      await save('maintenance-plan', plan);
      if (!plan.files.length) plan = undefined;
    }
    if (plan) {
      state.candidateKind = 'maintenance';
      state.maintenance = { baseSHA, plan, identity: digest(JSON.stringify(plan)),
        files: plan.changes, evidenceTimes: plan.evidenceTimes };
      headSHA = await gh.commitFiles(startSHA, plan.files, 'chore: deterministic Node and Actions maintenance');
      await gh.createBranch(branch, headSHA);
      Object.assign(state, { branch, headSHA });
      candidate = await validatedCandidate({ baseSHA, headSHA, branch, base, advisories, runtime, plan });
      headSHA = candidate.headSHA; state.headSHA = headSHA;
      state.maintenance.compatibilityPaths = candidate.compatibilityPaths;
    } else {
      state.candidateKind = 'dependencies';
      const names = [...new Set([...Object.keys(base.manifest.dependencies ?? {}), ...Object.keys(base.manifest.devDependencies ?? {}), ...necessaryFixes.map(fix => fix.name)])];
      const metadata = await dep.fetchRegistryMetadata(names);
      const discovery = discoverDependencyUpdates({ ...base, metadata, advisories, securityOnly: necessaryFixes.length > 0, now: now(), ...runtime });
      await save('discovery', { selections: discovery.selections, metadata: registryEvidence(metadata, [base.lock], discovery.selections), baselineAudits });
      headSHA = discovery.changed ? await gh.commitFiles(startSHA, [{ path: 'package.json', content: JSON.stringify(discovery.manifest, null, 2) + '\n' }], 'chore: discover dependency releases') : startSHA;
      const branchCreated = discovery.changed || ownedRestart;
      if (branchCreated) await gh.createBranch(branch, headSHA);
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
        requireSafe(!ownedRestart, 'owned-updates-awaiting-a-new-safe-fix');
        state.outcome = 'no-updates';
        await checkpoint('complete');
        return { ...state, summary: 'No eligible dependency changes. Main, updates and production are unchanged.' };
      }
      const resolvedSHA = await gh.commitFiles(headSHA, resolvedFiles, 'chore: resolve dependency lock without scripts');
      if (branchCreated) await gh.fastForward(branch, headSHA, resolvedSHA);
      else await gh.createBranch(branch, resolvedSHA);
      headSHA = resolvedSHA;
      candidate = await validatedCandidate({ baseSHA, headSHA, branch, base, advisories, runtime });
      headSHA = candidate.headSHA; state.headSHA = headSHA;
    }
    // Capture once, before publishing updates or touching main, and bind its
    // immutable artifact to the original production deployment and main SHA.
    await current(baseSHA, updatesSHA);
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: baseSHA, deploymentId: production.id });
    const capture = await dispatched('capture', baseSHA, baseSHA, { baselineURL: `https://${configuration.productionHostname}` });
    verifyCapture(capture);
    await vercel.verifyAlias({ hostname: configuration.productionHostname, sha: baseSHA, deploymentId: production.id });
    state.baseline = { runId: capture.runId, artifactId: capture.artifactId, request: capture.request,
      controlSHA: capture.controlSHA, manifestSHA256: digest(capture.files.get('qa/result.json')) };
    await statuses(headSHA, ['policy', 'dependencies', 'audit', 'build', 'research', 'review'], true);
    const ownershipPR = await ownedPR(branch, 'chore: validate researched dependency candidate', 'Ownership checkpoint before publishing updates. This candidate must pass public updates acceptance before promotion.');
    state.ownerPR = ownershipPR.number;
    await checkpoint('publish-validated-updates');
    await current(baseSHA, updatesSHA);
    await gh.fastForward('updates', updatesSHA, headSHA);
    const deployed = await vercel.waitForDeployment({ sha: headSHA, branch: 'updates' });
    requireSafe(deployed.sha === headSHA && deployed.projectId === configuration.projectId && deployed.readyState === 'READY', 'updates-deployment-identity-mismatch');
    await vercel.verifyAlias({ hostname: configuration.updatesHostname, sha: headSHA, deploymentId: deployed.id });
    await vercel.verifyRuntime({ deploymentId: deployed.id, minimumNodeVersion: plan?.targetNodeVersion ?? runtime.nodeVersion });
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
    const pr = await ownedPR('updates', 'chore: promote validated dependency updates', 'Hourly promotion passed all changed-version research, whole-lock policy, independent review, both audits, build, public updates browser comparison and vision review.');
    await gh.repoApi(`/pulls/${ownershipPR.number}`, { method: 'PATCH', body: { state: 'closed' } });
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
    return { ...state, summary: `${plan ? 'Node and Actions maintenance' : 'Dependencies'} promoted and production verified against the saved baseline.` };
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
