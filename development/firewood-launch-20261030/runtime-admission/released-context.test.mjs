// Synthetic, in-process fixtures only. No actual descriptor, database, provider or mount is created.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, rmSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signProof } from './upstream/failover-proof.mjs';
import { FIXED_RELEASE, MODES, sha256,
  validateReleasedSnapshot, privateConfigurationMatches, sameRelease } from './released-context-core.mjs';
import { FIXED_PATHS, readBoundedFile, assertReadOnlyMount, readFixedSnapshot, assertLatchAbsent } from './release-filesystem.mjs';
import { readReleasedContext, createReleasedDependenciesFactory, getReleasedDependencies } from './released-context.mjs';

import { bytes, changed, testSigningSecret, pair, fixture, resign, configFor } from './test-fixture.mjs';

test('real upstream signature verification returns frozen public provenance, never SQL admission or credentials', () => {
  const { snapshot } = fixture();
  for (const mode of MODES) {
    const context = validateReleasedSnapshot(snapshot, mode);
    assert.equal(context.mode, mode); assert.ok(Object.isFrozen(context) && Object.isFrozen(context.modes));
    assert.equal(context.admitted, undefined); assert.equal(context.recoveryAuthorityId, undefined);
    assert.equal(context.bindingSha256, sha256(snapshot.binding));
    assert.notEqual(context.releaseSha256, context.receiptComponentSha256);
    assert.equal(context.backupVerifiedAtMs, snapshot.wallMs - 50000);
    assert.equal(context.backupAgeMs, 60000);
    assert.equal(context.observedMonotonicMs, snapshot.monotonicMs);
    assert.equal(context.stripeKeyFingerprint, '8'.repeat(64));
    assert.equal(context.installationOverlaySha256, 'a'.repeat(64));
    const serialized = JSON.stringify(context);
    for (const sensitive of [testSigningSecret, 'privateKey', 'signingSecret', 'encryptionKey', 'password', 'envelope'])
      assert.equal(serialized.includes(sensitive), false);
  }
});
test('public backup age and remaining deadline use actual source monotonic time', () => {
  const { snapshot } = fixture(); snapshot.monotonicMs += 1500.1;
  const context = validateReleasedSnapshot(snapshot, 'status');
  assert.equal(context.backupAgeMs, 61501);
  assert.equal(context.expiresAtMs, snapshot.wallMs + 218499);
  assert.equal(context.receiptExpiresAtMs, snapshot.wallMs + 220000);
});
test('public remaining deadline never exceeds the earlier signed wall expiry', () => {
  const { snapshot } = fixture(); snapshot.wallMs += 1500;
  const context = validateReleasedSnapshot(snapshot, 'status');
  assert.equal(context.backupAgeMs, 60000);
  assert.equal(context.expiresAtMs, context.receiptExpiresAtMs);
  assert.ok(context.expiresAtMs < snapshot.wallMs + 220000);
});

