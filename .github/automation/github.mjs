import { readFile, appendFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// These checks run for every PR. Promotion-only security checks belong to the
// controller's internal validator, rather than repository-wide merge policy.
export const REQUIRED_SECURITY_CHECKS = Object.freeze(['security/ai-review', 'Automation tests', 'Application lint, build and audit']);
const GITHUB_ACTIONS_APP_ID = 15368;
export const repository = process.env.GITHUB_REPOSITORY || 'DavidNemecek/BSC70Linz-Wesbite';

function branchName(branch) {
  if (typeof branch !== 'string' || !/^(?:main|updates|automation\/[a-zA-Z0-9._/-]+)$/.test(branch) ||
      branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.') || part.endsWith('.lock')) || branch.includes('..')) throw Error('Unapproved automation branch');
  return branch;
}
function filePath(path) {
  return typeof path === 'string' && /^[\w./-]+$/.test(path) && !path.split('/').some(part => !part || part === '.' || part === '..');
}

/** No checkout credentials, third-party SDK, candidate scripts or shell commands. */
export async function api(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\\s#]/.test(path) ||
      path.split('?')[0].split('/').some(part => part === '.' || part === '..') || !REPO.test(repository)) throw Error('Invalid GitHub API path');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw Error('GitHub automation token is missing');
  const response = await fetch(`https://api.github.com${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${token}`, accept, 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw Error(`GitHub ${method} request failed (${response.status})`);
  if (response.status === 204) return null;
  return accept === 'application/vnd.github.diff' ? response.text() : response.json();
}

export const repoApi = (path, options) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) throw Error('Invalid repository API path');
  return api(`/repos/${repository}${path}`, options);
};
export function assertSHA(sha) { if (typeof sha !== 'string' || !SHA.test(sha)) throw Error('Expected immutable full Git SHA'); return sha; }
export async function ref(branch) {
  branchName(branch);
  return assertSHA((await repoApi(`/git/ref/heads/${branch}`)).object.sha);
}
export async function file(path, sha) {
  assertSHA(sha);
  if (!filePath(path)) throw Error('Invalid repository path');
  const data = await repoApi(`/contents/${path}?ref=${sha}`);
  if (data.type !== 'file' || data.encoding !== 'base64' || !Number.isSafeInteger(data.size) || data.size < 0 || data.size > 4_000_000 ||
      typeof data.content !== 'string' || data.content.length > 5_500_000 || !/^[A-Za-z0-9+/=\r\n]*$/.test(data.content)) throw Error('Expected bounded repository file');
  const content = Buffer.from(data.content, 'base64');
  if (content.length !== data.size) throw Error('Repository file length mismatch');
  return content.toString('utf8');
}
export async function changes(base, head) {
  assertSHA(base); assertSHA(head);
  const comparison = await repoApi(`/compare/${base}...${head}?per_page=100`);
  if (!Array.isArray(comparison.files) || comparison.files.length >= 300 || comparison.status === 'diverged') throw Error('Incomplete or diverged candidate comparison');
  return comparison.files;
}
export async function output(name, value) {
  if (!/^[a-z_]+$/.test(name) || /[\r\n]/.test(String(value))) throw Error('Unsafe workflow output');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
export async function event() { return JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')); }
export async function setStatus(sha, context, success, description) {
  assertSHA(sha);
  if (typeof context !== 'string' || !/^security\/[a-z-]+$/.test(context) || typeof success !== 'boolean' || typeof description !== 'string') throw Error('Invalid check status');
  return repoApi(`/statuses/${sha}`, { method: 'POST', body: {
    state: success ? 'success' : 'failure', context, description: description.slice(0, 140),
    target_url: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  } });
}
export async function ensureLabels() {
  const existing = await repoApi('/labels?per_page=100');
  for (const [name, color] of [['automated-dependencies', '0366d6'], ['security', 'd73a4a'], ['automation-blocked', 'e4e669']]) {
    if (!existing.some(label => label.name === name)) await repoApi('/labels', { method: 'POST', body: { name, color } });
  }
}
export async function issue(title, body, marker) {
  const issues = await repoApi('/issues?state=open&labels=automation-blocked&per_page=100');
  const existing = issues.find(item => !item.pull_request && item.body?.includes(`<!-- ${marker} -->`));
  const content = `<!-- ${marker} -->\n${body}\n\nRun: https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  if (existing) return repoApi(`/issues/${existing.number}`, { method: 'PATCH', body: { title, body: content } });
  return repoApi('/issues', { method: 'POST', body: { title, body: content, labels: ['automation-blocked'] } });
}

export async function fastForward(branch, expected, target) {
  assertSHA(expected); assertSHA(target);
  if (await ref(branch) !== expected) throw Error(`${branch} changed; refusing stale update`);
  return repoApi(`/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: target, force: false } });
}

