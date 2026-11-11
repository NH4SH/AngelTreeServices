// Actual durable filesystem custody for the future original-host guardian.
// Internal module: the production entry point must supply fixed, reviewed paths
// and the independently pinned installation digest. No bootstrap or activation
// constructor exists here. A restored database alone cannot create these files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, posix } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const HASH = /^[a-f0-9]{64}$/u, ID = /^[a-f0-9]{32}$/u;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;
const INSTALL_KEYS = ['kind','primaryInstallationId','bindingSha256','systemIdentifier',
  'originalHostIdentitySha256','databaseStorageIdentitySha256'];
const STATE_KEYS = ['kind','primaryInstallationId','bindingSha256','operationSequence',
  'nativeWalLsn','reservedAtMs','databaseBoot','sourceBoot'];
const OBSERVATION_KEYS = ['primaryInstallationId','bindingSha256','systemIdentifier',
  'originalHostIdentitySha256','databaseStorageIdentitySha256','nativeWalLsn',
  'observedAtMs','databaseBoot','sourceBoot'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const positive = n => Number.isSafeInteger(n) && n > 0;
function exact(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}
function parse(bytes) {
  const text = bytes.toString('utf8');
  assert(Buffer.from(text).equals(bytes) && !text.startsWith('\uFEFF'));
  return JSON.parse(text);
}
function lsn(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^(?:0|[1-9A-F][0-9A-F]{0,7})\/(?:0|[1-9A-F][0-9A-F]{0,7})$/u);
  const [hi, lo] = value.split('/');
  return (BigInt('0x' + hi) << 32n) + BigInt('0x' + lo);
}
function identity(a, b) {
  assert(['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs']
    .every(key => a[key] === b[key]), 'Private custody file changed during read');
}
function privateFile(path, uid, maximum = 4096) {
  const before = fs.lstatSync(path);
  assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1);
  assert.equal(before.uid, uid); assert.equal(before.mode & 0o7777, 0o600);
  assert(before.size > 0 && before.size <= maximum);
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    identity(before, fs.fstatSync(fd));
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0, count;
    do { count = fs.readSync(fd, bytes, length, bytes.length - length, null); length += count; }
    while (count && length < bytes.length);
    assert(length <= maximum);
    identity(before, fs.fstatSync(fd)); identity(before, fs.lstatSync(path));
    return bytes.subarray(0, length);
  } finally { fs.closeSync(fd); }
}
function assertDirectory(root, uid) {
  assert.equal(posix.normalize(root), root); assert(root.startsWith('/') && root !== '/');
  assert.equal(fs.realpathSync(root), root);
  for (let p = root;; p = dirname(p)) {
    const st = fs.lstatSync(p);
    assert(st.isDirectory() && !st.isSymbolicLink());
    assert(st.uid === 0 || st.uid === uid);
    assert.equal(st.mode & 0o7022, 0, 'Unsafe custody directory');
    if (p === root) { assert.equal(st.uid, uid); assert.equal(st.mode & 0o7777, 0o700); }
    if (p === '/') break;
  }
}
function assertLock(root, uid) {
  assertDirectory(root, uid);
  const lock = fs.lstatSync(root + '/guardian.lock');
  assert(lock.isFile() && !lock.isSymbolicLink() && lock.nlink === 1);
  assert.equal(lock.uid, uid); assert.equal(lock.mode & 0o7777, 0o600);
  const parent = process.ppid;
  assert.equal(fs.realpathSync('/proc/' + parent + '/exe'), '/usr/bin/flock');
  // The fixed wrapper starts flock with only standard FDs. Its sole opened
  // lock is FD3; inspect only our parent's exact FD, never global processes.
  const fd = '/proc/' + parent + '/fd/3';
  const held = fs.statSync(fd);
  assert.equal(held.dev, lock.dev); assert.equal(held.ino, lock.ino);
  const info = fs.readFileSync('/proc/' + parent + '/fdinfo/3', 'utf8');
  assert(info.length < 4096);
  const matches = [...info.matchAll(/^lock:\s+\d+: FLOCK\s+ADVISORY\s+WRITE\s+(\d+)\s+([a-f0-9]+):([a-f0-9]+):(\d+)\s+0\s+EOF$/gmu)];
  assert.equal(matches.length, 1, 'Original guardian kernel lock is not held');
  const m = matches[0], dev = BigInt(lock.dev);
  const major = ((dev >> 8n) & 0xfffn) | ((dev >> 32n) & 0xfffff000n);
  const minor = (dev & 0xffn) | ((dev >> 12n) & 0xffffff00n);
  assert.equal(Number(m[1]), parent); assert.equal(BigInt('0x' + m[2]), major);
  assert.equal(BigInt('0x' + m[3]), minor); assert.equal(BigInt(m[4]), BigInt(lock.ino));
  assert.equal(process.ppid, parent);
}
function validateState(state, installation) {
  exact(state, STATE_KEYS); assert.equal(state.kind, 'ats-original-installation-journal-v1');
  assert.equal(state.primaryInstallationId, installation.primaryInstallationId);
  assert.equal(state.bindingSha256, installation.bindingSha256);
  assert(Number.isSafeInteger(state.operationSequence) && state.operationSequence >= 0);
  lsn(state.nativeWalLsn);
  assert(Number.isSafeInteger(state.reservedAtMs) && state.reservedAtMs >= 0);
  if (state.operationSequence === 0) {
    assert.equal(state.reservedAtMs, 0); assert.equal(state.databaseBoot, null); assert.equal(state.sourceBoot, null);
  } else {
    assert(positive(Date.parse(state.databaseBoot))); assert.match(state.sourceBoot, UUID);
    assert(positive(state.reservedAtMs) && Date.parse(state.databaseBoot) <= state.reservedAtMs);
  }
}

