// Offline packet preparation and read-only Mac screening. No install/start mode.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statfsSync, writeFileSync } from 'node:fs';
import { arch, availableParallelism, homedir, platform, totalmem } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PACKET_FILES = Object.freeze([
  'MACBOOK_SCANNER_SETUP.md',
  'SCANNER_HOSTING_AND_RESTORE.md',
  'SCANNER_ACTIVATION_REVIEW.md',
  'SCANNER_ACTIVATION_RUNBOOK.md',
  'scripts/private-scanner/bridge.mjs',
  'scripts/private-scanner/token.mjs',
  'scripts/private-scanner/probe.mjs',
  'scripts/private-scanner/hosting/compose.yaml',
  'scripts/private-scanner/hosting/Engine.Dockerfile',
  'scripts/private-scanner/hosting/Bridge.Dockerfile',
  'scripts/private-scanner/hosting/Proxy.Dockerfile',
  'scripts/private-scanner/hosting/clamd.conf',
  'scripts/private-scanner/hosting/freshclam.conf',
  'scripts/private-scanner/hosting/nginx.conf',
  'scripts/private-scanner/hosting/coredump.conf',
  'scripts/private-scanner/hosting/inspect-host.mjs',
  'scripts/private-scanner/hosting/README.md',
  'scripts/private-scanner/hosting/LOCAL_VERIFICATION.json',
  'scripts/private-scanner/home-mac/lima.yaml',
  'scripts/private-scanner/home-mac/prepare.mjs',
]);
const GiB = 1024 ** 3;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const keysEqual = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const safeAbsolute = path => {
  if (typeof path !== 'string' || !isAbsolute(path) || normalize(path) !== path || /[\x00-\x1f]/.test(path)) {
    throw Error('Use a normalized absolute local path.');
  }
  return path;
};

export function assessMac(facts) {
  const version = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(facts.macOSVersion ?? '');
  const checks = {
    macOS: facts.platform === 'darwin',
    appleSilicon: facts.architecture === 'arm64',
    supportedVZ: Boolean(version && (+version[1] > 13 || (+version[1] === 13 && +version[2] >= 5))),
    physicalMemory: Number.isFinite(facts.memoryBytes) && facts.memoryBytes >= 16 * GiB,
    cpuCapacity: Number.isInteger(facts.cpus) && facts.cpus >= 4,
    // Conservative preparation allowance: 64 GiB virtual disk plus build/update headroom.
    freeDisk: Number.isFinite(facts.freeDiskBytes) && facts.freeDiskBytes >= 80 * GiB,
  };
  return { checks, preliminaryMacSuitable: Object.values(checks).every(Boolean),
    readyForActivation: false, settingsChanged: false,
    plannedGuest: { architecture: 'arm64', memoryGiB: 8, cpus: 4, diskGiB: 64 },
    pending: ['Actual guest rootless/cgroup/no-swap checks and native synthetic corpus',
      'Host FileVault, memory pressure, power/sleep, operator and recovery review',
      'Home ISP reachability, approved network boundary, trusted TLS and external denial tests',
      'Separate staging credentials, monitor and explicit activation review'] };
}

export function inspectMac() {
  const macOSVersion = platform() === 'darwin'
    ? execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8', timeout: 5000 }).trim() : null;
  const disk = statfsSync(homedir());
  // Only selected numeric/OS facts, never serial numbers, names, paths, env or addresses.
  const facts = { platform: platform(), architecture: arch(), macOSVersion,
    memoryBytes: totalmem(), cpus: availableParallelism(), freeDiskBytes: disk.bavail * disk.bsize };
  return { scope: 'Read-only current Mac screening; not evidence about another Mac', facts, ...assessMac(facts) };
}

