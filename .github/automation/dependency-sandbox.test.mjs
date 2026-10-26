import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { containerArguments, assertContainerBoundary, sourceSnapshot, assertSourceUnchanged, sha256, SANDBOX_IMAGE } from './dependency-sandbox.mjs';
const execute = promisify(execFile);
const config = { name: 'bsc70-12345678-1234-1234-1234-123456789abc', work: '/tmp/narrow/work', runtime: '/trusted/node',
  uid: 1001, gid: 1001, network: false, writable: true, nodeArgs: ['/opt/node/lib/node_modules/npm/bin/npm-cli.js', 'run', 'lint'] };

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
  await writeFile(join(root, 'app.js'), 'original');
  const before = await sourceSnapshot(root);
  await mkdir(join(root, 'dist')); await writeFile(join(root, 'dist/app.js'), 'built');
  await mkdir(join(root, 'node_modules')); await writeFile(join(root, 'node_modules/output'), 'generated');
  assert.equal((await assertSourceUnchanged(root, before)).packageSHA256, sha256(Buffer.from('{}')));
  for (const name of ['app.js', 'package.json', 'package-lock.json', 'new-source.js', '__proto__']) {
    await writeFile(join(root, name), 'modified');
    await assert.rejects(assertSourceUnchanged(root, before), /Candidate source changed/);
    if (['new-source.js', '__proto__'].includes(name)) await rm(join(root, name));
    else await writeFile(join(root, name), name === 'app.js' ? 'original' : '{}');
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
