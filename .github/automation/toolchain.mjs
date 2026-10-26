/**
 * Deterministic toolchain discovery for the trusted parent.
 *
 * This module deliberately has no GitHub writes, installs, shell execution or
 * candidate imports.  Network adapters return bounded, official upstream data;
 * the planner only turns that data into exact bytes after the independent
 * research result has covered every target.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { updateActionRefs, updateNodePin, parseStableVersion, compareStableVersions,
  publicationEligibility, result, isRecord } from './policy.mjs';
import * as defaultAI from './ai.mjs';

export const TOOLCHAIN_SCHEMA_VERSION = 1;
export const SUPPORTED_NODE_LTS_MAJORS = Object.freeze([24]);
export const ALLOWED_ACTIONS = Object.freeze([
  'actions/checkout', 'actions/setup-node', 'actions/upload-artifact', 'actions/download-artifact',
]);
export const NODE_INDEX_URL = 'https://nodejs.org/dist/index.json';
export const NODE_DIST_URL = version => `https://nodejs.org/dist/v${version}/`;
export const ACTION_API_URL = action => `https://api.github.com/repos/${action}/releases`;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ACTION = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_RELEASES = 100;

const fail = message => { throw new TypeError(message); };
const asVersion = value => typeof value === 'string' && VERSION.test(value) ? value : null;
const ageOK = (date, now) => publicationEligibility(date, now).ok;
const officialAction = action => ALLOWED_ACTIONS.includes(action) && ACTION.test(action);
const hexToSri = hex => `sha256-${Buffer.from(hex, 'hex').toString('base64')}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function mapFiles(files) {
  if (files instanceof Map) return new Map(files);
  if (Array.isArray(files)) return new Map(files.map(file => [file.path, file.content]));
  if (isRecord(files)) return new Map(Object.entries(files));
  fail('base files must be a Map, file list or object');
}

function text(value, label) {
  if (typeof value !== 'string') fail(`${label} must be text`);
  return value;
}

/** Bounded official HTTP transport. Tests can inject a fetch implementation. */
export async function boundedFetch(url, { fetchImpl = globalThis.fetch, timeoutMs = 15_000,
  maxBytes = MAX_BYTES, headers = {}, allowedHosts = [] } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { fail('invalid URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
      (allowedHosts.length && !allowedHosts.includes(parsed.hostname))) fail('untrusted upstream URL');
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000 ||
      !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 32 * 1024 * 1024) fail('invalid fetch options');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(parsed.href, { method: 'GET', redirect: 'error', headers: {
      accept: 'application/json, text/plain, */*', ...headers,
    }, signal: controller.signal });
    if (!response || !response.ok) fail(`upstream HTTP ${response?.status ?? 'unknown'}`);
    let bytes;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = [], length = [];
      let total = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > maxBytes) { await reader.cancel().catch(() => {}); fail('upstream body too large'); }
        chunks.push(part.value);
      }
      bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), total);
    } else if (typeof response.arrayBuffer === 'function') {
      bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxBytes) fail('upstream body too large');
    } else if (typeof response.text === 'function') {
      const value = await response.text();
      bytes = Buffer.from(value);
      if (bytes.length > maxBytes) fail('upstream body too large');
    } else fail('upstream response has no body');
    return { url: parsed.href, status: response.status, headers: response.headers, bytes,
      text: bytes.toString('utf8') };
  } catch (error) {
    if (error instanceof TypeError && /^(upstream|invalid|untrusted)/.test(error.message)) throw error;
    if (controller.signal.aborted) fail('upstream timeout');
    fail('upstream fetch failed');
  } finally { clearTimeout(timer); }
}

export async function boundedFetchJson(url, options = {}) {
  const response = await boundedFetch(url, options);
  try { return { ...response, json: JSON.parse(response.text) }; }
  catch { fail('upstream JSON malformed'); }
}

function releaseDate(release) { return release?.date ?? release?.published_at ?? release?.publishedAt ?? release?.created_at; }

function parseChecksums(shasums, filename) {
  const rows = text(shasums, 'SHASUMS').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const found = rows.map(line => /^(?<sha>[a-f0-9]{64})\s+(?:\*|)\s*(?<name>\S+)$/.exec(line)).find(row => row?.groups.name === filename);
  if (!found || !SHA256.test(found.groups.sha)) fail('missing official Node Linux x64 checksum');
  return found.groups.sha;
}

