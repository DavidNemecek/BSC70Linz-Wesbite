/** Primary-source CVE selectors. No model/caller-authored record is authority.
 * Node WG ranges and nodejs.org's vulnerability RSS/Markdown are public project
 * data. Actions records come from each allowlisted repository's published GHSA
 * endpoint. Fetch provenance is deliberately process-local: serialized evidence
 * must be refreshed by the trusted parent before accepting a young release.
 */
import { isDeepStrictEqual } from 'node:util';
import { boundedFetch, boundedFetchJson, fetchActionCommitLive, ALLOWED_ACTIONS } from './toolchain.mjs';
import { compareStableVersions, parseStableVersion, publicationEligibility, result } from './policy.mjs';

export const NODE_SECURITY_INDEX = 'https://raw.githubusercontent.com/nodejs/security-wg/main/vuln/core/index.json';
export const NODE_SECURITY_FEED = 'https://nodejs.org/en/feed/vulnerability.xml';
const NODE_BLOG_ROOT = 'https://raw.githubusercontent.com/nodejs/nodejs.org/main/apps/site/pages/en/blog/vulnerability/';
const CVE = /^CVE-\d{4}-\d{4,}$/;
const GHSA = /^GHSA-[23456789cfghjmpqrvwx]{4}(?:-[23456789cfghjmpqrvwx]{4}){2}$/;
const authentic = new WeakSet();
const fail = message => { throw new TypeError(message); };
const version = value => typeof value === 'string' && parseStableVersion(value.replace(/^v/, '')) ? value.replace(/^v/, '') : null;
const key = target => `${target.kind}:${target.name}@${target.version}`;
const fresh = (proof, now) => Number.isFinite(now) && Date.parse(proof?.fetchedAt) <= now && now - Date.parse(proof?.fetchedAt) <= 86_400_000;

function requireSemver(semver) {
  if (!semver || !['validRange', 'satisfies', 'minVersion', 'intersects'].every(name => typeof semver[name] === 'function'))
    fail('trusted npm-bundled semver is required for primary toolchain advisory verification');
}
function affected(range, current, semver, label) {
  if (typeof range !== 'string' || !range.trim() || !semver.validRange(range)) fail(`unsupported relevant affected range: ${label}`);
  return semver.satisfies(current, range);
}
function proofFor(target, fixed, id, source, range, now, record) {
  const to = target.kind === 'action' ? `v${fixed}` : fixed;
  const proof = Object.freeze({ target: Object.freeze({ kind: target.kind, name: target.name, version: to }),
    fromVersion: target.version, ...(target.sha ? { fromSHA: target.sha } : {}), fetchedAt: new Date(now).toISOString(),
    advisory: Object.freeze({ id, aliases: Object.freeze([id]), package: target.name, affectedRange: range,
      firstFixedVersion: to, source, record }) });
  authentic.add(proof);
  return proof;
}

/** Only objects made by a successful bounded primary fetch can waive age. */
export function verifiedSecurityProof(proof, { target, fromVersion, fromSHA, now = Date.now() } = {}) {
  return authentic.has(proof) && fresh(proof, now) && (!target || key(proof.target) === key(target)) &&
    (fromVersion === undefined || proof.fromVersion === fromVersion) && (fromSHA === undefined || proof.fromSHA === fromSHA);
}
export function releaseAgeEligible(date, { kind, name, version: to, fromVersion, fromSHA, securityProofs = [], now = Date.now() }) {
  if (publicationEligibility(date, now).ok) return true;
  const time = Date.parse(date);
  return Number.isFinite(time) && time <= now && securityProofs.some(proof => verifiedSecurityProof(proof,
    { target: { kind, name, version: to }, fromVersion, fromSHA, now }));
}

/** Structural validation alone never authenticates saved/caller-supplied bytes. */
export function validatePrimaryWaivers(waivers, { targets = [], now = Date.now(), securityProofs = waivers } = {}) {
  if (!Array.isArray(waivers) || !Array.isArray(securityProofs)) return result(['CVE waivers must be an array']);
  const errors = [], seen = new Set();
  for (const waiver of waivers) {
    const identity = `${key(waiver?.target ?? {})}:${waiver?.advisory?.id}`;
    if (seen.has(identity) || !targets.some(target => key(target) === key(waiver?.target ?? {})) ||
        waiver?.scope || waiver?.blanket || !securityProofs.some(proof => {
          if (!waiver?.target || proof.fromVersion !== waiver.fromVersion || proof.fromSHA !== waiver.fromSHA ||
              !verifiedSecurityProof(proof, { target: waiver.target, now })) return false;
          // Timestamp may change when evidence is fetched again after resumption.
          return isDeepStrictEqual(proof.advisory, waiver.advisory);
        })) errors.push('CVE waiver lacks fresh authenticated primary fetch for exact current/fixed versions');
    seen.add(identity);
  }
  for (const proof of securityProofs) {
    if (verifiedSecurityProof(proof, { now }) && targets.some(target => key(target) === key(proof.target)) &&
        !waivers.some(waiver => waiver?.fromVersion === proof.fromVersion && waiver?.fromSHA === proof.fromSHA &&
          key(waiver?.target ?? {}) === key(proof.target) && isDeepStrictEqual(waiver?.advisory, proof.advisory)))
      errors.push('selected primary CVE proof is absent from saved waivers');
  }
  return result(errors);
}

