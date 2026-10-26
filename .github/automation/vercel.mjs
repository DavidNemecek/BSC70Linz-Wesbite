/**
 * Trusted-parent Vercel deployment helper.
 *
 * The API base is deliberately fixed to api.vercel.com. Project and team
 * selection can only come from the trusted workflow environment; callers do
 * not get to provide an arbitrary Vercel scope or endpoint.
 *
 * API references (checked 2026-10-26):
 * - GET /v7/deployments
 * - GET /v13/deployments/{idOrUrl}?withGitRepoInfo=true
 * - GET /v4/aliases/{idOrAlias}
 * - GET /v3/deployments/{idOrUrl}/events
 * - POST /v1/projects/{projectId}/rollback/{deploymentId}
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_BASE = 'https://api.vercel.com';
export const DEFAULT_PROJECT_ID = 'prj_RvCfba1ktsKLHQoaa8LtlLilt4Bu';
export const DEFAULT_TEAM_ID = 'team_uZCoZg2ttUoEZi7BeQtQt4m0';
export const DEFAULT_UPDATES_HOSTNAME = 'updates.dev.bsc70linz.at';
export const DEFAULT_PRODUCTION_HOSTNAME = 'www.bsc70linz.at';
export const NODE_LINE = 24;
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHA = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export class VercelError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'VercelError';
  }
}

export class VercelTimeoutError extends VercelError {
  constructor(message = 'Vercel deployment polling timed out') {
    super(message);
    this.name = 'VercelTimeoutError';
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function config(env = process.env) {
  const token = env.VERCEL_TOKEN;
  if (typeof token !== 'string' || token.length === 0) throw new VercelError('VERCEL_TOKEN is required');
  const projectId = env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID;
  const teamId = env.VERCEL_TEAM_ID || env.VERCEL_ORG_ID || DEFAULT_TEAM_ID;
  const updatesHostname = env.VERCEL_UPDATES_HOSTNAME || DEFAULT_UPDATES_HOSTNAME;
  const productionHostname = env.VERCEL_PRODUCTION_HOSTNAME || DEFAULT_PRODUCTION_HOSTNAME;
  if (!/^prj_[A-Za-z0-9]+$/.test(projectId) || !/^team_[A-Za-z0-9]+$/.test(teamId))
    throw new VercelError('Invalid trusted Vercel project configuration');
  for (const hostname of [updatesHostname, productionHostname])
    if (typeof hostname !== 'string' || !HOSTNAME.test(hostname)) throw new VercelError('Invalid trusted Vercel hostname configuration');
  return Object.freeze({ token, projectId, teamId, updatesHostname, productionHostname });
}

function optionsOf(options = {}) {
  if (!isObject(options)) throw new TypeError('options must be an object');
  const env = options.env ?? process.env;
  if (!isObject(env)) throw new TypeError('env must be an object');
  return { ...options, env, config: config(env), fetchImpl: options.fetchImpl ?? fetch };
}

function checkedSha(value, label = 'sha') {
  if (typeof value !== 'string' || !SHA.test(value)) throw new TypeError(`${label} must be a lowercase 40-character Git SHA`);
  return value;
}

function checkedId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function checkedHostname(value) {
  if (typeof value !== 'string' || !HOSTNAME.test(value)) throw new TypeError('hostname is invalid');
  return value.toLowerCase();
}

function pathPart(value) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

function queryString(entries) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) query.set(key, String(value));
  const text = query.toString();
  return text ? `?${text}` : '';
}

async function apiRequest(path, { method = 'GET', query = {}, body, fetchImpl, env, timeoutMs = 15_000, expectedStatuses } = {}) {
  const { token, teamId } = config(env);
  if (!path.startsWith('/') || path.includes('://')) throw new TypeError('API path must be relative');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new TypeError('Invalid API timeout');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl(`${API_BASE}${path}${queryString(query)}`, {
        method,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new VercelError('Vercel API request failed');
    }
    if (!response || !response.ok || (expectedStatuses && !expectedStatuses.includes(response.status)))
      throw new VercelError(`Vercel API request failed (${response?.status ?? 'no response'})`);
    let value;
    try { value = await response.json(); } catch { throw new VercelError('Vercel API returned invalid JSON'); }
    if (!isObject(value) && !Array.isArray(value)) throw new VercelError('Vercel API returned an invalid response');
    return value;
  } finally { clearTimeout(timer); }
}

function rawSha(raw) {
  const values = [raw?.gitSource?.sha, raw?.meta?.githubCommitSha, raw?.meta?.gitCommitSha, raw?.gitCommitSha];
  const present = values.filter(value => value !== undefined);
  if (!present.length || present.some(value => value !== present[0])) return null;
  return SHA.test(present[0]) ? present[0] : null;
}

function rawBranch(raw) {
  const values = [raw?.gitSource?.ref, raw?.gitSource?.branch, raw?.meta?.githubCommitRef, raw?.meta?.gitBranch, raw?.gitBranch]
    .filter(value => value !== undefined);
  if (!values.length || values.some(value => value !== values[0])) return null;
  return typeof values[0] === 'string' && values[0].length > 0 ? values[0] : null;
}

function deploymentInfo(raw, { nodeVersion } = {}) {
  if (!isObject(raw)) throw new VercelError('Vercel deployment identity is missing');
  const id = raw.id ?? raw.uid;
  const projectId = raw.projectId ?? raw.project?.id;
  const sha = rawSha(raw);
  const branch = rawBranch(raw);
  const readyState = raw.readyState ?? raw.state;
  const urlValue = raw.url ?? raw.deployment?.url;
  if (!ID.test(id) || typeof projectId !== 'string' || !SHA.test(sha) || typeof branch !== 'string' ||
      typeof readyState !== 'string' || typeof urlValue !== 'string') throw new VercelError('Vercel deployment identity is incomplete');
  const url = /^https?:\/\//i.test(urlValue) ? urlValue : `https://${urlValue}`;
  return Object.freeze({ id, sha, branch, url, readyState, projectId, ...(nodeVersion ? { nodeVersion } : {}) });
}

async function getDeployment(id, options) {
  const { config: cfg, fetchImpl, env } = optionsOf(options);
  const raw = await apiRequest(`/v13/deployments/${pathPart(checkedId(id, 'deploymentId'))}`, {
    query: { withGitRepoInfo: 'true', teamId: cfg.teamId }, fetchImpl, env,
  });
  const info = deploymentInfo(raw);
  if (info.projectId !== cfg.projectId) throw new VercelError('Vercel deployment belongs to another project');
  return { raw, info };
}

async function getAliases(hostname, options) {
  const { config: cfg, fetchImpl, env } = optionsOf(options);
  const raw = await apiRequest(`/v4/aliases/${pathPart(checkedHostname(hostname))}`, {
    query: { projectId: cfg.projectId, teamId: cfg.teamId }, fetchImpl, env,
  });
  if (raw.alias !== hostname.toLowerCase() || raw.projectId !== cfg.projectId || typeof raw.deploymentId !== 'string')
    throw new VercelError('Vercel alias identity mismatch');
  return raw;
}

function logTexts(raw) {
  const events = Array.isArray(raw) ? raw : Array.isArray(raw?.events) ? raw.events : null;
  if (!events) throw new VercelError('Vercel build logs are incomplete');
  return events.flatMap(event => [event?.text, event?.payload?.text, event?.payload?.info?.text].filter(value => typeof value === 'string'));
}

/** Return one unambiguous concrete Node version reported by Vercel build logs. */
export function parseNodeVersion(rawLogs) {
  const versions = new Set();
  for (const text of logTexts(rawLogs)) {
    // The application's build script emits `node --version` as a standalone line.
    const standalone = text.trim().match(/^v(24\.\d+\.\d+)$/);
    if (standalone) versions.add(standalone[1]);
    for (const match of text.matchAll(/(?:using\s+)?node(?:\.js)?(?:\s+version)?\s*(?:v|:)?\s*(\d+\.\d+\.\d+)/gi)) versions.add(match[1]);
    for (const match of text.matchAll(/\bnode\s+-v\s*(?:v)?(\d+\.\d+\.\d+)/gi)) versions.add(match[1]);
  }
  if (versions.size !== 1) return null;
  return [...versions][0];
}

