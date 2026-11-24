import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { reviewBrowserImages } from './controller.mjs';

// Only used by the installation acceptance workflow. Inputs are artifacts from
// its own secretless browser job, never PR-supplied run IDs or filesystem paths.
async function files(directory, prefix = '') {
  const result = new Map();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Evidence symlinks are forbidden');
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const [path, bytes] of await files(join(directory, entry.name), name + '/')) result.set(path, bytes);
    } else if (entry.isFile()) result.set(`qa/${name}`, await readFile(join(directory, entry.name)));
    else throw Error('Unexpected evidence file');
  }
  return result;
}
const root = resolve('acceptance');
const capture = { pass: true, files: await files(join(root, 'baseline')) };
const comparison = { pass: true, files: await files(join(root, 'comparison')) };
const identity = JSON.parse(await readFile(join(root, 'identity.json')));
const result = await reviewBrowserImages({ capture, comparison, ...identity });
await writeFile('acceptance-vision.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: result.pass, reviews: result.reviews.length }));
if (!result.pass) process.exitCode = 1;
