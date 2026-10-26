/**
 * Trusted maintenance adapter.
 *
 * This module is an integration boundary around toolchain.mjs.  It only reads
 * an authenticated base snapshot and official upstream metadata; it never
 * invokes Git, npm, a candidate checkout, or a shell.  The returned file list
 * is the complete deterministic byte plan a controller may pass to its
 * candidate writer.  A controller must call assertCandidateBytes with complete
 * base/head snapshots immediately before accepting a candidate.
 */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  ACTION_API_URL, ALLOWED_ACTIONS, NODE_DIST_URL, NODE_INDEX_URL,
  SUPPORTED_NODE_LTS_MAJORS, boundedFetch, boundedFetchJson,
  discoverActionRelease, discoverActionReleaseLive, discoverNodeRelease, discoverWorkflowActionRefs,
  generateToolchainPlan, researchToolchainTargets, validateResearchResults,
  validateToolPlan,
} from './toolchain.mjs';
import {
  compareStableVersions, isRecord, parseStableVersion,
  publicationEligibility, result, timestamp,
} from './policy.mjs';

export { ALLOWED_ACTIONS } from './toolchain.mjs';

export const MAINTENANCE_SCHEMA_VERSION = 1;
export const TRUSTED_BASE_PATHS = Object.freeze([
  '.nvmrc',
  'package.json',
  'package-lock.json',
  '.github/automation/dependency-sandbox.mjs',
  '.github/qa/.nvmrc',
]);
export const NODE_COORDINATED_PATHS = Object.freeze([
  '.nvmrc', 'package.json', 'package-lock.json', '.github/automation/dependency-sandbox.mjs',
]);
export const QA_NODE_PATH = '.github/qa/.nvmrc';
const WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SAFE_PATH = /^(?:[\w.-]+\/)*[\w.-]+$/;
const ROOT = '.github/automation/dependency-sandbox.mjs';
const OFFICIAL_NODE = new Set(['nodejs.org']);
const OFFICIAL_ACTIONS = new Set(['github.com', 'api.github.com']);