/** Verify the trusted root pin and the concrete Node version emitted by Vercel. */
export async function verifyRuntime({ deploymentId, rootDir = ROOT, ...options } = {}) {
  const { fetchImpl, env, config: cfg } = optionsOf(options);
  const pin = readFileSync(resolve(rootDir, '.nvmrc'), 'utf8').trim();
  if (!/^24\.\d+\.\d+$/.test(pin)) throw new VercelError('Root .nvmrc is not pinned to Node 24');
  const rawLogs = await apiRequest(`/v3/deployments/${pathPart(checkedId(deploymentId, 'deploymentId'))}/events`, {
    query: { follow: 0, limit: -1, teamId: cfg.teamId }, fetchImpl, env,
  });
  const nodeVersion = parseNodeVersion(rawLogs);
  if (!nodeVersion || nodeVersion !== pin) throw new VercelError('Vercel build Node version differs from the trusted .nvmrc pin');
  return Object.freeze({ pinnedNodeVersion: pin, nodeVersion, deploymentId });
}

/** Check project ownership, trusted runtime configuration and optional deployment identity. */
export async function preflight({ deploymentId, rootDir = ROOT, verifyRuntime: checkRuntime = true, ...options } = {}) {
  const opts = optionsOf(options);
  const { config: cfg, fetchImpl, env } = opts;
  const project = await apiRequest(`/v9/projects/${pathPart(cfg.projectId)}`, { query: { teamId: cfg.teamId }, fetchImpl, env });
  const ownerId = project.teamId ?? project.accountId;
  if (project.id !== cfg.projectId || ownerId !== cfg.teamId)
    throw new VercelError('Vercel project/team identity mismatch');
  const pinnedNodeVersion = readFileSync(resolve(rootDir, '.nvmrc'), 'utf8').trim();
  if (!/^24\.\d+\.\d+$/.test(pinnedNodeVersion)) throw new VercelError('Root .nvmrc is not pinned to Node 24');
  const runtime = deploymentId && checkRuntime ? await verifyRuntime({ deploymentId, rootDir, fetchImpl, env }) : null;
  return Object.freeze({ projectId: cfg.projectId, teamId: cfg.teamId, updatesHostname: cfg.updatesHostname,
    productionHostname: cfg.productionHostname, pinnedNodeVersion, ...(runtime ?? {}) });
}

