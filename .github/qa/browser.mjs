#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { routes, anchors, matrix, pixels, sha, json, pdfText, safeURL, get, imageDiff, integrity, verifyBaseline } from './support.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({ options: {
  'baseline-url': { type: 'string' }, 'candidate-url': { type: 'string' },
  'baseline-dir': { type: 'string' }, output: { type: 'string' },
  'capture-only': { type: 'boolean', default: false }, local: { type: 'boolean', default: false },
} });
if (!args.output) throw new Error('--output is required');
const output = path.resolve(args.output);
const result = { schema: 1, pass: false, captureOnly: args['capture-only'], started: new Date().toISOString(), baselineURL: args['baseline-url'] ?? null, candidateURL: args['candidate-url'] ?? null, baselineDir: args['baseline-dir'] ? path.resolve(args['baseline-dir']) : null, metadata: {}, checks: [], counts: {}, errors: [], artifacts: {} };
let browser;
const pairedContexts = new Map();
const artifactFiles = [];
function check(name, pass, detail = {}) {
  result.checks.push({ name, pass: !!pass, ...detail });
  if (!pass) {
    result.errors.push({ check: name, ...detail });
    console.error(`FAIL ${name}: ${detail.message ?? ''}`);
    if (detail.events?.length) console.error(JSON.stringify({ check: name, events: detail.events.slice(0, 20) }));
  }
  return pass;
}
async function attempt(name, fn) {
  try { return await fn(); } catch (error) { check(name, false, { message: error.message }); return null; }
}
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function artifact(file) { artifactFiles.push(file); return path.join(output, file); }
const stateOf = page => page.evaluate(() => ({
  path: location.pathname, lang: document.documentElement.lang, theme: document.documentElement.dataset.theme,
  title: document.title, h1: [...document.querySelectorAll('h1')].map(e => e.textContent.trim()),
  description: document.querySelector('meta[name="description"]')?.content,
  canonical: document.querySelector('link[rel="canonical"]')?.href,
  robots: document.querySelector('meta[name="robots"]')?.content ?? '',
  width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
  badImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')),
  headings: [...document.querySelectorAll('h1,h2,h3')].map(e => e.textContent.trim()),
  portraits: [...document.querySelectorAll('#vorstand img')].map(i => ({ src: i.getAttribute('src'), alt: i.alt, width: i.naturalWidth, height: i.naturalHeight })),
  links: [...document.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })),
}));