function nodeIndexProofs(data, target, semver, now) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length > 2000) fail('Node primary security index is malformed');
  const proofs = [];
  for (const [record, item] of Object.entries(data)) {
    if (!Array.isArray(item?.cve) || !item.cve.some(id => CVE.test(id))) continue;
    if (!semver.validRange(item.vulnerable ?? '')) {
      // Old records mentioning only other majors cannot affect supported Node 24.
      if (/\b24\b/.test(item.vulnerable ?? '')) fail('unsupported relevant Node affected range');
      continue;
    }
    if (!semver.satisfies(target.version, item.vulnerable)) continue;
    if (typeof item.patched !== 'string' || !semver.validRange(item.patched)) fail('unsupported relevant Node patched range');
    if (semver.satisfies(target.version, item.patched)) continue;
    const fixes = item.patched.split('||').map(branch => {
      if (!semver.intersects(branch.trim(), '>=24.0.0 <25.0.0')) return null;
      return semver.minVersion(`${branch.trim()} >=24.0.0 <25.0.0`)?.version;
    }).filter(value => version(value)).sort(compareStableVersions);
    const fixed = fixes[0];
    if (!fixed || compareStableVersions(fixed, target.version) <= 0) fail('relevant Node CVE has no exact supported fixed endpoint');
    for (const id of item.cve.filter(id => CVE.test(id))) proofs.push(proofFor(target, fixed, id,
      NODE_SECURITY_INDEX, item.vulnerable, now, `NSWG-COR-${record}`));
  }
  return proofs;
}