/** Resolve the deployment currently serving the trusted production hostname. */
export async function getProductionDeployment(options = {}) {
  const opts = optionsOf(options);
  const { config: cfg } = opts;
  const alias = await getAliases(cfg.productionHostname, opts);
  const deployment = await getDeployment(alias.deploymentId, opts);
  if (alias.redirect !== undefined || deployment.info.readyState !== 'READY' || deployment.raw.target !== 'production')
    throw new VercelError('Current production deployment is not READY production');
  return Object.freeze({ ...deployment.info, hostname: cfg.productionHostname });
}

async function candidateDetails(raw, options) {
  const opts = optionsOf(options);
  // The list endpoint is only a discovery hint. Always retrieve the full
  // deployment with withGitRepoInfo=true before accepting its identity.
  return getDeployment(raw?.id ?? raw?.uid, opts);
}

/** Poll for the exact SHA/branch/project deployment, with a hard ten-minute cap. */
export async function waitForDeployment({ sha, branch, production = false, timeoutMs = DEFAULT_TIMEOUT_MS, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, ...options } = {}) {
  checkedSha(sha); if (typeof branch !== 'string' || branch.length === 0) throw new TypeError('branch is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > DEFAULT_POLL_INTERVAL_MS)
    throw new TypeError('Invalid bounded deployment polling options');
  const opts = optionsOf(options), { config: cfg, fetchImpl, env } = opts;
  const started = Date.now();
  while (true) {
    const list = await apiRequest('/v7/deployments', { query: { projectId: cfg.projectId, teamId: cfg.teamId, sha, branch,
      target: production ? 'production' : undefined, limit: 20 }, fetchImpl, env });
    if (!Array.isArray(list.deployments)) throw new VercelError('Vercel deployment list is incomplete');
    for (const raw of list.deployments) {
      const candidate = await candidateDetails(raw, opts);
      const info = candidate.info;
      if (info.projectId !== cfg.projectId || info.sha !== sha || info.branch !== branch || info.readyState !== 'READY') continue;
      if (production && candidate.raw.target !== 'production') continue;
      const nodeVersion = parseNodeVersion(await apiRequest(`/v3/deployments/${pathPart(info.id)}/events`, {
        query: { follow: 0, limit: -1, teamId: cfg.teamId }, fetchImpl, env }));
      return Object.freeze({ ...info, ...(nodeVersion ? { nodeVersion } : {}) });
    }
    if (Date.now() - started >= timeoutMs) throw new VercelTimeoutError();
    await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(pollIntervalMs, timeoutMs - (Date.now() - started))));
  }
}