/** Selects a newer Node 24 LTS patch/minor and binds it to signed SHASUMS. */
export function discoverNodeRelease({ index, currentVersion, now = Date.now(), shasums, shasumsSignature,
  tarballBytes, supportedLtsMajors = SUPPORTED_NODE_LTS_MAJORS, allowMinor = true } = {}) {
  const current = asVersion(currentVersion);
  if (!current || !Array.isArray(supportedLtsMajors) || !supportedLtsMajors.includes(24)) fail('invalid current Node pin');
  const currentParts = parseStableVersion(current);
  if (currentParts[0] !== 24) fail('only Node 24 LTS is supported');
  if (!Array.isArray(index) || !Number.isFinite(now)) fail('invalid Node release index');
  const eligible = index.map(item => {
    const version = typeof item?.version === 'string' ? item.version.replace(/^v/, '') : null;
    const parts = version && parseStableVersion(version);
    return { item, version, parts, date: item?.date };
  }).filter(row => row.parts && row.parts[0] === 24 && (allowMinor || row.parts[1] === currentParts[1]) &&
    (row.item.lts === true || typeof row.item.lts === 'string') && ageOK(row.date, now));
  if (!eligible.length) fail('no eligible same-minor Node 24 LTS release');
  eligible.sort((a, b) => compareStableVersions(b.version, a.version));
  const chosen = eligible[0];
  if (compareStableVersions(chosen.version, current) <= 0) {
    return { changed: false, from: current, to: current, version: current, releaseDate: chosen.date,
      source: NODE_INDEX_URL, supportedLtsMajors: [...SUPPORTED_NODE_LTS_MAJORS] };
  }
  const filename = `node-v${chosen.version}-linux-x64.tar.gz`;
  const checksum = parseChecksums(shasums, filename);
  if (typeof shasumsSignature !== 'string' || !shasumsSignature.trim()) fail('missing signed Node SHASUMS');
  if (tarballBytes !== undefined) {
    const bytes = Buffer.isBuffer(tarballBytes) ? tarballBytes : Buffer.from(tarballBytes);
    if (sha256(bytes) !== checksum) fail('Node tarball checksum mismatch');
  }
  return { changed: true, from: current, to: chosen.version, version: chosen.version, releaseDate: chosen.date,
    source: NODE_INDEX_URL, distUrl: `${NODE_DIST_URL(chosen.version)}${filename}`,
    shasumsUrl: `${NODE_DIST_URL(chosen.version)}SHASUMS256.txt`, shasumsSignatureUrl: `${NODE_DIST_URL(chosen.version)}SHASUMS256.txt.sig`,
    sha256: checksum, linuxX64Sha256: checksum, sri: hexToSri(checksum), linuxX64SRI: hexToSri(checksum), tarballSRI: hexToSri(checksum), linuxX64Tarball: filename,
    setupNode: { nodeVersionFile: '.nvmrc', expectedVersion: chosen.version, officialDigest: checksum },
    signedShasums: { required: true, bytes: Buffer.byteLength(shasumsSignature) },
    supportedLtsMajors: [...SUPPORTED_NODE_LTS_MAJORS] };
}

export async function discoverNodeReleaseLive({ currentVersion, now = Date.now(), fetchImpl, supportedLtsMajors, allowMinor = true } = {}) {
  const index = (await boundedFetchJson(NODE_INDEX_URL, { fetchImpl, allowedHosts: ['nodejs.org'] })).json;
  const current = asVersion(currentVersion);
  if (!current) fail('invalid current Node pin');
  const currentParts = parseStableVersion(current);
  const candidates = index.filter(item => {
    const version = typeof item?.version === 'string' ? item.version.replace(/^v/, '') : '';
    const parts = parseStableVersion(version);
    return parts && parts[0] === 24 && (allowMinor || parts[1] === currentParts[1]) && (item.lts === true || typeof item.lts === 'string') && ageOK(item.date, now);
  });
  candidates.sort((a, b) => compareStableVersions(b.version.replace(/^v/, ''), a.version.replace(/^v/, '')));
  const latest = candidates[0];
  if (!latest) fail('Node 24 not present in official index');
  const version = latest.version.replace(/^v/, '');
  const prefix = NODE_DIST_URL(version);
  const [checks, signature] = await Promise.all([
    boundedFetch(`${prefix}SHASUMS256.txt`, { fetchImpl, allowedHosts: ['nodejs.org'] }),
    boundedFetch(`${prefix}SHASUMS256.txt.sig`, { fetchImpl, allowedHosts: ['nodejs.org'] }),
  ]);
  return discoverNodeRelease({ index, currentVersion, now, shasums: checks.text, shasumsSignature: signature.text, supportedLtsMajors });
}

function actionTag(release) { return release?.tag_name ?? release?.tag ?? release?.name; }
function repositoryOf(release, fallback) { return release?.repository?.full_name ?? release?.repository?.nameWithOwner ?? fallback; }

