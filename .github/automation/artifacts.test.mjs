import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import { readArtifactZip, worker } from './artifacts.mjs';
import { repository } from './github.mjs';

// ZIP fixtures contain only synthetic bytes and never touch the filesystem.
function zipOf(entries, { comment = '' } = {}) {
  const locals = [], directories = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || '');
    const method = entry.method ?? 8, data = method === 8 ? deflateRawSync(content) : content;
    const flags = 0x800 | (entry.descriptor ? 8 : 0), crc = crc32(content);
    const extra = entry.extra || Buffer.alloc(0), local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    if (!entry.descriptor) { local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(content.length, 22); }
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extra.length, 28);
    let descriptor = Buffer.alloc(0);
    if (entry.descriptor) {
      descriptor = Buffer.alloc(entry.descriptor === 'signed' ? 16 : 12);
      const at = descriptor.length === 16 ? 4 : 0;
      if (at) descriptor.writeUInt32LE(0x08074b50);
      descriptor.writeUInt32LE(crc, at); descriptor.writeUInt32LE(data.length, at + 4); descriptor.writeUInt32LE(content.length, at + 8);
    }
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(entry.attributes ?? (entry.name.endsWith('/') ? 0x41ed0010 : 0x81a40000), 38);
    central.writeUInt32LE(offset, 42);
    const record = Buffer.concat([local, name, extra, data, descriptor]);
    locals.push(record); directories.push(Buffer.concat([central, name, extra])); offset += record.length;
  }
  const directory = Buffer.concat(directories), end = Buffer.alloc(22), note = Buffer.from(comment);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(note.length, 20);
  return Buffer.concat([...locals, directory, end, note]);
}
const centralAt = zip => zip.readUInt32LE(zip.length - 6);
const mutate = (source, fn) => { const copy = Buffer.from(source); fn(copy, centralAt(copy)); return copy; };

test('ZIP accepts stored, deflated, streamed descriptors, directory records and comments', () => {
  for (const descriptor of [undefined, 'signed', 'unsigned']) {
    const zip = zipOf([{ name: 'qa/' }, { name: 'qa/result.json', content: '{}', descriptor },
      { name: 'worker.json', content: '{"pass":true}', method: 0, descriptor }], { comment: 'synthetic archive' });
    const files = readArtifactZip(zip);
    assert.equal(files.size, 2); assert.equal(files.get('qa/result.json').toString(), '{}');
    assert.equal(files.get('worker.json').toString(), '{"pass":true}');
  }
  assert.equal(readArtifactZip(zipOf([])).size, 0);
});

test('ZIP has explicit compressed, per-file and entry-count bounds', () => {
  assert.throws(() => readArtifactZip(Buffer.allocUnsafe(512_000_001)), /size limit/);
  assert.throws(() => readArtifactZip(zipOf(Array.from({ length: 2001 }, (_, i) => ({ name: `file-${i}` })))), /count/);
  const zip = zipOf([{ name: 'screen.png', content: 'x' }]);
  assert.throws(() => readArtifactZip(mutate(zip, (b, c) => b.writeUInt32LE(30_000_001, c + 24))), /Unsafe artifact/);
  // A 21 MB screenshot was rejected by the previous 20 MB ceiling.
  const screenshot = Buffer.alloc(21_000_000, 0x61);
  assert.equal(readArtifactZip(zipOf([{ name: 'qa/screen.png', content: screenshot }])).get('qa/screen.png').length, screenshot.length);
});

test('ZIP rejects truncations and bogus directory bounds without unchecked Buffer reads', () => {
  const zip = zipOf([{ name: 'worker.json', content: '{}' }]);
  for (let size = 0; size < zip.length; size++) assert.throws(() => readArtifactZip(zip.subarray(0, size)));
  for (const fn of [
    b => b.writeUInt32LE(0xffffffff, b.length - 6),
    b => b.writeUInt32LE(0xffffffff, b.length - 10),
    (b, c) => b.writeUInt16LE(60000, c + 28),
    (b, c) => b.writeUInt16LE(60000, c + 30),
    (b, c) => b.writeUInt16LE(60000, c + 32),
    (b, c) => b.writeUInt32LE(c - 4, c + 42),
    b => b.writeUInt16LE(2, b.length - 14),
  ]) assert.throws(() => readArtifactZip(mutate(zip, fn)));
  assert.throws(() => readArtifactZip(Buffer.concat([zip, Buffer.from('trailing')])), /Unsupported/);
});

