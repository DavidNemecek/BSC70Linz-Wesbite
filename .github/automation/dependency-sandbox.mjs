/**
 * HOST ONLY. Candidate npm/plugins never share the runner's filesystem or PID
 * namespace. No evidence, harness, Docker socket, credentials or checkout .git
 * are mounted. Only a disposable candidate copy is writable and persists across
 * commands; each command's container (including its descendants) is destroyed.
 *
 * Base provenance independently verified 2026-10-26, before pulling/execution:
 * https://hub.docker.com/_/ubuntu (Canonical's official Ubuntu 24.04)
 * https://raw.githubusercontent.com/docker-library/official-images/master/library/ubuntu
 * noble-20260930.1, amd64 source a0eaf38ec9d9bfffb5546f9f75d86383ce9c115c.
 * GET https://registry-1.docker.io/v2/library/ubuntu/manifests/24.04:
 * index sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac;
 * amd64 manifest below: response header AND SHA256 of raw bytes matched.
 * Image config created 2026-10-02T08:10:55Z (>7 days old). This is a base
 * pull, not installation/lifecycle execution of newly discovered dependencies.
 * Node/npm are the authorized exact setup-node distribution, mounted read-only,
 * matching the expected version and host process; no in-container apt/npm setup.
 * Ubuntu's glibc/libstdc++ supports this Node and Linux native Vite/Rollup tools.
 * Docker isolation flags: https://docs.docker.com/reference/cli/docker/container/run/
 */
