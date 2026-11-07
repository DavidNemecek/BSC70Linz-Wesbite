import { inflateRawSync, crc32 } from 'node:zlib';
import { assertSHA, ref, repoApi, repository } from './github.mjs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const MAX_ZIP = 512_000_000, MAX_TOTAL = 1_000_000_000, MAX_FILE = 30_000_000, MAX_ENTRIES = 2000;
const WORKFLOW = 'dependency-worker.yml', WORKFLOW_PATH = `.github/workflows/${WORKFLOW}`;
const id = value => Number.isSafeInteger(value) && value > 0;

/** Bounded, memory-only ZIP reader for authenticated worker artifacts. Never
 * extracts files. ZIP64, encryption, ambiguous names and non-file types fail closed. */
export function readArtifactZip(zip) {
  if (!Buffer.isBuffer(zip) || zip.length < 22 || zip.length > MAX_ZIP) throw Error('Artifact size limit');
  const bounds = (offset, length, limit = zip.length) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > limit) throw Error('Artifact ZIP bounds');
  };
  const extras = (start, length) => {
    const end = start + length;
    bounds(start, length);
    while (start < end) {
      bounds(start, 4, end);
      const type = zip.readUInt16LE(start), size = zip.readUInt16LE(start + 2);
      if ([1, 0x7075, 0x6375].includes(type)) throw Error('Unsupported ZIP64 or Unicode artifact metadata');
      start += 4; bounds(start, size, end); start += size;
    }
  };
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) { end = i; break; }
  }
  if (end < 0 || zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6) ||
      (end >= 20 && zip.readUInt32LE(end - 20) === 0x07064b50)) throw Error('Unsupported artifact ZIP');
  const count = zip.readUInt16LE(end + 10), directorySize = zip.readUInt32LE(end + 12), directory = zip.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || count !== zip.readUInt16LE(end + 8) || directorySize === 0xffffffff || directory === 0xffffffff || directory + directorySize !== end) throw Error('Invalid artifact directory size or count');
  bounds(directory, directorySize, end);
  let cursor = directory, total = 0;
  const files = new Map(), names = new Map(), regions = [];
  for (let i = 0; i < count; i++) {
    bounds(cursor, 46, end);
    if (zip.readUInt32LE(cursor) !== 0x02014b50) throw Error('Invalid artifact directory');
    const flags = zip.readUInt16LE(cursor + 8), method = zip.readUInt16LE(cursor + 10), crc = zip.readUInt32LE(cursor + 16);
    const compressed = zip.readUInt32LE(cursor + 20), size = zip.readUInt32LE(cursor + 24);
    const length = zip.readUInt16LE(cursor + 28), extra = zip.readUInt16LE(cursor + 30), comment = zip.readUInt16LE(cursor + 32);
    const offset = zip.readUInt32LE(cursor + 42), attributes = zip.readUInt32LE(cursor + 38), kind = (attributes >>> 16) & 0xf000;
    bounds(cursor + 46, length + extra + comment, end);
    const rawName = zip.subarray(cursor + 46, cursor + 46 + length), name = rawName.toString('utf8');
    extras(cursor + 46 + length, extra);
    const isDirectory = name.endsWith('/'), key = isDirectory ? name.slice(0, -1) : name;
    if ((flags & ~0x080e) || ![0, 8].includes(method) || (method === 0 && (flags & 6)) ||
        zip.readUInt16LE(cursor + 6) >= 45 || zip.readUInt16LE(cursor + 34) !== 0 || offset === 0xffffffff || compressed === 0xffffffff ||
        size > MAX_FILE || (total += size) > MAX_TOTAL || !/^[\w./-]+$/.test(name) ||
        key.split('/').some(part => !part || part === '.' || part === '..') || names.has(key) ||
        (kind && kind !== (isDirectory ? 0x4000 : 0x8000)) || (!isDirectory && (attributes & 0x10))) throw Error('Unsafe artifact entry');
    names.set(key, isDirectory);
    cursor += 46 + length + extra + comment;
    bounds(offset, 30, directory);
    if (zip.readUInt32LE(offset) !== 0x04034b50 || zip.readUInt16LE(offset + 4) >= 45 ||
        zip.readUInt16LE(offset + 6) !== flags || zip.readUInt16LE(offset + 8) !== method) throw Error('Invalid artifact local entry');
    const localLength = zip.readUInt16LE(offset + 26), localExtra = zip.readUInt16LE(offset + 28);
    const start = offset + 30 + localLength + localExtra;
    bounds(offset + 30, localLength + localExtra, directory);
    if (!rawName.equals(zip.subarray(offset + 30, offset + 30 + localLength))) throw Error('Artifact local name mismatch');
    extras(offset + 30 + localLength, localExtra);
    for (const [position, expected] of [[14, crc], [18, compressed], [22, size]]) {
      const actual = zip.readUInt32LE(offset + position);
      if (actual !== expected && (!(flags & 8) || actual !== 0)) throw Error('Artifact local size or CRC mismatch');
    }
    bounds(start, compressed, directory);
    let finish = start + compressed;
    if (flags & 8) {
      bounds(finish, 12, directory);
      // The descriptor signature is optional, and a CRC may itself equal it.
      const matches = at => at + 12 <= directory && zip.readUInt32LE(at) === crc && zip.readUInt32LE(at + 4) === compressed && zip.readUInt32LE(at + 8) === size;
      if (matches(finish)) finish += 12;
      else if (zip.readUInt32LE(finish) === 0x08074b50 && matches(finish + 4)) finish += 16;
      else throw Error('Invalid artifact data descriptor');
    }
    regions.push([offset, finish]);
    const data = zip.subarray(start, start + compressed);
    let content;
    if (method === 8) {
      const inflated = inflateRawSync(data, { maxOutputLength: size || 1, info: true });
      if (inflated.engine.bytesWritten !== compressed) throw Error('Artifact compressed length mismatch');
      content = inflated.buffer;
    } else content = data;
    if (content.length !== size || crc32(content) !== crc || (isDirectory && size !== 0)) throw Error('Artifact length or CRC mismatch');
    if (!isDirectory) files.set(name, content);
  }
  if (cursor !== end) throw Error('Artifact directory length mismatch');
  regions.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < regions.length; i++) if (regions[i][0] < regions[i - 1][1]) throw Error('Overlapping artifact entries');
  for (const name of names.keys()) {
    const parts = name.split('/'); parts.pop();
    while (parts.length) {
      if (names.get(parts.join('/')) === false) throw Error('Artifact file/directory collision');
      parts.pop();
    }
  }
  return files;
}