/** Prove that a specific trusted hostname resolves to the exact deployment and SHA. */
export async function verifyAlias({ hostname, sha, deploymentId, ...options } = {}) {
  const expectedSha = checkedSha(sha), expectedId = checkedId(deploymentId, 'deploymentId');
  const opts = optionsOf(options), alias = await getAliases(hostname, opts);
  if (alias.redirect !== undefined || alias.deploymentId !== expectedId) throw new VercelError('Vercel alias deployment mismatch');
  const deployment = await getDeployment(expectedId, opts);
  if (deployment.info.sha !== expectedSha || deployment.info.readyState !== 'READY') throw new VercelError('Vercel alias SHA or readiness mismatch');
  return Object.freeze({ ...deployment.info, hostname: checkedHostname(hostname) });
}

/**
 * Atomically guarded instant rollback. The API response is only a request
 * acknowledgement; the final alias read proves the resulting deployment.
 */
export async function rollback({ failedDeploymentId, previousDeploymentId, expectedFailedSHA, timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, ...options } = {}) {
  const failedId = checkedId(failedDeploymentId, 'failedDeploymentId');
  const previousId = checkedId(previousDeploymentId, 'previousDeploymentId');
  if (failedId === previousId) throw new VercelError('Rollback deployments must differ');
  checkedSha(expectedFailedSHA, 'expectedFailedSHA');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > DEFAULT_TIMEOUT_MS || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > DEFAULT_POLL_INTERVAL_MS)
    throw new TypeError('Invalid bounded rollback options');
  const opts = optionsOf(options), { config: cfg, fetchImpl, env } = opts;
  const failed = await getDeployment(failedId, opts);
  const previous = await getDeployment(previousId, opts);
  if (failed.info.projectId !== cfg.projectId || previous.info.projectId !== cfg.projectId || failed.info.sha !== expectedFailedSHA ||
      failed.info.readyState !== 'READY' || failed.raw.target !== 'production' || previous.info.readyState !== 'READY' || previous.raw.target !== 'production')
    throw new VercelError('Rollback deployment identity or readiness mismatch');
  const current = await getProductionDeployment(opts);
  if (current.id !== failedId || current.sha !== expectedFailedSHA) throw new VercelError('Production changed before rollback');
  // A second read closes the ordinary race between the first guard and POST.
  const currentAgain = await getProductionDeployment(opts);
  if (currentAgain.id !== failedId || currentAgain.sha !== expectedFailedSHA) throw new VercelError('Production changed before rollback');
  const response = await apiRequest(`/v1/projects/${pathPart(cfg.projectId)}/rollback/${pathPart(previousId)}`, {
    method: 'POST', query: { teamId: cfg.teamId }, expectedStatuses: [201], fetchImpl, env,
  });
  // A successful rollback endpoint acknowledges with an empty object. Identity
  // is proven below through the alias, never by HTTP status alone.
  if (!isObject(response)) throw new VercelError('Rollback acknowledgement is invalid');
  const started = Date.now();
  while (true) {
    const after = await getProductionDeployment(opts);
    if (after.id === previousId && after.projectId === cfg.projectId && after.sha === previous.info.sha)
      return Object.freeze({ failed: failed.info, previous: previous.info, production: after });
    if (Date.now() - started >= timeoutMs) throw new VercelTimeoutError('Vercel rollback verification timed out');
    await new Promise(resolvePromise => setTimeout(resolvePromise, Math.min(pollIntervalMs, timeoutMs - (Date.now() - started))));
  }
}

