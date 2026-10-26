import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const routes = ['/', '/news', '/anmeldung', '/chronik', '/impressum', '/datenschutz', '/anfahrt/solarcity', '/anfahrt/auhof'];
export const anchors = ['training', 'mitgliedschaft', 'teams', 'vorstand', 'erfolge', 'sponsoren'];
export const matrix = [360, 768, 1280].flatMap(width => ['de', 'en'].flatMap(lang => ['light', 'dark'].map(theme => ({ width, lang, theme, key: `${width}-${lang}-${theme}` }))));
// A perceptual color tolerance, NOT a changed-area allowance. Every differing pixel fails.
export const pixels = { threshold: 0.05, includeAA: true, maxDiffPixels: 0 };
export const sha = value => createHash('sha256').update(value).digest('hex');
export const json = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
export const pdfText = file => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 }).replace(/\s+/g, ' ').trim();

export function safeURL(value, local = false) {
  const u = new URL(value);
  const host = u.hostname.toLowerCase();
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  const allowed = host === 'bsc70linz.at' || host.endsWith('.bsc70linz.at') || host.endsWith('.vercel.app');
  if (u.username || u.password || !((u.protocol === 'https:' && allowed && (!u.port || u.port === '443')) || (local && loopback && ['http:', 'https:'].includes(u.protocol)))) {
    throw new Error(`URL rejected: expected HTTPS on bsc70linz.at/*.bsc70linz.at/*.vercel.app (loopback requires --local)`);
  }
  return u;
}

export async function get(request, url, local) {
  let u = safeURL(url, local);
  for (let i = 0; i < 6; i++) {
    const r = await request.get(u.href, { maxRedirects: 0, timeout: 30000 });
    if ([301, 302, 303, 307, 308].includes(r.status())) {
      u = safeURL(new URL(r.headers().location, u).href, local);
      await r.dispose();
    } else return { response: r, url: u };
  }
  throw new Error('Too many redirects');
}

export async function imageDiff(a, b, output) {
  const first = PNG.sync.read(await fs.readFile(a));
  const second = PNG.sync.read(await fs.readFile(b));
  const width = Math.max(first.width, second.width), height = Math.max(first.height, second.height);
  const pad = img => {
    const p = new PNG({ width, height });
    PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0);
    return p;
  };
  const diff = new PNG({ width, height });
  const changed = pixelmatch(pad(first).data, pad(second).data, diff.data, width, height, pixels);
  await fs.writeFile(output, PNG.sync.write(diff));
  return { changed, total: width * height, ratio: changed / (width * height), dimensions: [[first.width, first.height], [second.width, second.height]], pass: changed === 0 && first.width === second.width && first.height === second.height };
}

export async function integrity(root, files) {
  return Object.fromEntries(await Promise.all(files.map(async file => [file, sha(await fs.readFile(path.join(root, file)))])));
}

export async function verifyBaseline(root, baseline) {
  if (baseline.schema !== 1 || !baseline.pass || !baseline.captureOnly || baseline.baseline?.variants?.length !== matrix.length) throw new Error('Baseline must be a successful, complete --capture-only run');
  if (!baseline.artifacts || Object.keys(baseline.artifacts).length < matrix.length * routes.length) throw new Error('Missing baseline artifact hashes');
  for (const [file, hash] of Object.entries(baseline.artifacts)) {
    if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw new Error('Unsafe baseline artifact path');
    if (sha(await fs.readFile(path.join(root, file))) !== hash) throw new Error(`Baseline integrity mismatch: ${file}`);
  }
  const expected = ['teams-fixture.json', ...baseline.baseline.pdfs.map(p => p.file), ...baseline.baseline.variants.flatMap(v => v.routes.map(r => r.screenshot))];
  if (expected.length !== 99 || expected.some(file => !Object.hasOwn(baseline.artifacts, file))) throw new Error('Incomplete baseline coverage');
  for (const variant of matrix) {
    const v = baseline.baseline.variants.find(v => v.key === variant.key);
    if (!v || JSON.stringify(v.routes.map(r => r.path)) !== JSON.stringify(routes) || !v.functional) throw new Error(`Incomplete baseline variant ${variant.key}`);
  }
}
