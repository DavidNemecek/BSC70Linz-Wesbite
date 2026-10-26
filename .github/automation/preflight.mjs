import { mkdir, writeFile } from 'node:fs/promises';
import { preflight as aiPreflight } from './ai.mjs';
import { preflight as vercelPreflight, getProductionDeployment, verifyRuntime } from './vercel.mjs';

const result = { startedAt: new Date().toISOString(), pass: false, checks: [] };
await mkdir('evidence', { recursive: true });
try {
  await vercelPreflight();
  const production = await getProductionDeployment();
  const runtime = await verifyRuntime({ deploymentId: production.id });
  result.checks.push({ name: 'vercel', pass: true, production, runtime });
  const research = await aiPreflight();
  result.checks.push({ name: 'live-ai-web-search', pass: research.pass === true, research });
  if (!research.pass) throw Error('AI live search preflight did not pass');
  result.pass = true;
} catch (error) {
  // Adapter errors are deliberately generic; never serialize request/response objects.
  result.error = error.message;
}
result.completedAt = new Date().toISOString();
await writeFile('evidence/preflight.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: result.pass, checks: result.checks.map(({name,pass}) => ({name,pass})), error: result.error }));
if (!result.pass) process.exitCode = 1;
