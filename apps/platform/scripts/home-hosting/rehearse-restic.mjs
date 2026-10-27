// Local synthetic encryption/recovery rehearsal. No network backend, database
// connection, deployment, schedule, retention deletion, or production keys.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const [binaryArgument, outputArgument] = process.argv.slice(2);
assert.ok(binaryArgument && outputArgument, 'Usage: node rehearse-restic.mjs <pinned-restic-binary> <new-private-output-directory>');
assert.equal(process.arch, 'arm64');
assert.ok(['darwin', 'linux'].includes(process.platform));
const binary = realpathSync(binaryArgument), output = resolve(outputArgument);
const repository = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
assert.ok(output !== repository && !output.startsWith(repository + sep), 'Keep recovery artifacts and passwords outside the Git repository.');
assert.ok(!existsSync(output), 'Use a new directory; existing artifacts are preserved.');
assert.equal(lstatSync(dirname(output)).isSymbolicLink(), false);
assert.equal(lstatSync(dirname(output)).mode & 0o077, 0, 'Parent directory must be private (0700).');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const binaryDigests = {
  darwin: '06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768',
  linux: '2fb45ac6f9071b6f20eb883953a188f9e7c7cb6bbe43c67a2e47ada4e85ee7f0',
};
assert.equal(digest(readFileSync(binary)), binaryDigests[process.platform], 'Use the reviewed restic 0.19.1 ARM64 binary.');
process.umask(0o077);
mkdirSync(output, { mode: 0o700 });
const fixture = join(output, 'synthetic-capture');
mkdirSync(fixture, { mode: 0o700 });
mkdirSync(join(fixture, 'objects'), { mode: 0o700 });
const passwordFile = join(output, 'recovery-password.private');
writeFileSync(passwordFile, randomBytes(48).toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
const marker = 'ATS_RECOVERY_SYNTHETIC_' + randomBytes(16).toString('hex');
const bytes = randomBytes(256 * 1024);
const files = {
  'database-fixture.sql': Buffer.from(`-- Synthetic format fixture, not a PostgreSQL export.\n-- ${marker}\n`),
  'auth-fixture.json': Buffer.from(JSON.stringify({ userId: 'synthetic-user', passwordHash: marker })),
  'provider-state-fixture.json': Buffer.from(JSON.stringify({
    invoice: { totalCents: 45000, balanceCents: 0 },
    payment: { requestKey: marker, state: 'succeeded' },
    acceptedEmail: { providerKey: marker + '-accepted', state: 'accepted', attemptCount: 1 },
    uncertainEmail: { providerKey: marker + '-uncertain', state: 'unknown', retryAuthorized: false },
  })),
  ['objects/' + digest(bytes) + '.bin']: bytes,
};
for (const [name, data] of Object.entries(files)) writeFileSync(join(fixture, name), data, { mode: 0o600, flag: 'wx' });
writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({
  syntheticOnly: true, realDatabaseExport: false,
  files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, digest(data)])),
}), { mode: 0o600, flag: 'wx' });
files['manifest.json'] = readFileSync(join(fixture, 'manifest.json'));

