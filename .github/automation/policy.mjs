/**
 * Trusted-parent integration contract (Node 24, no installation required).
 * All functions are pure and fail closed. Inputs MUST be read from Git objects,
 * authenticated CI artifacts and independent registry/advisory research, never
 * descriptions or allowlists supplied by the candidate agent. Run this policy
 * from the trusted base checkout, not candidate code. No verdict authenticates
 * its own provenance: the parent must verify artifact origin and Git SHAs.
 */
import { isDeepStrictEqual } from 'node:util';

export const DAY_MS = 86_400_000;
export const COOLDOWN_MS = 7 * DAY_MS;
export const MAX_EVIDENCE_AGE_MS = DAY_MS;
export const REQUIRED_CHECKS = Object.freeze(['policy', 'dependencies', 'audit', 'build', 'qa', 'live']);
const SHA = /^[a-f0-9]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PUBLISHED_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const result = (errors, extra = {}) => ({ ok: errors.length === 0, errors, ...extra });
export const isPackageName = name => typeof name === 'string' && NAME.test(name);

/** Strict stable numeric versions only; ranges belong to npm's bundled semver. */
export function parseStableVersion(version) {
  if (typeof version !== 'string' || !VERSION.test(version)) return null;
  const parts = version.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function compareStableVersions(a, b) {
  const left = parseStableVersion(a), right = parseStableVersion(b);
  if (!left || !right) throw new TypeError('Expected strict stable versions');
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  return 0;
}

/** Reject permissive Date.parse inputs, rollovers, missing zones and future dates. */
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  const [whole, fraction = ''] = value.slice(0, -1).split('.');
  const canonical = `${whole}.${fraction.padEnd(3, '0').slice(0, 3)}Z`;
  // Round sub-millisecond publication times up: never age a release early.
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? time + (/[1-9]/.test(fraction.slice(3)) ? 1 : 0) : NaN;
}

/** Invalid publication dates block even when an urgent fix is otherwise proven. */
export function publicationEligibility(publishedAt, now = Date.now()) {
  const published = timestamp(publishedAt);
  if (!Number.isFinite(now) || !Number.isFinite(published) || published > now)
    return result(['missing, invalid or future publication timestamp']);
  return { ok: now - published >= COOLDOWN_MS, errors: now - published >= COOLDOWN_MS ? [] : ['publication younger than seven days'], ageMs: now - published };
}

