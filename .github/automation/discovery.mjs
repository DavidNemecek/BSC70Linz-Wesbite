/** Trusted discovery only: registry/advisory data in, a manifest proposal out.
 * No installation, package imports, candidate scripts, Node or QA-tool updates.
 */
import { isDeepStrictEqual } from 'node:util';
import {
  changedLockEntries, compareStableVersions, isPackageName, parseStableVersion,
  publicationEligibility, packageNameFromPath, validatePackageUpgrade,
} from './policy.mjs';
import { chooseEligibleStable, validateCveFix } from './dependencies.mjs';

export function exactTargets(changes) {
  return [...new Map(changes.map(({ name, entry }) => [`${name}@${entry.version}`, { name, version: entry.version }])).values()];
}

function supported(manifest, toolchain) {
  if (!manifest || manifest.deprecated || !parseStableVersion(manifest.version)) return false;
  return ['node', 'npm'].every(key => manifest.engines?.[key] === undefined ||
    (typeof manifest.engines[key] === 'string' && toolchain.semver.validRange(manifest.engines[key]) &&
      toolchain.semver.satisfies(toolchain[`${key}Version`], manifest.engines[key])));
}

/** The smallest endpoint fixing the used version in each independently fetched
 * CVE. With multiple CVEs take the greatest necessary endpoint. A later release
 * cannot borrow an earlier release's urgent exemption.
 */
export function necessaryCveFix({ name, fromVersion, advisories, semver, now }) {
  const fixes = [];
  for (const advisory of Object.values(advisories)) {
    const endpoints = [...new Set((advisory.affected ?? [])
      .filter(item => item?.package?.ecosystem === 'npm' && item.package.name === name)
      .flatMap(item => (item.ranges ?? []).flatMap(range => (range.events ?? []).map(event => event.fixed)))
      .filter(version => parseStableVersion(version)))];
    const fixed = endpoints.filter(toVersion => validateCveFix({ name, fromVersion, toVersion, advisory, semver, now }).ok)
      .sort(compareStableVersions)[0];
    if (fixed) fixes.push({ version: fixed, advisoryId: advisory.id });
  }
  return fixes.sort((a, b) => compareStableVersions(b.version, a.version))[0] ?? null;
}

/** Majors are intentional. Only root application dependencies are discovered;
 * the independent .github/qa toolchain and trusted automation are never touched.
 * Resolve the returned manifest in a secretless lock-only worker, then inspect
 * EVERY resulting lock entry with preflightLockUpdate before validation.
 */
export function discoverDependencyUpdates({ manifest, lock, metadata, advisories = {}, securityOnly = false, now = Date.now(), ...toolchain }) {
  const next = structuredClone(manifest), selections = [];
  for (const section of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {}).sort()) {
      if (!isPackageName(name)) throw Error('Invalid direct package name');
      const currentVersion = lock.packages?.[`node_modules/${name}`]?.version;
      if (!parseStableVersion(currentVersion)) throw Error('Direct dependency must resolve to a stable version');
      const packument = metadata[name];
      let version = chooseEligibleStable(packument, { currentVersion, now, ...toolchain });
      const fix = necessaryCveFix({ name, fromVersion: currentVersion, advisories, semver: toolchain.semver, now });
      if (securityOnly && !fix) continue;
      if (fix) {
        const release = packument?.versions?.[fix.version];
        const age = publicationEligibility(packument?.time?.[fix.version], now);
        if (!release || release.name !== name || !supported(release, toolchain) || !Number.isFinite(age.ageMs))
          throw Error('Necessary CVE fix is not a verified compatible registry release');
        // Pin the exact necessary release, even when an ordinary newer release
        // exists. This avoids broadening the urgent change to unrelated updates.
        version = fix.version;
      }
      if (version) {
        next[section][name] = version;
        selections.push({ name, fromVersion: currentVersion, version,
          ...(fix ? { advisoryId: fix.advisoryId, urgent: !publicationEligibility(packument.time[version], now).ok } : {}) });
      }
    }
  }
  const policy = validatePackageUpgrade(manifest, next);
  if (!policy.ok) throw Error(`Discovery violated manifest policy: ${policy.errors.join('; ')}`);
  return { manifest: next, selections, changed: !isDeepStrictEqual(manifest, next) };
}

/** Proofs select independently fetched records; the whole-lock policy validates
 * them again. No proof is issued for an unrelated young transitive release.
 */
export function deriveCveProofs({ baseLock, headLock, metadata, advisories, now = Date.now(), semver }) {
  const proofs = [];
  for (const change of changedLockEntries(baseLock, headLock)) {
    if (publicationEligibility(metadata[change.name]?.time?.[change.entry.version], now).ok) continue;
    const origins = Object.entries(baseLock.packages).filter(([path]) => path && packageNameFromPath(path) === change.name);
    for (const [fromPath, previous] of origins) {
      const fix = necessaryCveFix({ name: change.name, fromVersion: previous.version, advisories, semver, now });
      if (fix?.version === change.entry.version) {
        proofs.push({ path: change.path, fromPath, advisoryId: fix.advisoryId });
        break;
      }
    }
  }
  return proofs;
}
