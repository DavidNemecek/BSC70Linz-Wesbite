import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { safeURL, imageDiff, verifyBaseline, sha, pageErrorDetails, pdfComparisons } from './support.mjs';

test('pageerror origin uses only the throwing stack frame and bounds metadata', () => {
  const detail = stack => pageErrorDetails({ name: 'Error', message: 'boom', stack });
  const first = detail('Error: boom\n    at handler (https://www.bsc70linz.at/assets/app.js:12:34)\n    at https://other.test/caller.js:1:2');
  assert.equal(first.scriptURL, 'https://www.bsc70linz.at/assets/app.js');
  assert.equal(first.line, 12); assert.equal(first.column, 34);
  assert.ok(safeURL(first.scriptURL));
  const external = detail('Error: boom\n    at https://formular.vereinsplaner.com/form.js:1:2\n    at https://www.bsc70linz.at/assets/app.js:3:4');
  assert.equal(external.scriptURL, 'https://formular.vereinsplaner.com/form.js');
  assert.throws(() => safeURL(external.scriptURL));
  for (const stack of ['Error: boom', 'Error: boom\n    at <anonymous>:1:2\n    at https://www.bsc70linz.at/assets/app.js:3:4', 'Error: boom\n    at eval (eval at handler (https://www.bsc70linz.at/assets/app.js:1:2), <anonymous>:1:2)']) assert.equal(detail(stack).scriptURL, null);
  assert.equal(pageErrorDetails({ name: 'Error', message: 'boom', stack: 'Error: boom', url: 'https://www.bsc70linz.at/' }).scriptURL, null);
  const forgedMessage = 'boom\n    at https://www.bsc70linz.at/forged.js:1:2';
  assert.equal(pageErrorDetails({ name: 'Error', message: forgedMessage, stack: `Error: ${forgedMessage}\n    at https://formular.vereinsplaner.com/form.js:1:2` }).scriptURL, external.scriptURL);
  assert.equal(detail('Error: boom\n    at https://bsc70linz.at.evil.test/app.js:1:2').scriptURL, 'https://bsc70linz.at.evil.test/app.js');
  assert.throws(() => safeURL(detail('Error: boom\n    at https://bsc70linz.at.evil.test/app.js:1:2').scriptURL));
  const bounded = pageErrorDetails({ message: 'x'.repeat(10000), stack: 'y'.repeat(10000) });
  assert.equal(bounded.message.length, 2048); assert.equal(bounded.stack.length, 8192);
});

test('PDF missing or unparsed captures fail as incomplete; retrieved text differences still fail', () => {
  const site = text => ({ pdfs: ['de', 'en'].map(lang => ({ lang, text })), completion: { pdfs: Object.fromEntries(['de', 'en'].map(lang => [lang, { retrieved: true, parsed: true }])) } });
  const baseline = site('original');
  assert.ok(pdfComparisons(baseline, site('original')).every(c => c.pass && c.captureComplete));
  assert.ok(pdfComparisons(baseline, site('changed')).every(c => !c.pass && c.captureComplete && c.name.endsWith('content comparison')));
  for (const candidate of [{ pdfs: [] }, { ...site('original'), completion: { pdfs: { de: { retrieved: true, parsed: false }, en: { retrieved: false, parsed: false } } } }]) {
    const checks = pdfComparisons(baseline, candidate);
    assert.equal(checks.length, 2);
    assert.ok(checks.every(c => !c.pass && c.name.endsWith('capture incomplete') && !c.captureComplete));
    assert.ok(checks.every(c => !c.name.endsWith('content comparison')));
  }
  assert.ok(pdfComparisons({ pdfs: [] }, site('original')).every(c => !c.pass && c.name.endsWith('capture incomplete')));
});

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