/** Infer the real package name from a canonical npm lock packages key. */
export function packageNameFromPath(path) {
  if (typeof path !== 'string' || !/^(?:node_modules\/(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*\/)*node_modules\/((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)$/.test(path)) return null;
  return path.slice(path.lastIndexOf('node_modules/') + 13);
}

function validIntegrity(integrity) {
  if (typeof integrity !== 'string') return false;
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(integrity);
  if (!match) return false;
  const digest = Buffer.from(match[2], 'base64');
  return digest.length === { sha256: 32, sha384: 48, sha512: 64 }[match[1]] && digest.toString('base64') === match[2];
}

/** Nearest enclosing package path for npm bundled entries (never root ''). */
export function enclosingPackagePath(path) {
  if (!packageNameFromPath(path)) return null;
  const index = path.lastIndexOf('/node_modules/');
  return index < 0 ? null : path.slice(0, index);
}

/**
 * Registry-only lock v3. Root '' is the sole non-package entry; no links/aliases.
 * Existing prerelease transitives are legitimate npm lock entries; DISCOVERY
 * still chooses stable releases only. Bundled entries may omit dist fields only
 * when nested below a registry package protected by its own integrity. Changed
 * bundle content is rejected separately by preflightLockUpdate (not verifiable
 * using the child's registry metadata).
 */
export function validateLockfile(lock) {
  const errors = [];
  if (!isRecord(lock) || lock.lockfileVersion !== 3 || !isRecord(lock.packages) || !isRecord(lock.packages['']))
    return result(['expected npm lockfile v3 with root packages entry']);
  if ('dependencies' in lock) errors.push('legacy dependency tree is not permitted');
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!isRecord(entry)) { errors.push(`invalid package entry: ${path}`); continue; }
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      if (entry[section] !== undefined && !isRecord(entry[section])) errors.push(`invalid ${section}: ${path}`);
      for (const [dependency, range] of Object.entries(isRecord(entry[section]) ? entry[section] : {})) {
        if (!isPackageName(dependency) || typeof range !== 'string' || /(?:npm:|git|https?:|file:|link:|workspace:|\/)/i.test(range))
          errors.push(`non-registry dependency specifier: ${path}:${dependency}`);
      }
    }
    if (path === '') continue;
    const name = packageNameFromPath(path);
    if (!name) { errors.push(`invalid package path: ${path}`); continue; }
    if (typeof entry.version !== 'string' || !PUBLISHED_VERSION.test(entry.version)) errors.push(`invalid published version: ${path}`);
    if ('link' in entry || ('name' in entry && entry.name !== name)) errors.push(`link or alias: ${path}`);
    let containerPath = enclosingPackagePath(path);
    while (containerPath && lock.packages[containerPath]?.inBundle === true) containerPath = enclosingPackagePath(containerPath);
    const container = containerPath && lock.packages[containerPath];
    const firstBundledName = containerPath && /^node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(path.slice(containerPath.length + 1))?.[1];
    const bundled = entry.inBundle === true && isRecord(container) && validIntegrity(container.integrity) && typeof container.resolved === 'string' &&
      Array.isArray(container.bundleDependencies) && container.bundleDependencies.includes(firstBundledName);
    if (entry.inBundle === true && !bundled) errors.push(`unanchored bundled entry: ${path}`);
    if (!(bundled && entry.integrity === undefined) && !validIntegrity(entry.integrity)) errors.push(`missing or invalid integrity: ${path}`);
    const expected = `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${entry.version}.tgz`;
    if (!(bundled && entry.resolved === undefined) && entry.resolved !== expected) errors.push(`noncanonical registry tarball: ${path}`);
  }
  return result(errors);
}

/** Every new or changed entry, including metadata/integrity-only edits, is checked. */
export function changedLockEntries(base, head) {
  if (!validateLockfile(base).ok || !validateLockfile(head).ok) throw new TypeError('Invalid lockfile');
  return Object.entries(head.packages).filter(([path, entry]) => {
    if (!path) return false;
    if (!isDeepStrictEqual(base.packages[path], entry)) return true;
    if (entry.inBundle === true) {
      let parent = enclosingPackagePath(path);
      while (parent) {
        if (!isDeepStrictEqual(base.packages[parent], head.packages[parent])) return true;
        parent = enclosingPackagePath(parent);
      }
    }
    return false;
  })
    .map(([path, entry]) => ({ path, name: packageNameFromPath(path), entry, previous: base.packages[path] ?? null }));
}

const dependencySpec = spec => typeof spec === 'string' ? /^(?:\^|~)?(\d+\.\d+\.\d+)$/.exec(spec)?.[1] : undefined;

/** Preserve all root metadata and dependency names; permit stable upgrades only. */
export function validatePackageUpgrade(base, head, { approvedNodePatch } = {}) {
  if (!isRecord(base) || !isRecord(head)) return result(['invalid package manifest']);
  const errors = [];
  const trustedNodePatch = approvedNodePatch;
  for (const key of new Set([...Object.keys(base), ...Object.keys(head)])) {
    if (['dependencies', 'devDependencies'].includes(key)) {
      const before = base[key], after = head[key];
      if (!isRecord(before) || !isRecord(after) || !isDeepStrictEqual(Object.keys(before).sort(), Object.keys(after).sort())) {
        errors.push(`dependency names changed in ${key}`); continue;
      }
      for (const name of Object.keys(before)) {
        const oldVersion = dependencySpec(before[name]), newVersion = dependencySpec(after[name]);
        if (!isPackageName(name) || !parseStableVersion(oldVersion) || !parseStableVersion(newVersion) ||
            compareStableVersions(newVersion, oldVersion) < 0 ||
            (before[name] !== after[name] && compareStableVersions(newVersion, oldVersion) === 0))
          errors.push(`not a dependency upgrade: ${name}`);
      }
    } else if (key === 'engines' && trustedNodePatch) {
      const patch = validateNodePatch(trustedNodePatch);
      if (!patch.ok || !isDeepStrictEqual(base.engines, { ...head.engines, node: trustedNodePatch.from }) || head.engines?.node !== trustedNodePatch.to)
        errors.push('invalid supported Node patch engine update');
    } else if (!isDeepStrictEqual(base[key], head[key])) errors.push(`protected manifest field: ${key}`);
  }
  return result(errors);
}