export function writePacket(destination, { sourceCommit, readSource }) {
  safeAbsolute(destination);
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw Error('A full committed source revision is required.');
  // Read the explicit source set before creating anything. Never crawl the repo.
  const files = PACKET_FILES.map(path => ({ path, bytes: Buffer.from(readSource(path)) }));
  if (realpathSync(dirname(destination)) !== dirname(destination)) throw Error('Destination parent must not be a symlink.');
  mkdirSync(destination, { mode: 0o700 }); // exclusive: existing destinations are never replaced
  const manifest = { format: 1, sourceCommit, scope: 'offline-home-mac-preparation',
    host: null, origin: null, credentialsIncluded: false, readyForActivation: false,
    files: files.map(({ path, bytes }) => ({ path, sha256: digest(bytes), bytes: bytes.length })) };
  for (const file of files) {
    mkdirSync(dirname(join(destination, file.path)), { recursive: true, mode: 0o700 });
    writeFileSync(join(destination, file.path), file.bytes, { flag: 'wx', mode: 0o600 });
  }
  writeFileSync(join(destination, 'PACKET_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return verifyPacket(destination);
}

export function verifyPacket(directory) {
  safeAbsolute(directory);
  if (!lstatSync(directory).isDirectory() || realpathSync(directory) !== directory) throw Error('Use a real local packet directory.');
  const found = [];
  function walk(path) {
    for (const entry of readdirSync(path)) {
      const full = join(path, entry), stat = lstatSync(full), rel = relative(directory, full).split('\\').join('/');
      if (stat.isSymbolicLink()) throw Error('Packet symlinks are forbidden.');
      if (stat.isDirectory()) {
        if (!PACKET_FILES.some(file => file.startsWith(rel + '/'))) throw Error('Unexpected packet directory.');
        walk(full);
      } else if (stat.isFile()) found.push(rel);
      else throw Error('Packet must contain regular files only.');
    }
  }
  walk(directory);
  const expected = [...PACKET_FILES, 'PACKET_MANIFEST.json'].sort();
  if (JSON.stringify(found.sort()) !== JSON.stringify(expected)) throw Error('Missing or unexpected packet files.');
  const manifest = JSON.parse(readFileSync(join(directory, 'PACKET_MANIFEST.json'), 'utf8'));
  if (!keysEqual(manifest, ['format','sourceCommit','scope','host','origin','credentialsIncluded','readyForActivation','files'])
    || manifest.format !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
    || manifest.scope !== 'offline-home-mac-preparation' || manifest.host !== null || manifest.origin !== null
    || manifest.credentialsIncluded !== false || manifest.readyForActivation !== false
    || !Array.isArray(manifest.files) || manifest.files.length !== PACKET_FILES.length) throw Error('Invalid preparation manifest.');
  const listed = new Set();
  for (const file of manifest.files) {
    if (!keysEqual(file, ['path','sha256','bytes']) || !PACKET_FILES.includes(file.path) || listed.has(file.path)
      || !/^[a-f0-9]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw Error('Invalid packet file entry.');
    listed.add(file.path);
    const bytes = readFileSync(join(directory, file.path));
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw Error('Packet content failed verification.');
  }
  return { integrityVerified: true, sourceCommit: manifest.sourceCommit, fileCount: listed.size,
    manifestSha256: digest(readFileSync(join(directory, 'PACKET_MANIFEST.json'))),
    readyForActivation: false, credentialsIncluded: false };
}

export function prepareCommittedPacket(destination) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const git = args => execFileSync('git', args, { cwd: root, timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
  const sourceCommit = git(['rev-parse','HEAD']).toString().trim();
  return writePacket(destination, { sourceCommit,
    readSource: path => git(['show', `${sourceCommit}:apps/platform/${path}`]) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log('prepare.mjs --check-mac | --prepare /absolute/NEW-directory | --verify /absolute/packet-directory\nOffline preparation only. No install/start, service credentials or cloud operations.');
    } else if (args.length === 1 && args[0] === '--check-mac') {
      const result = inspectMac(); console.log(JSON.stringify(result, null, 2));
      if (!result.preliminaryMacSuitable) process.exitCode = 1;
    } else if (args.length === 2 && ['--prepare','--verify'].includes(args[0])) {
      const result = args[0] === '--prepare' ? prepareCommittedPacket(args[1]) : verifyPacket(args[1]);
      console.log(JSON.stringify(result, null, 2));
    } else throw Error('Invalid mode.');
  } catch {
    console.error('Preparation/check failed. Use --help; verify the source commit, new destination or packet integrity privately. No services or settings were changed. A partial new packet, if present, is not verified.');
    process.exitCode = 1;
  }
}
