import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { safeURL, imageDiff, verifyBaseline, sha } from './support.mjs';

test('target allowlist rejects credentials, lookalikes, HTTP, ports and unapproved loopback', () => {
  for (const url of ['https://www.bsc70linz.at', 'https://bsc70linz.at', 'https://branch.vercel.app']) assert.ok(safeURL(url));
  for (const url of ['http://www.bsc70linz.at', 'https://bsc70linz.at.evil.test', 'https://evilbsc70linz.at', 'https://vercel.app', 'https://user:pass@www.bsc70linz.at', 'https://www.bsc70linz.at:444', 'http://127.0.0.1:8000', 'file:///etc/passwd', 'https://127.0.0.2']) assert.throws(() => safeURL(url));
  assert.ok(safeURL('http://127.0.0.1:8000', true));
  assert.ok(safeURL('http://[::1]:8000', true));
});

test('one visible pixel and image dimension changes fail; identical images pass', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsc70-qa-pixels-'));
  try {
    const a = new PNG({ width: 10, height: 10 }); a.data.fill(255);
    const first = path.join(dir, 'a.png'), second = path.join(dir, 'b.png'), diff = path.join(dir, 'diff.png');
    await fs.writeFile(first, PNG.sync.write(a)); await fs.writeFile(second, PNG.sync.write(a));
    assert.equal((await imageDiff(first, second, diff)).pass, true);
    a.data[0] = 0; a.data[1] = 0; a.data[2] = 0;
    await fs.writeFile(second, PNG.sync.write(a));
    assert.equal((await imageDiff(first, second, diff)).pass, false);
    await fs.writeFile(second, PNG.sync.write(new PNG({ width: 10, height: 11 })));
    assert.equal((await imageDiff(first, second, diff)).pass, false);
  } finally { await fs.rm(dir, { recursive: true }); }
});

test('immutable baseline rejects unsuccessful manifests and changed artifacts', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsc70-qa-integrity-'));
  try {
    await assert.rejects(verifyBaseline(dir, { schema: 1, pass: false }), /successful/);
    const variants = Array.from({ length: 12 }, () => ({}));
    const artifacts = Object.fromEntries(Array.from({ length: 96 }, (_, i) => [`capture-${i}.png`, sha('original')]));
    await fs.writeFile(path.join(dir, 'capture-0.png'), 'modified');
    await assert.rejects(verifyBaseline(dir, { schema: 1, pass: true, captureOnly: true, baseline: { variants }, artifacts }), /integrity mismatch/);
  } finally { await fs.rm(dir, { recursive: true }); }
});
