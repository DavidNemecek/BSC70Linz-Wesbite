/** LIVE Docker test, no native substitute or silent skip. Only synthetic host
 * canaries are accessed; no Actions/AI/Vercel secret is read. Pull the reviewed
 * dependency-sandbox digest first and run with the pinned trusted host Node. */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createDependencySandbox, NODE_VERSION, sha256 } from './dependency-sandbox.mjs';

// Serialized as a synthetic installed dependency, executed only in Docker.
function hostile(config) {
  const fs = require('node:fs'), { spawn } = require('node:child_process');
  const denied = fn => { try { fn(); return false; } catch { return true; } };
  const report = {
    uid: process.getuid(), status: fs.readFileSync('/proc/self/status', 'utf8'),
    outside: denied(() => fs.writeFileSync('/outside-candidate', 'escape')),
    hostOutside: denied(() => fs.writeFileSync(config.escaped, 'escape')),
    npm: denied(() => fs.writeFileSync('/opt/node/lib/node_modules/npm/bin/npm-cli.js', 'forged npm')),
    node: denied(() => fs.writeFileSync('/opt/node/bin/node', 'forged node')),
    worker: denied(() => fs.writeFileSync(config.worker, 'forged worker')),
    evidence: denied(() => fs.writeFileSync(config.evidence, JSON.stringify({ pass: true }))),
    procRoot: denied(() => fs.writeFileSync('/proc/1/root' + config.evidence, JSON.stringify({ pass: true }))),
    hostProc: denied(() => { const bytes = fs.readFileSync('/proc/' + config.hostPID + '/environ'); fs.writeFileSync('/work/node_modules/stolen', bytes); }),
    socketsAbsent: !fs.existsSync('/var/run/docker.sock') && !fs.existsSync('/run/docker.sock'),
    envClean: !Object.keys(process.env).some(k => /^(ACTIONS_|GITHUB_|GH_TOKEN|VERCEL_|OPENAI_|AI_)/.test(k)),
    noHostRoot: !fs.existsSync('/host') && !fs.existsSync('/github'),
  };
  // A detached child would poison later checks on the old same-user worker.
  const child = spawn(process.execPath, ['-e', 'const fs=require(\'node:fs\');fs.writeFileSync(\'/work/node_modules/heartbeat\',\'started\');setInterval(()=>fs.appendFileSync(\'/work/node_modules/heartbeat\',\'x\'),30)'], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => {
    fs.writeFileSync('/work/node_modules/probe.json', JSON.stringify(report));
    fs.writeFileSync('/work/src.js', 'export const value = 666;');
    fs.writeFileSync('/work/package-lock.json', '{}');
    console.log('::set-output name=pass::true');
    console.log(JSON.stringify({ pass: true, auditReportVersion: 2 }));
    // Deliberately exit zero: host integrity checks must reject independently.
  }, 250);
}