export function openGuardianJournal({ root, uid, expectedInstallationSha256 }) {
  assert.equal(process.platform, 'linux'); assert(positive(uid)); assert.equal(process.getuid(), uid);
  assert.match(expectedInstallationSha256, HASH); assertLock(root, uid);
  const installationBytes = privateFile(root + '/installation.json', uid);
  assert.equal(hash(installationBytes), expectedInstallationSha256, 'Original installation custody is absent or changed');
  const installation = parse(installationBytes); exact(installation, INSTALL_KEYS);
  assert.equal(installation.kind, 'ats-original-installation-custody-v1');
  assert.match(installation.primaryInstallationId, ID);
  for (const key of ['bindingSha256','originalHostIdentitySha256','databaseStorageIdentitySha256'])
    assert.match(installation[key], HASH);
  assert.match(installation.systemIdentifier, /^[0-9]{16,20}$/u);
  function state() {
    assertLock(root, uid);
    assert(privateFile(root + '/installation.json', uid).equals(installationBytes));
    const s = parse(privateFile(root + '/journal.json', uid)); validateState(s, installation); return s;
  }
  function verifyObservation(observation, previous = state()) {
    exact(observation, OBSERVATION_KEYS);
    for (const key of OBSERVATION_KEYS.slice(0, 5)) assert.equal(observation[key], installation[key], 'Original host/database custody differs');
    assert(lsn(observation.nativeWalLsn) >= lsn(previous.nativeWalLsn), 'Database WAL regressed against original-host high-water mark');
    assert(positive(observation.observedAtMs)); assert.match(observation.sourceBoot, UUID);
    assert(positive(Date.parse(observation.databaseBoot)) && Date.parse(observation.databaseBoot) <= observation.observedAtMs);
    return previous;
  }
  // A temporary file left before rename cannot have preceded SQL execution:
  // reserve returns only after file+directory fsync and independent readback.
  state();
  const orphans = fs.readdirSync(root).filter(n => /^\.journal-[a-f0-9]{32}\.tmp$/u.test(n));
  assert(orphans.length <= 4, 'Too many incomplete custody writes');
  for (const name of orphans) {
    const s = fs.lstatSync(root + '/' + name);
    assert(s.isFile() && !s.isSymbolicLink() && s.nlink === 1 && s.uid === uid);
    assert.equal(s.mode & 0o7777, 0o600); assert(s.size <= 4096);
    fs.unlinkSync(root + '/' + name);
  }
  state();
  return Object.freeze({
    installation: Object.freeze({ ...installation }),
    read: () => Object.freeze(state()),
    verifyObservation: observation => Object.freeze(verifyObservation(observation)),
    reserve(observation) {
      const previous = verifyObservation(observation);
      const sequence = previous.operationSequence + 1; assert(positive(sequence));
      const next = { kind: previous.kind, primaryInstallationId: installation.primaryInstallationId,
        bindingSha256: installation.bindingSha256, operationSequence: sequence,
        nativeWalLsn: observation.nativeWalLsn, reservedAtMs: observation.observedAtMs,
        databaseBoot: observation.databaseBoot, sourceBoot: observation.sourceBoot };
      validateState(next, installation);
      const bytes = Buffer.from(JSON.stringify(next) + '\n'); assert(bytes.length <= 4096);
      const temporary = root + '/.journal-' + randomBytes(16).toString('hex') + '.tmp';
      const fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      assertLock(root, uid); assert.deepEqual(state(), previous);
      fs.renameSync(temporary, root + '/journal.json');
      const directory = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      assert(privateFile(root + '/journal.json', uid).equals(bytes));
      assertLock(root, uid);
      return Object.freeze(next);
    },
  });
}