// Recognizes the project's actual Markdown format: a CVE heading, an explicit
// affected-major sentence in that section, and a Downloads release link. Never
// infer an affected range from free prose, an upcoming announcement or an AI.
function nodeBlogProofs(markdown, target, source, semver, now, coveredIds) {
  const fixes = [...markdown.matchAll(/\[Node\.js v(24\.\d+\.\d+)\]\(\/blog\/release\/v\1\/?\)/g)].map(match => match[1]);
  const sections = [...markdown.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^#{1,2} |$(?![\s\S]))/gm)];
  const proofs = [];
  for (const section of sections) {
    const ids = [...section[1].matchAll(/\bCVE-\d{4}-\d{4,}\b/g)].map(match => match[0]).filter(id => !coveredIds.has(id));
    if (!ids.length) continue;
    const sentences = section[2].replace(/\*\*/g, '').match(/This vulnerability affects[^\n]*(?:\n[^\n]+)?/g) ?? [];
    const relevant = sentences.some(line => /\b24\.x\b/.test(line));
    if (!relevant) continue;
    if (new Set(fixes).size !== 1) fail('relevant Node blog CVE has no unambiguous exact Node 24 fixed endpoint');
    const fixed = fixes[0];
    if (compareStableVersions(target.version, fixed) >= 0) continue;
    // A qualified subrange in prose must not become an invented all-major range.
    if (sentences.some(line => /(?:prior|before|since|through|introduced|\b24\.\d)/i.test(line)) ||
        !sentences.some(line => /This vulnerability affects (?:Node\.js|all users)/.test(line)))
      fail('unsupported relevant Node blog affected format');
    const range = `>=24.0.0 <${fixed}`;
    if (!affected(range, target.version, semver, source)) continue;
    for (const id of ids) proofs.push(proofFor(target, fixed, id, source, range, now, section[1]));
  }
  return proofs;
}

async function fetchNodeProofs(target, { fetchImpl, semver, now }) {
  const index = await boundedFetchJson(NODE_SECURITY_INDEX, { fetchImpl, allowedHosts: ['raw.githubusercontent.com'], maxBytes: 4 * 1024 * 1024 });
  const proofs = nodeIndexProofs(index.json, target, semver, now);
  const feed = await boundedFetch(NODE_SECURITY_FEED, { fetchImpl, allowedHosts: ['nodejs.org'], maxBytes: 512 * 1024 });
  if (!/<rss\b/.test(feed.text) || !/<\/channel>/.test(feed.text)) fail('Node primary vulnerability feed is malformed');
  const coveredIds = new Set(Object.values(index.json).flatMap(item => Array.isArray(item?.cve) ? item.cve : []));
  const items = [...feed.text.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const blogs = new Set();
  for (const [, item] of items) {
    const url = /<link>([^<]+)<\/link>/.exec(item)?.[1];
    const date = Date.parse(/<pubDate>([^<]+)<\/pubDate>/.exec(item)?.[1]);
    if (!Number.isFinite(date)) fail('Node vulnerability feed date is malformed');
    if (date < Date.parse('2025-05-06') || date > now) continue;
    const slug = /^https:\/\/nodejs\.org\/en\/blog\/vulnerability\/([a-z0-9-]+)\/?$/.exec(url ?? '')?.[1];
    if (!slug) fail('Node primary vulnerability feed has an unsupported URL');
    blogs.add(slug);
  }
  if (blogs.size > 32) fail('Node advisory fetch bound exceeded');
  for (const slug of blogs) {
    const source = `${NODE_BLOG_ROOT}${slug}.md`;
    let response;
    try { response = await boundedFetch(source, { fetchImpl, allowedHosts: ['raw.githubusercontent.com'], maxBytes: 256 * 1024 }); }
    catch (error) {
      if (error.message !== 'upstream HTTP 404') throw error;
      // The official feed also publishes MDX (e.g. march-2026-hashdos).
      response = await boundedFetch(source.replace(/\.md$/, '.mdx'), { fetchImpl, allowedHosts: ['raw.githubusercontent.com'], maxBytes: 256 * 1024 });
    }
    proofs.push(...nodeBlogProofs(response.text, target, response.url, semver, now, coveredIds));
  }
  return proofs;
}

async function fetchActionProofs(target, { fetchImpl, semver, now, token }) {
  const proofs = [], headers = { accept: 'application/vnd.github+json' };
  let currentVerified = false;
  if (typeof token === 'string' && token) headers.authorization = `Bearer ${token}`;
  for (let page = 1; page <= 3; page++) {
    const source = `https://api.github.com/repos/${target.name}/security-advisories?state=published&per_page=100&page=${page}`;
    const response = await boundedFetchJson(source, { fetchImpl, headers, allowedHosts: ['api.github.com'], allowSearch: true, maxBytes: 2 * 1024 * 1024 });
    if (!Array.isArray(response.json) || response.json.length > 100) fail('Actions primary advisory list is malformed');
    for (const advisory of response.json) {
      if (advisory?.state !== 'published' || advisory.withdrawn_at || !CVE.test(advisory.cve_id ?? '')) continue;
      const rows = advisory.vulnerabilities?.filter(row => row?.package?.ecosystem === 'actions' && row.package.name === target.name) ?? [];
      for (const row of rows) {
        const range = row.vulnerable_version_range?.replace(/,/g, ' ');
        if (!affected(range, version(target.version), semver, target.name)) continue;
        if (!GHSA.test(advisory.ghsa_id ?? '') || advisory.url !== `https://api.github.com/repos/${target.name}/security-advisories/${advisory.ghsa_id}` ||
            !advisory.identifiers?.some(id => id.type === 'CVE' && id.value === advisory.cve_id)) fail('relevant Actions CVE identity is inconsistent');
        if (!currentVerified) {
          if (!/^[a-f0-9]{40}$/.test(target.sha ?? '') || await fetchActionCommitLive({ action: target.name, tag: target.version, fetchImpl, token }) !== target.sha)
            fail('current Actions version label does not match actual official pinned SHA');
          currentVerified = true;
        }
        const fixed = version(row.patched_versions);
        if (!fixed || compareStableVersions(fixed, version(target.version)) <= 0 || semver.satisfies(fixed, range))
          fail('relevant Actions CVE has no exact necessary fixed endpoint');
        // The fix must be exactly the exclusive upper endpoint of the affected
        // interval containing the current pin, not any later patched release.
        const branches = range.split('||').filter(branch => semver.satisfies(version(target.version), branch));
        if (!branches.length || branches.some(branch => !new RegExp(`<\\s*${fixed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(branch)))
          fail('Actions patched version is not the exact affected interval endpoint');
        proofs.push(proofFor(target, fixed, advisory.cve_id, advisory.url, range, now, advisory.ghsa_id));
      }
    }
    if (!/rel="next"/.test(response.headers?.get?.('link') ?? '')) return proofs;
  }
  fail('Actions advisory pagination bound exceeded');
}

/** `targets` are ACTUAL USED pins, not proposed updates. No upstream JSON input. */
export async function fetchPrimarySecurityProofs({ targets = [], fetchImpl = globalThis.fetch, token, semver, now = Date.now() } = {}) {
  requireSemver(semver);
  if (!Array.isArray(targets) || targets.length > 5 || !Number.isFinite(now)) fail('invalid used toolchain targets');
  const proofs = [], seen = new Set();
  for (const target of targets) {
    if (!target || seen.has(`${target.kind}:${target.name}`) || !version(target.version) ||
        !(target.kind === 'node' && target.name === 'node' && parseStableVersion(target.version)?.[0] === 24 ||
          target.kind === 'action' && ALLOWED_ACTIONS.includes(target.name))) fail('invalid actual used toolchain pin');
    seen.add(`${target.kind}:${target.name}`);
    proofs.push(...await (target.kind === 'node' ? fetchNodeProofs : fetchActionProofs)(target, { fetchImpl, token, semver, now }));
  }
  return proofs;
}