const fail = message => { throw new TypeError(message); };
const sha256 = value => createHash('sha256').update(value).digest('hex');
const asText = (value, label) => typeof value === 'string' ? value : fail(`${label} must be text`);
const mapFiles = files => {
  const entries = files instanceof Map ? [...files.entries()] : Array.isArray(files)
    ? files.map(file => [file?.path, file?.content]) : isRecord(files) ? Object.entries(files) : null;
  if (!entries) fail('files must be a Map, file list or object');
  const map = new Map();
  for (const [path, content] of entries) {
    if (typeof path !== 'string' || !SAFE_PATH.test(path) || path.includes('..') || map.has(path)) fail('invalid or duplicate trusted file path');
    map.set(path, asText(content, path));
  }
  return map;
};
const sortedFiles = map => [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
const copyMap = map => new Map(sortedFiles(map));
const exactVersion = value => typeof value === 'string' && VERSION.test(value) ? value : null;

function requireBaseFiles(files) {
  const map = mapFiles(files);
  for (const path of TRUSTED_BASE_PATHS) if (!map.has(path)) fail(`trusted base file is missing: ${path}`);
  if (![...map.keys()].some(path => WORKFLOW.test(path))) fail('trusted base has no workflow files');
  for (const path of map.keys()) if (WORKFLOW.test(path) && path.split('/').length !== 3) fail(`invalid workflow path: ${path}`);
  return map;
}

/** Snapshot trusted bytes through an injected, authenticated file reader. */
export async function snapshotTrustedBase({ fetchFiles, paths = TRUSTED_BASE_PATHS } = {}) {
  if (typeof fetchFiles !== 'function') fail('fetchFiles callback is required');
  if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string' || !SAFE_PATH.test(path)))
    fail('invalid trusted snapshot path list');
  // The callback receives only paths.  Tokens, environment objects and PR data
  // are deliberately not passed to prevent provider secrets leaking into it.
  const supplied = await fetchFiles([...new Set(paths)]);
  const files = requireBaseFiles(supplied);
  const workflows = [...files.keys()].filter(path => WORKFLOW.test(path));
  if (!workflows.length) fail('trusted snapshot has no workflows');
  return Object.freeze({ files: copyMap(files), paths: [...files.keys()].sort() });
}

function rootEngine(source, path) {
  let parsed;
  try { parsed = JSON.parse(source); } catch { fail(`${path} is not valid JSON`); }
  const value = parsed?.engines?.node;
  if (typeof value !== 'string') fail(`${path} has no root Node engine`);
  const match = /^>=(\d+\.\d+\.\d+) <(\d+)$/.exec(value);
  if (!match || !parseStableVersion(match[1])) fail(`${path} has an unsupported Node engine`);
  return { parsed, value, minimum: match[1], major: Number(match[2]) };
}

function lockRootEngine(source) {
  let parsed;
  try { parsed = JSON.parse(source); } catch { fail('package-lock.json is not valid JSON'); }
  const value = parsed?.packages?.['']?.engines?.node;
  if (typeof value !== 'string') fail('package-lock.json has no root Node engine');
  const match = /^>=(\d+\.\d+\.\d+) <(\d+)$/.exec(value);
  if (!match || !parseStableVersion(match[1])) fail('package-lock.json has an unsupported Node engine');
  return { parsed, value, minimum: match[1], major: Number(match[2]) };
}

function rewriteJsonRootEngine(source, path, from, to) {
  const current = path === 'package.json' ? rootEngine(source, path) : lockRootEngine(source);
  const expected = `>=${from} <25`;
  if (current.value !== expected || current.major !== 25) fail(`${path} Node engine is not coordinated with .nvmrc`);
  const next = `>=${to} <25`;
  if (path === 'package.json') {
    const match = /("engines"\s*:\s*\{\s*"node"\s*:\s*")([^"\r\n]+)(")/.exec(source);
    if (!match || match[2] !== expected) fail(`could not locate exact root engine bytes in ${path}`);
    return source.slice(0, match.index) + match[1] + next + match[3] + source.slice(match.index + match[0].length);
  }
  const packages = /("packages"\s*:\s*\{)/.exec(source);
  if (!packages) fail('package-lock.json packages root is missing');
  const rootStart = packages.index + packages[0].length;
  const boundary = source.indexOf('\n    "node_modules/', rootStart);
  const rootEnd = boundary < 0 ? source.length : boundary;
  const prefix = source.slice(rootStart, rootEnd);
  const match = /("engines"\s*:\s*\{\s*"node"\s*:\s*")([^"\r\n]+)(")/.exec(prefix);
  if (!match || match[2] !== expected) fail('could not locate exact root lock engine bytes');
  const offset = rootStart + match.index;
  return source.slice(0, offset) + match[1] + next + match[3] + source.slice(offset + match[0].length);
}

function rewriteSandboxNode(source, from, to) {
  const pattern = /(export\s+const\s+NODE_VERSION\s*=\s*['"])(\d+\.\d+\.\d+)(['"]\s*;)/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || matches[0][2] !== from) fail('sandbox Node constant is not a unique coordinated pin');
  const match = matches[0];
  return source.slice(0, match.index) + match[1] + to + match[3] + source.slice(match.index + match[0].length);
}

function coordinateNodeFiles(baseFiles, toolPlan) {
  const base = requireBaseFiles(baseFiles), node = toolPlan.nodePlan;
  const from = exactVersion(node?.from), to = exactVersion(node?.to);
  if (!from || !to || node.changed !== (from !== to)) fail('malformed trusted Node plan');
  const qaPin = base.get(QA_NODE_PATH).trim().replace(/^v/, '');
  if (!exactVersion(qaPin)) fail('QA Node pin is invalid');
  const packageMeta = rootEngine(base.get('package.json'), 'package.json');
  const lockMeta = lockRootEngine(base.get('package-lock.json'));
  if (packageMeta.minimum !== from || lockMeta.minimum !== from || packageMeta.major !== 25 || lockMeta.major !== 25)
    fail('Node pin is not coordinated across package and lock root engines');
  const output = new Map((toolPlan.files ?? []).map(file => [file.path, file.content]));
  if (!node.changed) {
    if (output.has('.nvmrc') || output.has('package.json') || output.has('package-lock.json') || output.has(ROOT)) fail('unchanged Node plan changed coordinated bytes');
    return output;
  }
  if (compareStableVersions(to, from) <= 0 || parseStableVersion(to)[0] !== 24 || parseStableVersion(from)[0] !== 24)
    fail('Node plan is not a strictly newer Node 24 patch or LTS minor');
  const nvm = output.get('.nvmrc');
  if (nvm !== base.get('.nvmrc').replace(from, to)) fail('toolchain did not produce the exact Node pin bytes');
  output.set('package.json', rewriteJsonRootEngine(base.get('package.json'), 'package.json', from, to));
  output.set('package-lock.json', rewriteJsonRootEngine(base.get('package-lock.json'), 'package-lock.json', from, to));
  output.set(ROOT, rewriteSandboxNode(base.get(ROOT), from, to));
  if (output.has(QA_NODE_PATH)) fail('QA Node pin cannot be part of a toolchain candidate');
  return output;
}

function officialSource(target, source) {
  try {
    const url = new URL(source);
    if (target.kind === 'node') return url.protocol === 'https:' && OFFICIAL_NODE.has(url.hostname);
    return url.protocol === 'https:' && OFFICIAL_ACTIONS.has(url.hostname) &&
      (url.hostname === 'api.github.com' ? url.pathname.startsWith('/repos/') || url.pathname.startsWith('/advisories') : url.pathname.startsWith(`/${target.name}/`));
  } catch { return false; }
}

function advisoryFirstFix(advisory) {
  return advisory?.firstFixedVersion ?? advisory?.firstFixedLine ?? advisory?.fixedVersion;
}

/** Validate one independent urgent CVE exception; AI output cannot satisfy it. */
export function validateCveWaivers(waivers, { targets = [], now = Date.now() } = {}) {
  const errors = [];
  if (!Array.isArray(waivers)) return result(['CVE waivers must be an array']);
  const targetKeys = new Set(targets.map(target => `${target.kind}:${target.name}@${target.version}`));
  const seen = new Set();
  for (const waiver of waivers) {
    const target = waiver?.target, key = target && `${target.kind}:${target.name}@${target.version}`;
    if (!targetKeys.has(key) || seen.has(key)) { errors.push('CVE waiver target is missing, unknown or duplicated'); continue; }
    seen.add(key);
    const advisory = waiver.advisory;
    const fixed = advisoryFirstFix(advisory);
    const fetched = timestamp(waiver.fetchedAt ?? advisory?.fetchedAt);
    const source = advisory?.source ?? waiver.source;
    const normalizedFixed = typeof fixed === 'string' ? fixed.replace(/^v/, '') : null;
    const normalizedTarget = typeof target.version === 'string' ? target.version.replace(/^v/, '') : null;
    if (waiver.scope || waiver.blanket === true) errors.push(`blanket CVE waiver rejected: ${key}`);
    if (!isRecord(advisory) || typeof advisory.id !== 'string' || !advisory.id.trim() ||
        waiver.independent !== true || typeof waiver.fromVersion !== 'string' || waiver.fromVersion === target.version ||
        typeof fixed !== 'string' || !exactVersion(normalizedFixed) && target.kind === 'node' ||
        typeof advisory.affectedRange !== 'string' || !advisory.affectedRange.trim() ||
        !officialSource(target, source) || !Number.isFinite(fetched) || fetched > now || normalizedFixed !== normalizedTarget) {
      errors.push(`independent exact CVE metadata is incomplete: ${key}`); continue;
    }
    if (target.kind === 'action' && !Array.isArray(advisory.aliases)) errors.push(`Actions advisory aliases are missing: ${key}`);
    if (target.kind === 'action' && !advisory.aliases.some(alias => /^CVE-\d{4}-\d{4,}$/i.test(alias))) errors.push(`Actions advisory has no CVE alias: ${key}`);
    if (advisory.firstFixedVersion && advisory.firstFixedVersion !== target.version && advisory.firstFixedVersion !== `v${target.version}`)
      errors.push(`CVE first fix does not exactly match target: ${key}`);
    if (advisory.package && advisory.package !== target.name) errors.push(`CVE package does not match target: ${key}`);
  }
  return result(errors, { covered: [...seen].sort() });
}

/** Fetch independent GHSA records for Actions. Node advisories are supplied by
 * the Node security metadata adapter because Node's public index has no CVE
 * range field; an absent adapter deliberately blocks an urgent exception. */
export async function fetchOfficialSecurityMetadata({ targets = [], fetchImpl, token } = {}) {
  const output = [];
  for (const target of targets) {
    if (target.kind !== 'action') continue;
    const headers = { accept: 'application/vnd.github+json' };
    if (typeof token === 'string' && token) headers.authorization = `Bearer ${token}`;
    const url = `https://api.github.com/advisories?ecosystem=actions&affects=${encodeURIComponent(target.name)}%40${encodeURIComponent(target.version)}&per_page=100`;
    const response = await boundedFetchJson(url, { fetchImpl, headers, allowedHosts: ['api.github.com'], maxBytes: 2 * 1024 * 1024 });
    if (!Array.isArray(response.json)) fail(`GitHub advisory response for ${target.name} is malformed`);
    output.push({ target, source: url, advisories: response.json });
  }
  return output;
}

async function fetchNodeMetadata({ currentVersion, now, fetchImpl }) {
  const indexResponse = await boundedFetchJson(NODE_INDEX_URL, { fetchImpl, allowedHosts: ['nodejs.org'] });
  if (!Array.isArray(indexResponse.json)) fail('Node release index is malformed');
  const current = parseStableVersion(currentVersion);
  const eligible = indexResponse.json.filter(item => {
    const version = String(item?.version ?? '').replace(/^v/, '');
    const parsed = parseStableVersion(version);
    return parsed && current && parsed[0] === 24 && (item.lts === true || typeof item.lts === 'string') && publicationEligibility(item.date, now).ok;
  }).sort((a, b) => compareStableVersions(String(b.version).replace(/^v/, ''), String(a.version).replace(/^v/, '')));
  const latest = eligible[0], version = latest && String(latest.version).replace(/^v/, '');
  if (!version) return { index: indexResponse.json, shasums: '', shasumsSignature: '', source: NODE_INDEX_URL };
  const prefix = NODE_DIST_URL(version);
  const [shasums, signature] = await Promise.all([
    boundedFetch(`${prefix}SHASUMS256.txt`, { fetchImpl, allowedHosts: ['nodejs.org'] }),
    boundedFetch(`${prefix}SHASUMS256.txt.sig`, { fetchImpl, allowedHosts: ['nodejs.org'] }),
  ]);
  if (!signature.bytes.length) fail('Node SHASUMS signature is empty; refusing unsigned checksum metadata');
  return { index: indexResponse.json, shasums: shasums.text, shasumsSignature: signature.text, source: NODE_INDEX_URL,
    signatureSource: `${prefix}SHASUMS256.txt.sig` };
}

/** Fetch current release metadata and resolve each selected action tag to SHA. */
export async function fetchTrustedToolchainMetadata({ baseFiles, now = Date.now(), fetchImpl = globalThis.fetch, token } = {}) {
  const base = requireBaseFiles(baseFiles), current = base.get('.nvmrc').trim().replace(/^v/, '');
  if (!exactVersion(current) || parseStableVersion(current)[0] !== 24) fail('trusted .nvmrc is not Node 24');
  const node = await fetchNodeMetadata({ currentVersion: current, now, fetchImpl });
  const refs = discoverWorkflowActionRefs(base), actions = [...new Set(refs.map(ref => ref.action))].sort();
  if (actions.some(action => !ALLOWED_ACTIONS.includes(action))) fail('workflow action is outside the trusted four-repository allowlist');
  const actionReleases = {}, actionCommits = {}, sources = [node.source];
  for (const action of actions) {
    const release = await discoverActionReleaseLive({ action, fetchImpl, token, now });
    actionReleases[action] = [release];
    actionCommits[action] = release.selectedSha;
    sources.push(release.source, release.releaseUrl);
  }
  return Object.freeze({ nodeIndex: node.index, shasums: node.shasums, shasumsSignature: node.shasumsSignature,
    actionReleases, actionCommits, sources: sources.filter(Boolean), fetchedAt: new Date(now).toISOString() });
}

function targetsForToolPlan(toolPlan) {
  return (toolPlan.releases ?? []).map(release => release.kind === 'node'
    ? { kind: 'node', name: 'node', version: release.to }
    : { kind: 'action', name: release.action, version: release.tag });
}

function deriveTargets(base, upstream, now, supportedLtsMajors) {
  const current = base.get('.nvmrc').trim().replace(/^v/, '');
  const node = discoverNodeRelease({ currentVersion: current, now, index: upstream.nodeIndex,
    shasums: upstream.shasums, shasumsSignature: upstream.shasumsSignature, supportedLtsMajors, allowMinor: true });
  const refs = discoverWorkflowActionRefs(base);
  const actions = [...new Set(refs.map(ref => ref.action))].sort();
  const releases = actions.map(action => {
    const refsForAction = refs.filter(ref => ref.action === action);
    const currentSha = [...new Set(refsForAction.map(ref => ref.ref))];
    const currentTag = [...new Set(refsForAction.map(ref => ref.commentTag))];
    if (currentSha.length !== 1 || currentTag.length !== 1 || !currentTag[0]) fail(`ambiguous current action pin: ${action}`);
    const supplied = upstream.actionReleases?.[action];
    const selected = Array.isArray(supplied) ? supplied : supplied?.releases ?? supplied;
    const release = discoverActionRelease({ action, releases: selected, now,
      commitSha: upstream.actionCommits?.[action], currentTag: currentTag[0], currentSha: currentSha[0] });
    return { kind: 'action', name: action, version: release.tag };
  });
  return [{ kind: 'node', name: 'node', version: node.to }, ...releases];
}

function planChanges(base, files) {
  const output = [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, content]) => ({
    path, content, fromSHA256: sha256(Buffer.from(base.get(path) ?? '')), toSHA256: sha256(Buffer.from(content)),
  }));
  if (output.some(file => file.fromSHA256 === file.toSHA256)) fail('maintenance plan contains an unchanged file');
  return output;
}

/** Construct the complete deterministic maintenance contract. */
export async function createMaintenancePlan({ baseFiles, fetchFiles, metadata, now = Date.now(), ai, researchresults,
  security = [], token, fetchImpl = globalThis.fetch, supportedLtsMajors = SUPPORTED_NODE_LTS_MAJORS } = {}) {
  const snapshot = baseFiles ? { files: copyMap(requireBaseFiles(baseFiles)) } : await snapshotTrustedBase({ fetchFiles });
  const base = snapshot.files;
  const upstream = metadata ?? await fetchTrustedToolchainMetadata({ baseFiles: base, now, fetchImpl, token });
  const targets = deriveTargets(base, upstream, now, supportedLtsMajors);
  const research = researchresults ?? (ai ? await researchToolchainTargets({ targets, ai }) : null);
  const researchCheck = validateResearchResults(research?.results ?? research, targets);
  if (!researchCheck.ok) fail(`exact toolchain research is incomplete: ${researchCheck.errors.join('; ')}`);
  // Re-run the generator with the exact research object so metadata cannot be
  // replaced between target discovery and deterministic byte generation.
  const toolPlan = generateToolchainPlan({ baseFiles: base, now, ...upstream, supportedLtsMajors, allowNodeMinor: true, researchresults: research?.results ?? research });
  const coordinated = coordinateNodeFiles(base, toolPlan);
  const waivers = Array.isArray(security) ? security : security?.waivers;
  const waiverCheck = validateCveWaivers(waivers ?? [], { targets, now });
  if (!waiverCheck.ok) fail(`unsupported or unproven urgent CVE exception: ${waiverCheck.errors.join('; ')}`);
  const files = planChanges(base, coordinated);
  const plan = {
    schemaVersion: MAINTENANCE_SCHEMA_VERSION,
    generatedAt: new Date(now).toISOString(),
    baseFiles: Object.fromEntries(sortedFiles(base).map(([path, content]) => [path, sha256(Buffer.from(content))])),
    files,
    changes: files.map(({ path, fromSHA256, toSHA256 }) => ({ path, fromSHA256, toSHA256 })),
    targetNodeVersion: toolPlan.nodePlan?.to,
    nodeVersion: toolPlan.nodePlan?.to,
    expectedNodeBytes: Object.fromEntries(files.filter(file => NODE_COORDINATED_PATHS.includes(file.path)).map(file => [file.path, file.content])),
    toolchainPlan: toolPlan,
    research: { targets, results: research?.results ?? research, researchedAt: research?.researchedAt ?? new Date(now).toISOString() },
    evidenceTimes: { metadata: upstream.fetchedAt ?? new Date(now).toISOString(), research: research?.researchedAt ?? new Date(now).toISOString() },
    waivers: waivers ?? [],
    trustedPaths: [...files].map(file => file.path),
    integration: {
      candidateNode: toolPlan.nodePlan?.to ?? toolPlan.nodePlan?.from,
      workerUsesOldTrustedNodeUntilPromotion: true,
      qaNodePin: base.get(QA_NODE_PATH).trim(),
      workflowBytesAreGeneratorOwned: true,
      candidateExecution: 'controller/adapter performs no candidate execution',
      checksum: toolPlan.nodePlan?.sha256 ?? null,
      checksumEvidence: toolPlan.nodePlan?.changed ? {
        shasums: toolPlan.nodePlan.shasumsUrl,
        signature: toolPlan.nodePlan.shasumsSignatureUrl,
        signedMetadataRequired: true,
        tarballDownloadedByAdapter: false,
        transportNote: 'setup-node official transport remains responsible for runtime download verification',
      } : null,
    },
  };
  const checked = validateMaintenancePlan(base, plan, { now, supportedLtsMajors });
  if (!checked.ok) fail(`maintenance plan failed deterministic validation: ${checked.errors.join('; ')}`);
  return Object.freeze(plan);
}

/** Validate a serialized maintenance contract without trusting its file bytes. */
export function validateMaintenancePlan(baseFiles, plan, { now = Date.now(), supportedLtsMajors = SUPPORTED_NODE_LTS_MAJORS } = {}) {
  const errors = [];
  let base;
  try { base = requireBaseFiles(baseFiles); } catch (error) { return result([error.message]); }
  if (!isRecord(plan) || plan.schemaVersion !== MAINTENANCE_SCHEMA_VERSION || !isRecord(plan.toolchainPlan)) return result(['malformed maintenance plan']);
  const generated = timestamp(plan.generatedAt);
  if (!Number.isFinite(generated) || generated > now) errors.push('invalid maintenance plan timestamp');
  const expectedBase = Object.fromEntries(sortedFiles(base).map(([path, content]) => [path, sha256(Buffer.from(content))]));
  if (!isDeepStrictEqual(plan.baseFiles, expectedBase)) errors.push('maintenance plan is bound to a different trusted base snapshot');
  if (plan.targetNodeVersion !== plan.toolchainPlan.nodePlan?.to || plan.nodeVersion !== plan.targetNodeVersion)
    errors.push('maintenance target Node version is not bound to the toolchain plan');
  if (plan.integration?.workflowBytesAreGeneratorOwned !== true || plan.integration?.workerUsesOldTrustedNodeUntilPromotion !== true ||
      plan.integration?.candidateExecution !== 'controller/adapter performs no candidate execution' ||
      plan.integration?.qaNodePin !== base.get(QA_NODE_PATH).trim()) errors.push('maintenance integration contract is not trusted');
  const toolCheck = validateToolPlan(base, plan.toolchainPlan, { now, supportedLtsMajors, allowNodeMinor: true });
  if (!toolCheck.ok) errors.push(...toolCheck.errors.map(error => `toolchain: ${error}`));
  const targets = targetsForToolPlan(plan.toolchainPlan);
  const research = plan.research?.results;
  const researchCheck = validateResearchResults(research, targets);
  if (!researchCheck.ok) errors.push(...researchCheck.errors);
  const waiverCheck = validateCveWaivers(plan.waivers, { targets, now });
  if (!waiverCheck.ok) errors.push(...waiverCheck.errors);
  let coordinated;
  try { coordinated = coordinateNodeFiles(base, plan.toolchainPlan); } catch (error) { errors.push(error.message); coordinated = new Map(); }
  let expected;
  try { expected = planChanges(base, coordinated); } catch (error) { errors.push(error.message); expected = []; }
  if (!isDeepStrictEqual(plan.files, expected)) errors.push('maintenance file bytes are not deterministic');
  const expectedNodeBytes = Object.fromEntries(expected.filter(file => NODE_COORDINATED_PATHS.includes(file.path)).map(file => [file.path, file.content]));
  if (!isDeepStrictEqual(plan.expectedNodeBytes, expectedNodeBytes)) errors.push('coordinated Node constant bytes are not exact');
  if (!isDeepStrictEqual(plan.changes, expected.map(({ path, fromSHA256, toSHA256 }) => ({ path, fromSHA256, toSHA256 })))) errors.push('maintenance change metadata is not exact');
  if (plan.trustedPaths?.some(path => path === QA_NODE_PATH || !NODE_COORDINATED_PATHS.includes(path) && !WORKFLOW.test(path))) errors.push('maintenance path is outside the trusted scope');
  return result(errors, { expectedFiles: expected });
}

/**
 * Exact byte gate for the parent controller.  `baseFiles` and `headFiles` are
 * complete authenticated snapshots; any omitted/added/hidden file is rejected.
 */
export function assertCandidateBytes(baseFiles, headFiles, plan) {
  const errors = [];
  let base, head;
  try { base = requireBaseFiles(baseFiles); head = requireBaseFiles(headFiles); }
  catch (error) { return result([error.message]); }
  const planCheck = validateMaintenancePlan(base, plan);
  if (!planCheck.ok) errors.push(...planCheck.errors.map(error => `plan: ${error}`));
  const expected = new Map((plan?.files ?? []).map(file => [file?.path, file?.content]));
  if (expected.size !== (plan?.files ?? []).length) errors.push('candidate plan has duplicate or malformed files');
  if (head.has(QA_NODE_PATH) && head.get(QA_NODE_PATH) !== base.get(QA_NODE_PATH)) errors.push('QA Node pin changed');
  const allPaths = new Set([...base.keys(), ...head.keys()]);
  for (const path of allPaths) {
    if (!base.has(path) || !head.has(path)) { errors.push(`candidate added or deleted trusted file: ${path}`); continue; }
    const before = base.get(path), after = head.get(path), planned = expected.get(path);
    if (planned === undefined) {
      if (before !== after) errors.push(`unplanned candidate byte change: ${path}`);
    } else if (after !== planned || before === after) errors.push(`candidate bytes do not exactly match plan: ${path}`);
  }
  for (const path of expected.keys()) if (!base.has(path) || !head.has(path)) errors.push(`planned file is absent: ${path}`);
  const allowed = path => NODE_COORDINATED_PATHS.includes(path) || WORKFLOW.test(path);
  for (const path of expected.keys()) {
    if (!allowed(path) || path === QA_NODE_PATH) errors.push(`candidate plan path is outside maintenance scope: ${path}`);
    if (WORKFLOW.test(path) && !base.has(path)) errors.push(`workflow is not from the trusted base: ${path}`);
  }
  return result([...new Set(errors)], { changes: [...expected.keys()].sort() });
}

export const planMaintenance = createMaintenancePlan;
export const validatePlan = validateMaintenancePlan;
export const assertCandidateDiff = assertCandidateBytes;

export default Object.freeze({
  snapshotTrustedBase,
  fetchTrustedToolchainMetadata,
  fetchOfficialSecurityMetadata,
  createMaintenancePlan,
  planMaintenance,
  validateMaintenancePlan,
  validatePlan,
  assertCandidateBytes,
  assertCandidateDiff,
  validateCveWaivers,
});