/** Resolve the immutable commit behind a GitHub release tag. */
export function resolveActionCommit({ action, tag, ref, dereferenced, maxDepth = 2 } = {}) {
  if (!officialAction(action) || typeof tag !== 'string' || !TAG.test(tag) || !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 3) fail('invalid action ref');
  const walk = (value, depth) => {
    if (depth > maxDepth || typeof value === 'undefined') fail('annotated Git tag dereference exceeded bound');
    const repository = value?.repository?.full_name ?? value?.repository?.nameWithOwner;
    if (repository !== undefined && repository !== action) fail('tag ref repository is not official');
    const refName = value?.ref ?? value?.name;
    if (typeof refName === 'string' && refName !== tag && refName !== `refs/tags/${tag}`) fail('tag ref does not match requested release');
    const object = value?.object ?? value;
    const sha = typeof object === 'string' ? object : object?.sha;
    const type = typeof object === 'object' ? object?.type : 'commit';
    if (!SHA40.test(sha ?? '')) fail('action ref is not an immutable SHA');
    if (type === 'commit' || type === undefined) return sha;
    if (type !== 'tag') fail('action ref does not resolve to a commit');
    if (depth >= maxDepth || !dereferenced) fail('annotated tag requires bounded dereference');
    return walk(dereferenced, depth + 1);
  };
  return walk(ref, 0);
}

/** Newest non-prerelease release with an immutable official repository commit. */
export function discoverActionRelease({ action, releases, now = Date.now(), ref, dereferenced, commitSha, currentTag, currentSha } = {}) {
  if (!officialAction(action) || !Array.isArray(releases) || !Number.isFinite(now)) fail('invalid GitHub release metadata');
  const eligible = releases.filter(release => release && release.draft !== true && release.prerelease !== true &&
    typeof actionTag(release) === 'string' && TAG.test(actionTag(release)) && ageOK(releaseDate(release), now) &&
    repositoryOf(release, action) === action);
  if (!eligible.length) fail(`no eligible release for ${action}`);
  eligible.sort((a, b) => Date.parse(releaseDate(b)) - Date.parse(releaseDate(a)) || String(actionTag(b)).localeCompare(String(actionTag(a))));
  const chosen = eligible[0], tag = actionTag(chosen);
  const sha = commitSha ?? resolveActionCommit({ action, tag, ref: ref ?? chosen.ref, dereferenced: dereferenced ?? chosen.dereferenced });
  if ((currentTag !== undefined || currentSha !== undefined) &&
      (typeof currentTag !== 'string' || !TAG.test(currentTag) || !SHA40.test(currentSha ?? '') || compareReleaseTags(tag, currentTag) === null)) fail(`ambiguous current action tag: ${action}`);
  const tagOrder = typeof currentTag === 'string' ? compareReleaseTags(tag, currentTag) : null;
  if (tagOrder === 0 && currentSha !== sha) fail(`current action tag SHA mismatch: ${action}`);
  const unchanged = typeof currentTag === 'string' && tagOrder !== null && tagOrder <= 0;
  return { kind: 'action', action, repository: action, tag: unchanged ? currentTag : tag, sha: unchanged ? currentSha : sha,
    selectedTag: tag, selectedSha: sha, changed: !unchanged, currentTag: currentTag ?? null, currentSha: currentSha ?? null, publishedAt: releaseDate(chosen),
    releaseUrl: chosen.html_url ?? chosen.url ?? `https://github.com/${action}/releases/tag/${encodeURIComponent(tag)}`,
    source: ACTION_API_URL(action) };
}

export async function fetchGitHubReleases(action, { fetchImpl, token, now = Date.now() } = {}) {
  if (!officialAction(action)) fail('action is not allowlisted');
  const headers = { accept: 'application/vnd.github+json' };
  if (typeof token === 'string' && token) headers.authorization = `Bearer ${token}`;
  const response = await boundedFetchJson(ACTION_API_URL(action), { fetchImpl, headers, allowedHosts: ['api.github.com'], maxBytes: 4 * 1024 * 1024 });
  if (!Array.isArray(response.json) || response.json.length > MAX_RELEASES) fail('invalid GitHub releases response');
  return response.json.map(release => ({ ...release, repository: action })).filter(release => releaseDate(release) && ageOK(releaseDate(release), now));
}

