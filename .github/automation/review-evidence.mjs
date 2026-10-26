import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { readArtifactZip } from './artifacts.mjs';

export const REVIEW_WORKFLOW_PATH = '.github/workflows/pr-review.yml';
export const REVIEW_EVIDENCE_FILE = 'review-evidence.json';
export const REVIEW_LIMITS = Object.freeze({
  artifactBytes: 512_000_000,
  recordBytes: 1_000_000,
  reviewPages: 20,
  artifactPages: 10,
});

const SHA = /^[a-f0-9]{40}$/;
const REPO = /^(?!\.{1,2}\/)[A-Za-z0-9_.-]+\/(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;
const RUN_ID = /^[1-9]\d*$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9[\]-]{0,99}$/;
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => Number.isSafeInteger(value) && value > 0;
const digest = value => createHash('sha256').update(value).digest('hex');

function validIdentity(ids) {
  if (!object(ids) || !REPO.test(ids.repository) || !Number.isSafeInteger(ids.number) || ids.number < 1 ||
      typeof ids.baseRef !== 'string' || !ids.baseRef || ids.baseRef.length > 255 || /[\x00-\x20\x7f]/.test(ids.baseRef) ||
      !SHA.test(ids.baseSHA) || !SHA.test(ids.headSHA)) fail('Invalid review identity');
  return ids;
}

function runText(runID) {
  if (id(runID)) return String(runID);
  if (typeof runID === 'string' && RUN_ID.test(runID) && id(Number(runID))) return runID;
  fail('Invalid review run ID');
}

export function workflowRef(repository) {
  if (!REPO.test(repository)) fail('Invalid review repository');
  return `${repository}/${REVIEW_WORKFLOW_PATH}@refs/heads/main`;
}

/**
 * Marker contract. v2 remains readable for historical display/tests; trusted
 * records are always v3 and include the exact Actions run ID. A v2 marker is
 * never accepted by verifyTrustedReviewRecord.
 */
export function reviewMarker(ids, pass, runID) {
  validIdentity(ids);
  if (typeof pass !== 'boolean') fail('Invalid review verdict');
  const suffix = runID === undefined ? '' : ` run=${runText(runID)}`;
  return `<!-- bsc70-ai-review:${runID === undefined ? 'v2' : 'v3'} repo=${ids.repository} pr=${ids.number} ref=${encodeURIComponent(ids.baseRef)} base=${ids.baseSHA} head=${ids.headSHA}${suffix} verdict=${pass ? 'pass' : 'fail'} -->`;
}

export function parseReviewMarker(body, ids) {
  validIdentity(ids);
  if (typeof body !== 'string') return null;
  const prefix = /^<!-- bsc70-ai-review:v3 repo=([^ ]+) pr=(\d+) ref=([^ ]+) base=([a-f0-9]{40}) head=([a-f0-9]{40}) run=([1-9]\d*) verdict=(pass|fail) -->\n/.exec(body);
  if (!prefix) return null;
  let parsed;
  try {
    parsed = { repository: prefix[1], number: Number(prefix[2]), baseRef: decodeURIComponent(prefix[3]), baseSHA: prefix[4], headSHA: prefix[5], runID: prefix[6], pass: prefix[7] === 'pass' };
    validIdentity(parsed);
    if (!RUN_ID.test(parsed.runID) || !id(Number(parsed.runID))) return null;
  } catch { return null; }
  return parsed.repository === ids.repository && parsed.number === ids.number && parsed.baseRef === ids.baseRef &&
    parsed.baseSHA === ids.baseSHA && parsed.headSHA === ids.headSHA ? parsed : null;
}

function validActor(value) {
  if (!ACTOR.test(value)) fail('Invalid review actor');
  return value;
}

function validEvent(value) {
  if (!['pull_request_target', 'workflow_dispatch'].includes(value)) fail('Invalid review event');
  return value;
}

