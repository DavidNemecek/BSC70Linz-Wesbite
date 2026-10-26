import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { preflight as aiPreflight, researchPackages } from './ai.mjs';
import { preflight as vercelPreflight, getProductionDeployment, verifyRuntime } from './vercel.mjs';

const result = { startedAt: new Date().toISOString(), pass: false, checks: [] };
await mkdir('evidence', { recursive: true });
const outcomes = await Promise.allSettled([(async () => {
  await vercelPreflight();
  const production = await getProductionDeployment();
  const runtime = await verifyRuntime({ deploymentId: production.id });
  result.checks.push({ name: 'vercel', pass: true, production, runtime });
})(), (async () => {
  if (!process.env.GITHUB_TOKEN) return;
  const response = await fetch('https://api.github.com/repos/DavidNemecek/BSC70Linz-Wesbite/rulesets/25886164', {
    redirect: 'error', signal: AbortSignal.timeout(30000),
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw Error(`Ruleset visibility probe failed (${response.status})`);
  const ruleset = await response.json();
  result.checks.push({ name: 'ruleset-visibility', pass: true, bypassVisible: Array.isArray(ruleset.bypass_actors),
    bypassCount: Array.isArray(ruleset.bypass_actors) ? ruleset.bypass_actors.length : null,
    currentUserCanBypass: ruleset.current_user_can_bypass ?? null });
})(), (async () => {
  const research = await aiPreflight();
  result.checks.push({ name: 'live-ai-web-search', pass: research.pass === true, research });
  if (!research.pass) throw Error('AI live search preflight did not pass');
})(), (async () => {
  const lock = JSON.parse(await readFile(new URL('../../package-lock.json', import.meta.url), 'utf8'));
  const packages = ['react', 'vite'].map(name => ({ name, version: lock.packages[`node_modules/${name}`].version }));
  const research = await researchPackages({ packages, baseSHA: process.env.GITHUB_SHA, headSHA: process.env.GITHUB_SHA });
  result.checks.push({ name: 'exact-version-research', pass: research.pass === true, research });
  if (!research.pass) throw Error('Exact-version supply-chain research did not pass');
})()]);
result.pass = outcomes.every(outcome => outcome.status === 'fulfilled');
// Adapter errors are deliberately generic; never serialize request/response objects.
result.errors = outcomes.flatMap(outcome => outcome.status === 'rejected' ? [outcome.reason.message] : []);
result.researchDiagnostics = outcomes.flatMap(outcome => outcome.status === 'rejected' &&
  outcome.reason.code === 'PACKAGE_SEARCH_PROOF_MISSING' ? [outcome.reason.researchDiagnostic] : []);
result.completedAt = new Date().toISOString();
await writeFile('evidence/preflight.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: result.pass, checks: result.checks.map(({name,pass}) => ({name,pass})),
  rulesetVisibility: result.checks.find(check => check.name === 'ruleset-visibility'), errors: result.errors }));
if (!result.pass) process.exitCode = 1;