test('ZIP rejects duplicate, traversal, separator and Unicode path aliases including directory entries', () => {
  for (const name of ['../secret', '/secret', 'qa/../secret', 'qa/./result.json', 'qa//result.json', 'qa\\result.json',
    'qa/..\\secret', 'qa\u0000.json', 'c:/secret', 'qa/é.png', 'qa/ｅ.png', './', '/', '../']) {
    assert.throws(() => readArtifactZip(zipOf([{ name }])), undefined, name);
  }
  for (const names of [['worker.json', 'worker.json'], ['qa/', 'qa/'], ['qa/', 'qa'], ['qa', 'qa/result.json']]) {
    assert.throws(() => readArtifactZip(zipOf(names.map(name => ({ name })))));
  }
});

test('ZIP rejects encryption, unsupported compression, symlinks, devices, multidisk and ZIP64', () => {
  const zip = zipOf([{ name: 'worker.json', content: '{}' }]);
  for (const fn of [
    (b, c) => b.writeUInt16LE(1, c + 8), (b, c) => b.writeUInt16LE(99, c + 10),
    (b, c) => b.writeUInt32LE(0xa1ff0000, c + 38), (b, c) => b.writeUInt32LE(0x21ff0000, c + 38),
    b => b.writeUInt16LE(1, b.length - 18), (b, c) => b.writeUInt16LE(1, c + 34),
    (b, c) => b.writeUInt32LE(0xffffffff, c + 20), (b, c) => b.writeUInt32LE(0xffffffff, c + 42),
    (b, c) => b.writeUInt16LE(45, c + 6),
  ]) assert.throws(() => readArtifactZip(mutate(zip, fn)));
  for (const type of [1, 0x7075, 0x6375]) {
    const extra = Buffer.alloc(4); extra.writeUInt16LE(type);
    assert.throws(() => readArtifactZip(zipOf([{ name: 'worker.json', extra }])), /Unsupported/);
  }
  assert.throws(() => readArtifactZip(zipOf([{ name: 'worker.json', extra: Buffer.from([2, 0, 255, 255]) }])), /bounds/);
});

test('ZIP validates CRC, local headers, compressed consumption and data descriptors', () => {
  const zip = zipOf([{ name: 'worker.json', content: '{}', method: 0 }]);
  for (const fn of [
    b => { b[30] ^= 1; }, b => b.writeUInt16LE(8, 8), b => b.writeUInt16LE(0, 6),
    (b, c) => { b[c - 1] ^= 1; }, (b, c) => { b.writeUInt32LE(0, 14); b.writeUInt32LE(0, c + 16); },
    b => b.writeUInt32LE(1, 18),
  ]) assert.throws(() => readArtifactZip(mutate(zip, fn)));
  const streamed = zipOf([{ name: 'worker.json', content: '{}', descriptor: 'signed' }]);
  assert.throws(() => readArtifactZip(mutate(streamed, (b, c) => { b[c - 1] ^= 1; })), /descriptor/);
  const deflated = zipOf([{ name: 'worker.json', content: 'a'.repeat(10000) }]);
  assert.throws(() => readArtifactZip(mutate(deflated, (b, c) => { b.writeUInt32LE(1, 22); b.writeUInt32LE(1, c + 24); })));
  // Stored size agreement alone cannot validate deflate input consumption.
  const compressed = zipOf([{ name: 'worker.json', content: '{}', descriptor: 'signed' }]);
  assert.throws(() => readArtifactZip(mutate(compressed, (b, c) => b.writeUInt32LE(b.readUInt32LE(c + 20) + 1, c + 20))));
});

test('ZIP rejects overlapping local entries even when directory names are distinct', () => {
  const zip = zipOf([{ name: 'a', content: 'first' }, { name: 'b', content: 'second' }]);
  assert.throws(() => readArtifactZip(mutate(zip, (b, c) => b.writeUInt32LE(0, c + 47 + 42))));
});

