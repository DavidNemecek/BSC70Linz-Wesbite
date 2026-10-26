import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { containerArguments, assertContainerBoundary, sourceSnapshot, assertSourceUnchanged, sha256, SANDBOX_IMAGE,
  NODE_VERSION, assertCandidateNodeVersion, parseCandidateNodeVersion, readCandidateNodeVersion, createDependencySandbox } from './dependency-sandbox.mjs';
const execute = promisify(execFile);
const config = { name: 'bsc70-12345678-1234-1234-1234-123456789abc', work: '/tmp/narrow/work', runtime: '/trusted/node',
  uid: 1001, gid: 1001, network: false, writable: true, nodeArgs: ['/opt/node/lib/node_modules/npm/bin/npm-cli.js', 'run', 'lint'] };

const [, minor, patch] = NODE_VERSION.split('.').map(Number);
const newerPatch = `24.${minor}.${patch + 1}`, newerMinor = `24.${minor + 1}.0`;

test('candidate runtime allows exact same/newer stable 24 patch and minor, never a downgrade or setup-node selector', async () => {
  for (const version of [NODE_VERSION, newerPatch, newerMinor]) {
    assert.equal(assertCandidateNodeVersion(version), version);
    for (const newline of ['', '\n', '\r\n']) assert.equal(parseCandidateNodeVersion(version + newline), version);
  }
  for (const version of [undefined, '', '24', '24.x', 'node', 'lts/*', 'v' + NODE_VERSION, '^' + NODE_VERSION,
    '>=' + NODE_VERSION, NODE_VERSION + '-rc.1', NODE_VERSION + '+custom', '25.0.0', '22.99.99',
    `24.${minor - 1}.999`, `24.${minor}.${patch - 1}`, '24.022.1', '24.22.01', '24.99999999999999999.0',
    'https://nodejs.org/dist/' + NODE_VERSION, 'file:///tmp/node', 'refs/heads/main', 'nightly/' + NODE_VERSION,
    NODE_VERSION + '\n', NODE_VERSION + '\r', NODE_VERSION + ' ', ' ' + NODE_VERSION]) {
    assert.throws(() => assertCandidateNodeVersion(version));
  }
  for (const text of [NODE_VERSION + '\n\n', NODE_VERSION + '\r\n\n', NODE_VERSION + '\nnode', NODE_VERSION + '\0', 'node=' + NODE_VERSION])
    assert.throws(() => parseCandidateNodeVersion(text));
  // Deliberately no download/execution of a hypothetical newer release.
  await assert.rejects(createDependencySandbox('/not-read', { nodeVersion: newerPatch }), /host Node/);
  await assert.rejects(createDependencySandbox('/not-read', { nodeVersion: '25.0.0' }), /exact stable Node 24/);
});

test('candidate .nvmrc reader rejects links, directories, FIFOs, oversized files and invalid selectors', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bsc70-node-file-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pin = join(root, '.nvmrc'), other = join(root, 'other');
  await writeFile(other, NODE_VERSION);
  await symlink(other, pin); await assert.rejects(readCandidateNodeVersion(root)); await rm(pin);
  await link(other, pin); await assert.rejects(readCandidateNodeVersion(root), /regular file/); await rm(pin);
  await mkdir(pin); await assert.rejects(readCandidateNodeVersion(root), /regular file/); await rm(pin, { recursive: true });
  await execute('/usr/bin/mkfifo', [pin]); await assert.rejects(readCandidateNodeVersion(root), /regular file/); await rm(pin);
  for (const content of ['24.x', 'https://example.org/node', '25.0.0', 'x'.repeat(65)]) {
    await writeFile(pin, content); await assert.rejects(readCandidateNodeVersion(root));
  }
  await writeFile(pin, newerMinor + '\n'); assert.equal(await readCandidateNodeVersion(root), newerMinor);
});

test('host worker binds candidate file through selection and rejects env tampering or actual runtime mismatch before Docker', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bsc70-worker-node-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const candidate = join(root, 'candidate'); await mkdir(candidate);
  const pin = join(candidate, '.nvmrc'), binding = join(root, 'outputs');
  const worker = new URL('./worker.mjs', import.meta.url).pathname;
  const env = { PATH: '/usr/bin:/bin', CANDIDATE_DIR: candidate, GITHUB_OUTPUT: binding };
  await writeFile(pin, newerPatch + '\n');
  await execute(process.execPath, [worker, 'select-node'], { env });
  assert.equal(await readFile(binding, 'utf8'), `node_version=${newerPatch}\n`);
  for (const [expected, actual, errorPattern] of [
    [NODE_VERSION, newerPatch, /differs from authorized/],
    [newerPatch, newerPatch, /host Node/],
    ['25.0.0', '25.0.0', /exact stable Node 24/],
    [NODE_VERSION + '\n', NODE_VERSION, /exact stable Node 24/],
  ]) {
    await writeFile(pin, actual + '\n');
    const evidence = join(root, 'evidence-' + Math.random());
    await assert.rejects(execute(process.execPath, [worker], { env: { ...env, EVIDENCE_DIR: evidence,
      CANDIDATE_NODE_VERSION: expected, WORKER_PHASE: 'validate', WORKER_REQUEST: '12345678-1234-1234-1234-123456789abc',
      BASE_SHA: 'a'.repeat(40), HEAD_SHA: 'b'.repeat(40) } }));
    const result = JSON.parse(await readFile(join(evidence, 'worker.json'), 'utf8'));
    assert.equal(result.pass, false); assert.equal(result.nodeVersion, process.version);
    assert.equal(result.checks.length, 0); assert.equal(result.sandbox, undefined); assert.match(result.error, errorPattern);
    if (expected === newerPatch) assert.equal(result.expectedNodeVersion, newerPatch);
  }
});

