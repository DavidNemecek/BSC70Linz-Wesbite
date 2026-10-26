/**
 * TRUSTED MAIN ONLY. application-checks.yml owns the single required application
 * context, posted with the Checks API on the exact candidate SHA (the native
 * pull_request_target/workflow_dispatch job check belongs to main).
 *
 * Controller contract (normal bot PRs AND restores): dispatch automation-checks
 * on headBranch with {pr_number, head_sha}; dispatch application-checks.yml on
 * main with {pr_number, head_sha}; dispatch the independent review as before.
 * Await all ordinary required contexts on head_sha and retain strict protection.
 * The application workflow must be dispatched separately on trusted main; a
 * candidate branch workflow cannot dispatch a privileged workflow. No artifact
 * from the still-running controller is needed. Inputs, bot bodies and branch names
 * are hints, never authorization to accept audit findings.
 *
 * Recovery deliberately accepts existing CVEs ONLY when production already serves
 * the original main commit and the PR restores exactly its Git tree, with one
 * parent equal to failed/current main. The failed merge must have original main
 * as its first parent. Audits remain recorded as findings, never called clean.
 * VERCEL_TOKEN is confined to the initial/final trusted authorizer jobs; candidate
 * code runs only in createDependencySandbox on a different, read-only-token job.
 * Final authorization re-reads GitHub AND actual Vercel production before success.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import * as github from './github.mjs';
import { getProductionDeployment } from './vercel.mjs';
import { auditCommandPlans, inspectNpmAudit } from './dependencies.mjs';
import { createDependencySandbox, sourceSnapshot, assertSourceUnchanged } from './dependency-sandbox.mjs';

export const APPLICATION_CONTEXT = 'Application lint, build and audit';
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MARKER = /<!-- dependency-restore:v1 failed=([a-f0-9]{40}) original=([a-f0-9]{40}) -->/g;
const requireThat = (value, message) => { if (!value) throw Error(message); };
const checkedSHA = value => { requireThat(typeof value === 'string' && SHA.test(value), 'Invalid SHA'); return value; };
const checkedPR = value => { requireThat(/^[1-9]\d{0,8}$/.test(String(value)), 'Invalid PR number'); return Number(value); };
const execute = promisify(execFile);

function assertTrusted(env) {
  requireThat(REPO.test(env.GITHUB_REPOSITORY) &&
    env.GITHUB_WORKFLOW_REF === `${env.GITHUB_REPOSITORY}/.github/workflows/application-checks.yml@refs/heads/main`, 'Only installed main workflow is trusted');
  checkedSHA(env.GITHUB_WORKFLOW_SHA);
}

export async function resolveRequest(event, env, gh = github) {
  assertTrusted(env);
  requireThat(event.repository?.full_name === gh.repository && event.repository.default_branch === 'main', 'Repository identity changed');
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') return {
    number: checkedPR(event.inputs?.pr_number), headSHA: checkedSHA(event.inputs?.head_sha),
  };
  if (env.GITHUB_EVENT_NAME === 'pull_request_target') return {
    number: checkedPR(event.number), headSHA: checkedSHA(event.pull_request?.head?.sha),
  };
  throw Error('Unsupported application event; bot PRs require explicit main dispatch');
}

async function commit(gh, sha) {
  const value = await gh.repoApi(`/git/commits/${checkedSHA(sha)}`);
  requireThat(value.sha === sha && SHA.test(value.tree?.sha) && Array.isArray(value.parents) &&
    value.parents.every(parent => SHA.test(parent.sha)), 'Incomplete Git commit identity');
  return value;
}

async function githubIdentity(request, gh) {
  const number = checkedPR(request.number), headSHA = checkedSHA(request.headSHA);
  const pr = await gh.repoApi(`/pulls/${number}`);
  requireThat(pr.number === number && pr.state === 'open' && pr.draft === false && pr.head?.sha === headSHA &&
    REPO.test(pr.head.repo?.full_name) && pr.base?.repo?.full_name === gh.repository &&
    ['main', 'updates'].includes(pr.base?.ref), 'PR identity changed');
  const baseSHA = checkedSHA(pr.base.sha);
  requireThat(await gh.ref(pr.base.ref) === baseSHA, 'Current base changed');
  const head = await commit(gh, headSHA);
  return { pr, head, identity: { version: 1, repository: gh.repository, number, headRepository: pr.head.repo.full_name,
    headRef: pr.head.ref, headSHA, baseRef: pr.base.ref, baseSHA, treeSHA: head.tree.sha,
    parents: head.parents.map(parent => parent.sha) } };
}

// No caller-supplied allowFindings/recovery flag exists. A malformed/forged
// marker takes the ordinary clean-audit path, or fails authorization closed.
export async function authorize(request, { gh = github, production = getProductionDeployment } = {}) {
  const { pr, head, identity } = await githubIdentity(request, gh);
  const markers = [...(typeof pr.body === 'string' ? pr.body.matchAll(MARKER) : [])];
  const hint = markers.length > 0 || pr.head.ref?.startsWith('automation/restore-');
  if (!hint) return { ...identity, recovery: null };
  requireThat(markers.length === 1 && pr.user?.login === 'github-actions[bot]' && pr.user?.type === 'Bot' &&
    pr.head.repo.full_name === gh.repository && /^automation\/restore-[a-zA-Z0-9-]+$/.test(pr.head.ref) &&
    pr.base.ref === 'main', 'Unverified restore PR identity');
  const [, failedSHA, originalSHA] = markers[0];
  requireThat(failedSHA === identity.baseSHA && failedSHA !== originalSHA && head.parents.length === 1 &&
    head.parents[0].sha === failedSHA, 'Restore head/parent/current main mismatch');
  const failed = await commit(gh, failedSHA), original = await commit(gh, originalSHA);
  requireThat(failed.parents[0]?.sha === originalSHA && head.tree.sha === original.tree.sha &&
    head.tree.sha !== failed.tree.sha, 'Restore differs from original production Git tree');
  await assertOnlyRestorePR(identity, gh);
  // Read-only helper checks fixed project/team/hostname, READY production target,
  // alias deployment and matching immutable Git metadata via authenticated API.
  const serving = await production();
  requireThat(serving.sha === originalSHA && serving.branch === 'main' && serving.readyState === 'READY' &&
    typeof serving.id === 'string' && typeof serving.projectId === 'string' && typeof serving.hostname === 'string',
  'Actual Vercel production has not rolled back to original main');
  // Re-read refs after external reads; no stale proof if the PR/main moved.
  const fresh = await githubIdentity(request, gh);
  requireThat(isDeepStrictEqual(identity, fresh.identity), 'PR/base changed during authorization');
  return { ...identity, recovery: { originalSHA, failedSHA, treeSHA: original.tree.sha, deploymentId: serving.id,
    projectId: serving.projectId, hostname: serving.hostname } };
}

// Required contexts are SHA-scoped, not PR-scoped. Never publish a recovery
// exception while an ordinary open PR could borrow it on the same head SHA.
async function assertOnlyRestorePR(proof, gh) {
  const matches = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await gh.repoApi(`/pulls?state=open&per_page=100&page=${page}`);
    requireThat(Array.isArray(batch) && batch.length <= 100, 'Incomplete shared-head PR inventory');
    matches.push(...batch.filter(pr => pr.state === 'open' && pr.head?.sha === proof.headSHA));
    if (batch.length < 100) {
      requireThat(matches.length === 1 && matches[0].number === proof.number, 'Recovery head is shared with another open PR');
      return;
    }
  }
  throw Error('Incomplete shared-head PR inventory');
}

export async function recheckIdentity(proof, gh = github) {
  requireThat(proof?.version === 1 && proof.repository === gh.repository, 'Untrusted authorization output');
  const { identity, pr, head } = await githubIdentity(proof, gh);
  const { recovery, ...expected } = proof;
  requireThat(isDeepStrictEqual(identity, expected), 'Authorized PR/head/base/tree changed');
  if (recovery !== null) {
    requireThat(recovery && recovery.failedSHA === proof.baseSHA && recovery.treeSHA === head.tree.sha &&
      head.parents.length === 1 && head.parents[0].sha === proof.baseSHA && pr.user?.login === 'github-actions[bot]' &&
      pr.user?.type === 'Bot' && pr.head.repo.full_name === gh.repository && proof.baseRef === 'main', 'Invalid recovery output');
    checkedSHA(recovery.originalSHA);
    await assertOnlyRestorePR(proof, gh);
  }
}

// inspectNpmAudit distinguishes valid vulnerability findings from network errors,
// unsupported reports, inconsistent counts and inventory mismatches. Only its
// specific vulnerability error is waived; malformed reports always fail closed.
export function auditVerdict(report, exitCode, scope, lock, proof) {
  const inspected = inspectNpmAudit(report, { exitCode, scope, lock });
  const findingsOnly = inspected.errors.length === 1 && inspected.errors[0] === 'npm audit reports vulnerabilities' &&
    inspected.findings.length > 0 && exitCode === 1;
  const acceptedBaselineFindings = Boolean(proof.recovery) && findingsOnly;
  return { ...inspected, clean: inspected.ok, acceptedBaselineFindings,
    pass: inspected.ok || acceptedBaselineFindings };
}

async function localIdentity(candidate, proof) {
  const git = async args => (await execute('/usr/bin/git', ['-C', candidate, ...args], {
    env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
    timeout: 30_000, maxBuffer: 8_000_000,
  })).stdout.trim();
  requireThat(await git(['rev-parse', 'HEAD']) === proof.headSHA &&
    await git(['rev-parse', 'HEAD^{tree}']) === proof.treeSHA, 'Local candidate head/tree mismatch');
  requireThat(await git(['status', '--porcelain', '--untracked-files=all']) === '', 'Local checkout is not pristine');
}

export async function validateApplication({ proof, candidate, evidence, gh = github,
  sandboxFactory = createDependencySandbox, verifyLocal = localIdentity }) {
  const result = { proof, pass: false, audits: [], checks: [] };
  await mkdir(evidence, { recursive: true });
  let sandbox, before;
  try {
    await recheckIdentity(proof, gh);
    await verifyLocal(candidate, proof);
    before = await sourceSnapshot(candidate);
    sandbox = await sandboxFactory(candidate);
    const lock = JSON.parse(await readFile(resolve(candidate, 'package-lock.json'), 'utf8'));
    // Immutable npm, read-only workspace, before candidate plugins. Save both
    // complete reports even if the first contains ordinary blocking findings.
    for (const plan of auditCommandPlans()) {
      const output = await sandbox.run(plan.args, { network: true, writable: false });
      await writeFile(resolve(evidence, `audit-${plan.scope}.json`), output.stdout);
      await writeFile(resolve(evidence, `audit-${plan.scope}.stderr`), output.stderr);
      const audit = auditVerdict(JSON.parse(output.stdout), output.code, plan.scope, lock, proof);
      result.audits.push({ scope: plan.scope, exitCode: output.code, ...audit });
      await sandbox.verify();
    }
    requireThat(result.audits.every(audit => audit.pass), 'Dependency audit failed; see recorded reports');
    for (const [name, args, options] of [
      ['install', ['ci', '--ignore-scripts', '--strict-peer-deps', '--no-fund', '--no-audit'], { network: true }],
      ['tree', ['ls', '--all', '--json'], { writable: false }],
      ['lint', ['run', 'lint', '--ignore-scripts', '--strict-peer-deps'], {}],
      ['build', ['run', 'build', '--ignore-scripts', '--strict-peer-deps'], {}],
    ]) {
      const output = await sandbox.run(args, options);
      await writeFile(resolve(evidence, `${name}.log`), output.stdout + '\n' + output.stderr);
      result.checks.push({ name, exitCode: output.code, pass: output.code === 0 });
      await sandbox.verify();
      requireThat(output.code === 0, `${name} failed; see recorded log`);
    }
    result.pass = true;
  } catch (error) { result.error = error.message; }
  finally {
    if (sandbox) {
      try { result.sourceIntegrity = await sandbox.verify(); }
      catch (error) { result.pass = false; result.error = error.message; }
      try { await sandbox.close(); }
      catch (error) { result.pass = false; result.error = error.message; }
    }
    try {
      if (before) await assertSourceUnchanged(candidate, before);
      await verifyLocal(candidate, proof);
      await recheckIdentity(proof, gh);
    } catch (error) { result.pass = false; result.error = error.message; }
    // Host envelope lives outside both candidate and sandbox mounts, written
    // after all candidate processes/containers have gone away.
    await writeFile(resolve(evidence, 'application.json'), JSON.stringify(result, null, 2));
  }
  return result;
}

export async function finalize({ proof, checkId, buildResult, gh = github, production = getProductionDeployment }) {
  requireThat(Number.isSafeInteger(checkId) && checkId > 0, 'Invalid check ID');
  const check = await gh.repoApi(`/check-runs/${checkId}`);
  requireThat(check.name === APPLICATION_CONTEXT && check.head_sha === proof.headSHA && check.app?.id === 15368 &&
    check.external_id === `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`, 'Check identity changed');
  let success = false, reason = 'Application sandbox failed or did not finish';
  try {
    const fresh = await authorize(proof, { gh, production });
    requireThat(isDeepStrictEqual(fresh, proof), 'Authorization/production changed after validation');
    success = buildResult === 'success';
    if (success) reason = proof.recovery
      ? 'Exact serving production tree restored; baseline audit findings recorded; install/tree/lint/build/source integrity passed.'
      : 'Clean audits and install/tree/lint/build/source integrity passed.';
  } catch (error) { reason = error.message; }
  await gh.repoApi(`/check-runs/${checkId}`, { method: 'PATCH', body: {
    status: 'completed', conclusion: success ? 'success' : 'failure', completed_at: new Date().toISOString(),
    output: { title: success ? 'Application validation passed' : 'Application validation blocked', summary: reason },
  } });
  return success;
}

async function cli() {
  const env = process.env;
  assertTrusted(env);
  const mode = process.argv[2];
  if (mode === 'authorize') {
    const request = await resolveRequest(await github.event(), env);
    const proof = await authorize(request);
    const check = await github.repoApi('/check-runs', { method: 'POST', body: {
      name: APPLICATION_CONTEXT, head_sha: proof.headSHA, status: 'in_progress',
      external_id: `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`,
      details_url: `https://github.com/${github.repository}/actions/runs/${env.GITHUB_RUN_ID}`,
    } });
    requireThat(Number.isSafeInteger(check.id) && check.id > 0, 'Invalid created check');
    for (const [name, value] of Object.entries({ proof: JSON.stringify(proof), check_id: String(check.id),
      head_sha: proof.headSHA, head_repository: proof.headRepository, trusted_sha: env.GITHUB_WORKFLOW_SHA })) await github.output(name, value);
  } else {
    const proof = JSON.parse(env.APPLICATION_PROOF);
    if (mode === 'validate') {
      requireThat(!env.VERCEL_TOKEN && !env.AI_API_KEY, 'No privileged secrets allowed in validation');
      const result = await validateApplication({ proof, candidate: resolve('candidate'), evidence: resolve('evidence') });
      if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,
        `Application validation: ${result.pass ? 'passed' : 'failed'}. Mode: ${proof.recovery ? 'verified production restoration' : 'ordinary clean audit'}.\n` +
        result.audits.map(audit => `${audit.scope}: clean=${audit.clean}, baseline findings accepted=${audit.acceptedBaselineFindings}, findings=${audit.findings.length}.\n`).join(''));
      if (!result.pass) process.exitCode = 1;
    } else if (mode === 'finalize') {
      if (!await finalize({ proof, checkId: Number(env.APPLICATION_CHECK_ID), buildResult: env.APPLICATION_BUILD_RESULT })) process.exitCode = 1;
    } else throw Error('Unknown application-check mode');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli();