const environment = {
  HOME: output, TMPDIR: output, PATH: '/usr/bin:/bin',
  GOMAXPROCS: '2', GOMEMLIMIT: '256MiB',
};
let sequence = 0;
function restic(repo, args, { success = true, password = passwordFile } = {}) {
  assert.ok(repo.startsWith(output + sep), 'Only this local rehearsal repository is permitted.');
  const result = spawnSync(binary, ['--repo', repo, '--password-file', password, '--no-cache', ...args], {
    cwd: fixture, env: environment, encoding: 'utf8', timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  writeFileSync(join(output, `${++sequence}-restic.private.log`), (result.stdout ?? '') + '\n' + (result.stderr ?? ''), { mode: 0o600, flag: 'wx' });
  if (success) assert.equal(result.status, 0, `Restic step ${sequence} failed; inspect its private log.`);
  else assert.ok(Number.isInteger(result.status) && result.status !== 0, 'The deliberately invalid operation must fail.');
  return result.stdout;
}
function allFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}
function verifyRestored(folder, expected) {
  for (const [name, data] of Object.entries(expected)) assert.equal(digest(readFileSync(join(folder, name))), digest(data), name);
}

const started = performance.now(), source = join(output, 'encrypted-repository');
restic(source, ['init', '--repository-version', '2']);
function backup() {
  const result = restic(source, ['backup', '--json', '--host', 'ats-synthetic-recovery-rehearsal', '--tag', 'synthetic-only', fixture]);
  const summary = result.trim().split('\n').map(line => JSON.parse(line)).find(line => line.message_type === 'summary');
  assert.match(summary?.snapshot_id, /^[a-f0-9]{64}$/);
  return summary.snapshot_id;
}
const originalSnapshot = backup();
const first = { ...files };
const changed = Buffer.from(files['provider-state-fixture.json'].toString() + '\n');
writeFileSync(join(fixture, 'provider-state-fixture.json'), changed, { mode: 0o600 });
files['provider-state-fixture.json'] = changed;
writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({
  syntheticOnly: true, realDatabaseExport: false,
  files: Object.fromEntries(Object.entries(files).filter(([name]) => name !== 'manifest.json').map(([name, data]) => [name, digest(data)])),
}), { mode: 0o600 });
files['manifest.json'] = readFileSync(join(fixture, 'manifest.json'));
const newerSnapshot = backup();
assert.notEqual(originalSnapshot, newerSnapshot);
restic(source, ['check', '--read-data']);
for (const path of allFiles(source)) assert.equal(readFileSync(path).includes(Buffer.from(marker)), false, 'Fixture content must be encrypted at rest.');

// A separate local repository copy tests recovery without the original repo.
// It is not evidence of upload to Supabase or survival of losing this Mac.
const independent = join(output, 'independent-encrypted-copy');
cpSync(source, independent, { recursive: true, errorOnExist: true, force: false });
restic(independent, ['check', '--read-data']);
const restored = join(output, 'restored-original');
restic(independent, ['restore', originalSnapshot + ':' + fixture, '--target', restored, '--verify']);
verifyRestored(restored, first);
const restoredNewer = join(output, 'restored-newer');
restic(independent, ['restore', newerSnapshot + ':' + fixture, '--target', restoredNewer, '--verify']);
verifyRestored(restoredNewer, files);
const wrongPassword = join(output, 'wrong-password.private');
writeFileSync(wrongPassword, randomBytes(48).toString('base64') + '\n', { mode: 0o600, flag: 'wx' });
restic(independent, ['snapshots'], { success: false, password: wrongPassword });

const corrupt = join(output, 'deliberately-corrupted-copy');
cpSync(source, corrupt, { recursive: true, errorOnExist: true, force: false });
const pack = allFiles(join(corrupt, 'data'))[0];
assert.ok(pack);
const damaged = readFileSync(pack); damaged[0] ^= 1;
chmodSync(pack, 0o600); // Only the disposable corruption fixture, never the good repository.
writeFileSync(pack, damaged, { mode: 0o600 });
restic(corrupt, ['check', '--read-data'], { success: false });
const report = {
  scope: 'Local synthetic encrypted-file recovery only',
  resticVersion: '0.19.1', encryptionAndIndependentLocalCopyVerified: true,
  restoredFilesPerSnapshot: Object.keys(files).length, snapshotsRestored: 2,
  acceptedAndUncertainProviderStateRetainedAsBytes: true,
  wrongPasswordRejected: true, corruptedPackDetected: true,
  elapsedMilliseconds: Math.round(performance.now() - started),
  realDatabaseRestoreTested: false, hostedS3CompatibilityTested: false,
  offsiteRecoveryVerified: false, fiveMinuteRecoveryTargetProven: false,
  hostServicesChanged: false, productionChanged: false,
};
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
