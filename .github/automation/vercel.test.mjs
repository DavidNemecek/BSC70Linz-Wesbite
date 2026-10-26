import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROJECT_ID, DEFAULT_TEAM_ID, preflight, waitForDeployment,
  verifyAlias, verifyRuntime, rollback, parseNodeVersion, getProductionDeployment, VercelError, VercelTimeoutError,
} from './vercel.mjs';

const env = { VERCEL_TOKEN: 'test-token' };
const SHA = 'a'.repeat(40);
const PREVIOUS_SHA = 'b'.repeat(40);
const project = { id: DEFAULT_PROJECT_ID, teamId: DEFAULT_TEAM_ID, accountId: DEFAULT_TEAM_ID };
const deployment = (id, sha = SHA, branch = 'updates', target = 'production') => ({
  id, uid: id, projectId: DEFAULT_PROJECT_ID, url: `${id}.vercel.app`, readyState: 'READY', state: 'READY', target,
  gitSource: { sha, ref: branch },
});
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const routes = ({ currentId = 'dpl_failed', currentSha = SHA, previousId = 'dpl_previous', previousSha = PREVIOUS_SHA, aliasHost = 'www.bsc70linz.at', aliasId = currentId, aliasSha = currentSha, projectValue = project } = {}) => {
  let rollbackCalled = false;
  return { get rollbackCalled() { return rollbackCalled; }, fetch: async (url, init = {}) => {
    const parsed = new URL(url); const path = parsed.pathname;
    if (path === `/v9/projects/${DEFAULT_PROJECT_ID}`) return response(projectValue);
    if (path.startsWith('/v4/aliases/')) return response({ alias: path.split('/').at(-1), projectId: DEFAULT_PROJECT_ID, deploymentId: rollbackCalled ? previousId : aliasId });
    if (path.startsWith('/v13/deployments/')) {
      const id = decodeURIComponent(path.split('/').at(-1));
      if (id === currentId) return response(deployment(id, currentSha));
      if (id === previousId) return response(deployment(id, previousSha));
      return response(deployment(id));
    }
    if (path.startsWith('/v3/deployments/')) return response([{ payload: { text: 'Running Node.js 24.22.1' } }]);
    if (path.startsWith('/v7/deployments')) return response({ deployments: [deployment(currentId, currentSha)] });
    if (path.includes('/rollback/')) { rollbackCalled = true; return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } }); }
    throw new Error(`unexpected test route ${path}`);
  } };
};

test('parseNodeVersion requires one concrete version', () => {
  assert.equal(parseNodeVersion([{ text: 'v24.22.1\n' }]), '24.22.1');
  assert.equal(parseNodeVersion([{ payload: { text: 'Using Node.js 24.22.1' } }]), '24.22.1');
  assert.equal(parseNodeVersion([{ payload: { text: 'Node.js 22.0.0 then Node.js 24.22.1' } }]), null);
});

test('verifyRuntime accepts a newer Vercel Node 24 patch and records the minimum', async () => {
  const r = routes();
  const fetchImpl = async (url, init) => {
    if (new URL(url).pathname.startsWith('/v3/deployments/')) return response([{ payload: { text: 'Using Node.js 24.22.2' } }]);
    return r.fetch(url, init);
  };
  const runtime = await verifyRuntime({ deploymentId: 'dpl_failed', env, fetchImpl });
  assert.equal(runtime.minimumNodeVersion, '24.22.1');
  assert.equal(runtime.nodeVersion, '24.22.2');
  assert.equal(runtime.platformNodeVersion, '24.22.2');
  assert.equal(runtime.pinControlsPlatform, false);
});

test('verifyRuntime rejects an older or different-major Vercel runtime', async () => {
  for (const version of ['24.22.0', '25.0.0']) {
    const r = routes();
    const fetchImpl = async (url, init) => {
      if (new URL(url).pathname.startsWith('/v3/deployments/')) return response([{ payload: { text: `Using Node.js ${version}` } }]);
      return r.fetch(url, init);
    };
    await assert.rejects(verifyRuntime({ deploymentId: 'dpl_failed', env, fetchImpl }), VercelError);
  }
});

test('verifyRuntime applies an explicit trusted candidate minimum', async () => {
  const r = routes();
  const fetchImpl = async (url, init) => {
    if (new URL(url).pathname.startsWith('/v3/deployments/')) return response([{ payload: { text: 'Using Node.js 24.23.0' } }]);
    return r.fetch(url, init);
  };
  const runtime = await verifyRuntime({ deploymentId: 'dpl_failed', minimumNodeVersion: '24.22.2', env, fetchImpl });
  assert.equal(runtime.minimumNodeVersion, '24.22.2');
  await assert.rejects(verifyRuntime({ deploymentId: 'dpl_failed', minimumNodeVersion: '24.23.1', env, fetchImpl }), VercelError);
  const recovery = await verifyRuntime({ deploymentId: 'dpl_failed', minimumNodeVersion: '24.22.0', env, fetchImpl });
  assert.equal(recovery.minimumNodeVersion, '24.22.0');
});