const execute = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'bsc70-hostile-integration-'));
const candidate = join(root, 'candidate'), trusted = join(root, 'trusted');
const evidence = join(trusted, 'worker.json'), worker = join(trusted, 'worker.mjs');
const token = randomUUID(); // synthetic canary, never an actual credential
let hostProcess, sandbox;
const absent = async path => { try { await access(path); return false; } catch (e) { if (e.code === 'ENOENT') return true; throw e; } };
try {
  await mkdir(join(candidate, 'fixtures/hostile'), { recursive: true });
  await mkdir(trusted);
  await cp(new URL('./worker.mjs', import.meta.url), worker);
  const hostWorkerBytes = await readFile(worker);
  const hostEvidence = JSON.stringify({ request: token, pass: false, authoredBy: 'host' });
  await writeFile(evidence, hostEvidence);
  hostProcess = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { env: { SYNTHETIC_ACTIONS_TOKEN: token }, stdio: 'ignore' });
  await new Promise((ok, fail) => { hostProcess.once('spawn', ok); hostProcess.once('error', fail); });
  // A real, readable host PID with a known token prevents a vacuous test pass.
  assert((await readFile('/proc/' + hostProcess.pid + '/environ')).includes(Buffer.from(token)));
  await writeFile(join(candidate, 'src.js'), 'export const value = 42;\n');
  await writeFile(join(candidate, 'package.json'), JSON.stringify({ name: 'isolation-fixture', version: '1.0.0', private: true,
    scripts: { lint: 'node -e \'require("hostile-fixture")\'', build: 'node --version' },
    dependencies: { 'hostile-fixture': 'file:fixtures/hostile' } }));
  await writeFile(join(candidate, 'fixtures/hostile/package.json'), JSON.stringify({ name: 'hostile-fixture', version: '1.0.0', main: 'index.cjs' }));
  await writeFile(join(candidate, 'package-lock.json'), JSON.stringify({ name: 'isolation-fixture', version: '1.0.0', lockfileVersion: 3, requires: true,
    packages: { '': { name: 'isolation-fixture', version: '1.0.0', dependencies: { 'hostile-fixture': 'file:fixtures/hostile' } },
      'fixtures/hostile': { name: 'hostile-fixture', version: '1.0.0' }, 'node_modules/hostile-fixture': { resolved: 'fixtures/hostile', link: true } } }));
  const hostRuntime = resolve(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js');
  const runtimeBefore = sha256(await readFile(hostRuntime));
  const escaped = join(root, 'escaped');
  await writeFile(join(candidate, 'fixtures/hostile/index.cjs'), '(' + hostile.toString() + ')(' + JSON.stringify({ worker, evidence, escaped, hostPID: hostProcess.pid }) + ');');
  const originalSource = await readFile(join(candidate, 'src.js'));
  const originalLock = await readFile(join(candidate, 'package-lock.json'));
  sandbox = await createDependencySandbox(candidate);
  const installed = await sandbox.run(['ci', '--ignore-scripts', '--strict-peer-deps', '--no-fund', '--no-audit']);
  assert.equal(installed.code, 0, installed.stderr);
  await sandbox.verify();
  const attack = await sandbox.run(['run', 'lint', '--ignore-scripts']);
  assert.equal(attack.code, 0, attack.stderr);
  const probe = JSON.parse(await readFile(join(sandbox.work, 'node_modules/probe.json')));
  assert(probe.uid > 0);
  assert.match(probe.status, /^CapEff:\s+0+$/m);
  assert.match(probe.status, /^NoNewPrivs:\s+1$/m);
  for (const field of ['outside', 'hostOutside', 'npm', 'node', 'worker', 'evidence', 'procRoot', 'hostProc', 'socketsAbsent', 'envClean', 'noHostRoot'])
    assert.equal(probe[field], true, 'Live hostile probe failed: ' + field);
  // Independently inspect host targets, never trust exit zero or plugin prose.
  assert.deepEqual(await readFile(worker), hostWorkerBytes);
  assert.equal(await readFile(evidence, 'utf8'), hostEvidence);
  assert.equal(sha256(await readFile(hostRuntime)), runtimeBefore);
  assert(await absent(escaped));
  assert(await absent(join(sandbox.work, 'node_modules/stolen')));
  await assert.rejects(sandbox.verify(), /Candidate source changed.*(?:package-lock|src)/);
  assert.deepEqual(await readFile(join(candidate, 'src.js')), originalSource);
  assert.deepEqual(await readFile(join(candidate, 'package-lock.json')), originalLock);
  const heartbeatPath = join(sandbox.work, 'node_modules/heartbeat');
  const heartbeat = await readFile(heartbeatPath, 'utf8');
  assert(heartbeat.startsWith('started'), 'background process must actually start');
  await delay(300);
  assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeat, 'background process survived removal');
  const next = await sandbox.run(['--version'], { rawNode: true });
  assert.equal(next.code, 0, next.stderr);
  assert.equal(next.stdout.trim(), 'v' + NODE_VERSION);
  await delay(150);
  assert.equal(await readFile(heartbeatPath, 'utf8'), heartbeat);
  const names = sandbox.commands.map(item => item.container);
  assert.equal(new Set(names).size, 3);
  for (const name of names) await assert.rejects(execute('/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', 'inspect', name],
    { env: { PATH: '/usr/bin:/bin', HOME: join(root, 'docker-home') }, timeout: 15_000 }));
  // Exercise the real HOST worker too: audits/tree must precede the hostile
  // plugin, forged stdout must stay data, and the final identity must be false.
  const request = randomUUID(), actualEvidence = join(trusted, 'actual-evidence');
  const workerEnv = { PATH: process.env.PATH, WORKER_PHASE: 'validate', WORKER_REQUEST: request,
    BASE_SHA: 'a'.repeat(40), HEAD_SHA: 'b'.repeat(40), CANDIDATE_DIR: candidate, EVIDENCE_DIR: actualEvidence };
  await assert.rejects(execute(process.execPath, [new URL('./worker.mjs', import.meta.url).pathname], {
    env: workerEnv, timeout: 120_000, maxBuffer: 1_000_000,
  }), error => error.code === 1 && !error.stdout.includes('::set-output'));
  const envelope = JSON.parse(await readFile(join(actualEvidence, 'worker.json')));
  assert.equal(envelope.request, request);
  assert.equal(envelope.baseSHA, workerEnv.BASE_SHA);
  assert.equal(envelope.headSHA, workerEnv.HEAD_SHA);
  assert.equal(envelope.pass, false);
  assert.match(envelope.error, /Candidate source changed/);
  assert.deepEqual(envelope.checks.map(item => item.name), ['audit', 'auditProduction', 'install', 'tree', 'lint']);
  assert(envelope.checks.every(item => item.exitCode === 0));
  assert.equal(envelope.sandbox.commands.length, 5);
  assert.equal(envelope.sandbox.commands.at(-1).network, 'none');
  assert.deepEqual(await readFile(worker), hostWorkerBytes);
  assert.equal(await readFile(evidence, 'utf8'), hostEvidence);
  assert.equal(sha256(await readFile(hostRuntime)), runtimeBefore);
  // A benign zero-dependency candidate exercises all package phases and
  // proves normal validation can reach build with the same isolated runtime.
  const cleanManifest = { name: 'clean-isolation-fixture', version: '1.0.0', private: true,
    scripts: { lint: 'node --version', build: 'node --version' } };
  await writeFile(join(candidate, 'package.json'), JSON.stringify(cleanManifest));
  await writeFile(join(candidate, 'package-lock.json'), JSON.stringify({ name: cleanManifest.name, version: cleanManifest.version,
    lockfileVersion: 3, requires: true, packages: { '': { name: cleanManifest.name, version: cleanManifest.version } } }));
  for (const phase of ['inspect', 'resolve', 'validate']) {
    const cleanOutput = join(trusted, 'clean-' + phase);
    await execute(process.execPath, [new URL('./worker.mjs', import.meta.url).pathname], {
      env: { ...workerEnv, WORKER_PHASE: phase, EVIDENCE_DIR: cleanOutput }, timeout: 120_000, maxBuffer: 1_000_000,
    });
    const clean = JSON.parse(await readFile(join(cleanOutput, 'worker.json')));
    assert.equal(clean.pass, true);
    assert(clean.checks.every(item => item.exitCode === 0));
    if (phase === 'validate') assert.deepEqual(clean.checks.map(item => item.name), ['audit', 'auditProduction', 'install', 'tree', 'lint', 'build']);
    if (phase === 'resolve') {
      assert.equal(clean.files[0].path, 'package-lock.json');
      assert.equal(JSON.parse(clean.files[0].content).name, cleanManifest.name);
    }
  }
  console.log('LIVE Docker isolation passed: nonroot/caps/proc/env/mount attacks blocked; host worker/evidence/runtime unchanged; background child killed; source+lock tampering rejected despite exit 0.');
} finally {
  hostProcess?.kill('SIGKILL');
  await sandbox?.close();
  await rm(root, { recursive: true, force: true });
}
