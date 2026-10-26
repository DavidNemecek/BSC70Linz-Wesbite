import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { auditCommandPlans } from './dependencies.mjs';

const execute = promisify(execFile);
const output = resolve(process.env.EVIDENCE_DIR || 'evidence');
const candidate = resolve(process.env.CANDIDATE_DIR || 'candidate');
const phase = process.env.WORKER_PHASE;
const result = { request: process.env.WORKER_REQUEST, phase, baseSHA: process.env.BASE_SHA, headSHA: process.env.HEAD_SHA,
  startedAt: new Date().toISOString(), pass: false, checks: [], nodeVersion: process.version };
const cleanEnv = Object.fromEntries(['PATH', 'RUNNER_TEMP', 'TMPDIR', 'LANG', 'CI', 'PLAYWRIGHT_BROWSERS_PATH'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
cleanEnv.HOME = process.env.RUNNER_TEMP || '/tmp';
cleanEnv.npm_config_userconfig = '/dev/null';
cleanEnv.npm_config_registry = 'https://registry.npmjs.org';
cleanEnv.npm_config_ignore_scripts = 'true';
cleanEnv.npm_config_engine_strict = 'true';
const npm = resolve(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js');
await mkdir(output, { recursive: true });

async function run(name, args, { allowFindings = false } = {}) {
  let stdout = '', stderr = '', code = 0;
  try { ({ stdout, stderr } = await execute(process.execPath, [npm, ...args], { cwd: candidate, env: cleanEnv, timeout: 8 * 60_000, maxBuffer: 8_000_000 })); }
  catch (error) { stdout = error.stdout || ''; stderr = error.stderr || ''; code = Number.isInteger(error.code) ? error.code : 2; }
  await writeFile(resolve(output, `${name}.log`), stdout + '\n' + stderr);
  result.checks.push({ name, exitCode: code, pass: code === 0 });
  if (args.includes('--json')) {
    try { result[name] = { exitCode: code, report: JSON.parse(stdout) }; }
    catch { throw Error(`Invalid ${name} JSON`); }
  }
  if (code !== 0 && !allowFindings) throw Error(`${name} failed (see evidence)`);
}

try {
  if (!/^[a-f0-9]{40}$/.test(result.baseSHA) || !/^[a-f0-9]{40}$/.test(result.headSHA) || !/^[0-9a-f-]{36}$/.test(result.request)) throw Error('Invalid worker identities');
  if (['inspect', 'resolve', 'validate'].includes(phase)) {
    if (phase === 'resolve') {
      const args = ['install', '--package-lock-only', '--ignore-scripts', '--strict-peer-deps', '--no-fund', '--no-audit'];
      if (process.env.URGENT_FIX !== 'true') args.push(`--before=${new Date(Date.now() - 7 * 86400000).toISOString()}`);
      await run('resolve', args);
      // Fix vulnerable transitives without force or major-range bypasses.
      await run('audit-fix', ['audit', 'fix', '--package-lock-only', '--ignore-scripts', '--strict-peer-deps', '--no-fund', ...(process.env.URGENT_FIX === 'true' ? [] : [`--before=${new Date(Date.now() - 7 * 86400000).toISOString()}`])], { allowFindings: true });
      result.files = [{ path: 'package-lock.json', content: await readFile(resolve(candidate, 'package-lock.json'), 'utf8') }];
    }
    if (phase === 'validate') {
      await run('install', ['ci', '--ignore-scripts', '--strict-peer-deps', '--no-fund', '--no-audit']);
      await run('tree', ['ls', '--all', '--json']);
      await run('lint', ['run', 'lint']);
      await run('build', ['run', 'build']);
    }
    for (const plan of auditCommandPlans()) await run(plan.scope === 'all' ? 'audit' : 'auditProduction', plan.args, { allowFindings: phase !== 'validate' });
    result.pass = phase !== 'validate' || result.checks.every(item => item.pass);
  } else if (['browser', 'capture'].includes(phase)) {
    const args = [resolve('.github/qa/browser.mjs'), '--output', resolve(output, 'qa')];
    if (phase === 'capture') args.push('--capture-only', '--baseline-url', process.env.BASELINE_URL);
    else {
      args.push('--candidate-url', process.env.CANDIDATE_URL);
      if (process.env.BASELINE_RUN) args.push('--baseline-dir', resolve(process.env.BASELINE_DIR));
      else args.push('--baseline-url', process.env.BASELINE_URL);
    }
    try { await execute(process.execPath, args, { env: cleanEnv, timeout: 30 * 60_000, maxBuffer: 8_000_000 }); }
    catch (error) { await writeFile(resolve(output, 'browser.log'), (error.stdout || '') + '\n' + (error.stderr || '')); }
    result.qa = JSON.parse(await readFile(resolve(output, 'qa/result.json'), 'utf8'));
    result.pass = result.qa.pass === true;
  } else throw Error('Unknown worker phase');
} catch (error) { result.error = error.message; }
result.completedAt = new Date().toISOString();
await writeFile(resolve(output, 'worker.json'), JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