function inspectedBoundary() {
  const args = containerArguments(config), env = [];
  args.forEach((arg, i) => { if (arg === '--env') env.push(args[i + 1]); });
  return { Config: { User: '1001:1001', Entrypoint: ['/opt/node/bin/node'], Cmd: config.nodeArgs, Env: env },
    HostConfig: { Privileged: false, ReadonlyRootfs: true, PidMode: '', IpcMode: 'private', CgroupnsMode: 'private', NetworkMode: 'none',
      CapAdd: [], CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges=true'], PidsLimit: 128, Memory: 2147483648,
      MemorySwap: 2147483648, NanoCpus: 2000000000, Devices: [], DeviceRequests: [], VolumesFrom: [], Binds: [],
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=256m,mode=1777', '/home/node': 'rw,noexec,nosuid,nodev,size=64m,mode=700,uid=1001,gid=1001' } },
    Mounts: [{ Type: 'bind', Source: config.runtime, Destination: '/opt/node', RW: false, Propagation: 'rprivate' },
      { Type: 'bind', Source: config.work, Destination: '/work', RW: true, Propagation: 'rprivate' }] };
}

test('sandbox mounts only disposable work and immutable runtime, with a fixed secretless environment', () => {
  const args = containerArguments(config);
  assert(args.includes(SANDBOX_IMAGE));
  assert.equal(args.filter(arg => arg === '--mount').length, 2);
  assert.equal(args[args.indexOf('--network') + 1], 'none');
  assert(!args.includes('--pid') && !args.includes('--privileged'));
  const env = inspectedBoundary().Config.Env;
  assert(!env.some(value => /^(ACTIONS_|GITHUB_|GH_TOKEN|OPENAI_|AI_|VERCEL_)/.test(value)));
  assertContainerBoundary(inspectedBoundary(), config);
  for (const change of [{ uid: 0 }, { gid: 0 }, { runtime: '/tmp/narrow/work/tools' }, { work: '/trusted/node/project' }, { work: '/work,src=/' }])
    assert.throws(() => containerArguments({ ...config, ...change }));
});

test('host inspects each actual container and rejects weakened boundaries', () => {
  const mutations = [
    x => { x.HostConfig.Privileged = true; }, x => { x.HostConfig.PidMode = 'host'; },
    x => { x.HostConfig.ReadonlyRootfs = false; }, x => { x.Config.User = '0:0'; },
    x => { x.HostConfig.CapAdd = ['SYS_ADMIN']; }, x => { x.HostConfig.CapDrop = []; },
    x => { x.HostConfig.SecurityOpt = []; }, x => { x.HostConfig.Memory = 0; },
    x => { x.HostConfig.PidsLimit = 0; }, x => { x.HostConfig.NetworkMode = 'host'; },
    x => { x.Mounts[0].RW = true; }, x => { x.Mounts.push({ Type: 'bind', Source: '/', Destination: '/host', RW: false }); },
    x => { x.Config.Env.push('ACTIONS_RUNTIME_TOKEN=synthetic'); }, x => { x.Config.Cmd = ['candidate-loader.js']; },
    x => { x.HostConfig.Tmpfs['/evidence'] = 'rw'; }, x => { x.HostConfig.Tmpfs['/tmp'] = 'rw'; },
  ];
  for (const mutate of mutations) { const actual = inspectedBoundary(); mutate(actual); assert.throws(() => assertContainerBoundary(actual, config)); }
});

test('host byte snapshots reject changed or added source and manifests but allow generated outputs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bsc70-source-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), '{}'); await writeFile(join(root, 'package-lock.json'), '{}');
  await writeFile(join(root, '.nvmrc'), NODE_VERSION);
  await writeFile(join(root, 'app.js'), 'original');
  const before = await sourceSnapshot(root);
  await mkdir(join(root, 'dist')); await writeFile(join(root, 'dist/app.js'), 'built');
  await mkdir(join(root, 'node_modules')); await writeFile(join(root, 'node_modules/output'), 'generated');
  assert.equal((await assertSourceUnchanged(root, before)).packageSHA256, sha256(Buffer.from('{}')));
  for (const name of ['app.js', '.nvmrc', 'package.json', 'package-lock.json', 'new-source.js', '__proto__']) {
    await writeFile(join(root, name), 'modified');
    await assert.rejects(assertSourceUnchanged(root, before), /Candidate source changed/);
    if (['new-source.js', '__proto__'].includes(name)) await rm(join(root, name));
    else await writeFile(join(root, name), name === 'app.js' ? 'original' : name === '.nvmrc' ? NODE_VERSION : '{}');
  }
  await writeFile(join(root, 'package-lock.json'), 'resolved');
  await assertSourceUnchanged(root, before, { allowLockChange: true });
  await writeFile(join(root, 'app.js'), 'modified');
  await assert.rejects(assertSourceUnchanged(root, before, { allowLockChange: true }), /app.js/);
});

