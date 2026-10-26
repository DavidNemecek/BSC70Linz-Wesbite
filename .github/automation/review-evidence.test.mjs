import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
import {
  createReviewEvidence, parseReviewMarker, reviewMarker, verifiedReviewRecord,
  validateReviewEvidence, workflowRef,
} from './review-evidence.mjs';

const repository = 'owner/site';
const ids = { repository, number: 7, baseRef: 'main', baseSHA: 'a'.repeat(40), headSHA: 'b'.repeat(40) };
const controlSHA = 'c'.repeat(40);

function zipOf(name, content) {
  const filename = Buffer.from(name), data = Buffer.from(content), compressed = deflateRawSync(data), crc = crc32(data);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(filename.length, 26); Buffer.from(filename).copy(local, 30);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(0x81a40000, 38);
  central.writeUInt32LE(0, 42); Buffer.from(filename).copy(central, 46);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12); end.writeUInt32LE(local.length + filename.length + compressed.length, 16);
  return Buffer.concat([local, filename, compressed, central, filename, end]);
}

function setup({ run = {}, artifact = {}, record = {} } = {}) {
  const body = reviewMarker(ids, true, 42) + '\nIndependent pass.';
  const review = { id: 9, user: { login: 'github-actions[bot]', type: 'Bot' }, commit_id: ids.headSHA, state: 'COMMENTED', body };
  const base = createReviewEvidence({ ids, verdict: true, reviewID: review.id, runID: 42, controlSHA, event: 'workflow_dispatch', actor: 'github-actions[bot]', reviewBody: body });
  const value = { ...base, ...record };
  const calls = [];
  const api = async path => {
    calls.push(path);
    if (path === '/actions/runs/42') return { id: 42, path: '.github/workflows/pr-review.yml', event: 'workflow_dispatch', head_branch: 'main', head_sha: controlSHA,
      status: 'completed', conclusion: 'success', run_attempt: 1, repository: { full_name: repository }, head_repository: { full_name: repository },
      actor: { login: 'github-actions[bot]', type: 'Bot' }, triggering_actor: { login: 'github-actions[bot]', type: 'Bot' }, ...run };
    if (path === '/actions/runs/42/artifacts?per_page=100') return { artifacts: [{ id: 77, name: 'review-evidence-42', expired: false, size_in_bytes: 200,
      workflow_run: { id: 42, head_sha: controlSHA, head_branch: 'main' }, ...artifact }] };
    throw Error(`unexpected ${path}`);
  };
  const files = new Map([['review-evidence.json', Buffer.from(JSON.stringify(value))]]);
  return { review, body, record: value, calls, api, downloadArtifact: async () => files };
}

test('v3 markers carry the exact run and v2 markers remain display-only', () => {
  const v3 = reviewMarker(ids, true, 42);
  assert.match(v3, /bsc70-ai-review:v3 .* run=42 verdict=pass/);
  assert.deepEqual(parseReviewMarker(`${v3}\ntext`, ids), { ...ids, runID: '42', pass: true });
  assert.equal(parseReviewMarker(`${reviewMarker(ids, true)}\ntext`, ids), null);
  assert.equal(workflowRef(repository), 'owner/site/.github/workflows/pr-review.yml@refs/heads/main');
});

test('forged bot marker from another workflow or unrelated successful run is rejected', async () => {
  const forged = setup({ run: { path: '.github/workflows/other.yml' } });
  assert.equal(await verifiedReviewRecord({ api: forged.api, reviews: [forged.review], ids, controlSHA, downloadArtifact: forged.downloadArtifact }), null);
  const wrongSHA = setup({ run: { head_sha: ids.headSHA } });
  assert.equal(await verifiedReviewRecord({ api: wrongSHA.api, reviews: [wrongSHA.review], ids, controlSHA, downloadArtifact: wrongSHA.downloadArtifact }), null);
  const wrongReview = setup({ record: { reviewID: 10 } });
  assert.equal(await verifiedReviewRecord({ api: wrongReview.api, reviews: [wrongReview.review], ids, controlSHA, downloadArtifact: wrongReview.downloadArtifact }), null);
  const wrongEvent = setup({ record: { event: 'pull_request_target' } });
  assert.equal(await verifiedReviewRecord({ api: wrongEvent.api, reviews: [wrongEvent.review], ids, controlSHA, downloadArtifact: wrongEvent.downloadArtifact }), null);
});

test('valid completed trusted run and immutable artifact attest the exact PASS review', async () => {
  const fixture = setup();
  const result = await verifiedReviewRecord({ api: fixture.api, reviews: [fixture.review], ids, controlSHA, downloadArtifact: fixture.downloadArtifact });
  assert.equal(result.reviewID, fixture.review.id);
  assert.equal(result.runID, 42);
  assert.equal(result.controlSHA, controlSHA);
  assert.equal(result.verdict, 'pass');
  assert.equal(validateReviewEvidence(fixture.record, { ids, reviewID: fixture.review.id, marker: { runID: '42', pass: true, body: fixture.body }, artifactName: 'review-evidence-42' }), true);
});

test('a running current review cannot consume its own not-yet-uploaded artifact', async () => {
  const fixture = setup();
  assert.equal(await verifiedReviewRecord({ api: fixture.api, reviews: [fixture.review], ids, controlSHA, currentRunID: 42, downloadArtifact: fixture.downloadArtifact }), null);
  assert.deepEqual(fixture.calls, []);
});