export async function discoverActionReleaseLive({ action, fetchImpl, token, now = Date.now() } = {}) {
  const releases = await fetchGitHubReleases(action, { fetchImpl, token, now });
  if (!releases.length) fail(`no eligible release for ${action}`);
  const chosen = [...releases].sort((a, b) => Date.parse(releaseDate(b)) - Date.parse(releaseDate(a)))[0];
  const tag = actionTag(chosen), headers = { accept: 'application/vnd.github+json' };
  if (typeof token === 'string' && token) headers.authorization = `Bearer ${token}`;
  const refResponse = await boundedFetchJson(`https://api.github.com/repos/${action}/git/ref/tags/${encodeURIComponent(tag)}`, {
    fetchImpl, headers, allowedHosts: ['api.github.com'], maxBytes: 128 * 1024,
  });
  let dereferenced;
  if (refResponse.json?.object?.type === 'tag') {
    const tagResponse = await boundedFetchJson(`https://api.github.com/repos/${action}/git/tags/${encodeURIComponent(refResponse.json.object.sha)}`, {
      fetchImpl, headers, allowedHosts: ['api.github.com'], maxBytes: 128 * 1024,
    });
    dereferenced = tagResponse.json?.object ?? tagResponse.json;
  }
  return discoverActionRelease({ action, releases, now, ref: refResponse.json, dereferenced });
}

