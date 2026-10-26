/**
 * Dependency preflight for a trusted parent, never candidate-executed policy.
 * Fetch research in a secretless job; retain raw registry, OSV and npm audit JSON
 * as SHA-bound artifacts. At promotion verify trusted artifact provenance and
 * freshness using policy.mjs. Do not accept agent-written proofs as evidence:
 * proofs only select independently fetched source records to validate below.
 * No install/audit subprocesses run here. Parent runs auditCommandPlans in a
 * separate secretless sandbox and resolves candidates with npm normally, with
 * engine-strict, ignore-scripts and strict-peer-deps; NEVER --force or
 * --legacy-peer-deps. Discovery does not promise a resolvable dependency graph.
 * Required integration order: policy.validateCandidateDiff +
 * policy.validatePackageUpgrade, validateManifestLock, preflightLockUpdate,
 * both auditCommandPlans/inspectNpmAudit({scope,exitCode,lock:headLock}), then
 * policy.validatePromotionVerdict with fresh remote-main identity. Require all
 * ok flags AND explicit review of requiresLifecycleReview; never use one check
 * to substitute for another. Cache research at most 24h, bound to exact Git SHAs.
 * Sources: https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/
 * https://docs.npmjs.com/cli/v11/commands/npm-audit/
 * https://google.github.io/osv.dev/api/ and https://ossf.github.io/osv-schema/
 */
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  isRecord, isPackageName, result, parseStableVersion, compareStableVersions,
  publicationEligibility, timestamp, validateLockfile, changedLockEntries,
  packageNameFromPath, enclosingPackagePath, validatePackageUpgrade,
} from './policy.mjs';

/** Load ONLY the trusted runtime's existing npm-bundled semver; no dependency. */
export function loadNpmSemver(npmRoot = resolve(dirname(process.execPath), '../lib/node_modules/npm')) {
  if (!isAbsolute(npmRoot)) throw new TypeError('npmRoot must be an absolute trusted runtime path');
  const require = createRequire(import.meta.url);
  const root = realpathSync(npmRoot);
  const semver = require(resolve(root, 'node_modules/semver'));
  if (typeof semver.satisfies !== 'function' || typeof semver.validRange !== 'function') throw new TypeError('npm semver unavailable');
  return semver;
}

function validSemver(semver) {
  return semver && ['satisfies', 'validRange', 'valid', 'lt', 'gt', 'gte'].every(key => typeof semver[key] === 'function');
}

/** Bounded worker pool; errors propagate and no unbounded request fan-out. */
export async function mapConcurrent(items, worker, concurrency = 4) {
  if (!Array.isArray(items) || typeof worker !== 'function' || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new TypeError('Expected items and concurrency from 1 to 8');
  const output = new Array(items.length);
  let cursor = 0, failed = false;
  await Promise.all(Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (!failed) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await worker(items[index], index); }
      catch (error) { failed = true; throw error; }
    }
  }));
  return output;
}

async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 15_000, maxBytes = 32 * 1024 * 1024, body } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 64 * 1024 * 1024)
    throw new TypeError('Invalid network bounds');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', signal: controller.signal,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok || !response.body || !/application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get('content-type') ?? ''))
      throw new Error(`Research request failed (${response.status}): ${url}`);
    const reader = response.body.getReader(), chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error('Research response exceeds byte limit');
        chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel(); }
    const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!isRecord(json)) throw new TypeError('Research response must be a JSON object');
    return json;
  } finally { clearTimeout(timer); }
}

