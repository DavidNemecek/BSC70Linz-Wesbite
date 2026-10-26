import { writeFile } from 'node:fs/promises';
import { ref, repoApi } from './github.mjs';
// This installation check exercises vision only. Production promotion uses
// Vercel API-bound identities in controller.mjs, not these GitHub deployment hints.
const baseSHA = await ref('main'), headSHA = await ref('updates');
const deployments = await repoApi(`/deployments?sha=${headSHA}&per_page=100`);
const deployment = deployments.find(item => item.environment === 'Preview' && item.sha === headSHA);
if (!deployment) throw Error('Updates deployment identity unavailable');
await writeFile('acceptance/identity.json', JSON.stringify({ baseSHA, headSHA, deploymentId: deployment.id }));