async function endpoints(ctx, base, label) {
  const evidence = {};
  for (const endpoint of ['/api/teams', '/robots.txt', '/sitemap.xml']) {
    await attempt(`${label} API ${endpoint}`, async () => {
      const { response: r, url } = await get(ctx.request, base + endpoint, args.local);
      const body = await r.text(), type = r.headers()['content-type'] ?? '';
      const file = `${label}/${endpoint.slice(1).replaceAll('/', '-')}`;
      await fs.writeFile(artifact(file), body);
      evidence[endpoint] = { status: r.status(), url: url.href, type, sha256: sha(body), file };
      requireThat(r.status() === 200, `HTTP ${r.status()}`);
      if (endpoint === '/api/teams') {
        requireThat(type.includes('application/json'), 'teams must be JSON');
        const data = JSON.parse(body);
        requireThat(data.schema_version === 1 && data.club?.name === 'BSC 70 Linz' && Array.isArray(data.teams) && data.teams.length > 0 && data.club.team_count === data.teams.length, 'Invalid teams schema/count');
        requireThat(Number.isFinite(Date.parse(data.updated_at)), 'Missing teams update date');
        for (const team of data.teams) requireThat(typeof team.name === 'string' && /BSC 70 Linz/.test(team.name) && typeof team.competition === 'string' && Number.isInteger(team.standing) && team.standing > 0 && Number.isInteger(team.points) && team.points >= 0 && new URL(team.team_url).hostname === 'obv.tournamentsoftware.com', 'Invalid team');
        evidence.teams = data;
      } else if (endpoint === '/robots.txt') {
        requireThat(type.includes('text/plain') && /User-agent:\s*\*/i.test(body) && /Allow:\s*\//i.test(body) && !/Disallow:\s*\//i.test(body), 'Invalid robots');
        requireThat(body.includes(`Sitemap: ${url.origin}/sitemap.xml`), 'robots sitemap must use response host');
      } else {
        const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
        requireThat(type.includes('xml') && body.includes('<urlset') && locs.length === 7, 'Invalid sitemap');
        requireThat(JSON.stringify(locs.slice().sort()) === JSON.stringify(routes.filter(p => p !== '/news').map(p => url.origin + p).sort()), 'sitemap routes/response host mismatch');
      }
      check(`${label} API ${endpoint}`, true, { status: r.status(), host: url.host });
      await r.dispose();
    });
  }
  return evidence;
}

async function context(variant, label) {
  const ctx = await browser.newContext({ viewport: { width: variant.width, height: 900 }, deviceScaleFactor: 1, locale: 'de-AT', timezoneId: 'Europe/Vienna', colorScheme: variant.theme, reducedMotion: 'reduce', acceptDownloads: true, serviceWorkers: 'block' });
  ctx.setDefaultTimeout(12000);
  await ctx.addInitScript(({ lang, theme }) => {
    if (!localStorage.getItem('bsc70-lang')) localStorage.setItem('bsc70-lang', lang);
    if (!localStorage.getItem('bsc70-theme')) localStorage.setItem('bsc70-theme', theme);
  }, variant);
  // Validate redirects and asset destinations as well as command-line inputs.
  await ctx.route('**/*', async route => {
    if (!route.request().isNavigationRequest() && /^(data:|blob:)/.test(route.request().url())) return route.continue();
    // The existing registration page embeds this documented processor. This
    // exception is for its iframe/resources, never a top-level target URL.
    const resource = new URL(route.request().url());
    const processor = ['formular.vereinsplaner.com', 'cdn.vereinsplaner.at'].includes(resource.hostname);
    if (processor && resource.protocol === 'https:' && !resource.username && !resource.password && (!route.request().isNavigationRequest() || route.request().frame().parentFrame())) return route.continue();
    try { safeURL(route.request().url(), args.local); await route.continue(); }
    catch { check(`${label} disallowed request`, false, { message: route.request().url().slice(0, 160) }); await route.abort('blockedbyclient'); }
  });
  return ctx;
}

function observe(page, site, phase) {
  const events = site.runtime;
  page.on('pageerror', e => events.push({ phase, type: 'pageerror', message: e.message, url: page.url() }));
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) events.push({ phase, type: `console.${m.type()}`, message: m.text(), url: page.url() }); });
  page.on('requestfailed', async r => {
    // Only navigations cancelled by a subsequent navigation may be ignored.
    if (r.isNavigationRequest() && r.failure()?.errorText === 'net::ERR_ABORTED') return;
    // Opening/closing the light-theme drawer can replace its dark logo before
    // the fetch finishes. Ignore only an aborted known logo no longer used by
    // ANY image; readiness checks still require every replacement to decode.
    if (r.failure()?.errorText === 'net::ERR_ABORTED' && r.resourceType() === 'image' && /\/assets\/bsc-logo-(dark-themepng|light)\.png$/.test(r.url())) {
      const superseded = await page.evaluate(url => ![...document.images].some(i => i.src === url || i.currentSrc === url), r.url()).catch(() => false);
      if (superseded) { site.supersededLogoRequests.push({ phase, url: r.url(), reason: 'ERR_ABORTED after image source replaced' }); return; }
    }
    events.push({ phase, type: 'requestfailed', url: r.url(), message: r.failure()?.errorText });
  });
  page.on('response', r => {
    site.assets.push({ phase, url: r.url(), status: r.status(), type: r.request().resourceType() });
    if (r.status() >= 400) events.push({ phase, type: 'http', status: r.status(), url: r.url() });
  });
}