async function download(artifactId) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token || !id(artifactId)) throw Error('Invalid artifact download identity');
  const first = await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    redirect: 'manual', signal: AbortSignal.timeout(30000),
  });
  if (![301, 302, 303, 307, 308].includes(first.status)) throw Error(`Artifact download denied (${first.status})`);
  const url = new URL(first.headers.get('location'));
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['.blob.core.windows.net', '.actions.githubusercontent.com'].some(suffix => url.hostname.endsWith(suffix))) throw Error('Unexpected artifact storage');
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60000) });
  const length = response.headers.get('content-length');
  if (!response.ok || !response.body || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_ZIP))) throw Error('Artifact download failed');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    if ((bytes += chunk.length) > MAX_ZIP) throw Error('Artifact download size limit');
    chunks.push(chunk);
  }
  return readArtifactZip(Buffer.concat(chunks, bytes));
}

/** Trusted dispatch only. A branch ref is required by GitHub dispatch; resolve it
 * BEFORE dispatch and reject runs from another SHA if that branch moved. */
export async function worker({ phase, baseSHA, headSHA, baselineRun = '', baselineURL = '', candidateURL = '', urgent = false }) {
  assertSHA(baseSHA); assertSHA(headSHA);
  if (!['inspect', 'resolve', 'validate', 'capture', 'browser'].includes(phase)) throw Error('Invalid worker phase');
  if (typeof urgent !== 'boolean' || typeof baselineURL !== 'string' || typeof candidateURL !== 'string' ||
      !(baselineRun === '' || (/^[1-9]\d*$/.test(String(baselineRun)) && id(Number(baselineRun))))) throw Error('Invalid worker inputs');
  const request = randomUUID(), controlRef = process.env.AUTOMATION_WORKER_REF || 'main';
  if (!['main', 'updates', 'automation/dependency-pipeline'].includes(controlRef)) throw Error('Unapproved worker control ref');
  const expectedActor = process.env.AUTOMATION_WORKER_ACTOR || process.env.GITHUB_ACTOR;
  if (typeof expectedActor !== 'string' || !/^[A-Za-z0-9\[\]-]+$/.test(expectedActor)) throw Error('Expected worker actor is missing');
  const controlSHA = await ref(controlRef);
  const workflow = await repoApi(`/actions/workflows/${WORKFLOW}`);
  if (!id(workflow.id) || workflow.path !== WORKFLOW_PATH || workflow.state !== 'active') throw Error('Untrusted worker workflow');
  const since = Date.now() - 60000;
  await repoApi(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: {
    ref: controlRef, inputs: { phase, request, base_sha: baseSHA, head_sha: headSHA,
      baseline_run: String(baselineRun), baseline_url: baselineURL, candidate_url: candidateURL, urgent: String(urgent) },
  } });
  let run;
  const deadline = Date.now() + (['browser', 'capture'].includes(phase) ? 35 : 20) * 60_000;
  while (Date.now() < deadline) {
    if (!run) {
      const data = await repoApi(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100`);
      if (!Array.isArray(data.workflow_runs)) throw Error('Invalid worker run listing');
      const matches = data.workflow_runs.filter(item => item.display_title === `Dependency worker ${request}` && Date.parse(item.created_at) >= since);
      if (matches.length > 1) throw Error('Ambiguous worker dispatch');
      run = matches[0];
    } else {
      const runId = run.id;
      run = await repoApi(`/actions/runs/${runId}`);
      if (run.id !== runId) throw Error('Worker run identity changed');
    }
    if (run) {
      if (!id(run.id) || run.event !== 'workflow_dispatch' || run.head_branch !== controlRef || run.head_sha !== controlSHA ||
          run.workflow_id !== workflow.id || run.path !== WORKFLOW_PATH || run.display_title !== `Dependency worker ${request}` ||
          run.run_attempt !== 1 || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
          run.actor?.login !== expectedActor || (run.triggering_actor && run.triggering_actor.login !== expectedActor) ||
          !(Date.parse(run.created_at) >= since)) throw Error('Untrusted worker run provenance');
      if (run.status === 'completed') {
        const { artifacts } = await repoApi(`/actions/runs/${run.id}/artifacts?per_page=100`);
        if (!Array.isArray(artifacts)) throw Error('Invalid worker artifact listing');
        const matches = artifacts.filter(item => item.name === `dependency-worker-${request}`);
        const artifact = matches[0];
        if (matches.length !== 1 || !id(artifact.id) || artifact.expired !== false ||
            !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0 || artifact.size_in_bytes > MAX_ZIP ||
            artifact.workflow_run?.id !== run.id || artifact.workflow_run.head_sha !== controlSHA || artifact.workflow_run.head_branch !== controlRef) throw Error(`Worker ${phase} failed without bound evidence; run ${run.id}`);
        const files = await download(artifact.id), json = files.get('worker.json');
        if (!json || json.length > 4_000_000) throw Error('Worker evidence is missing or oversized');
        let evidence;
        try { evidence = JSON.parse(json.toString('utf8')); }
        catch { throw Error('Invalid worker evidence JSON'); }
        if (evidence?.request !== request || evidence.baseSHA !== baseSHA || evidence.headSHA !== headSHA || evidence.phase !== phase || typeof evidence.pass !== 'boolean') throw Error('Worker evidence identity mismatch');
        if (run.conclusion !== 'success') evidence.pass = false;
        return { ...evidence, runId: run.id, artifactId: artifact.id, controlSHA, files };
      }
    }
    await delay(10000);
  }
  throw Error(`Worker ${phase} timed out`);
}