export async function commitFiles(base, files, message) {
  assertSHA(base);
  if (!Array.isArray(files) || !files.length || files.length > 40) throw Error('Invalid candidate file count');
  const baseCommit = await repoApi(`/git/commits/${base}`);
  const paths = new Set();
  const tree = [];
  for (const entry of files) {
    if (!entry || !filePath(entry.path) || paths.has(entry.path) ||
      typeof entry.content !== 'string' || Buffer.byteLength(entry.content) > 4_000_000) throw Error('Invalid proposed file');
    paths.add(entry.path);
    tree.push({ path: entry.path, mode: '100644', type: 'blob', content: entry.content });
  }
  const createdTree = await repoApi('/git/trees', { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree } });
  const created = await repoApi('/git/commits', { method: 'POST', body: { message, tree: createdTree.sha, parents: [base] } });
  return assertSHA(created.sha);
}

export async function createBranch(branch, sha) {
  branchName(branch);
  if (!branch.startsWith('automation/')) throw Error('Invalid candidate branch');
  return repoApi('/git/refs', { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: assertSHA(sha) } });
}

export async function openPR({ base, head, title, body }) {
  branchName(head);
  if (!['main', 'updates'].includes(base) || head === 'main') throw Error('Unapproved PR branches');
  const existing = await repoApi(`/pulls?state=open&base=${base}&head=${repository.split('/')[0]}:${head}&per_page=100`);
  if (existing.length > 1) throw Error('Ambiguous open automation PR');
  if (existing[0]) return existing[0];
  return repoApi('/pulls', { method: 'POST', body: { base, head, title, body } });
}

/** Read effective rules using Metadata read, not the legacy protection API's
 * Administration read. The parent owns configuration. Ruleset details expose
 * bypass_actors only to callers with write access to the ruleset; an omitted
 * property cannot establish that administrators or this app lack a bypass.
 * https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset
 * Scope verification deliberately accepts explicit refs or ~ALL with no
 * exclusions. Configure refs/heads/main (or updates) rather than glob patterns.
 */