function usesLines(source) {
  const lines = source.split('\n'), found = [];
  let scalarIndent = null;
  lines.forEach((line, index) => {
    const indent = /^ */.exec(line)[0].length;
    if (scalarIndent !== null) {
      if (!line.trim() || indent > scalarIndent) return;
      scalarIndent = null;
    }
    const scalar = /^( *)(-\s+)?[\w.-]+:\s*[|>](?:[-+]?[1-9]?|[1-9][-+]?)?\s*(?:#.*)?\r?$/.exec(line);
    if (scalar) { scalarIndent = scalar[1].length + (scalar[2]?.length ?? 0); return; }
    const match = /^(\s*(?:-\s+)?uses:\s*)([\w./-]+)@([\w.-]+)(\s*(?:#.*)?)$/.exec(line);
    if (match) found.push({ index, line, prefix: match[1], action: match[2], ref: match[3], suffix: match[4], commentTag: /^\s*#\s*([A-Za-z0-9][A-Za-z0-9._/-]*)\s*$/.exec(match[4])?.[1] ?? null });
  });
  return found;
}

function compareReleaseTags(a, b) {
  const parse = tag => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(tag ?? '');
  const left = parse(a), right = parse(b);
  if (!left || !right) return null;
  return compareStableVersions(`${left[1]}.${left[2]}.${left[3]}`, `${right[1]}.${right[2]}.${right[3]}`);
}

export function discoverWorkflowActionRefs(baseFiles) {
  const files = mapFiles(baseFiles), refs = [];
  for (const [path, content] of files) {
    if (!WORKFLOW.test(path)) continue;
    text(content, path);
    for (const ref of usesLines(content)) refs.push({ path, ...ref });
  }
  return refs;
}

function updateActionComments(source, tags) {
  let scalarIndent = null;
  return source.split('\n').map(line => {
    const indent = /^ */.exec(line)[0].length;
    if (scalarIndent !== null) {
      if (!line.trim() || indent > scalarIndent) return line;
      scalarIndent = null;
    }
    const scalar = /^( *)(-\s+)?[\w.-]+:\s*[|>](?:[-+]?[1-9]?|[1-9][-+]?)?\s*(?:#.*)?\r?$/.exec(line);
    if (scalar) { scalarIndent = scalar[1].length + (scalar[2]?.length ?? 0); return line; }
    const match = /^(\s*(?:-\s+)?uses:\s*)([\w./-]+)@([a-f0-9]{40})(\s*(?:#.*)?)$/.exec(line);
    if (!match || !Object.hasOwn(tags, match[2])) return line;
    return `${match[1]}${match[2]}@${match[3]} # ${tags[match[2]]}`;
  }).join('\n');
}

function applyActionUpdates(source, updates, tags) {
  const updated = updateActionRefs(source, updates, ALLOWED_ACTIONS);
  return updateActionComments(updated, tags);
}

function researchTargetKey(target) { return `${target.kind}:${target.name}@${target.version}`; }
function officialResearchSource(target, source) {
  try {
    const url = new URL(source);
    if (target.kind === 'node') return url.protocol === 'https:' && url.hostname === 'nodejs.org';
    const path = url.pathname.toLowerCase(), repo = `/${target.name.toLowerCase()}`, apiRepo = `/repos${repo}`;
    return url.protocol === 'https:' && ((url.hostname === 'github.com' && (path === repo || path.startsWith(`${repo}/`) || path.startsWith('/advisories/'))) ||
      (url.hostname === 'api.github.com' && (path === apiRepo || path.startsWith(`${apiRepo}/`) || path.startsWith('/advisories/'))));
  } catch { return false; }
}
function queryCoversTarget(query, target) {
  if (typeof query !== 'string') return false;
  const q = query.toLowerCase();
  return q.includes(String(target.version).toLowerCase()) && (target.kind === 'node' ? q.includes('node') : q.includes(target.name.toLowerCase()));
}

/** Fail-closed verifier for AI output and adapter-derived search provenance. */
export function validateResearchResults(results, targets) {
  const errors = [];
  if (!Array.isArray(targets) || !targets.length || !Array.isArray(results)) return result(['research targets/results are missing']);
  const expected = new Map(targets.map(target => [researchTargetKey(target), target]));
  const seen = new Set();
  for (const item of results) {
    const target = item?.target, key = target && researchTargetKey(target);
    if (!expected.has(key) || seen.has(key)) { errors.push('research target set is incomplete or duplicated'); continue; }
    seen.add(key);
    const searches = item.provenance?.searches ?? item.searches;
    const evidence = Array.isArray(item.evidence) ? item.evidence : [];
    if (!Array.isArray(searches) || !searches.length) errors.push(`missing search provenance: ${key}`);
    const sources = new Set((Array.isArray(searches) ? searches : []).filter(search => Array.isArray(search.queries) && search.queries.some(query => queryCoversTarget(query, target)))
      .flatMap(search => Array.isArray(search.sources) ? search.sources : []).filter(source => officialResearchSource(target, source)));
    if (!sources.size) errors.push(`missing exact target search coverage: ${key}`);
    if (!evidence.length || evidence.some(source => !sources.has(source))) errors.push(`research evidence is not provenance-bound: ${key}`);
    const security = item.security;
    if (!isRecord(security) || !['clear', 'fixed'].includes(security.status)) errors.push(`unknown security metadata: ${key}`);
    const advisories = security?.advisories;
    if (!Array.isArray(advisories)) errors.push(`security advisory proof missing: ${key}`);
    for (const advisory of advisories ?? []) {
      const firstFixed = advisory.firstFixedVersion ?? advisory.firstFixedLine ?? advisory.fixedRange;
      if (typeof advisory.id !== 'string' || !advisory.id.trim() || typeof firstFixed !== 'string' || !firstFixed.trim() ||
          typeof advisory.source !== 'string' || !sources.has(advisory.source) ||
          (target.kind === 'action' && typeof advisory.fixedRange !== 'string') ||
          (target.kind === 'action' && !Array.isArray(advisory.aliases)) ||
          (target.kind === 'node' && !/^(?:24\.x|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.test(firstFixed))) errors.push(`unproven security advisory: ${key}`);
    }
    if (!Array.isArray(item.findings) || item.pass !== true || item.findings.some(finding => ['high', 'critical'].includes(finding?.severity))) errors.push(`research did not pass: ${key}`);
  }
  for (const key of expected.keys()) if (!seen.has(key)) errors.push(`missing research target: ${key}`);
  return result(errors);
}

const researchSchema = { type: 'object', additionalProperties: false, required: ['target', 'pass', 'findings', 'evidence', 'security'], properties: {
  target: { type: 'object', additionalProperties: false, required: ['kind', 'name', 'version'], properties: {
    kind: { type: 'string', enum: ['node', 'action'] }, name: { type: 'string', minLength: 1, maxLength: 200 }, version: { type: 'string', minLength: 1, maxLength: 100 },
  } }, pass: { type: 'boolean' }, findings: { type: 'array', maxItems: 30, items: { type: 'object', additionalProperties: false, required: ['severity', 'message', 'evidence'], properties: {
    severity: { type: 'string', enum: ['info', 'low', 'medium', 'high', 'critical'] }, message: { type: 'string', minLength: 1, maxLength: 2000 }, evidence: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' } },
  } } }, evidence: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } }, security: { type: 'object', additionalProperties: false, required: ['status', 'advisories'], properties: {
    status: { type: 'string', enum: ['clear', 'fixed', 'unknown'] }, advisories: { type: 'array', maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['id', 'source'], properties: {
      id: { type: 'string', minLength: 1, maxLength: 200 }, firstFixedVersion: { type: 'string', minLength: 1, maxLength: 100 }, firstFixedLine: { type: 'string', minLength: 1, maxLength: 100 }, fixedRange: { type: 'string', minLength: 1, maxLength: 500 }, aliases: { type: 'array', maxItems: 20, items: { type: 'string', minLength: 1, maxLength: 200 } }, source: { type: 'string', minLength: 1, maxLength: 2000 },
    } } },
  } },
} };

/** One fresh stateless search call per exact Node/action target. */
export async function researchToolchainTargets({ targets, baseSHA = '0'.repeat(40), headSHA = '0'.repeat(40), ai = defaultAI, options = {} } = {}) {
  if (!Array.isArray(targets) || !targets.length || typeof ai?.callAI !== 'function') fail('invalid toolchain research request');
  const results = [];
  for (const target of targets) {
    if (!isRecord(target) || !['node', 'action'].includes(target.kind) || typeof target.name !== 'string' || typeof target.version !== 'string') fail('invalid research target');
    const instructions = target.kind === 'node'
      ? 'Assess only official Node.js security advisories or Node.js security blog records for this exact release and Node 24 line. Report every relevant CVE with the exact first fixed version/line; unknown metadata must fail.'
      : 'Assess only GitHub Advisory Database records (ecosystem actions) for this exact official Actions repository and release. Include CVE aliases when present, normalize the exact repository/version query, and report the exact fixed range; unknown metadata must fail.';
    const response = await ai.callAI({ search: true, instructions, input: { target, requirement: 'exact-target-security-proof' }, schema: researchSchema }, options);
    if (!response?.data || !response.provenance) fail(`research response missing for ${researchTargetKey(target)}`);
    const item = { ...response.data, target, provenance: response.provenance };
    const check = validateResearchResults([item], [target]);
    if (!check.ok) fail(check.errors.join('; '));
    results.push(item);
  }
  const check = validateResearchResults(results, targets);
  if (!check.ok) fail(check.errors.join('; '));
  return { results, targets, researchedAt: new Date().toISOString() };
}

function actionTargets(refs, releases) {
  return refs.map(action => ({ kind: 'action', name: action, version: releases.find(release => release.action === action)?.tag }));
}

function integrationNotes() {
  return [
    'Controller must authorize compatibilityPaths from this trusted plan before candidate diff validation.',
    'Root .nvmrc governs the trusted controller and worker; coordinate the Docker sandbox NODE_VERSION immutable constant through a reviewed trusted-parent change.',
    'Keep .github/qa/.nvmrc at the reviewed Node pin so baseline metadata cannot drift across runtime updates.',
    'Worker must coordinate the immutable Node pin and verify the official Linux x64 SHA-256/SRI before runtime setup.',
    'Node updates remain within major 24; the generator accepts only newer official LTS patch/minor releases with signed SHASUMS and seven-day eligibility.',
    'Vercel engines 24.x selects a platform patch independently of .nvmrc; verifyRuntime must not assume the repository pin controls Vercel. Current exact-pin checks require a trusted compatibility adjustment before Node auto-updates.',
    'Urgent CVE handling requires an independently verified tool advisory with exact fixed metadata; model assertions never create an exemption.',
    'validateToolPlan proves deterministic bytes and metadata consistency only; the parent must independently fetch and verify every release tag, commit, Node checksum and advisory before accepting this plan.',
    'Do not change workflow permissions, harness steps, or deployment settings in this generator.',
  ];
}

/** Build exact candidate bytes from trusted base files and independently verified metadata. */
export function generateToolchainPlan({ baseFiles, now = Date.now(), nodeIndex, shasums, shasumsSignature, nodeTarballBytes,
  currentNodeVersion, actionReleases = {}, actionCommits = {}, researchresults, supportedLtsMajors = SUPPORTED_NODE_LTS_MAJORS,
  allowNodeMinor = true } = {}) {
  const files = mapFiles(baseFiles), nvmrc = files.get('.nvmrc');
  if (typeof nvmrc !== 'string') fail('trusted base .nvmrc is missing');
  const current = nvmrc.trim().replace(/^v/, '');
  if (currentNodeVersion !== undefined && currentNodeVersion !== current) fail('current Node metadata does not match trusted .nvmrc');
  const node = discoverNodeRelease({ index: nodeIndex, currentVersion: current, now, shasums, shasumsSignature, tarballBytes: nodeTarballBytes, supportedLtsMajors, allowMinor: allowNodeMinor });
  const refs = discoverWorkflowActionRefs(files);
  const actions = [...new Set(refs.map(ref => ref.action))];
  if (actions.some(action => !officialAction(action))) fail('workflow contains an action outside the allowlist');
  const releases = [], pinUpdates = {}, finalRefs = {}, tags = {};
  for (const action of actions) {
    const current = refs.filter(ref => ref.action === action);
    const currentSHAs = [...new Set(current.map(ref => ref.ref))];
    const currentTags = [...new Set(current.map(ref => ref.commentTag))];
    if (currentSHAs.length !== 1 || currentTags.length !== 1 || !currentTags[0]) fail(`ambiguous current action pin: ${action}`);
    const supplied = Array.isArray(actionReleases[action]) ? actionReleases[action] : actionReleases[action]?.releases ?? actionReleases[action];
    if (!Array.isArray(supplied)) fail(`missing release metadata for ${action}`);
    const release = discoverActionRelease({ action, releases: supplied, now, ref: actionReleases[action]?.ref, dereferenced: actionReleases[action]?.dereferenced, commitSha: actionCommits[action], currentTag: currentSHAs[0] && currentTags[0] ? currentTags[0] : undefined, currentSha: currentSHAs[0] });
    releases.push(release); finalRefs[action] = release.sha; tags[action] = release.tag;
    if (release.changed) pinUpdates[action] = release.sha;
  }
  const targets = [
    { kind: 'node', name: 'node', version: node.to },
    ...actionTargets(actions, releases),
  ];
  const research = researchresults?.results ?? researchresults;
  const researchCheck = validateResearchResults(research, targets);
  if (!researchCheck.ok) fail(researchCheck.errors.join('; '));
  const outputFiles = [];
  if (node.changed) outputFiles.push({ path: '.nvmrc', content: updateNodePin(nvmrc, node.to, SUPPORTED_NODE_LTS_MAJORS) });
  const changedPaths = new Set();
  for (const path of [...files.keys()].sort()) {
    if (!WORKFLOW.test(path)) continue;
    const source = files.get(path), inFile = usesLines(source);
    const updates = Object.fromEntries(actions.filter(action => pinUpdates[action] && inFile.some(ref => ref.action === action)).map(action => [action, pinUpdates[action]]));
    if (!Object.keys(updates).length) continue;
    const content = applyActionUpdates(source, updates, tags);
    if (content !== source) { outputFiles.push({ path, content }); changedPaths.add(path); }
  }
  outputFiles.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schemaVersion: TOOLCHAIN_SCHEMA_VERSION, generatedAt: new Date(now).toISOString(),
    files: outputFiles, releases: [{ kind: 'node', ...node }, ...releases], nodePlan: node,
    researchresults: research, researchResults: research, pinnedactionrefs: finalRefs, pinnedActionRefs: finalRefs, actionUpdates: pinUpdates, baseNodePin: current,
    compatibilityPaths: [], integrationNotes: integrationNotes(), changedWorkflowPaths: [...changedPaths].sort(),
  };
}

/** Recompute all candidate bytes and reject substituted metadata or harness edits. */
export function validateToolPlan(baseFiles, plan, { now = Date.now(), supportedLtsMajors = SUPPORTED_NODE_LTS_MAJORS, allowNodeMinor = false } = {}) {
  const errors = [];
  let files;
  try { files = mapFiles(baseFiles); } catch (error) { return result([error.message]); }
  if (!isRecord(plan) || plan.schemaVersion !== TOOLCHAIN_SCHEMA_VERSION || !Array.isArray(plan.files)) return result(['malformed toolchain plan']);
  if (typeof plan.generatedAt !== 'string' || !Number.isFinite(Date.parse(plan.generatedAt)) || Date.parse(plan.generatedAt) > now) errors.push('invalid plan timestamp');
  const node = plan.nodePlan;
  if (!isRecord(node) || node.from !== String(files.get('.nvmrc') ?? '').trim().replace(/^v/, '')) errors.push('Node plan is not bound to trusted base pin');
  if (isRecord(node) && !node.changed && node.to !== node.from) errors.push('unchanged Node plan has a different target');
  const nodeRelease = (plan.releases ?? []).find(release => release?.kind === 'node');
  if (!isRecord(nodeRelease) || nodeRelease.version !== node?.to || nodeRelease.source !== NODE_INDEX_URL || !ageOK(nodeRelease.releaseDate, now)) errors.push('Node release metadata is missing or stale');
  if (node?.changed) {
    try { if (updateNodePin(files.get('.nvmrc'), node.to, SUPPORTED_NODE_LTS_MAJORS) !== plan.files.find(file => file.path === '.nvmrc')?.content) errors.push('Node bytes differ from deterministic pin update'); }
    catch { errors.push('unsupported Node patch'); }
    if (!SHA256.test(node.sha256 ?? '') || node.sri !== hexToSri(node.sha256) || node.signedShasums?.required !== true ||
        !String(node.shasumsUrl ?? '').startsWith('https://nodejs.org/dist/') || !String(node.shasumsSignatureUrl ?? '').endsWith('SHASUMS256.txt.sig')) errors.push('Node release evidence is incomplete');
  } else if (plan.files.some(file => file.path === '.nvmrc')) errors.push('unchanged Node plan modified .nvmrc');
  if (!Array.isArray(supportedLtsMajors) || !supportedLtsMajors.includes(24)) errors.push('trusted Node LTS policy is missing');
  const refs = (() => { try { return discoverWorkflowActionRefs(files); } catch { return []; } })();
  const actions = [...new Set(refs.map(ref => ref.action))];
  if (actions.some(action => !officialAction(action))) errors.push('workflow action outside allowlist');
  const finalRefs = plan.pinnedactionrefs;
  const updates = plan.actionUpdates;
  if (!isRecord(finalRefs) || !isRecord(updates)) errors.push('missing immutable action refs');
  const tags = {};
  const releaseByAction = {};
  for (const release of plan.releases ?? []) {
    if (release.kind === 'action') {
      if (!officialAction(release.action) || !SHA40.test(release.sha) || release.repository !== release.action || !ageOK(release.publishedAt, now) ||
          release.source !== ACTION_API_URL(release.action) || typeof release.tag !== 'string' || !TAG.test(release.tag) ||
          !String(release.releaseUrl ?? '').startsWith(`https://github.com/${release.action}/`)) errors.push(`invalid action release: ${release.action}`);
      tags[release.action] = release.tag; releaseByAction[release.action] = release;
    }
  }
  for (const action of actions) {
    const refsForAction = refs.filter(ref => ref.action === action), currentSHA = [...new Set(refsForAction.map(ref => ref.ref))], currentTag = [...new Set(refsForAction.map(ref => ref.commentTag))];
    if (currentSHA.length !== 1 || currentTag.length !== 1 || !currentTag[0] || !SHA40.test(currentSHA[0])) errors.push(`ambiguous current action pin: ${action}`);
    const release = releaseByAction[action];
    if (!release || typeof tags[action] !== 'string') errors.push(`missing action pin release: ${action}`);
    if (release && (release.currentSha !== currentSHA[0] || release.currentTag !== currentTag[0] || !SHA40.test(release.selectedSha ?? ''))) errors.push(`action release is not bound to current pin: ${action}`);
    if (updates?.[action] !== undefined) {
      if (!SHA40.test(updates[action]) || finalRefs?.[action] !== updates[action] || release?.sha !== updates[action] || release?.changed !== true) errors.push(`invalid action update: ${action}`);
    } else if (finalRefs?.[action] !== currentSHA[0] || release?.changed !== false || tags[action] !== currentTag[0]) {
      errors.push(`unchanged action pin is not grandfathered: ${action}`);
    }
  }
  for (const action of Object.keys(updates ?? {})) if (!actions.includes(action) || !officialAction(action)) errors.push(`untrusted action update: ${action}`);
  for (const action of Object.keys(finalRefs ?? {})) if (!actions.includes(action) || !SHA40.test(finalRefs[action])) errors.push(`untrusted final action pin: ${action}`);
  const expected = [];
  if (node?.changed) expected.push({ path: '.nvmrc', content: (() => { try { return updateNodePin(files.get('.nvmrc'), node.to, SUPPORTED_NODE_LTS_MAJORS); } catch { return null; } })() });
  for (const path of [...files.keys()].sort()) {
    if (!WORKFLOW.test(path)) continue;
    const source = files.get(path), local = usesLines(source);
    const localActions = [...new Set(local.map(ref => ref.action))];
    const localUpdates = Object.fromEntries(localActions.map(action => [action, updates?.[action]]).filter(([, sha]) => sha));
    if (!Object.keys(localUpdates).length) continue;
    try { expected.push({ path, content: applyActionUpdates(source, localUpdates, tags) }); }
    catch { errors.push(`workflow update cannot be reproduced: ${path}`); }
  }
  expected.sort((a, b) => a.path.localeCompare(b.path));
  const actual = [...plan.files].sort((a, b) => String(a?.path).localeCompare(String(b?.path)));
  if (!actual.every(file => isRecord(file) && typeof file.path === 'string' && typeof file.content === 'string')) errors.push('malformed plan file');
  if (!isDeepStrictEqual(actual, expected)) errors.push('plan files differ from deterministic generation');
  const targets = [ { kind: 'node', name: 'node', version: node?.to }, ...actions.map(action => ({ kind: 'action', name: action, version: tags[action] })) ];
  const researchCheck = validateResearchResults(plan.researchresults, targets);
  if (!researchCheck.ok) errors.push(...researchCheck.errors);
  if (plan.integrationNotes?.some(note => typeof note !== 'string')) errors.push('invalid integration notes');
  return result(errors);
}

export const createToolchainPlan = generateToolchainPlan;
export const planToolchain = generateToolchainPlan;
export const generateToolchain = generateToolchainPlan;
export const validateToolchainPlan = validateToolPlan;
export const validatePlan = validateToolPlan;