/** Trusted-parent supplied LTS support list, not a candidate-controlled assertion. */
export function validateNodePatch({ from, to, supportedLtsMajors } = {}) {
  const unwrap = value => typeof value === 'string' ? /^>=(\d+\.\d+\.\d+) <(\d+)$/.exec(value) : null;
  const a = unwrap(from), b = unwrap(to);
  const av = a && parseStableVersion(a[1]), bv = b && parseStableVersion(b[1]);
  return result(av && bv && Array.isArray(supportedLtsMajors) && supportedLtsMajors.includes(av[0]) && supportedLtsMajors.includes(bv[0]) &&
    av[0] === 24 && bv[0] === 24 && (bv[1] > av[1] || bv[1] === av[1] && bv[2] > av[2]) && Number(a[2]) === av[0] + 1 && a[2] === b[2]
    ? [] : ['expected an explicitly supported Node 24 LTS patch or minor upgrade']);
}

/**
 * Git-derived changes: {path,status:'M',addedLines,deletedLines,oldPath?}.
 * compatibilityPaths is an independently reviewed trusted-parent exact allowlist.
 * Agent changes can NEVER touch workflows, policy, tests or deployment settings.
 */
export function validateCandidateDiff(changes, { compatibilityPaths = [] } = {}) {
  if (!Array.isArray(changes) || !changes.length || !Array.isArray(compatibilityPaths)) return result(['missing candidate diff']);
  const errors = [], seen = new Set();
  let sourceFiles = 0, sourceLines = 0;
  for (const change of changes) {
    const path = change?.path;
    if (typeof path !== 'string' || seen.has(path) || change.status !== 'M' || (change.oldPath && change.oldPath !== path)) {
      errors.push('invalid, duplicate, renamed, added or deleted file'); continue;
    }
    seen.add(path);
    if (path === 'package.json' || path === 'package-lock.json') continue;
    if (!/^src\/(?:[\w-]+\/)*[\w.-]+\.(?:[cm]?[jt]sx?|css)$/.test(path) ||
        /(?:test|spec|qa|deploy|access|auth|permission|security|config|agent)/i.test(path) || !compatibilityPaths.includes(path)) {
      errors.push(`protected or unapproved file: ${path}`); continue;
    }
    if (![change.addedLines, change.deletedLines].every(n => Number.isSafeInteger(n) && n >= 0)) errors.push(`missing source diff counts: ${path}`);
    else sourceLines += change.addedLines + change.deletedLines;
    sourceFiles++;
  }
  if (sourceFiles > 5 || sourceLines > 120) errors.push('source compatibility diff exceeds five files / 120 changed lines');
  return result(errors);
}

/**
 * Separate trusted deterministic maintenance lane; NEVER whitelist these paths
 * through validateCandidateDiff. Parent retrieves approved immutable action SHAs
 * independently, calls this transformer, then compares exact resulting bytes.
 * Only existing uses lines for an explicit action allowlist can change.
 */