async function ready(page) {
  await page.locator('h1').waitFor({ state: 'attached' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(async image => {
      image.loading = 'eager';
      try { await image.decode(); } catch { /* reported by stateOf */ }
    }));
  });
}

async function goto(page, url) {
  const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  requireThat(r?.status() === 200, `Navigation returned ${r?.status()}`);
  safeURL(page.url(), args.local);
  await ready(page);
  return r.status();
}

async function advance(page, ms) {
  // Let native scroll/ResizeObserver events reach ScrollTrigger BEFORE the
  // time jump, then paint the completed timelines after it.
  await page.clock.runFor(100);
  await page.clock.fastForward(ms);
  await page.clock.runFor(100);
}

async function menu(page, width) {
  if (width < 1024) await page.getByRole('button', { name: 'Menu', exact: true }).click();
}
const visible = locator => locator.filter({ visible: true });
async function settledAnchor(page, id, repeat = false) {
  await page.locator('#' + id).waitFor({ state: 'attached' });
  await ready(page);
  await page.evaluate(() => { delete window.__qaScrollSample; });
  // Native image decode and React layout updates must finish before measuring
  // Lenis. A first cross-route jump may land inside the section's lead-in;
  // re-clicking the same anchor must reach its exact top.
  await page.waitForFunction(id => {
    const y = scrollY;
    const prior = window.__qaScrollSample;
    window.__qaScrollSample = { y, count: prior && Math.abs(prior.y - y) < 0.1 ? prior.count + 1 : 0 };
    return location.pathname === '/' && location.hash === '#' + id && window.__qaScrollSample.count >= 12;
  }, id);
  const top = await page.locator('#' + id).evaluate(e => Math.round(e.getBoundingClientRect().top));
  requireThat(top >= -12 && top < (repeat ? 12 : 720), `Anchor ${id} did not reach the section: ${top}px`);
  return top;
}
async function clickLink(page, href) {
  const link = visible(page.locator(`a[href="${href}"]`)).first();
  await link.scrollIntoViewIfNeeded();
  await link.click();
}
async function functional(page, base, variant, site) {
  const { width, lang, theme, key } = variant;
  const evidence = { links: [], anchors: [], fees: [], toggles: [], menu: [] };
  await goto(page, base + '/impressum');
  for (let i = 0; i < 2; i++) {
    await menu(page, width);
    await visible(page.getByRole('button', { name: 'Toggle theme', exact: true })).click();
    await visible(page.getByRole('button', { name: 'Toggle language', exact: true })).click();
    await menu(page, width);
    const expected = i === 0 ? { lang: lang === 'de' ? 'en' : 'de', theme: theme === 'light' ? 'dark' : 'light' } : { lang, theme };
    await page.reload({ waitUntil: 'networkidle' });
    const actual = await page.locator('html').evaluate(e => ({ lang: e.lang, theme: e.dataset.theme }));
    requireThat(JSON.stringify(actual) === JSON.stringify(expected), 'Toggle or persisted state failed');
    evidence.toggles.push(actual);
  }
  // Linked secondary pages must perform actual client navigation.
  for (const route of routes.filter(p => !['/', '/news'].includes(p))) {
    await goto(page, base + '/');
    const previousHeading = await page.locator('h1').textContent();
    const sentinel = await page.evaluate(() => window.__qaNavigation = 'document-survived');
    if (route.startsWith('/anfahrt/')) await clickLink(page, route);
    else await page.locator(`footer a[href="${route}"]`).click();
    await page.waitForURL(u => u.pathname === route);
    await page.waitForFunction(({ previousHeading, route }) => document.querySelector('h1')?.textContent !== previousHeading && new URL(document.querySelector('link[rel="canonical"]')?.href ?? location.href).pathname === route, { previousHeading, route });
    await ready(page);
    requireThat(await page.evaluate(s => window.__qaNavigation === s, sentinel), `SPA navigation failed ${route}`);
    evidence.links.push({ path: new URL(page.url()).pathname, h1: await page.locator('h1').innerText(), spa: true });
  }
  for (const id of anchors) {
    await goto(page, base + '/impressum');
    for (const repeat of [false, true]) {
      await menu(page, width);
      await clickLink(page, '/#' + id);
      const top = await settledAnchor(page, id, repeat);
      evidence.anchors.push({ id, repeat, top });
      if (width < 1024) requireThat(await page.locator('div.fixed.inset-0').evaluateAll(es => es.every(e => getComputedStyle(e).pointerEvents === 'none')), 'Drawer did not close');
    }
  }
  await goto(page, base + '/');
  const buttons = page.locator('#mitgliedschaft button[aria-controls]');
  requireThat(await buttons.count() >= 2, 'Missing fee controls');
  for (let i = 0; i < await buttons.count(); i++) {
    const b = buttons.nth(i);
    await b.scrollIntoViewIfNeeded(); await b.click();
    requireThat(await b.getAttribute('aria-expanded') === 'true', 'Fee disclosure did not open after click');
    const id = await b.getAttribute('aria-controls');
    const text = await page.locator('#' + id).innerText();
    requireThat(await b.getAttribute('aria-expanded') === 'true' && text.length > 20 && await buttons.evaluateAll(bs => bs.filter(b => b.getAttribute('aria-expanded') === 'true').length) === 1, 'Fee disclosure failed');
    evidence.fees.push({ id, text });
  }
  await buttons.last().click();
  requireThat(await buttons.last().getAttribute('aria-expanded') === 'false', 'Fee disclosure did not close');
  // Short drawers must remain operable, including the bottom registration CTA.
  if (width < 1024) {
    await page.setViewportSize({ width, height: 640 });
    for (const route of ['/chronik', '/anmeldung']) {
      await goto(page, base + '/impressum'); await menu(page, width);
      // The drawer is the only visible link outside the footer on this subpage.
      await clickLink(page, route); await page.waitForURL(u => u.pathname === route);
      requireThat(await page.locator('div.fixed.inset-0').evaluateAll(es => es.every(e => getComputedStyle(e).pointerEvents === 'none')), 'Short drawer did not close');
      await page.locator('nav a[href="/"]').click();
      await page.waitForFunction(() => location.pathname === '/' && scrollY < 3);
      evidence.menu.push({ route, closed: true, logoHome: true });
    }
    await page.setViewportSize({ width, height: 900 });
  }
  await goto(page, base + '/impressum');
  await page.locator('footer a[href="/#training"]').click();
  await settledAnchor(page, 'training');
  evidence.footerAnchor = true;
  // Unmocked page must render the real teams response, not just return valid JSON.
  await goto(page, base + '/');
  await page.waitForFunction(count => document.querySelectorAll('#teams a[target="_blank"]').length === count, site.api.teams?.teams.length);
  evidence.liveTeams = await page.locator('#teams h3').allTextContents();
  requireThat(JSON.stringify(evidence.liveTeams) === JSON.stringify(site.api.teams.teams.map(t => t.name)), 'Real teams UI differs from API');
  if (width === 360 && theme === 'light') {
    await goto(page, base + '/anmeldung');
    const downloading = page.waitForEvent('download', { timeout: 30000 });
    await page.getByRole('button', { name: /PDF/ }).click();
    const download = await downloading;
    requireThat(!await download.failure(), 'PDF download failed');
    const file = `${site.label}/membership-${lang}.pdf`, absolute = artifact(file);
    await download.saveAs(absolute);
    const bytes = await fs.readFile(absolute), text = pdfText(absolute);
    requireThat(bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 10000 && bytes.subarray(-100).toString().includes('%%EOF'), 'Downloaded artifact is not a complete PDF');
    requireThat(/BSC 70 Linz/.test(text) && (lang === 'de' ? /Beitritt|Mitgliedschaft/.test(text) && /Jahresbeitr|jährlich|Jahresgebühr/.test(text) : /Membership|membership/.test(text) && /annual fees/.test(text)) && /40/.test(text) && /IBAN/.test(text), 'PDF text/content missing');
    site.pdfs.push({ lang, file, filename: download.suggestedFilename(), bytes: bytes.length, text });
  }
  return evidence;
}