/** Create the complete host-authored JSON record uploaded by pr-review.yml. */
export function createReviewEvidence({ ids, verdict, reviewID, runID, controlSHA, event, actor, reviewBody }) {
  validIdentity(ids);
  if (typeof verdict !== 'boolean' || !id(reviewID) || !SHA.test(controlSHA)) fail('Invalid review attestation identity');
  const record = {
    schema: 1,
    repository: ids.repository,
    number: ids.number,
    baseRef: ids.baseRef,
    baseSHA: ids.baseSHA,
    headSHA: ids.headSHA,
    verdict: verdict ? 'pass' : 'fail',
    reviewID,
    runID: Number(runText(runID)),
    controlSHA,
    workflowPath: REVIEW_WORKFLOW_PATH,
    workflowRef: workflowRef(ids.repository),
    event: validEvent(event),
    actor: validActor(actor),
    artifactName: `review-evidence-${runText(runID)}`,
    reviewBodySHA256: typeof reviewBody === 'string' ? digest(Buffer.from(reviewBody)) : undefined,
  };
  if (record.reviewBodySHA256 === undefined) delete record.reviewBodySHA256;
  return record;
}

export async function writeReviewEvidence(path, record) {
  if (typeof path !== 'string' || !path || path.length > 4096 || !path.startsWith('/') || /[\0\r\n]/.test(path) || !object(record)) fail('Invalid review evidence path');
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized) > REVIEW_LIMITS.recordBytes) fail('Review evidence is oversized');
  await writeFile(path, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 });
  return record;
}

export function validateReviewEvidence(record, { ids, reviewID, marker, artifactName } = {}) {
  validIdentity(ids);
  if (!object(record) || record.schema !== 1 || record.repository !== ids.repository || record.number !== ids.number ||
      record.baseRef !== ids.baseRef || record.baseSHA !== ids.baseSHA || record.headSHA !== ids.headSHA ||
      !['pass', 'fail'].includes(record.verdict) || !id(record.reviewID) || record.reviewID !== reviewID ||
      !id(record.runID) || !SHA.test(record.controlSHA) || record.workflowPath !== REVIEW_WORKFLOW_PATH ||
      record.workflowRef !== workflowRef(ids.repository) || !['pull_request_target', 'workflow_dispatch'].includes(record.event) ||
      typeof record.actor !== 'string' || !ACTOR.test(record.actor) || record.artifactName !== (artifactName ?? `review-evidence-${record.runID}`) ||
      (record.reviewBodySHA256 !== undefined && !/^[a-f0-9]{64}$/.test(record.reviewBodySHA256))) return false;
  if (marker && (marker.runID !== String(record.runID) || marker.pass !== (record.verdict === 'pass'))) return false;
  return true;
}

async function boundedJSON(response) {
  if (!response?.ok || !response.body) fail('Review artifact download failed');
  const length = response.headers?.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > REVIEW_LIMITS.artifactBytes)) fail('Review artifact is oversized');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > REVIEW_LIMITS.artifactBytes) fail('Review artifact exceeds transport limit');
    chunks.push(chunk);
  }
  return readArtifactZip(Buffer.concat(chunks, size));
}

/** Download an Actions artifact through GitHub's redirect, without forwarding
 * credentials to storage. Callers may inject fetchImpl for deterministic tests. */