/** Full packuments include publication time; abbreviated metadata is insufficient. */
export async function fetchRegistryMetadata(names, { concurrency = 4, ...network } = {}) {
  if (!Array.isArray(names) || names.some(name => !isPackageName(name))) throw new TypeError('Invalid registry package name');
  const entries = await mapConcurrent([...new Set(names)], async name => {
    const metadata = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`, network);
    if (metadata.name !== name || !isRecord(metadata.versions) || !isRecord(metadata.time)) throw new TypeError(`Incomplete metadata: ${name}`);
    return [name, metadata];
  }, concurrency);
  return Object.fromEntries(entries);
}

/** Fetch a full source advisory independently; GHSA-only data is never a waiver. */
export async function fetchOsvAdvisory(id, network = {}) {
  if (typeof id !== 'string' || !/^(?:CVE-\d{4}-\d{4,}|GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4})$/.test(id))
    throw new TypeError('Expected CVE or GHSA advisory ID');
  const advisory = await fetchJson(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, network);
  if (advisory.id !== id || !Array.isArray(advisory.affected)) throw new TypeError('Advisory identity mismatch');
  return advisory;
}

/** Optional OSV scan of ALL unique locked versions, including development trees. */
export async function queryOsvLockfile(lock, { concurrency = 4, ...network } = {}) {
  if (!validateLockfile(lock).ok) throw new TypeError('Invalid lockfile');
  const packages = new Map();
  for (const [path, entry] of Object.entries(lock.packages)) if (path) packages.set(`${packageNameFromPath(path)}@${entry.version}`, { name: packageNameFromPath(path), version: entry.version });
  return mapConcurrent([...packages.values()], async ({ name, version }) => {
    const response = await fetchJson('https://api.osv.dev/v1/query', { ...network, body: { package: { ecosystem: 'npm', name }, version } });
    if (response.next_page_token || (response.vulns !== undefined && !Array.isArray(response.vulns))) throw new TypeError('Incomplete OSV response; pagination must be resolved');
    return { name, version, advisories: response.vulns ?? [] };
  }, concurrency);
}

function compatibleEngines(manifest, { nodeVersion, npmVersion, supportedLtsMajors, semver }) {
  const node = parseStableVersion(nodeVersion);
  if (!node || !parseStableVersion(npmVersion) || !Array.isArray(supportedLtsMajors) || !supportedLtsMajors.includes(node[0]) || !validSemver(semver)) return false;
  if (manifest.engines === undefined) return true;
  if (!isRecord(manifest.engines)) return false;
  for (const [name, version] of [['node', nodeVersion], ['npm', npmVersion]]) {
    const range = manifest.engines[name];
    if (range !== undefined && (typeof range !== 'string' || !semver.validRange(range) || !semver.satisfies(version, range))) return false;
  }
  return true;
}

/** Latest nondeprecated stable upgrade with valid age and supported LTS engines. */
export function chooseEligibleStable(metadata, { currentVersion, now = Date.now(), ...toolchain } = {}) {
  if (!isRecord(metadata) || !isRecord(metadata.versions) || !isRecord(metadata.time) || !parseStableVersion(currentVersion) || !Number.isFinite(now))
    throw new TypeError('Incomplete candidate research');
  return Object.keys(metadata.versions).filter(version => {
    const manifest = metadata.versions[version];
    return parseStableVersion(version) && compareStableVersions(version, currentVersion) > 0 &&
      isRecord(manifest) && manifest.version === version && !manifest.deprecated &&
      publicationEligibility(metadata.time[version], now).ok && compatibleEngines(manifest, toolchain);
  }).sort((a, b) => compareStableVersions(b, a))[0] ?? null;
}

/**
 * OSV source proof: confirmed CVE alias/id + npm SEMVER introduced/fixed chain.
 * Candidate MUST be the exact fixed version of the interval containing current.
 * No fixAvailable/critical/security labels, GHSA alone, or self-attested booleans.
 * Unsupported/ambiguous event forms fail closed; parent may seek better evidence.
 */
export function validateCveFix({ name, fromVersion, toVersion, advisory, semver, now = Date.now() } = {}) {
  const errors = [];
  if (!isPackageName(name) || !parseStableVersion(fromVersion) || !parseStableVersion(toVersion) ||
      compareStableVersions(toVersion, fromVersion) <= 0 || !validSemver(semver) || !isRecord(advisory)) return result(['invalid CVE fix inputs']);
  const ids = [advisory.id, ...(Array.isArray(advisory.aliases) ? advisory.aliases : [])];
  const cves = ids.filter(id => typeof id === 'string' && /^CVE-\d{4}-\d{4,}$/.test(id));
  if (typeof advisory.id !== 'string' || !/^(?:CVE-\d{4}-\d{4,}|GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4})$/.test(advisory.id) ||
      !cves.length || advisory.withdrawn !== undefined || !Number.isFinite(now) || !Number.isFinite(timestamp(advisory.modified)) || timestamp(advisory.modified) > now)
    errors.push('source does not confirm an active CVE');
  const affected = Array.isArray(advisory.affected) ? advisory.affected.filter(item => item?.package?.ecosystem === 'npm' && item.package.name === name) : [];
  if (!affected.length) errors.push('advisory does not identify this npm package');
  let fixesCurrent = false, targetAffected = false;
  for (const item of affected) {
    if (!Array.isArray(item.ranges) || !item.ranges.length) { errors.push('missing source fix chain'); continue; }
    if (item.versions !== undefined && !Array.isArray(item.versions)) errors.push('malformed affected versions');
    if (Array.isArray(item.versions) && item.versions.includes(toVersion)) targetAffected = true;
    for (const range of item.ranges) {
      if (range?.type !== 'SEMVER' || !Array.isArray(range.events) || !range.events.length) { errors.push('unsupported advisory range'); continue; }
      let introduced = null, previousFixed = null;
      for (const event of range.events) {
        if (!isRecord(event) || Object.keys(event).length !== 1) { errors.push('malformed advisory event'); continue; }
        if (Object.hasOwn(event, 'introduced')) {
          const start = event.introduced === '0' ? '0.0.0' : event.introduced;
          if (introduced !== null || !semver.valid(start) || (previousFixed && semver.lt(start, previousFixed))) { errors.push('invalid introduced event order'); continue; }
          introduced = start;
        } else if (Object.hasOwn(event, 'fixed')) {
          const fixed = event.fixed;
          if (introduced === null || !semver.valid(fixed) || !semver.gt(fixed, introduced)) { errors.push('invalid fixed event order'); continue; }
          const rangeText = `>=${introduced} <${fixed}`;
          if (semver.satisfies(fromVersion, rangeText) && fixed === toVersion) fixesCurrent = true;
          if (semver.satisfies(toVersion, rangeText)) targetAffected = true;
          previousFixed = fixed;
          introduced = null;
        } else errors.push('unsupported advisory event');
      }
      if (introduced !== null && semver.gte(toVersion, introduced)) targetAffected = true;
    }
  }
  if (!fixesCurrent || targetAffected) errors.push('current version is not in a source interval fixed exactly by target');
  return result(errors, { cves: [...new Set(cves)] });
}

/** Verify root manifest/lock consistency and every direct resolution, no guessing. */
export function validateManifestLock(manifest, lock, semver) {
  const errors = [];
  if (!isRecord(manifest) || !validateLockfile(lock).ok || !validSemver(semver)) return result(['invalid manifest, lock or semver']);
  const root = lock.packages[''];
  for (const key of ['name', 'version', 'engines', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'])
    if (!isDeepStrictEqual(manifest[key], root[key])) errors.push(`root manifest/lock mismatch: ${key}`);
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (manifest[section] !== undefined && !isRecord(manifest[section])) { errors.push(`invalid ${section}`); continue; }
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      const entry = lock.packages[`node_modules/${name}`];
      if (!isPackageName(name) || typeof range !== 'string' || !semver.validRange(range) || !entry || !semver.satisfies(entry.version, range))
        errors.push(`unresolved direct dependency: ${name}`);
    }
  }
  return result(errors);
}

/** Check npm-style nearest lock resolutions, including required peer ranges. */
export function validateLockResolutions(lock, semver) {
  if (!validateLockfile(lock).ok || !validSemver(semver)) return result(['invalid lock graph or semver']);
  const errors = [];
  const resolveDependency = (path, name) => {
    let current = path;
    while (true) {
      const entry = lock.packages[`${current ? `${current}/` : ''}node_modules/${name}`];
      if (entry) return entry;
      if (!current) return null;
      current = enclosingPackagePath(current) ?? '';
    }
  };
  for (const [path, entry] of Object.entries(lock.packages)) {
    const dependencies = { ...(entry.dependencies ?? {}), ...(entry.optionalDependencies ?? {}) };
    for (const [section, ranges] of [['dependencies', dependencies], ['peerDependencies', entry.peerDependencies ?? {}]]) {
      for (const [name, range] of Object.entries(ranges)) {
        const resolved = resolveDependency(path, name);
        const optional = section === 'dependencies' ? Object.hasOwn(entry.optionalDependencies ?? {}, name) : entry.peerDependenciesMeta?.[name]?.optional === true;
        if (typeof range !== 'string' || !semver.validRange(range) || (!resolved && !optional) || (resolved && !semver.satisfies(resolved.version, range)))
          errors.push(`unresolved or incompatible ${section}: ${path || '<root>'}:${name}`);
      }
    }
  }
  return result(errors);
}

/**
 * Whole-lock gate, including transitive, optional and platform-specific entries.
 * metadata/advisories are independently fetched maps keyed by name/advisory ID.
 * Proof selectors: [{path,fromPath,advisoryId}]. No batch exception exists.
 * Missing/bad/future dates block even CVE fixes; only valid recent dates waive.
 * lifecycleChanges require an explicit parent review before any install scripts.
 */
export function preflightLockUpdate({ baseLock, headLock, metadata, proofs = [], advisories = {}, now = Date.now(), ...toolchain } = {}) {
  const errors = [], lifecycleChanges = [], exemptions = [];
  for (const [label, lock] of [['base', baseLock], ['head', headLock]]) {
    const validation = validateLockfile(lock);
    errors.push(...validation.errors.map(error => `${label}: ${error}`));
  }
  if (errors.length) return result(errors, { lifecycleChanges, exemptions });
  if (!isRecord(metadata) || !isRecord(advisories) || !Array.isArray(proofs) || !Number.isFinite(now)) return result(['invalid research/proof input'], { lifecycleChanges, exemptions });
  for (const key of new Set([...Object.keys(baseLock), ...Object.keys(headLock)]))
    if (key !== 'packages' && !isDeepStrictEqual(baseLock[key], headLock[key])) errors.push(`protected lock metadata: ${key}`);
  errors.push(...validatePackageUpgrade(baseLock.packages[''], headLock.packages[''], { nodePatch: toolchain.nodePatch }).errors);
  errors.push(...validateLockResolutions(headLock, toolchain.semver).errors);
  const changes = changedLockEntries(baseLock, headLock);
  const changedPaths = new Set(changes.map(change => change.path));
  const proofPaths = new Set();
  for (const proof of proofs) {
    if (!isRecord(proof) || !changedPaths.has(proof.path) || proofPaths.has(proof.path)) errors.push('extraneous or duplicate urgent proof');
    else proofPaths.add(proof.path);
  }
  for (const { path, name, entry, previous } of changes) {
    if (entry.inBundle === true) {
      errors.push(`changed bundled content requires independent tarball inspection: ${path}`);
      lifecycleChanges.push({ path, name, version: entry.version, scripts: null, hasInstallScript: entry.hasInstallScript === true, unverifiedBundle: true });
      continue;
    }
    const packument = Object.hasOwn(metadata, name) ? metadata[name] : null;
    const manifest = packument?.versions?.[entry.version];
    const date = packument?.time?.[entry.version];
    if (packument?.name !== name || !isRecord(manifest) || manifest.version !== entry.version || manifest.name !== name) { errors.push(`missing registry version: ${path}`); continue; }
    if (manifest.dist?.integrity !== entry.integrity || manifest.dist?.tarball !== entry.resolved) errors.push(`registry artifact mismatch: ${path}`);
    if (previous?.version === entry.version && (previous.integrity !== entry.integrity || previous.resolved !== entry.resolved)) errors.push(`immutable package artifact changed: ${path}`);
    if (!compatibleEngines(manifest, toolchain)) errors.push(`unsupported LTS toolchain: ${path}`);
    const age = publicationEligibility(date, now);
    const proof = proofs.find(proof => proof?.path === path);
    let exemption = false;
    if (proof) {
      const before = baseLock.packages[proof.fromPath];
      const advisory = Object.hasOwn(advisories, proof.advisoryId) ? advisories[proof.advisoryId] : null;
      const validation = validateCveFix({ name, fromVersion: before?.version, toVersion: entry.version, advisory, semver: toolchain.semver, now });
      if (!before || packageNameFromPath(proof.fromPath) !== name || advisory?.id !== proof.advisoryId || !validation.ok)
        errors.push(`unproven CVE exemption: ${path}`);
      else { exemption = true; exemptions.push({ path, fromPath: proof.fromPath, fromVersion: before.version, toVersion: entry.version, advisoryId: proof.advisoryId, cves: validation.cves }); }
    }
    if (!age.ok && !(exemption && Number.isFinite(age.ageMs))) errors.push(`cooldown: ${path}: ${age.errors.join(', ')}`);
    const lifecycle = scripts => Object.fromEntries(['preinstall', 'install', 'postinstall', 'prepare'].filter(key => scripts?.[key] !== undefined).map(key => [key, scripts[key]]));
    const beforeManifest = previous && packument.versions?.[previous.version];
    const scripts = lifecycle(manifest.scripts), oldScripts = lifecycle(beforeManifest?.scripts);
    if (manifest.scripts !== undefined && !isRecord(manifest.scripts)) errors.push(`malformed registry scripts: ${path}`);
    if (Object.values(scripts).some(script => typeof script !== 'string')) errors.push(`malformed registry lifecycle scripts: ${path}`);
    if (Object.keys(scripts).length || entry.hasInstallScript)
      lifecycleChanges.push({ path, name, version: entry.version, scripts, previousScripts: oldScripts,
        newOrChanged: !previous || !isDeepStrictEqual(scripts, oldScripts) || !previous.hasInstallScript,
        hasInstallScript: entry.hasInstallScript === true });
  }
  return result(errors, { changedPaths: [...changedPaths], lifecycleChanges, requiresLifecycleReview: lifecycleChanges.length > 0, exemptions });
}

/**
 * Parent executes both plans in a separate secretless job. The all scope includes
 * direct/dev/prod/transitive/optional/peer dependencies; production is additional.
 * Invoke `node <trusted npmCliPath> ...args`, with sanitized env/config (no npm
 * tokens, user config or candidate .npmrc), protected lock and ignore-scripts.
 * npm audit exit 1 contains findings, not a successful clean audit.
 */
export function auditCommandPlans() {
  const common = ['audit', '--json', '--package-lock-only', '--ignore-scripts', '--registry=https://registry.npmjs.org', '--audit-level=low'];
  return [
    { scope: 'all', args: [...common, '--include=dev', '--include=optional', '--include=peer'] },
    { scope: 'production', args: [...common, '--omit=dev', '--include=optional', '--include=peer'] },
  ];
}

/**
 * npm audit JSON v2 parser. Findings at ANY severity block a clean audit gate.
 * Pass the protected lock to bind npm's package-lock-only dependency inventory.
 */
export function inspectNpmAudit(report, { scope = 'all', exitCode, lock } = {}) {
  if (!['all', 'production'].includes(scope) || ![0, 1].includes(exitCode) || !isRecord(report) || report.error || report.auditReportVersion !== 2 ||
      !isRecord(report.vulnerabilities) || !isRecord(report.metadata?.vulnerabilities) || !isRecord(report.metadata?.dependencies))
    return result(['malformed or failed npm audit'], { scope, findings: [] });
  const errors = [], findings = [], counts = report.metadata.vulnerabilities;
  const levels = ['info', 'low', 'moderate', 'high', 'critical'];
  if (!['prod', 'dev', 'optional', 'peer', 'peerOptional', 'total'].every(key => Number.isSafeInteger(report.metadata.dependencies[key]) && report.metadata.dependencies[key] >= 0))
    errors.push('malformed audit dependency counts');
  if (lock !== undefined && (!validateLockfile(lock).ok || report.metadata.dependencies.total !== Object.keys(lock.packages).length - 1))
    errors.push('audit dependency inventory does not match the protected lockfile');
  if (![...levels, 'total'].every(level => Number.isSafeInteger(counts[level]) && counts[level] >= 0) ||
      levels.reduce((total, level) => total + counts[level], 0) !== counts.total) errors.push('inconsistent audit totals');
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!isPackageName(name) || !isRecord(vulnerability) || vulnerability.name !== name || !levels.includes(vulnerability.severity) ||
        typeof vulnerability.isDirect !== 'boolean' || !Array.isArray(vulnerability.via) || !vulnerability.via.length ||
        !Array.isArray(vulnerability.nodes) || !vulnerability.nodes.length || vulnerability.nodes.some(path => !packageNameFromPath(path))) {
      errors.push(`malformed audit vulnerability: ${name}`); continue;
    }
    findings.push({ name, severity: vulnerability.severity, isDirect: vulnerability.isDirect, nodes: vulnerability.nodes,
      via: vulnerability.via, fixAvailable: vulnerability.fixAvailable });
  }
  if (Object.keys(report.vulnerabilities).length !== counts.total) errors.push('audit entries disagree with totals');
  if (findings.length || counts.total > 0 || exitCode !== 0) errors.push('npm audit reports vulnerabilities');
  return result(errors, { scope, findings });
}