async function visual(ctx, base, variant, site, fixture) {
  const page = await ctx.newPage();
  observe(page, site, `${variant.key}/visual`);
  // Only this page receives the immutable teams fixture. Functional page/API are real.
  // Follow the actual document origin (e.g. apex -> www redirect), and never
  // substitute an unrelated host's similarly named endpoint.
  await page.route(url => url.pathname === '/api/teams' && url.origin === new URL(page.url()).origin, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  const epoch = new Date('2026-01-01T12:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  const captures = [];
  for (const route of routes) {
    const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    requireThat(response?.status() === 200 && new URL(page.url()).pathname === route, `Route failed ${route}`);
    await ready(page);
    if (route === '/anmeldung') {
      await page.waitForLoadState('networkidle');
      await page.clock.runFor(1000);
      const frame = page.frames().find(f => f.parentFrame() && f.url().startsWith('https://formular.vereinsplaner.com/'));
      requireThat(frame, 'Registration iframe missing');
      await frame.locator('input:not([type="hidden"])').first().waitFor({ state: 'visible' });
      await frame.evaluate(async () => { await document.fonts.ready; });
    }
    if (route === '/') {
      await page.locator('#teams h3').first().waitFor({ state: 'attached' });
      requireThat(await page.locator('#teams h3').count() === fixture.teams.length, 'Fixture teams did not render');
    }
    // Natural scroll triggers and real GSAP/Lenis run on a controlled clock. No
    // opacity overrides, DOM masks, hidden content, or disabled application code.
    await advance(page, 3000);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 650) {
      await page.evaluate(y => window.scrollTo(0, y), y);
      await advance(page, 1200);
    }
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await advance(page, 1800);
    // Returning to the transparent home nav swaps its logo source once more.
    await ready(page);
    const unrevealed = await page.locator('[data-animate],[data-stagger-item],h1 .word').evaluateAll(es => es.filter(e => Number(getComputedStyle(e).opacity) < 0.99).map(e => e.textContent.slice(0, 80)));
    requireThat(unrevealed.length === 0, `Incomplete scroll reveals on ${route}: ${JSON.stringify(unrevealed)}`);
    const state = await stateOf(page);
    requireThat(state.path === route && state.lang === variant.lang && state.theme === variant.theme && state.h1.length === 1 && state.h1[0].length > 2 && state.description?.length > 20 && state.canonical === new URL(route, page.url()).href && state.badImages.length === 0, `Invalid page state ${route}: ${JSON.stringify(state.badImages)}`);
    if (route === '/news') requireThat(state.robots.includes('noindex'), 'Unlisted news must be noindex');
    if (route === '/') requireThat(state.portraits.length === 6 && state.portraits.every(i => i.width === 480 && i.height === 640), `Portraits missing or invalid: ${JSON.stringify(state.portraits)}`);
    const screenshot = `${site.label}/${variant.key}-${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}.png`;
    await page.screenshot({ path: artifact(screenshot), fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css' });
    captures.push({ path: route, status: response.status(), state, screenshot });
    check(`${site.label} ${variant.key} route ${route}`, true, { screenshot });
  }
  await page.close();
  return captures;
}

async function capture(base, label, fixture) {
  const site = { label, url: base, variants: [], pdfs: [], runtime: [], assets: [], supersededLogoRequests: [] };
  const apiContext = await context(matrix[0], label);
  site.api = await endpoints(apiContext, base, label);
  await apiContext.close();
  if (!fixture) {
    fixture = site.api.teams;
    requireThat(fixture, 'Cannot capture without valid real teams API');
    await json(artifact('teams-fixture.json'), fixture);
  }
  const queue = [...matrix];
  async function worker() {
   while (queue.length) {
    const variant = queue.shift();
    console.log(`${label} ${variant.key}`);
    const ctx = pairedContexts.get(variant.key) ?? await context(variant, label);
    pairedContexts.set(variant.key, ctx);
    try {
      const page = await ctx.newPage(); observe(page, site, `${variant.key}/functional`);
      const functionality = await attempt(`${label} ${variant.key} functional`, () => functional(page, base, variant, site));
      check(`${label} ${variant.key} functional complete`, !!functionality);
      await page.close();
      // Reset storage in context before screenshots; real toggles were tested above.
      await ctx.clearCookies();
      const captures = await attempt(`${label} ${variant.key} visual`, () => visual(ctx, base, variant, site, fixture));
      site.variants.push({ key: variant.key, routes: captures ?? [], functional: functionality });
    } finally {
      if (label === 'candidate' || args['capture-only']) {
        await ctx.close();
        pairedContexts.delete(variant.key);
      }
    }
   }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  site.variants.sort((a, b) => matrix.findIndex(v => v.key === a.key) - matrix.findIndex(v => v.key === b.key));
  site.pdfs.sort((a, b) => a.lang.localeCompare(b.lang));
  check(`${label} runtime clean`, site.runtime.length === 0, { events: site.runtime });
  check(`${label} PDFs complete`, site.pdfs.length === 2);
  return { site, fixture };
}

async function compare(baseline, candidate, baselineRoot) {
  for (const v of baseline.variants) {
    const c = candidate.variants.find(c => c.key === v.key);
    // Pixel screenshots compare layout exactly. Scroll observations are kept in
    // evidence, while functional equality compares independently asserted reachability.
    const outcomes = f => f && ({ ...f, anchors: f.anchors.map(({ top, ...anchor }) => ({ ...anchor, reached: true })) });
    check(`${v.key} functional comparison`, JSON.stringify(outcomes(v.functional)) === JSON.stringify(outcomes(c?.functional)), { baseline: v.functional, candidate: c?.functional });
    for (const route of v.routes) {
      const next = c?.routes.find(r => r.path === route.path);
      if (!check(`${v.key} ${route.path} candidate capture`, !!next)) continue;
      const normalized = r => ({ ...r.state, canonical: new URL(r.state.canonical).pathname });
      // Host names legitimately differ, overflow and all other state must match.
      check(`${v.key} ${route.path} semantic comparison`, JSON.stringify(normalized(route)) === JSON.stringify(normalized(next)), { baseline: normalized(route), candidate: normalized(next) });
      const diffFile = `diff/${v.key}-${route.path === '/' ? 'home' : route.path.slice(1).replaceAll('/', '-')}.png`;
      const diff = await imageDiff(path.join(baselineRoot, route.screenshot), path.join(output, next.screenshot), artifact(diffFile));
      check(`${v.key} ${route.path} pixels`, diff.pass, { ...diff, file: diffFile });
    }
  }
  for (const pdf of baseline.pdfs) check(`PDF ${pdf.lang} content comparison`, pdf.text === candidate.pdfs.find(p => p.lang === pdf.lang)?.text);
}

try {
  requireThat(process.versions.node.split('.')[0] === '24', 'Run with Node 24');
  requireThat(!(args['baseline-dir'] && args['baseline-url']), 'Choose --baseline-url OR --baseline-dir');
  requireThat(args['capture-only'] ? args['baseline-url'] && !args['candidate-url'] && !args['baseline-dir'] : args['candidate-url'] && (args['baseline-url'] || args['baseline-dir']), 'Use --baseline-url URL --capture-only OR (--baseline-url URL | --baseline-dir DIR) --candidate-url URL');
  // Origins only: reject accidental paths, query parameters, credentials and fragments.
  for (const key of ['baseline-url', 'candidate-url']) if (args[key]) {
    const u = safeURL(args[key], args.local);
    requireThat(u.pathname === '/' && !u.search && !u.hash, `${key} must be an origin`);
    args[key] = u.origin;
  }
  if (result.baselineDir) requireThat(output !== result.baselineDir && !output.startsWith(result.baselineDir + path.sep) && !result.baselineDir.startsWith(output + path.sep), 'Output and immutable baseline directories must be disjoint');
  await fs.mkdir(output, { recursive: true });
  requireThat((await fs.readdir(output)).length === 0, '--output must be an empty/new directory');
  for (const dir of ['baseline', 'candidate', 'diff']) await fs.mkdir(path.join(output, dir));
  // Mandatory for content validation; a missing tool fails before browser work.
  execFileSync('pdftotext', ['-v'], { stdio: 'pipe' });
  browser = await chromium.launch({ headless: true });
  const fonts = execFileSync('fc-list', [':', 'family', 'style', 'file'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).split('\n').sort().join('\n');
  result.metadata = {
    node: process.version, platform: process.platform, arch: process.arch, os: os.release(),
    chromium: browser.version(), fontFingerprint: sha(fonts),
    harnessFingerprint: sha(Buffer.concat(await Promise.all(['browser.mjs', 'support.mjs', 'package-lock.json'].map(f => fs.readFile(path.join(here, f)))))),
    versions: JSON.parse(await fs.readFile(path.join(here, 'package.json'))).dependencies,
    matrix, routes, pixels, viewportHeight: 900, locale: 'de-AT', timezone: 'Europe/Vienna', deviceScaleFactor: 1,
    stabilization: 'Only visual /api/teams uses captured baseline JSON; deterministic clock drives unmodified GSAP, Lenis and canvas. Functional page and API probes are unmocked.',
    local: args.local,
  };
  let fixture, baselineRoot = output;
  if (result.baselineDir) {
    const prior = JSON.parse(await fs.readFile(path.join(result.baselineDir, 'result.json')));
    await verifyBaseline(result.baselineDir, prior);
    requireThat(JSON.stringify(prior.metadata) === JSON.stringify(result.metadata), 'Baseline environment/harness differs; use the same pinned runner image, fonts, Node, browser and harness');
    result.baseline = prior.baseline; result.baselineURL = prior.baselineURL;
    result.baselineManifestSha256 = sha(await fs.readFile(path.join(result.baselineDir, 'result.json')));
    fixture = JSON.parse(await fs.readFile(path.join(result.baselineDir, 'teams-fixture.json')));
    await json(artifact('teams-fixture.json'), fixture);
    baselineRoot = result.baselineDir;
  } else {
    const captured = await capture(args['baseline-url'], 'baseline');
    result.baseline = captured.site; fixture = captured.fixture;
  }
  if (!args['capture-only']) {
    result.candidate = (await capture(args['candidate-url'], 'candidate', fixture)).site;
    await compare(result.baseline, result.candidate, baselineRoot);
  }
  result.pass = result.errors.length === 0;
} catch (error) {
  result.errors.push({ check: 'fatal', message: error.message });
} finally {
  await browser?.close();
  result.finished = new Date().toISOString();
  result.counts = { checks: result.checks.length, passed: result.checks.filter(c => c.pass).length, failed: result.errors.length, baselineVariants: result.baseline?.variants.length ?? 0, candidateVariants: result.candidate?.variants.length ?? 0, screenshots: artifactFiles.filter(f => f.endsWith('.png') && !f.startsWith('diff/')).length, diffs: artifactFiles.filter(f => f.startsWith('diff/')).length };
  // Never overwrite an existing report, including when validation rejected output.
  await fs.mkdir(output, { recursive: true });
  const existing = [];
  for (const file of artifactFiles) {
    try { await fs.access(path.join(output, file)); existing.push(file); }
    catch { result.errors.push({ check: 'missing artifact', file }); }
  }
  result.artifacts = await integrity(output, existing);
  result.pass = result.pass && result.errors.length === 0;
  result.counts.failed = result.errors.length;
  await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ pass: result.pass, output, counts: result.counts, errors: result.errors.map(e => ({ check: e.check, message: e.message })) }));
  process.exitCode = result.pass ? 0 : 1;
}
