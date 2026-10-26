import { appendFile, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { auditCommandPlans } from './dependencies.mjs';
import { createDependencySandbox, sha256, NODE_VERSION, assertCandidateNodeVersion, readCandidateNodeVersion } from './dependency-sandbox.mjs';

const execute = promisify(execFile);
async function worker() {
const trustedRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.env.EVIDENCE_DIR || 'evidence');
const candidate = resolve(process.env.CANDIDATE_DIR || 'candidate');
const phase = process.env.WORKER_PHASE;
const result = { request: process.env.WORKER_REQUEST, phase, baseSHA: process.env.BASE_SHA, headSHA: process.env.HEAD_SHA,
  startedAt: new Date().toISOString(), pass: false, checks: [], nodeVersion: process.version };
// This environment is only for the trusted, separate browser phase. Candidate
// commands receive dependency-sandbox's fixed environment and no runner values.
const browserEnv = Object.fromEntries(['PATH', 'LANG', 'CI'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
browserEnv.HOME = process.env.RUNNER_TEMP || '/tmp';
// Match the workflow install path; never let candidate code choose a browser.
browserEnv.PLAYWRIGHT_BROWSERS_PATH = resolve(trustedRoot, '.bsc70-browsers');
await mkdir(output, { recursive: true });
let sandbox;

async function run(name, args, { allowFindings = false, ...options } = {}) {
  const { stdout, stderr, code } = await sandbox.run(args, options);
  // Logs are untrusted data. Never print them into Actions workflow commands,
  // import/execute them, or use their prose as proof that a check passed.
  await writeFile(resolve(output, `${name}.log`), stdout + '\n' + stderr);
  result.checks.push({ name, exitCode: code, pass: code === 0 });
  if (args.includes('--json')) {
    try {
      const report = JSON.parse(stdout);
      // Only immutable npm's pre-plugin audits are controller evidence. Tree
      // output stays in its log to keep the final identity envelope bounded.
      if (name !== 'tree') result[name] = { exitCode: code, report };
    } catch { throw Error(`Invalid ${name} JSON`); }
  }
  if (code !== 0 && !allowFindings) throw Error(`${name} failed (see evidence)`);
}

try {
  if (!/^[a-f0-9]{40}$/.test(result.baseSHA) || !/^[a-f0-9]{40}$/.test(result.headSHA) || !/^[0-9a-f-]{36}$/.test(result.request)) throw Error('Invalid worker identities');
  if (['inspect', 'resolve', 'validate'].includes(phase)) {
    if (output === candidate || output.startsWith(candidate + sep) || candidate.startsWith(output + sep)) throw Error('Evidence and candidate must be separate');
    // The workflow reads candidate data under the trusted runtime BEFORE setup,
    // then binds that selection through an environment value. Re-read to catch
    // changes between setup and execution. No env binding means the old trusted
    // default only (also used by the synthetic Docker isolation smoke).
    result.expectedNodeVersion = assertCandidateNodeVersion(process.env.CANDIDATE_NODE_VERSION ?? NODE_VERSION);
    if (process.env.CANDIDATE_NODE_VERSION !== undefined && await readCandidateNodeVersion(candidate) !== result.expectedNodeVersion)
      throw Error('Candidate .nvmrc differs from authorized runtime');
    sandbox = await createDependencySandbox(candidate, { nodeVersion: result.expectedNodeVersion });
    result.sandbox = { commands: sandbox.commands };
    if (phase === 'resolve') {
      const before = new Date(Date.now() - 7 * 86400000).toISOString();
      const args = ['install', '--package-lock-only', '--ignore-scripts', '--strict-peer-deps', '--no-fund', '--no-audit'];
      if (process.env.URGENT_FIX !== 'true') args.push(`--before=${before}`);
      await run('resolve', args, { network: true });
      // Fix vulnerable transitives without force or major-range bypasses.
      await run('audit-fix', ['audit', 'fix', '--package-lock-only', '--ignore-scripts', '--strict-peer-deps', '--no-fund', ...(process.env.URGENT_FIX === 'true' ? [] : [`--before=${before}`])], { network: true, allowFindings: true });
      result.sourceIntegrity = await sandbox.verify({ allowLockChange: true });
      result.files = [{ path: 'package-lock.json', content: await readFile(resolve(sandbox.work, 'package-lock.json'), 'utf8') }];
    }
    // Audits run against the pristine/resolved lock in fresh containers with a
    // READ-ONLY workspace, before any lint/build plugin can execute. Require
    // both reports even when the first audit finds vulnerabilities.
    for (const plan of auditCommandPlans()) await run(plan.scope === 'all' ? 'audit' : 'auditProduction', plan.args,
      { network: true, writable: false, allowFindings: true });
    if (phase === 'validate') {
      if (result.checks.some(check => !check.pass)) throw Error('Dependency audit failed (see evidence)');
      await run('install', ['ci', '--ignore-scripts', '--strict-peer-deps', '--no-fund', '--no-audit'], { network: true });
      result.sourceIntegrity = await sandbox.verify();
      await run('tree', ['ls', '--all', '--json'], { writable: false });
      await run('lint', ['run', 'lint', '--ignore-scripts', '--strict-peer-deps']);
      result.sourceIntegrity = await sandbox.verify();
      await run('build', ['run', 'build', '--ignore-scripts', '--strict-peer-deps']);
      result.sourceIntegrity = await sandbox.verify();
    } else result.sourceIntegrity = await sandbox.verify({ allowLockChange: phase === 'resolve' });
    result.pass = phase !== 'validate' || result.checks.every(item => item.pass);
  } else if (['browser', 'capture'].includes(phase)) {
    // Browser harness comes only from the trusted checkout. No candidate Node
    // module is loaded here; this phase does not create a dependency sandbox.
    const args = [resolve(trustedRoot, '.github/qa/browser.mjs'), '--output', resolve(output, 'qa')];
    if (phase === 'capture') args.push('--capture-only', '--baseline-url', process.env.BASELINE_URL);
    else {
      args.push('--candidate-url', process.env.CANDIDATE_URL);
      if (process.env.BASELINE_RUN) args.push('--baseline-dir', resolve(process.env.BASELINE_DIR));
      else args.push('--baseline-url', process.env.BASELINE_URL);
    }
    let browserCode = 0;
    try { await execute(process.execPath, args, { cwd: trustedRoot, env: browserEnv, timeout: 30 * 60_000, maxBuffer: 8_000_000 }); }
    catch (error) { browserCode = 1; await writeFile(resolve(output, 'browser.log'), (error.stdout || '') + '\n' + (error.stderr || '')); }
    const qaBytes = await readFile(resolve(output, 'qa/result.json'));
    const qa = JSON.parse(qaBytes.toString('utf8'));
    // Full reports can exceed 5MB. Controller reads qa/result.json from the
    // artifact; keep worker.json below its 4MB identity-envelope limit.
    result.qa = { pass: qa.pass === true, captureOnly: qa.captureOnly === true, counts: qa.counts,
      errors: (qa.errors ?? []).slice(0, 30).map(error => ({ check: String(error.check ?? '').slice(0, 200), message: String(error.message ?? '').slice(0, 500) })),
      manifestSHA256: sha256(Buffer.from(JSON.stringify(qa.artifacts))), resultSHA256: sha256(qaBytes) };
    result.pass = browserCode === 0 && result.qa.pass;
  } else throw Error('Unknown worker phase');
} catch (error) { result.error = error.message; }
finally {
  if (sandbox) {
    // Also detect source tampering after a failing lint/build, before reporting.
    try { result.sourceIntegrity = await sandbox.verify({ allowLockChange: phase === 'resolve' }); }
    catch (error) { result.pass = false; result.error = error.message; }
    try { await sandbox.close(); }
    catch (error) { result.pass = false; result.error = error.message; }
  }
}
result.completedAt = new Date().toISOString();
// Only this HOST process writes final identities/verdict, after every container
// and its background processes have been removed. Output is never mounted.
if ((await lstat(output)).isSymbolicLink()) throw Error('Evidence directory must not be a symlink');
await writeFile(resolve(output, 'worker.json'), JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
}

if (process.argv[2] === 'select-node') {
  // Run only trusted host code; never source .nvmrc or invoke candidate npm.
  const nodeVersion = await readCandidateNodeVersion(resolve(process.env.CANDIDATE_DIR || 'candidate'));
  if (!process.env.GITHUB_OUTPUT) throw Error('Missing workflow output binding');
  await appendFile(process.env.GITHUB_OUTPUT, `node_version=${nodeVersion}\n`);
} else await worker();