export function updateActionRefs(source, updates, allowedActions) {
  if (typeof source !== 'string' || !isRecord(updates) || !Array.isArray(allowedActions)) throw new TypeError('Invalid action pin plan');
  for (const [action, sha] of Object.entries(updates)) {
    if (!allowedActions.includes(action) || !/^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?$/.test(action) || !SHA.test(sha))
      throw new TypeError('Action must be allowlisted and pinned to an immutable SHA');
  }
  const found = new Set();
  let scalarIndent = null;
  const output = source.split('\n').map(line => {
    const indent = /^ */.exec(line)[0].length;
    if (scalarIndent !== null) {
      if (!line.trim() || indent > scalarIndent) return line;
      scalarIndent = null;
    }
    // Never rewrite a uses-like string inside a YAML block scalar (run/env/etc.).
    const scalar = /^( *)(-\s+)?[\w.-]+:\s*[|>](?:[-+]?[1-9]?|[1-9][-+]?)\s*(?:#.*)?\r?$/.exec(line);
    if (scalar) { scalarIndent = scalar[1].length + (scalar[2]?.length ?? 0); return line; }
    const match = /^( *(?:-\s+)?uses:\s*)([\w./-]+)@([\w.-]+)(\s*(?:#.*)?)$/.exec(line);
    if (!match || !Object.hasOwn(updates, match[2])) return line;
    found.add(match[2]);
    return `${match[1]}${match[2]}@${updates[match[2]]}${match[4]}`;
  }).join('\n');
  if (Object.keys(updates).some(action => !found.has(action))) throw new TypeError('Action reference not found');
  return output;
}

/** Deterministic .node-version/.nvmrc pin update; preserves only final newline. */
export function updateNodePin(source, to, supportedLtsMajors) {
  if (typeof source !== 'string' || !/^v?\d+\.\d+\.\d+\n?$/.test(source)) throw new TypeError('Expected exact Node pin');
  const from = source.trim().replace(/^v/, ''), next = parseStableVersion(to), prev = parseStableVersion(from);
  if (!prev || !next || !validateNodePatch({ from: `>=${from} <${prev[0] + 1}`, to: `>=${to} <${next[0] + 1}`, supportedLtsMajors }).ok)
    throw new TypeError('Unsupported Node patch');
  return `${source.startsWith('v') ? 'v' : ''}${to}${source.endsWith('\n') ? '\n' : ''}`;
}

/**
 * Artifact v1: {schemaVersion,baseSHA,headSHA,mainSHA,deploymentID,createdAt,
 * research: evidence, checks:{policy,dependencies,audit,build,qa,live: evidence}}.
 * Each evidence = {status:'pass',checkedAt,baseSHA,headSHA,deploymentID}.
 * Context comes from fresh Git/deployment reads. Recheck main and use an atomic
 * compare-and-swap promotion; this pure check cannot eliminate a later Git race.
 */
export function validatePromotionVerdict(verdict, context, now = Date.now()) {
  const errors = [];
  if (!isRecord(verdict) || !isRecord(context) || !Number.isFinite(now)) return result(['malformed verdict/context']);
  const { baseSHA, headSHA, deploymentID, currentMainSHA } = context;
  if (![baseSHA, headSHA, currentMainSHA].every(value => typeof value === 'string' && SHA.test(value)) || baseSHA === headSHA ||
      typeof deploymentID !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(deploymentID)) errors.push('invalid expected identity');
  if (verdict.schemaVersion !== 1 || verdict.baseSHA !== baseSHA || verdict.headSHA !== headSHA ||
      verdict.mainSHA !== baseSHA || currentMainSHA !== baseSHA || verdict.deploymentID !== deploymentID) errors.push('stale head, baseline, deployment or main race');
  const created = timestamp(verdict.createdAt);
  if (!Number.isFinite(created) || created > now || now - created > MAX_EVIDENCE_AGE_MS) errors.push('invalid or stale verdict time');
  for (const [name, evidence] of [['research', verdict.research], ...REQUIRED_CHECKS.map(name => [name, verdict.checks?.[name]])]) {
    if (!isRecord(evidence)) { errors.push(`missing evidence: ${name}`); continue; }
    const checked = timestamp(evidence.checkedAt);
    if (evidence.status !== 'pass' || evidence.baseSHA !== baseSHA || evidence.headSHA !== headSHA || evidence.deploymentID !== deploymentID ||
        !Number.isFinite(checked) || checked > now || checked > created || now - checked > MAX_EVIDENCE_AGE_MS) errors.push(`invalid or stale evidence: ${name}`);
  }
  return result(errors);
}