export async function readProtection(branch) {
  if (!['main', 'updates'].includes(branch)) throw Error('Unapproved protected branch');
  const effective = [];
  for (let page = 1; ; page++) {
    const rules = await repoApi(`/rules/branches/${branch}?per_page=100&page=${page}`);
    if (!Array.isArray(rules) || rules.length > 100) throw Error('Invalid effective branch rules');
    effective.push(...rules);
    if (rules.length < 100) break;
    if (page === 10) throw Error('Incomplete effective branch rules');
  }
  const types = new Set(['required_status_checks', 'non_fast_forward', 'deletion', 'pull_request']);
  const relevant = effective.filter(rule => types.has(rule?.type));
  const rulesets = new Map();
  for (const rule of relevant) {
    if (!Number.isSafeInteger(rule.ruleset_id) || rule.ruleset_id < 1 || rule.ruleset_source_type !== 'Repository' ||
        typeof rule.ruleset_source !== 'string' || rule.ruleset_source.toLowerCase() !== repository.toLowerCase()) throw Error('Unverified branch ruleset source');
    if (!rulesets.has(rule.ruleset_id)) {
      const ruleset = await repoApi(`/rulesets/${rule.ruleset_id}`);
      const scope = ruleset?.conditions?.ref_name;
      if (ruleset?.id !== rule.ruleset_id || ruleset.source_type !== 'Repository' ||
          typeof ruleset.source !== 'string' || ruleset.source.toLowerCase() !== repository.toLowerCase() ||
          ruleset.target !== 'branch' || ruleset.enforcement !== 'active' ||
          !Array.isArray(scope?.include) || !scope.include.some(ref => ref === `refs/heads/${branch}` || ref === '~ALL') ||
          !Array.isArray(scope.exclude) || scope.exclude.length !== 0 ||
          !Array.isArray(ruleset.rules)) throw Error('Unverified active branch ruleset scope');
      if (!Array.isArray(ruleset.bypass_actors) || ruleset.bypass_actors.length !== 0) throw Error('Ruleset bypass actors are present or unavailable');
      rulesets.set(rule.ruleset_id, ruleset);
    }
    const definitions = rulesets.get(rule.ruleset_id).rules.filter(definition => definition?.type === rule.type);
    if (definitions.length !== 1 || !isDeepStrictEqual(definitions[0].parameters, rule.parameters)) throw Error('Effective branch rule differs from ruleset');
  }
  const statusRules = relevant.filter(rule => rule.type === 'required_status_checks');
  const checks = [];
  for (const rule of statusRules) {
    const parameters = rule.parameters;
    if (typeof parameters?.strict_required_status_checks_policy !== 'boolean' || !Array.isArray(parameters.required_status_checks) ||
        parameters.required_status_checks.some(check => typeof check?.context !== 'string' || !check.context.trim())) throw Error('Invalid required status check rule');
    checks.push(...parameters.required_status_checks.map(check => ({ context: check.context, app_id: check.integration_id ?? null })));
  }
  const reviewRules = relevant.filter(rule => rule.type === 'pull_request');
  if (reviewRules.some(rule => !Number.isSafeInteger(rule.parameters?.required_approving_review_count) ||
      rule.parameters.required_approving_review_count < 0 || rule.parameters.required_approving_review_count > 6)) throw Error('Invalid pull request rule');
  return {
    required_status_checks: {
      strict: statusRules.some(rule => rule.parameters.strict_required_status_checks_policy && rule.parameters.required_status_checks.length > 0),
      contexts: [...new Set(checks.map(check => check.context))], checks,
    },
    enforce_admins: { enabled: relevant.length > 0 },
    allow_force_pushes: { enabled: !relevant.some(rule => rule.type === 'non_fast_forward') },
    allow_deletions: { enabled: !relevant.some(rule => rule.type === 'deletion') },
    required_pull_request_reviews: reviewRules.length ? {
      required_approving_review_count: Math.max(...reviewRules.map(rule => rule.parameters.required_approving_review_count)),
      dismiss_stale_reviews: reviewRules.some(rule => rule.parameters.dismiss_stale_reviews_on_push === true),
      require_code_owner_reviews: reviewRules.some(rule => rule.parameters.require_code_owner_review === true),
      require_last_push_approval: reviewRules.some(rule => rule.parameters.require_last_push_approval === true),
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    } : null,
  };
}

/** Read only and fail closed. No approval, configuration write, or bypass. */
export async function assertProtection(branch) {
  const protection = await readProtection(branch);
  const checks = protection?.required_status_checks;
  if (checks?.strict !== true || protection.enforce_admins?.enabled !== true ||
      protection.allow_force_pushes?.enabled !== false || protection.allow_deletions?.enabled !== false ||
      protection.required_pull_request_reviews?.required_approving_review_count !== 0 ||
      REQUIRED_SECURITY_CHECKS.some(context => !checks.checks.some(check => check.context === context && check.app_id === GITHUB_ACTIONS_APP_ID))) throw Error('Strict required security branch protection is missing');
  return protection;
}

export async function mergePR(number, expectedHead, expectedBase) {
  assertSHA(expectedHead); assertSHA(expectedBase);
  if (!Number.isSafeInteger(number) || number < 1) throw Error('Invalid PR number');
  const pr = await repoApi(`/pulls/${number}`);
  if (pr.state !== 'open' || pr.draft !== false || pr.head?.sha !== expectedHead || pr.base?.sha !== expectedBase ||
      pr.head.repo?.full_name !== repository || pr.base.repo?.full_name !== repository || !['main', 'updates'].includes(pr.base.ref)) throw Error('PR changed before merge');
  if (await ref(pr.base.ref) !== expectedBase) throw Error('Base branch changed before merge');
  // GitHub only compares the head SHA on PUT /merge. Reads above are diagnostic;
  // strict server-side protection is what rejects a base advance during merge.
  await assertProtection(pr.base.ref);
  const merged = await repoApi(`/pulls/${number}/merge`, { method: 'PUT', body: { sha: expectedHead, merge_method: 'merge' } });
  if (!merged.merged || !SHA.test(merged.sha)) throw Error('GitHub did not confirm merge');
  return merged.sha;
}