import { cp, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const SANDBOX_IMAGE = 'docker.io/library/ubuntu@sha256:a2d43bffc46670d7108bb3c0468c67c5557c4c92e83e1e34cbff1322ad1b94dc';
export const NODE_VERSION = '24.22.1';
// This remains the trusted-main minimum/default. A candidate can only select
// an exact stable release on the same Node 24 LTS line, never a setup-node range,
// alias, URI, alternate distribution, prerelease or ordinary downgrade.
const recoveryNodeAuthorizations = new WeakMap();

// HOST ONLY: called by the trusted recovery authorizer AFTER independently
// checking GitHub and serving production (or rechecking its trusted job output).
// This process-local capability is never deserialized from candidate input.
export function bindRecoveryNodeAuthorization(proof) {
  const r = proof?.recovery, sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
  if (proof?.version !== 1 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(proof.repository) ||
    proof.headRepository !== proof.repository || proof.baseRef !== 'main' ||
    !/^automation\/restore-[a-zA-Z0-9-]+$/.test(proof.headRef) ||
    !Number.isSafeInteger(proof.number) || proof.number <= 0 ||
    ![proof.headSHA, proof.baseSHA, proof.treeSHA, r?.originalSHA, r?.nodeBlobSHA].every(sha) ||
    r.failedSHA !== proof.baseSHA || r.originalSHA === r.failedSHA || r.treeSHA !== proof.treeSHA ||
    proof.parents?.length !== 1 || proof.parents[0] !== r.failedSHA ||
    r.nodeVersion !== proof.candidateNodeVersion ||
    [r.deploymentId, r.projectId, r.hostname].some(value => typeof value !== 'string' || !value.length))
    throw Error('Invalid bound recovery runtime proof');
  const authorization = Object.freeze({});
  recoveryNodeAuthorizations.set(authorization, proof.candidateNodeVersion);
  // Even recovery cannot select a range, another major, or an unstable build.
  assertCandidateNodeVersion(proof.candidateNodeVersion, authorization);
  return authorization;
}

export function assertCandidateNodeVersion(version, recoveryNodeAuthorization) {
  if (typeof version !== 'string' || version.length > 64 || /\s/.test(version) || !/^24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw Error('Candidate Node must be an exact stable Node 24 version');
  const parts = version.split('.').map(Number), minimum = NODE_VERSION.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw Error('Candidate Node must be an exact stable Node 24 version');
  if ((parts[1] < minimum[1] || (parts[1] === minimum[1] && parts[2] < minimum[2])) &&
    recoveryNodeAuthorizations.get(recoveryNodeAuthorization) !== version)
    throw Error(`Candidate Node must be at least trusted Node ${NODE_VERSION}`);
  return version;
}

export function parseCandidateNodeVersion(content, recoveryNodeAuthorization) {
  if (typeof content !== 'string' || content.length > 64)
    throw Error('Candidate .nvmrc must contain only one exact stable Node 24 version');
  return assertCandidateNodeVersion(content.replace(/\r?\n$/, ''), recoveryNodeAuthorization);
}

export async function readCandidateNodeVersion(candidate, recoveryNodeAuthorization) {
  if (!(await lstat(candidate)).isDirectory()) throw Error('Candidate must be a regular directory');
  // No candidate code has run yet. NOFOLLOW/NONBLOCK also reject symlinks and
  // prevent a hostile FIFO/device from hanging the host's version selection.
  const file = await open(join(candidate, '.nvmrc'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 64) throw Error('Candidate .nvmrc must be a bounded regular file');
    const bytes = Buffer.alloc(65);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== stat.size) throw Error('Candidate .nvmrc changed while reading');
    return parseCandidateNodeVersion(bytes.subarray(0, bytesRead).toString('utf8'), recoveryNodeAuthorization);
  } finally { await file.close(); }
}
const execute = promisify(execFile);
const DOCKER = '/usr/bin/docker';
const DOCKER_PREFIX = ['--host', 'unix:///var/run/docker.sock'];
const NODE = '/opt/node/bin/node', NPM = '/opt/node/lib/node_modules/npm/bin/npm-cli.js';
const OMIT = new Set(['.git', 'node_modules', 'dist']);
const ENV = {
  PATH: '/opt/node/bin:/usr/bin:/bin', HOME: '/home/node', TMPDIR: '/tmp', LANG: 'C.UTF-8', CI: 'true',
  npm_config_userconfig: '/dev/null', npm_config_globalconfig: '/tmp/empty-global-npmrc',
  npm_config_cache: '/tmp/npm-cache', npm_config_registry: 'https://registry.npmjs.org',
  npm_config_ignore_scripts: 'true', npm_config_strict_peer_deps: 'true', npm_config_engine_strict: 'true',
  npm_config_update_notifier: 'false',
};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (parent, child) => child === parent || child.startsWith(parent + sep);

// Host reads after the container has been removed; never invoke candidate git or
// execute a log. Reject symlinks/special files instead of following them outside
// the workspace. Check all original source bytes AND unexpected new source.
export async function sourceSnapshot(root) {
  const files = Object.create(null);
  let count = 0, bytes = 0;
  async function walk(path = '') {
    for (const entry of (await readdir(join(root, path))).sort()) {
      if (!path && OMIT.has(entry)) continue;
      const name = path ? `${path}/${entry}` : entry, full = join(root, name), stat = await lstat(full);
      if (++count > 200_000) throw Error('Candidate source file limit');
      if (stat.isDirectory()) { files[name + '/'] = 'directory'; await walk(name); }
      else if (stat.isFile() && stat.nlink === 1) {
        if ((bytes += stat.size) > 1_000_000_000) throw Error('Candidate source size limit');
        files[name] = `${stat.mode & 0o777}:${sha256(await readFile(full))}`;
      } else throw Error(`Candidate source must contain only regular files/directories: ${name}`);
    }
  }
  await walk();
  return files;
}

export async function assertSourceUnchanged(root, before, { allowLockChange = false } = {}) {
  const after = await sourceSnapshot(root);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(name => !(allowLockChange && name === 'package-lock.json') && before[name] !== after[name]);
  if (changed.length) throw Error(`Candidate source changed during validation: ${changed.slice(0, 8).join(', ')}`);
  return { packageSHA256: sha256(await readFile(join(root, 'package.json'))), lockSHA256: sha256(await readFile(join(root, 'package-lock.json'))) };
}

export function containerArguments({ name, work, runtime, uid, gid, network = false, writable = true, nodeArgs }) {
  if (!/^bsc70-[a-f0-9-]{36}$/.test(name) || !Number.isInteger(uid) || uid <= 0 || !Number.isInteger(gid) || gid <= 0 ||
      !Array.isArray(nodeArgs) || nodeArgs.some(arg => typeof arg !== 'string') ||
      [work, runtime].some(path => !path.startsWith('/') || /[,\n\r]/.test(path)) || within(work, runtime) || within(runtime, work))
    throw Error('Invalid sandbox configuration');
  return ['create', '--name', name, '--platform', 'linux/amd64', '--pull', 'never',
    '--user', `${uid}:${gid}`, '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges=true',
    '--pids-limit', '128', '--memory', '2g', '--memory-swap', '2g', '--cpus', '2',
    '--ulimit', 'nofile=1024:1024', '--cgroupns', 'private', '--ipc', 'private',
    '--network', network ? 'bridge' : 'none', '--log-driver', 'none',
    '--mount', `type=bind,src=${work},dst=/work${writable ? '' : ',readonly'},bind-propagation=rprivate`,
    '--mount', `type=bind,src=${runtime},dst=/opt/node,readonly,bind-propagation=rprivate`,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=256m,mode=1777',
    '--tmpfs', `/home/node:rw,noexec,nosuid,nodev,size=64m,mode=700,uid=${uid},gid=${gid}`,
    '--workdir', '/work', ...Object.entries(ENV).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    '--entrypoint', NODE, SANDBOX_IMAGE, ...nodeArgs];
}

// Verify actual daemon configuration BEFORE starting every container, rather
// than treating a correct command-line string as proof of an immutable runtime.
export function assertContainerBoundary(info, { work, runtime, uid, gid, network, writable, nodeArgs }) {
  const h = info.HostConfig, c = info.Config;
  const env = Object.fromEntries(c.Env.map(item => { const i = item.indexOf('='); return [item.slice(0, i), item.slice(i + 1)]; }));
  const mounts = info.Mounts.filter(m => m.Type !== 'tmpfs');
  if (h.Privileged || !h.ReadonlyRootfs || c.User !== `${uid}:${gid}` || h.PidMode !== '' || h.IpcMode !== 'private' ||
      h.CgroupnsMode !== 'private' || h.NetworkMode !== (network ? 'bridge' : 'none') || h.CapAdd?.length ||
      h.CapDrop?.join(',') !== 'ALL' || !h.SecurityOpt?.includes('no-new-privileges=true') ||
      h.SecurityOpt.some(opt => /unconfined/.test(opt)) || h.PidsLimit !== 128 || h.Memory !== 2147483648 ||
      h.MemorySwap !== h.Memory || h.NanoCpus !== 2000000000 || h.Devices?.length || h.DeviceRequests?.length ||
      h.VolumesFrom?.length || h.Binds?.length || mounts.length !== 2 ||
      !mounts.some(m => m.Type === 'bind' && m.Source === runtime && m.Destination === '/opt/node' && !m.RW && m.Propagation === 'rprivate') ||
      !mounts.some(m => m.Type === 'bind' && m.Source === work && m.Destination === '/work' && m.RW === writable && m.Propagation === 'rprivate') ||
      Object.keys(h.Tmpfs ?? {}).sort().join(',') !== '/home/node,/tmp' ||
      h.Tmpfs['/tmp'] !== 'rw,noexec,nosuid,nodev,size=256m,mode=1777' ||
      h.Tmpfs['/home/node'] !== `rw,noexec,nosuid,nodev,size=64m,mode=700,uid=${uid},gid=${gid}` ||
      JSON.stringify(c.Entrypoint) !== JSON.stringify([NODE]) || JSON.stringify(c.Cmd) !== JSON.stringify(nodeArgs) ||
      Object.keys(env).length !== Object.keys(ENV).length || Object.entries(ENV).some(([k, v]) => env[k] !== v))
    throw Error('Container boundary verification failed');
}

export async function createDependencySandbox(candidate, { nodeVersion = NODE_VERSION, recoveryNodeAuthorization } = {}) {
  assertCandidateNodeVersion(nodeVersion, recoveryNodeAuthorization);
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.version !== `v${nodeVersion}` || !process.getuid?.() || !process.getgid?.())
    throw Error(`Sandbox requires nonroot Linux x64 host Node ${nodeVersion}`);
  const runtime = await realpath(resolve(dirname(process.execPath), '..'));
  if (await realpath(join(runtime, 'bin/node')) !== await realpath(process.execPath)) throw Error('Unexpected trusted runtime');
  const scratch = await mkdtemp(join(tmpdir(), 'bsc70-sandbox-'));
  const work = join(scratch, 'work'), dockerHome = join(scratch, 'docker-home');
  const uid = process.getuid(), gid = process.getgid();
  const docker = (args, options = {}) => execute(DOCKER, [...DOCKER_PREFIX, ...args], {
    env: { PATH: '/usr/bin:/bin', HOME: dockerHome }, timeout: 30_000, maxBuffer: 8_000_000, ...options,
  });
  try {
    await mkdir(dockerHome);
    const original = await sourceSnapshot(candidate);
    await cp(candidate, work, { recursive: true, dereference: false, filter: path => !OMIT.has(relative(candidate, path).split(sep)[0]) });
    const pristine = await sourceSnapshot(work);
    if (JSON.stringify(original) !== JSON.stringify(pristine)) throw Error('Candidate copy differs from original source');
    const { stdout } = await docker(['image', 'inspect', SANDBOX_IMAGE]);
    const [image] = JSON.parse(stdout);
    if (image.Os !== 'linux' || image.Architecture !== 'amd64' || !image.RepoDigests?.some(d => d.endsWith(SANDBOX_IMAGE.split('@')[1])))
      throw Error('Pinned sandbox image missing or invalid; pull the reviewed digest first');
    const runtimeHashes = await Promise.all(['bin/node', 'lib/node_modules/npm/bin/npm-cli.js'].map(async path => sha256(await readFile(join(runtime, path)))));
    const commands = [];
    return {
      work, pristine, commands, expectedNodeVersion: nodeVersion,
      async run(args, { network = false, writable = true, rawNode = false, timeout = 8 * 60_000 } = {}) {
        const name = `bsc70-${randomUUID()}`;
        const nodeArgs = rawNode ? args : [NPM, ...args, '--ignore-scripts', '--strict-peer-deps', '--registry=https://registry.npmjs.org'];
        const config = { name, work, runtime, uid, gid, network, writable, nodeArgs };
        let stdout = '', stderr = '', code = 0, created = false, attachFailed = false;
        try {
          await docker(containerArguments(config)); created = true;
          const inspected = JSON.parse((await docker(['inspect', name])).stdout)[0];
          if (inspected.Image !== image.Id) throw Error('Sandbox image identity changed');
          assertContainerBoundary(inspected, config);
          // Record only host-verified properties, never values emitted by plugins.
          commands.push({ container: name, image: SANDBOX_IMAGE, nodeVersion, runtimeReadOnly: true,
            privatePID: true, nonroot: true, network: network ? 'bridge' : 'none' });
          try { ({ stdout, stderr } = await docker(['start', '--attach', name], { timeout })); }
          catch (error) {
            stdout = error.stdout || ''; stderr = error.stderr || ''; attachFailed = true;
            // A truncated log, timeout, or failed attach is infrastructure failure,
            // even if the container happens to report success afterwards.
            if (!Number.isInteger(error.code)) throw Error('Sandbox command timeout or output limit');
          }
          const ended = JSON.parse((await docker(['inspect', name])).stdout)[0];
          code = ended.State.ExitCode;
          if (ended.State.Status !== 'exited' || ended.State.Running || ended.State.OOMKilled || ended.State.Error || (attachFailed && code === 0)) throw Error('Sandbox command did not complete cleanly');
        } finally {
          if (created) await docker(['rm', '--force', name]); // kills ALL descendants before any host evidence read
        }
        const afterHashes = await Promise.all(['bin/node', 'lib/node_modules/npm/bin/npm-cli.js'].map(async path => sha256(await readFile(join(runtime, path)))));
        if (JSON.stringify(afterHashes) !== JSON.stringify(runtimeHashes)) throw Error('Trusted runtime changed');
        return { stdout, stderr, code };
      },
      verify: options => assertSourceUnchanged(work, pristine, options),
      async close() { await rm(scratch, { recursive: true, force: true }); },
    };
  } catch (error) { await rm(scratch, { recursive: true, force: true }); throw error; }
}
