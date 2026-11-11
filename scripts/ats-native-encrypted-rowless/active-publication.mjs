// Internal actual-filesystem publisher for the candidate guardian. It publishes
// only the newly reserved local operation under an already installed v2 binding.
// It has no database, role/mode, source-bootstrap or provider capability.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname, posix } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const KEYS = ['kind','bindingSha256','namespace','generation','operationSequence','sourceBoot',
  'databaseBoot','systemIdentifier','topologyFingerprint','primaryInstallationId','observedAtMs',
  'observedMonotonicMs','expiresAtMs','expiresAtBootMs'];
function directory(root, uid) {
  assert(root.startsWith('/') && root !== '/' && posix.normalize(root) === root);
  assert.equal(fs.realpathSync(root), root);
  for (let p = root;; p = dirname(p)) {
    const s = fs.lstatSync(p); assert(s.isDirectory() && !s.isSymbolicLink());
    assert(s.uid === 0 || s.uid === uid); assert.equal(s.mode & 0o7022, 0);
    if (p === root) { assert.equal(s.uid, uid); assert.equal(s.mode & 0o7777, 0o755); }
    if (p === '/') break;
  }
  return fs.lstatSync(root);
}
function read(root, name, uid) {
  const path = root + '/' + name, before = fs.lstatSync(path);
  assert(before.isFile() && !before.isSymbolicLink() && before.nlink === 1);
  assert.equal(before.uid, uid); assert.equal(before.mode & 0o7777, 0o444);
  assert(before.size > 0 && before.size <= 16384);
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const same = actual => assert(['dev','ino','uid','mode','nlink','size','ctimeMs','mtimeMs'].every(k => actual[k] === before[k]));
    same(fs.fstatSync(fd));
    const b = Buffer.alloc(16385); let n = 0, count;
    do { count = fs.readSync(fd, b, n, b.length - n, null); n += count; } while (count && n < b.length);
    assert(n > 0 && n <= 16384); same(fs.fstatSync(fd)); same(fs.lstatSync(path));
    return b.subarray(0, n);
  } finally { fs.closeSync(fd); }
}
function absent(path) {
  try { fs.lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
  throw Error('Local operation is held');
}
function clock() {
  for (const path of ['/proc/sys/kernel/random/boot_id','/proc/uptime'])
    assert.equal(fs.statfsSync(path, { bigint: true }).type, 0x9fa0n);
  const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
  const uptime = fs.readFileSync('/proc/uptime', 'utf8');
  assert.match(bootId, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
  assert(uptime.length <= 128); assert.match(uptime.trim(), /^[0-9]+(?:\.[0-9]+)? [0-9]+(?:\.[0-9]+)?$/u);
  return { bootId, bootMs: Number(uptime.split(' ')[0]) * 1000, wallMs: Date.now() };
}

export function openActivePublisher({ root, uid, journal }) {
  assert.equal(process.platform, 'linux'); assert(Number.isSafeInteger(uid) && uid > 0);
  assert.equal(process.getuid(), uid); journal.read();
  const originalDirectory = directory(root, uid), bindingBytes = read(root, 'binding.json', uid);
  const binding = JSON.parse(bindingBytes.toString('utf8'));
  assert.equal(sha(bindingBytes), journal.installation.bindingSha256);
  assert.equal(binding.version, 2); assert.equal(binding.admissionProtocol, 'local-primary-operation-v1');
  assert.equal(binding.primaryInstallationId, journal.installation.primaryInstallationId);
  assert.equal(binding.systemIdentifier, journal.installation.systemIdentifier);
  function unchanged() {
    journal.read(); const current = directory(root, uid);
    assert(current.dev === originalDirectory.dev && current.ino === originalDirectory.ino);
    assert(read(root, 'binding.json', uid).equals(bindingBytes)); absent(root + '/fenced.latch');
  }
  unchanged();
  return Object.freeze({
    read: () => { unchanged(); return read(root, 'active.json', uid); },
    publish(bytes) {
      assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 16384);
      const text = bytes.toString('utf8'); assert(Buffer.from(text).equals(bytes) && !text.startsWith('\uFEFF'));
      const a = JSON.parse(text), reserved = journal.read();
      assert.deepEqual(Object.keys(a).sort(), [...KEYS].sort());
      assert.equal(a.kind, 'ats-local-primary-operation-v1');
      assert.equal(a.bindingSha256, journal.installation.bindingSha256);
      for (const key of ['primaryInstallationId','systemIdentifier','namespace','generation']) assert.equal(a[key], binding[key]);
      assert.equal(a.topologyFingerprint, binding.topology);
      for (const key of ['operationSequence','sourceBoot','databaseBoot']) assert.equal(a[key], reserved[key]);
      assert(Number.isSafeInteger(a.observedAtMs) && a.observedAtMs >= reserved.reservedAtMs);
      assert(Number.isSafeInteger(a.expiresAtMs) && a.expiresAtMs > a.observedAtMs && a.expiresAtMs <= a.observedAtMs + 14000);
      assert(typeof a.observedMonotonicMs === 'number' && Number.isFinite(a.observedMonotonicMs) && a.observedMonotonicMs > 0);
      assert(typeof a.expiresAtBootMs === 'number' && Number.isFinite(a.expiresAtBootMs)
        && a.expiresAtBootMs > a.observedMonotonicMs && a.expiresAtBootMs <= a.observedMonotonicMs + 14000);
      function live() {
        unchanged(); const now = clock(); assert.equal(now.bootId, a.sourceBoot);
        assert(a.observedAtMs <= now.wallMs && a.observedMonotonicMs <= now.bootMs);
        assert(a.expiresAtMs > now.wallMs && a.expiresAtBootMs > now.bootMs);
        assert(Math.abs((now.wallMs - a.observedAtMs) - (now.bootMs - a.observedMonotonicMs)) <= 1000);
        assert.equal(journal.read().operationSequence, a.operationSequence);
      }
      live();
      try { read(root, 'active.json', uid); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const orphans = fs.readdirSync(root).filter(n => /^\.active-[a-f0-9]{32}\.tmp$/u.test(n));
      assert(orphans.length <= 4);
      for (const n of orphans) {
        const st = fs.lstatSync(root + '/' + n);
        assert(st.isFile() && !st.isSymbolicLink() && st.nlink === 1 && st.uid === uid && st.size <= 16384);
        assert((st.mode & 0o7777) === 0o444 || (st.mode & 0o7777) === 0o600);
        fs.unlinkSync(root + '/' + n);
      }
      const tmp = root + '/.active-' + randomBytes(16).toString('hex') + '.tmp';
      const fd = fs.openSync(tmp, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, 0o444); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      live(); fs.renameSync(tmp, root + '/active.json');
      const dir = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
      assert(read(root, 'active.json', uid).equals(bytes)); live();
    },
  });
}