test('production accepts Vercel null redirects and rejects actual redirects', async () => {
  const original = routes();
  const fetchImpl = async (url, init) => {
    const value = await original.fetch(url, init);
    if (new URL(url).pathname.startsWith('/v4/aliases/')) return response({ ...await value.json(), redirect: null, redirectStatusCode: null });
    return value;
  };
  assert.equal((await getProductionDeployment({ env, fetchImpl })).id, 'dpl_failed');
  await assert.rejects(getProductionDeployment({ env, fetchImpl: async (url, init) => {
    const value = await fetchImpl(url, init);
    if (new URL(url).pathname.startsWith('/v4/aliases/')) return response({ ...await value.json(), redirect: 'https://example.org' });
    return value;
  } }), VercelError);
});

test('preflight rejects a project or team mismatch', async () => {
  const r = routes({ projectValue: { id: 'prj_wrong', teamId: DEFAULT_TEAM_ID } });
  await assert.rejects(preflight({ env, fetchImpl: r.fetch, verifyRuntime: false }), VercelError);
});

test('waitForDeployment rejects stale SHA and wrong branch/project', async () => {
  const r = routes({ currentSha: 'c'.repeat(40) });
  await assert.rejects(waitForDeployment({ sha: SHA, branch: 'updates', timeoutMs: 5, pollIntervalMs: 1, env, fetchImpl: r.fetch }), VercelTimeoutError);
  const wrongBranch = routes();
  await assert.rejects(waitForDeployment({ sha: SHA, branch: 'main', timeoutMs: 5, pollIntervalMs: 1, env, fetchImpl: wrongBranch.fetch }), VercelTimeoutError);
  const wrongProject = routes();
  wrongProject.fetch = async (url, init) => {
    const result = await routes().fetch(url, init);
    if (new URL(url).pathname.startsWith('/v13/')) return response({ ...deployment('dpl_failed'), projectId: 'prj_wrong' });
    return result;
  };
  await assert.rejects(waitForDeployment({ sha: SHA, branch: 'updates', timeoutMs: 5, pollIntervalMs: 1, env, fetchImpl: wrongProject.fetch }), VercelError);
});

test('verifyAlias rejects a READY deployment served by the wrong alias', async () => {
  const r = routes({ aliasHost: 'other.example', aliasId: 'dpl_other' });
  await assert.rejects(verifyAlias({ hostname: 'www.bsc70linz.at', sha: SHA, deploymentId: 'dpl_failed', env, fetchImpl: r.fetch }), VercelError);
});

test('rollback guards production races and wrong previous project', async () => {
  const raced = routes({ aliasId: 'dpl_changed' });
  await assert.rejects(rollback({ failedDeploymentId: 'dpl_failed', previousDeploymentId: 'dpl_previous', expectedFailedSHA: SHA, timeoutMs: 5, pollIntervalMs: 1, env, fetchImpl: raced.fetch }), VercelError);
  const wrong = routes();
  wrong.fetch = async (url, init) => {
    const result = await routes().fetch(url, init);
    if (new URL(url).pathname.endsWith('/v13/deployments/dpl_previous')) return response({ ...deployment('dpl_previous', PREVIOUS_SHA), projectId: 'prj_wrong' });
    return result;
  };
  await assert.rejects(rollback({ failedDeploymentId: 'dpl_failed', previousDeploymentId: 'dpl_previous', expectedFailedSHA: SHA, timeoutMs: 5, pollIntervalMs: 1, env, fetchImpl: wrong.fetch }), VercelError);
});

test('rollback verifies the resulting alias and fails on API or verification timeout', async () => {
  const r = routes();
  const result = await rollback({ failedDeploymentId: 'dpl_failed', previousDeploymentId: 'dpl_previous', expectedFailedSHA: SHA, env, fetchImpl: r.fetch, timeoutMs: 10, pollIntervalMs: 1 });
  assert.equal(result.production.id, 'dpl_previous');
  const failing = { fetch: async () => new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }) };
  await assert.rejects(rollback({ failedDeploymentId: 'dpl_failed', previousDeploymentId: 'dpl_previous', expectedFailedSHA: SHA, env, fetchImpl: failing.fetch }), VercelError);
  const never = routes();
  never.fetch = async (url, init) => {
    if (new URL(url).pathname.includes('/rollback/')) return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
    return routes().fetch(url, init);
  };
  await assert.rejects(rollback({ failedDeploymentId: 'dpl_failed', previousDeploymentId: 'dpl_previous', expectedFailedSHA: SHA, env, fetchImpl: never.fetch, timeoutMs: 5, pollIntervalMs: 1 }), VercelTimeoutError);
});