test('source snapshots reject symlinks instead of following candidate-controlled host paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bsc70-link-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink('/etc/passwd', join(root, 'source.js'));
  await assert.rejects(sourceSnapshot(root), /only regular files/);
});

test('capture/browser preserve full >5MB QA artifacts while keeping the host worker envelope compact', async t => {
  const root = await mkdtemp(join(tmpdir(), 'bsc70-qa-envelope-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const automation = join(root, '.github/automation');
  await mkdir(automation, { recursive: true }); await mkdir(join(root, '.github/qa'));
  for (const name of ['worker.mjs', 'dependency-sandbox.mjs', 'dependencies.mjs', 'policy.mjs'])
    await cp(new URL(name, import.meta.url), join(automation, name));
  // Trusted synthetic harness tests the envelope contract, not browser behavior.
  const harness = `import {writeFile,mkdir} from 'node:fs/promises';
const out=process.argv[process.argv.indexOf('--output')+1];await mkdir(out,{recursive:true});
if(process.env.PLAYWRIGHT_BROWSERS_PATH!==${JSON.stringify(join(root, '.bsc70-browsers'))})process.exit(2);
const report={pass:true,captureOnly:process.argv.includes('--capture-only'),counts:{checks:415,passed:415},errors:[],artifacts:{'file.png':{sha256:'a'.repeat(64)}},baseline:{data:'x'.repeat(5_100_000)}};
await writeFile(out+'/result.json',JSON.stringify(report));`;
  await writeFile(join(root, '.github/qa/browser.mjs'), harness);
  for (const phase of ['capture', 'browser']) {
    const output = join(root, phase);
    await execute(process.execPath, [join(automation, 'worker.mjs')], { cwd: root,
      env: { PATH: '/usr/bin:/bin', WORKER_PHASE: phase, WORKER_REQUEST: '12345678-1234-1234-1234-123456789abc',
        BASE_SHA: 'a'.repeat(40), HEAD_SHA: 'b'.repeat(40), EVIDENCE_DIR: output,
        BASELINE_URL: 'https://www.bsc70linz.at', CANDIDATE_URL: 'https://example.vercel.app', PLAYWRIGHT_BROWSERS_PATH: '/attacker-chosen' } });
    const bytes = await readFile(join(output, 'worker.json')), full = await readFile(join(output, 'qa/result.json'));
    const envelope = JSON.parse(bytes);
    assert.equal(envelope.pass, true);
    assert.equal(envelope.qa.captureOnly, phase === 'capture');
    assert(full.length > 5_000_000 && bytes.length < 4000);
    assert.equal(envelope.qa.resultSHA256, sha256(full));
    assert.equal(envelope.qa.counts.checks, 415);
    assert.equal(envelope.qa.manifestSHA256, sha256(Buffer.from(JSON.stringify(JSON.parse(full).artifacts))));
  }
});

test('worker workflow bootstraps under trusted pin before selecting candidate data, with secretless runtime binding and separate QA pin', async () => {
  const workflow = await readFile(new URL('../workflows/dependency-worker.yml', import.meta.url), 'utf8');
  assert(!workflow.includes('secrets.') && !workflow.includes(': write'));
  const checkout = workflow.indexOf('name: Checkout candidate without credentials');
  const smoke = workflow.indexOf('node .github/automation/sandbox-integration.mjs');
  const select = workflow.indexOf('node .github/automation/worker.mjs select-node');
  const setup = workflow.indexOf('name: Set up authorized candidate dependency runtime');
  assert(checkout > 0 && checkout < select && smoke < select && select < setup);
  assert(workflow.includes('CANDIDATE_NODE_VERSION: ${{ steps.candidate_node.outputs.node_version }}'));
  assert(workflow.includes('node-version: ${{ steps.candidate_node.outputs.node_version }}'));
  assert(workflow.includes('node-version-file: .github/qa/.nvmrc'));
});