const negatives = [
  ['unknown mode', s => {}, 'all'], ['wrong OS', s => { s.platform = 'darwin'; }],
  ['operator UID is not app UID', s => { s.uid = 0; }], ['fenced latch', s => { s.latchAbsent = false; }],
  ['missing source bytes', s => { s.binding = Buffer.from('{}'); }],
  ['byte changed binding including whitespace', s => { s.binding = Buffer.concat([s.binding, Buffer.from('\n')]); }],
  ['wrong schema hash format', s => changed(s, 'descriptor', d => { d.schemaSha256 = 'not-a-hash'; })],
  ['wrong Stripe key hash format', s => changed(s, 'descriptor', d => { d.stripeKeyFingerprint = 'rk_live_prefix_only'; })],
  ['missing root overlay pin', s => changed(s, 'descriptor', d => { delete d.installationOverlaySha256; })],
  ['unbound root overlay pin', s => changed(s, 'descriptor', d => { d.installationOverlaySha256 = 'UNBOUND'; })],
  ['root overlay differs from signed binding', s => changed(s, 'descriptor', d => { d.installationOverlaySha256 = '0'.repeat(64); })],
  ['extra unreviewed descriptor field', s => changed(s, 'descriptor', d => { d.syntheticBypass = true; })],
  ['wrong control kind', s => changed(s, 'descriptor', d => { d.kind = 'certificate'; })],
  ['wrong base recovery closure', s => changed(s, 'descriptor', d => { d.baseRecoverySourceManifestSha256 = '0'.repeat(64); })],
  ...Object.keys(FIXED_RELEASE).map(key => ['wrong fixed ' + key, s => changed(s, 'descriptor', d => { d[key] += '/changed'; })]),
  ['wrong authority key fingerprint', s => changed(s, 'descriptor', d => { d.authorityPublicKeyFingerprint = '0'.repeat(64); })],
  ['wrong source boot', s => { s.bootId = Buffer.from('00000000-0000-4000-8000-000000000000'); }],
  ['wrong generation descriptor', s => changed(s, 'descriptor', d => { d.generation += 1; })],
  ['wrong topology descriptor', s => changed(s, 'descriptor', d => { d.topologyFingerprint = '0'.repeat(32); })],
  ['missing worker marker', s => { s.workersReleased = bytes({}); }],
  ['wrong worker generation', s => changed(s, 'workersReleased', d => { d.generation += 1; })],
  ['wrong worker namespace', s => changed(s, 'workersReleased', d => { d.namespace = 'other'; })],
  ['provider reconciliation not verified', s => changed(s, 'workersReleased', d => { d.providerReconciliationVerified = false; })],
  ['missing explicit requested mode', s => changed(s, 'descriptor', d => { delete d.modes.office; }), 'office'],
  ['disabled requested mode', s => changed(s, 'descriptor', d => { d.modes.office = false; }), 'office'],
  ['status disabled also closes office', s => changed(s, 'descriptor', d => { d.modes.status = false; }), 'office'],
  ['invalid boolean flag', s => changed(s, 'descriptor', d => { d.modes.collection = 1; }), 'office'],
  ['unsigned claims mirror differs', s => changed(s, 'active', a => { a.claims.sequence = 2; })],
  ['signature corrupted', s => changed(s, 'active', a => { a.envelope.signature = 'A'.repeat(86); })],
  ['payload corrupted', s => changed(s, 'active', a => { a.envelope.payload = Buffer.from('{}').toString('base64url'); })],
  ['wrong signing public key', s => { s.authorityPublicKey = Buffer.from(generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' })); }],
  ['receipt wrong generation', s => resign(s, c => { c.generation = 5; })],
  ['receipt changed exact source binding', s => resign(s, c => { c.binding.timeline = 2; })],
  ['receipt private file state unverified', s => resign(s, c => { c.privateFileStateVerified = false; })],
  ['receipt private pair mismatch', s => resign(s, c => { c.privatePairSha256 = '0'.repeat(64); })],
  ['receipt recovery chain incomplete', s => resign(s, c => { c.completeRecoveryChain = false; })],
  ['receipt expiry enlarged', s => resign(s, c => { c.expiresAt = new Date(s.wallMs + 280000).toISOString(); })],
  ['expired wall deadline', s => { s.wallMs += 220000; s.monotonicMs += 220000; }],
  ['expired monotonic deadline', s => { s.monotonicMs += 220000; }],
  ['future signed monotonic capture', s => {
    resign(s, c => { c.captureStartedBootMs = s.monotonicMs + 1; });
    changed(s, 'active', a => { a.deadlineBootMs = a.claims.captureStartedBootMs + 280000; });
  }],
  ['wall clock jumped', s => { s.wallMs += 3000; }],
  ['clock rollback', s => { s.wallMs -= 3000; }],
  ['monotonic rollback before anchor', s => { s.monotonicMs -= 41000; }],
  ['invalid anchor', s => changed(s, 'active', a => { a.anchor.monotonic = null; })],
  ['forged deadline', s => changed(s, 'active', a => { a.deadlineBootMs += 1000; })],
  ['malformed JSON', s => { s.descriptor = Buffer.from('{'); }],
  ['invalid UTF8', s => { s.descriptor = Buffer.from([0xff, 0xfe]); }],
];
for (const [name, mutate, mode = 'status'] of negatives) test('rejects ' + name, () => {
  const { snapshot } = fixture(); mutate(snapshot); assert.throws(() => validateReleasedSnapshot(snapshot, mode));
});

for (const [name, mutate] of [
  ['current namespace with newer generation', b => { b.namespace = 'ats-home-continuous-7445a45dddd9'; }],
  ['generation 3 even with new namespace', b => { b.generation = 3; }],
  ['synthetic binding', b => { delete b.environment; b.sourceId = 'ats_crm_candidate_20261027'; b.namespace = 'ats-rehearsal-continuous-abcdef012345'; }],
  ['wrong database boot', b => { b.databaseBoot = 'invalid'; }],
  ['missing signed overlay', b => { delete b.installationOverlaySha256; }],
  ['changed signed overlay without matching root pin', b => { b.installationOverlaySha256 = '0'.repeat(64); }],
]) test('rejects coherent but unapproved ' + name, () => {
  const { snapshot, binding } = fixture(); mutate(binding);
  snapshot.binding = bytes(binding);
  changed(snapshot, 'descriptor', d => {
    d.bindingSha256 = sha256(snapshot.binding); d.namespace = binding.namespace; d.generation = binding.generation;
    d.sourceId = binding.sourceId; d.sourceEnvironment = binding.environment; d.databaseBoot = binding.databaseBoot;
  });
  changed(snapshot, 'active', a => {
    a.claims.binding = binding; a.claims.namespace = binding.namespace; a.claims.generation = binding.generation;
    a.envelope = signProof(a.claims, pair.privateKey);
  });
  assert.throws(() => validateReleasedSnapshot(snapshot, 'status'));
});

test('private configuration must match the root-attested key and fixed live identities', () => {
  const context = validateReleasedSnapshot(fixture().snapshot, 'office'), config = configFor(context);
  assert.equal(privateConfigurationMatches(context, config), true);
  assert.equal(privateConfigurationMatches(context, { ...config, stripeKeyFingerprint: context.stripeKeyFingerprint }), true);
  assert.equal(privateConfigurationMatches(context, { ...config, stripeKeyFingerprint: '0'.repeat(64) }), false);
  assert.equal(privateConfigurationMatches(context, { ...config, stripeKeyFingerprint: undefined }), false);
  for (const [key, value] of [['signingSecret', 'A'.repeat(40)], ['signingSecret', ' '.repeat(40)],
    ['keyId', 'other_key_0001'], ['contract', 'other'], ['sourceId', 'other'], ['accountId', 'other'],
    ['enabled', false], ['officeEnabled', false], ['encryptionKey', Buffer.alloc(31)], ['collectorReady', undefined]])
    assert.equal(privateConfigurationMatches(context, { ...config, [key]: value }), false, key);
  const collection = validateReleasedSnapshot(fixture().snapshot, 'collection');
  assert.equal(privateConfigurationMatches(collection, { ...configFor(collection), collectorReady: false }), false);
});
test('release continuity rejects changed release, key, boot and mode flags', () => {
  const a = validateReleasedSnapshot(fixture().snapshot, 'status');
  assert.equal(sameRelease(a, a), true); assert.equal(sameRelease(a, null), false);
  for (const key of ['bindingSha256', 'schemaSha256', 'releaseSha256', 'installationOverlaySha256', 'namespace', 'sourceBoot', 'signingKeyFingerprint', 'stripeKeyFingerprint'])
    assert.equal(sameRelease(a, { ...a, [key]: 'different' }), false);
  assert.equal(sameRelease(a, { ...a, modes: { ...a.modes, office: false } }), false);
});

const roMount = '1 0 0:1 / / rw,relatime - overlay overlay rw\n2 1 0:2 / /admission ro,relatime - tmpfs tmpfs rw\n3 1 0:3 / /release-admission ro,relatime - tmpfs tmpfs rw\n';
function filesystem(snapshot, alter = () => {}) {
  const files = new Map(Object.entries(FIXED_PATHS).filter(([name]) => name !== 'latch' && name !== 'uptime')
    .map(([name, path]) => [path, snapshot[name]]));
  files.set('/proc/123/mountinfo', Buffer.from(roMount));
  files.set('/proc/uptime', Buffer.from(snapshot.monotonicMs / 1000 + ' 100.00\n'));
  const overrides = new Map(), fds = new Map(); let nextFd = 10;
  const stats = new Map(); let ino = 100;
  const stat = (path, directory = false) => {
    if (!stats.has(path)) stats.set(path, { dev: 1, ino: ino++, uid: path === '/proc/123' || path === '/proc/123/mountinfo' ? 1000 : 0,
      mode: directory ? 0o40755 : 0o100444, nlink: 1, size: files.get(path)?.length ?? 0,
      mtimeMs: 1, ctimeMs: 1, isDirectory: () => directory, isFile: () => !directory, isSymbolicLink: () => false });
    return { ...stats.get(path), ...overrides.get(path) };
  };
  const io = {
    lstatSync(path) {
      if (path === FIXED_PATHS.latch) { const error = new Error('missing'); error.code = 'ENOENT'; throw error; }
      if (files.has(path)) return stat(path);
      if ([...files.keys()].some(file => file.startsWith(path === '/' ? '/' : path + '/'))) return stat(path, true);
      const error = new Error('missing'); error.code = 'ENOENT'; throw error;
    },
    openSync(path, flags) { assert.ok(flags & constants.O_NOFOLLOW); assert.ok(flags & constants.O_NONBLOCK);
      const fd = nextFd++; fds.set(fd, { path, offset: 0 }); return fd; },
    fstatSync(fd) { return stat(fds.get(fd).path); },
    readSync(fd, buffer, offset, length) { const handle = fds.get(fd), data = files.get(handle.path);
      const count = Math.min(length, data.length - handle.offset);
      data.copy(buffer, offset, handle.offset, handle.offset + count); handle.offset += count; return count; },
    closeSync(fd) { fds.delete(fd); },
  };
  alter({ files, overrides, io, stat });
  return io;
}
test('faithful Linux readonly mount and root-owned control fixture permits a fresh snapshot', () => {
  const { snapshot } = fixture();
  const got = readFixedSnapshot({ platform: 'linux', uid: 1000, pid: 123, wallMs: snapshot.wallMs }, filesystem(snapshot));
  assert.equal(validateReleasedSnapshot(got, 'office').generation, 4);
});

for (const [name, alter] of [
  ['writable descriptor', ({ overrides }) => overrides.set(FIXED_PATHS.descriptor, { mode: 0o100644 })],
  ['wrong descriptor owner', ({ overrides }) => overrides.set(FIXED_PATHS.descriptor, { uid: 1000 })],
  ['control file hardlink', ({ overrides }) => overrides.set(FIXED_PATHS.descriptor, { nlink: 2 })],
  ['control file symlink', ({ overrides }) => overrides.set(FIXED_PATHS.descriptor, { isSymbolicLink: () => true })],
  ['parent symlink', ({ overrides }) => overrides.set('/admission', { isSymbolicLink: () => true })],
  ['writable control parent', ({ overrides }) => overrides.set('/admission', { mode: 0o40777 })],
  ['nonroot control parent', ({ overrides }) => overrides.set('/release-admission', { uid: 1000 })],
  ['oversized descriptor', ({ files }) => files.set(FIXED_PATHS.descriptor, Buffer.alloc(16385))],
  ['rw admission mount', ({ files }) => files.set('/proc/123/mountinfo', Buffer.from(roMount.replace('/admission ro,', '/admission rw,')))],
  ['rw descriptor file override mount', ({ files }) => files.set('/proc/123/mountinfo', Buffer.from(roMount + '4 3 0:4 / /release-admission/firewood-release.json rw - tmpfs tmpfs rw\n'))],
  ['unrelated readonly prefix', ({ files }) => files.set('/proc/123/mountinfo', Buffer.from(roMount.replace('/admission ', '/admission-other ')))],
  ['missing control file', ({ files }) => files.delete(FIXED_PATHS.active)],
  ['latch access denied', ({ io }) => { const real = io.lstatSync; io.lstatSync = path => {
    if (path !== FIXED_PATHS.latch) return real(path); const error = new Error('denied'); error.code = 'EACCES'; throw error; }; }],
  ['latch created during snapshot', ({ io }) => { const real = io.lstatSync; let calls = 0; io.lstatSync = path => {
    if (path !== FIXED_PATHS.latch || ++calls === 1) return real(path); return { isFile: () => true }; }; }],
  ['file replaced between lstat and open', ({ io }) => { const real = io.fstatSync; io.fstatSync = fd => ({ ...real(fd), ino: 99999 }); }],
  ['snapshot changed between reads', ({ io, files }) => { const real = io.closeSync; let closes = 0; io.closeSync = fd => {
    real(fd); if (++closes === 2) files.set(FIXED_PATHS.descriptor, Buffer.from('{}')); }; }],
]) test('filesystem rejects ' + name, () => {
  const { snapshot } = fixture();
  assert.throws(() => readFixedSnapshot({ platform: 'linux', uid: 1000, pid: 123, wallMs: snapshot.wallMs }, filesystem(snapshot, alter)));
});
test('mount parser respects readonly bind VFS flags, escaped paths and deepest mount only', () => {
  assert.equal(assertReadOnlyMount(roMount, FIXED_PATHS.descriptor), true);
  assert.equal(assertReadOnlyMount('1 0 0:1 / / rw - tmpfs tmpfs rw\n2 1 0:2 / /safe\\040place ro - tmpfs tmpfs rw', '/safe place/a'), true);
  for (const text of ['', 'bad', roMount + '4 1 0:5 / /release-admission ro - tmpfs tmpfs rw\n',
    '1 0 0:1 / /safe\\077place ro - tmpfs tmpfs rw'])
    assert.throws(() => assertReadOnlyMount(text, FIXED_PATHS.descriptor));
});
test('actual temporary symlink and user-owned file are denied without changing OS paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ats-release-reader-test-'));
  try {
    writeFileSync(join(dir, 'file'), 'not control metadata', { mode: 0o444 });
    symlinkSync(join(dir, 'file'), join(dir, 'link'));
    assert.throws(() => readBoundedFile(join(dir, 'file'), 128, { control: true }));
    assert.throws(() => readBoundedFile(join(dir, 'link'), 128, { control: true }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('production entry is fixed-path and closed locally; no supplier called and no installed dependencies', () => {
  assert.equal(readReleasedContext(), null); assert.equal(getReleasedDependencies(), null);
  let calls = 0;
  const factory = createReleasedDependenciesFactory('office', () => { calls++; return {}; });
  assert.equal(factory(), null); assert.equal(factory(), null); assert.equal(calls, 0);
  assert.throws(() => createReleasedDependenciesFactory('any', () => ({})));
  assert.throws(() => createReleasedDependenciesFactory('status', null));
  assert.equal(assertLatchAbsent(filesystem(fixture().snapshot)), true);
});
test('the six upstream verifier helpers are exact pinned copies', () => {
  const pins = JSON.parse(readFileSync(new URL('./UPSTREAM_PINS.json', import.meta.url)));
  assert.equal(pins.files.length, 6);
  for (const entry of pins.files) {
    const copy = readFileSync(new URL('./upstream/' + entry.name, import.meta.url));
    assert.equal(sha256(copy), entry.sha256);
    assert.equal(sha256(readFileSync(join(pins.source, entry.name))), entry.sha256);
  }
});