export async function downloadReviewArtifact({ repository, artifactID, token, fetchImpl = fetch }) {
  if (!REPO.test(repository) || !id(artifactID) || typeof token !== 'string' || !token || /[\r\n]/.test(token)) fail('Invalid review artifact download identity');
  const first = await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${artifactID}/zip`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    redirect: 'manual', signal: AbortSignal.timeout(30_000),
  });
  if (![301, 302, 303, 307, 308].includes(first.status)) fail('Review artifact redirect denied');
  const location = first.headers?.get('location');
  const url = new URL(location);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['.blob.core.windows.net', '.actions.githubusercontent.com'].some(suffix => url.hostname.endsWith(suffix))) fail('Unexpected review artifact storage');
  return boundedJSON(await fetchImpl(url.href, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60_000) }));
}

async function artifactRecord({ api, downloadArtifact, runID, repository, ids, marker, controlSHA, currentRunID }) {
  if (currentRunID !== undefined && String(currentRunID) === String(runID)) return null;
  const run = await api(`/actions/runs/${runID}`);
  const actor = run?.actor;
  if (!id(run?.id) || run.id !== Number(runID) || run.path !== REVIEW_WORKFLOW_PATH ||
      !['pull_request_target', 'workflow_dispatch'].includes(run.event) || run.head_branch !== 'main' || run.head_sha !== controlSHA ||
      run.status !== 'completed' || run.conclusion !== 'success' || run.run_attempt !== 1 ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      !object(actor) || !ACTOR.test(actor.login) || !['User', 'Bot'].includes(actor.type) ||
      (run.triggering_actor && (run.triggering_actor.login !== actor.login || !['User', 'Bot'].includes(run.triggering_actor.type ?? actor.type)))) return null;
  const listing = await api(`/actions/runs/${runID}/artifacts?per_page=100`);
  if (!Array.isArray(listing?.artifacts) || listing.artifacts.length > 100) return null;
  const name = `review-evidence-${runID}`;
  const matches = listing.artifacts.filter(item => item?.name === name);
  const artifact = matches.length === 1 ? matches[0] : null;
  if (!artifact || !id(artifact.id) || artifact.expired !== false || !Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0 || artifact.size_in_bytes > REVIEW_LIMITS.artifactBytes ||
      artifact.workflow_run?.id !== run.id || artifact.workflow_run?.head_sha !== controlSHA || artifact.workflow_run?.head_branch !== 'main') return null;
  const files = await downloadArtifact(artifact.id);
  const bytes = files instanceof Map ? files.get(REVIEW_EVIDENCE_FILE) : undefined;
  if (!Buffer.isBuffer(bytes) || bytes.length > REVIEW_LIMITS.recordBytes) return null;
  let record;
  try { record = JSON.parse(bytes.toString('utf8')); } catch { return null; }
  if (!validateReviewEvidence(record, { ids, reviewID: marker.reviewID, marker, artifactName: name }) || record.controlSHA !== controlSHA ||
      record.event !== run.event || record.actor !== actor.login) return null;
  if (record.reviewBodySHA256 && digest(Buffer.from(marker.body)) !== record.reviewBodySHA256) return null;
  return { ...record, artifactID: artifact.id };
}

/**
 * Async controller contract for sibling/main acceptance.
 *
 * Inputs: complete chronological `reviews`, freshly fetched exact `ids`, the
 * trusted main `controlSHA`, and an API function for `/actions/runs/...` and
 * `/actions/runs/.../artifacts` JSON. `downloadArtifact(id)` must return the
 * bounded ZIP as a Map (or use downloadReviewArtifact). A current run ID is
 * explicitly rejected because its upload cannot be complete while the job is
 * executing. Return is the authenticated record, or null; never trust a bare
 * marker/status. The newest exact v3 marker is authoritative, including fail;
 * callers gate acceptance on `record.verdict === 'pass'`.
 */
export async function verifiedReviewRecord({ api, reviews, ids, controlSHA, downloadArtifact, currentRunID }) {
  validIdentity(ids);
  if (typeof api !== 'function' || typeof downloadArtifact !== 'function' || !SHA.test(controlSHA) || !Array.isArray(reviews)) return null;
  const candidates = reviews.map(review => {
    const marker = parseReviewMarker(review?.body, ids);
    if (!marker || !review || review.state !== 'COMMENTED' || review.commit_id !== ids.headSHA ||
        review.user?.login !== 'github-actions[bot]' || review.user?.type !== 'Bot' || !id(review.id)) return null;
    return { review, marker };
  }).filter(Boolean);
  const latest = candidates.at(-1);
  if (!latest) return null;
  const marker = { ...latest.marker, reviewID: latest.review.id, body: latest.review.body };
  return artifactRecord({ api, downloadArtifact, runID: marker.runID, repository: ids.repository, ids, marker, controlSHA, currentRunID });
}

// Descriptive alias for callers that prefer the verb-first contract name.
export const verifyReviewRecord = verifiedReviewRecord;