const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), CONTROL = 'c'.repeat(40);
const originalFetch = globalThis.fetch;
let savedEnv;
beforeEach(() => {
  savedEnv = { ...process.env };
  process.env.GH_TOKEN = 'synthetic-test-token'; process.env.GITHUB_ACTOR = 'synthetic-controller';
  delete process.env.AUTOMATION_WORKER_ACTOR; delete process.env.AUTOMATION_WORKER_REF;
  globalThis.fetch = async () => { throw Error('Unexpected network request'); };
});
afterEach(() => { globalThis.fetch = originalFetch; process.env = savedEnv; });
const json = value => new Response(JSON.stringify(value));
function workerFixture({ phase = 'inspect', mutateRun, mutateArtifact, mutateEvidence, mutateWorkflow, mutateDispatch, duplicateRun = false,
  duplicateArtifact = false, location = 'https://synthetic.blob.core.windows.net/evidence.zip', downloadResponse, listingResponse } = {}) {
  const calls = []; let request;
  globalThis.fetch = async (url, init) => {
    const target = String(url); calls.push({ target, init });
    if (target.startsWith('https://api.github.com/')) {
      assert.equal(init.headers.authorization, 'Bearer synthetic-test-token');
      const path = target.slice(`https://api.github.com/repos/${repository}`.length);
      if (path === '/git/ref/heads/main') return json({ object: { sha: CONTROL } });
      if (path === '/actions/workflows/dependency-worker.yml') {
        const value = { id: 77, path: '.github/workflows/dependency-worker.yml', state: 'active' }; mutateWorkflow?.(value); return json(value);
      }
      if (path.endsWith('/dispatches')) {
        const dispatch = JSON.parse(init.body); request = dispatch.inputs.request;
        assert.equal(dispatch.ref, 'main'); assert.equal(dispatch.inputs.phase, phase);
        assert.equal(dispatch.inputs.base_sha, BASE); assert.equal(dispatch.inputs.head_sha, HEAD);
        assert.equal(init.method, 'POST'); mutateDispatch?.(dispatch); return new Response(null, { status: 204 });
      }
      if (path.includes('/runs?')) {
        const run = { id: 123, event: 'workflow_dispatch', head_branch: 'main', head_sha: CONTROL, workflow_id: 77,
          path: '.github/workflows/dependency-worker.yml', display_title: `Dependency worker ${request}`, run_attempt: 1,
          created_at: new Date().toISOString(), repository: { full_name: repository }, head_repository: { full_name: repository },
          actor: { login: 'synthetic-controller' }, triggering_actor: { login: 'synthetic-controller' }, status: 'completed', conclusion: 'success' };
        mutateRun?.(run); return json(listingResponse ?? { workflow_runs: duplicateRun ? [run, run] : [run] });
      }
      if (path === '/actions/runs/123/artifacts?per_page=100') {
        const artifact = { id: 456, name: `dependency-worker-${request}`, expired: false, size_in_bytes: 100,
          workflow_run: { id: 123, head_sha: CONTROL, head_branch: 'main' } };
        mutateArtifact?.(artifact); return json({ artifacts: duplicateArtifact ? [artifact, artifact] : [artifact] });
      }
      if (path === '/actions/artifacts/456/zip') {
        assert.equal(init.redirect, 'manual'); return new Response(null, { status: 302, headers: { location } });
      }
      throw Error(`Unexpected synthetic API path ${path}`);
    }
    assert.equal(target, location); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(init.headers?.authorization, undefined);
    const evidence = { request, phase, baseSHA: BASE, headSHA: HEAD, pass: true }; mutateEvidence?.(evidence);
    return downloadResponse?.() ?? new Response(zipOf([{ name: 'worker.json', content: JSON.stringify(evidence) }]));
  };
  return calls;
}
const input = (phase = 'inspect') => ({ phase, baseSHA: BASE, headSHA: HEAD });

test('worker binds control SHA before dispatch and keeps all existing phases plus capture', async () => {
  for (const phase of ['inspect', 'resolve', 'validate', 'capture', 'browser']) {
    const calls = workerFixture({ phase, mutateDispatch: dispatch => {
      assert.equal(dispatch.inputs.baseline_run, phase === 'browser' ? '100' : '');
    } });
    const result = await worker({ ...input(phase), ...(phase === 'browser' ? { baselineRun: 100 } : {}) });
    assert.equal(result.pass, true); assert.equal(result.runId, 123); assert.equal(result.artifactId, 456); assert.equal(result.controlSHA, CONTROL);
    assert.ok(result.files instanceof Map); assert.match(calls[0].target, /git\/ref\/heads\/main$/);
    assert.equal(calls.length, 7);
  }
});

test('worker rejects invalid inputs, unapproved control refs and absent expected actor before networking', async () => {
  for (const value of [{ phase: 'untrusted' }, { headSHA: 'main' }, { baselineRun: '../other' }, { baselineRun: 1.5 }, { urgent: 'true' }]) await assert.rejects(worker({ ...input(), ...value }));
  process.env.AUTOMATION_WORKER_REF = 'untrusted'; await assert.rejects(worker(input()), /control ref/);
  delete process.env.AUTOMATION_WORKER_REF; delete process.env.GITHUB_ACTOR;
  await assert.rejects(worker(input()), /actor is missing/);
});

test('worker requires exact API workflow path, numeric ID and active state', async () => {
  for (const mutateWorkflow of [value => { value.path = '.github/workflows/evil.yml'; }, value => { value.id = '77'; }, value => { value.state = 'disabled_manually'; }]) {
    const calls = workerFixture({ mutateWorkflow }); await assert.rejects(worker(input()), /workflow/);
    assert.equal(calls.length, 2);
  }
});

test('worker rejects control-ref races, foreign workflows, actors, repositories and reruns', async () => {
  for (const mutateRun of [run => { run.head_sha = HEAD; }, run => { run.workflow_id = 78; }, run => { run.path += '@main'; },
    run => { run.actor.login = 'github-actions[bot]'; }, run => { run.triggering_actor.login = 'other'; },
    run => { run.repository.full_name = 'other/repo'; }, run => { run.head_repository.full_name = 'other/repo'; },
    run => { run.head_branch = 'updates'; }, run => { run.event = 'pull_request'; }, run => { run.run_attempt = 2; },
    run => { run.id = '123'; }]) {
    const calls = workerFixture({ mutateRun }); await assert.rejects(worker(input()), /run provenance/);
    assert.equal(calls.length, 4);
  }
  workerFixture({ duplicateRun: true }); await assert.rejects(worker(input()), /Ambiguous/);
});

test('worker expected actor override allows one explicitly configured token identity', async () => {
  process.env.AUTOMATION_WORKER_ACTOR = 'synthetic-bot[bot]';
  workerFixture({ mutateRun: run => { run.actor.login = 'synthetic-bot[bot]'; run.triggering_actor.login = 'synthetic-bot[bot]'; } });
  assert.equal((await worker(input())).pass, true);
});

test('worker artifacts must uniquely match nonce, run and control-ref identity', async () => {
  for (const mutateArtifact of [a => { a.name = 'dependency-worker-old'; }, a => { a.workflow_run.id = 999; },
    a => { a.workflow_run.head_sha = HEAD; }, a => { a.workflow_run.head_branch = 'updates'; }, a => { delete a.workflow_run; },
    a => { a.expired = true; }, a => { a.id = '456'; }, a => { a.size_in_bytes = 512_000_001; }]) {
    const calls = workerFixture({ mutateArtifact }); await assert.rejects(worker(input()), /bound evidence/);
    assert.equal(calls.length, 5);
  }
  workerFixture({ duplicateArtifact: true }); await assert.rejects(worker(input()), /bound evidence/);
});

test('worker evidence binds nonce, candidate SHAs, phase and boolean verdict without logging content', async () => {
  for (const mutateEvidence of [e => { e.request = 'old'; }, e => { e.headSHA = BASE; }, e => { e.baseSHA = HEAD; },
    e => { e.phase = 'browser'; }, e => { e.pass = 'true'; }]) {
    workerFixture({ mutateEvidence }); await assert.rejects(worker(input()), /identity mismatch/);
  }
  workerFixture({ mutateRun: run => { run.conclusion = 'failure'; } });
  assert.equal((await worker(input())).pass, false);
  workerFixture({ downloadResponse: () => new Response(zipOf([{ name: 'worker.json', content: 'secret malformed evidence' }])) });
  await assert.rejects(worker(input()), error => error.message === 'Invalid worker evidence JSON');
});

test('artifact storage redirects are HTTPS allowlisted and never receive the GitHub token', async () => {
  for (const location of ['http://synthetic.blob.core.windows.net/file', 'https://evil.test/file',
    'https://synthetic.blob.core.windows.net.evil.test/file', 'https://user:pass@synthetic.blob.core.windows.net/file',
    'https://synthetic.blob.core.windows.net:444/file', 'https://blob.core.windows.net/file']) {
    const calls = workerFixture({ location }); await assert.rejects(worker(input()), /Unexpected artifact storage/);
    assert.equal(calls.length, 6);
  }
  workerFixture({ location: 'https://synthetic.actions.githubusercontent.com/file' }); assert.equal((await worker(input())).pass, true);
});

test('artifact downloads reject errors, oversized declared bodies and invalid ZIPs', async () => {
  for (const downloadResponse of [() => new Response('denied', { status: 403 }),
    () => new Response('x', { headers: { 'content-length': '512000001' } }),
    () => new Response('x', { headers: { 'content-length': '-1' } }), () => new Response('not a zip')]) {
    workerFixture({ downloadResponse }); await assert.rejects(worker(input()));
  }
});
