// Internal filesystem policy. Callers cannot choose production paths through the public reader.
import assert from 'node:assert/strict';
import { constants, lstatSync, openSync, fstatSync, readSync, closeSync } from 'node:fs';
import { dirname, posix } from 'node:path';

export const FIXED_PATHS = Object.freeze({
  descriptor: '/release-admission/firewood-release.json', binding: '/admission/binding.json',
  active: '/admission/active.json', authorityPublicKey: '/admission/authority-public.pem',
  workersReleased: '/admission/workers-released.json', latch: '/admission/fenced.latch',
  bootId: '/proc/sys/kernel/random/boot_id', uptime: '/proc/uptime',
});
export const LIMITS = Object.freeze({ descriptor: 16384, binding: 16384, active: 196608,
  authorityPublicKey: 4096, workersReleased: 16384, bootId: 128, uptime: 128, mountinfo: 1048576 });
const permission = stat => stat.mode & 0o7777;
const fsOps = Object.freeze({ lstatSync, openSync, fstatSync, readSync, closeSync });
const missing = error => error?.code === 'ENOENT';
function safeParents(path, io, processId) {
  for (let parent = dirname(path);; parent = dirname(parent)) {
    const stat = io.lstatSync(parent);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(stat.uid, processId && parent === '/proc/' + processId ? 1000 : 0);
    assert.equal(permission(stat) & 0o7022, 0, 'Unsafe control directory');
    if (parent === '/') break;
  }
}
export function assertLatchAbsent(io = fsOps) {
  try { io.lstatSync(FIXED_PATHS.latch); } catch (error) { if (missing(error)) return true; throw error; }
  throw new Error('Release fenced');
}
export function readBoundedFile(path, maximum, { control = false, io = fsOps, processId } = {}) {
  assert.ok(path.startsWith('/') && posix.normalize(path) === path && Number.isSafeInteger(maximum) && maximum > 0);
  if (processId !== undefined) assert.equal(path, '/proc/' + processId + '/mountinfo');
  safeParents(path, io, processId);
  const before = io.lstatSync(path);
  assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(before.uid, processId ? 1000 : 0);
  assert.equal(before.nlink, 1);
  if (control) assert.equal(permission(before), 0o444);
  else assert.equal(permission(before) & 0o7022, 0);
  assert.ok(before.size <= maximum);
  const fd = io.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const after = io.fstatSync(fd);
    assert.ok(after.isFile() && after.dev === before.dev && after.ino === before.ino
      && after.uid === before.uid && after.mode === before.mode && after.nlink === 1 && after.size <= maximum);
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0, count;
    do {
      count = io.readSync(fd, buffer, length, buffer.length - length, null);
      length += count;
    } while (count > 0 && length < buffer.length);
    assert.ok(length <= maximum);
    const final = io.fstatSync(fd);
    assert.ok(final.dev === after.dev && final.ino === after.ino && final.uid === after.uid
      && final.mode === after.mode && final.nlink === after.nlink && final.size === after.size
      && final.mtimeMs === after.mtimeMs && final.ctimeMs === after.ctimeMs);
    return buffer.subarray(0, length);
  } finally { io.closeSync(fd); }
}
function unescapeMount(value) {
  assert.ok(!/\\(?!040|011|012|134)/u.test(value));
  return value.replace(/\\(040|011|012|134)/gu, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}
export function assertReadOnlyMount(mountinfo, path) {
  assert.equal(typeof mountinfo, 'string');
  assert.ok(mountinfo.length > 0 && mountinfo.length <= LIMITS.mountinfo);
  const candidates = [];
  for (const line of mountinfo.trim().split('\n')) {
    const separator = line.indexOf(' - ');
    assert.ok(separator > 0);
    const fields = line.slice(0, separator).split(' ');
    assert.ok(fields.length >= 6 && /^[0-9]+$/u.test(fields[0]));
    const mountpoint = unescapeMount(fields[4]);
    assert.ok(mountpoint.startsWith('/') && posix.normalize(mountpoint) === mountpoint);
    if (path === mountpoint || path.startsWith(mountpoint === '/' ? '/' : mountpoint + '/'))
      candidates.push({ mountpoint, options: fields[5].split(',') });
  }
  candidates.sort((a, b) => b.mountpoint.length - a.mountpoint.length);
  assert.ok(candidates.length > 0 && !(candidates[1] && candidates[0].mountpoint.length === candidates[1].mountpoint.length));
  assert.ok(candidates[0].options.includes('ro') && !candidates[0].options.includes('rw'));
  return true;
}

// The production caller passes only platform clocks. The separate io argument is internal/test-only.
export function readFixedSnapshot({ platform, uid, pid, wallMs, monotonicMs }, io = fsOps) {
  assert.equal(platform, 'linux'); assert.equal(uid, 1000);
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assertLatchAbsent(io);
  const mountinfo = readBoundedFile('/proc/' + pid + '/mountinfo', LIMITS.mountinfo, { io, processId: pid }).toString('utf8');
  const out = { platform, uid, wallMs, monotonicMs, latchAbsent: true };
  for (const name of ['descriptor', 'binding', 'active', 'authorityPublicKey', 'workersReleased']) {
    assertReadOnlyMount(mountinfo, FIXED_PATHS[name]);
    out[name] = readBoundedFile(FIXED_PATHS[name], LIMITS[name], { control: true, io });
  }
  out.bootId = readBoundedFile(FIXED_PATHS.bootId, LIMITS.bootId, { io });
  const uptime = readBoundedFile(FIXED_PATHS.uptime, LIMITS.uptime, { io }).toString('utf8').trim();
  assert.match(uptime, /^[0-9]+(?:\.[0-9]+)? [0-9]+(?:\.[0-9]+)?$/u);
  out.monotonicMs = Number(uptime.split(' ')[0]) * 1000;
  assert.ok(Number.isFinite(out.monotonicMs) && out.monotonicMs > 0);
  assertLatchAbsent(io);
  // Verify control snapshots were not replaced while being read. Do not cache valid snapshots.
  for (const name of ['descriptor', 'binding', 'active', 'authorityPublicKey', 'workersReleased'])
    assert.ok(out[name].equals(readBoundedFile(FIXED_PATHS[name], LIMITS[name], { control: true, io })));
  const lastMountinfo = readBoundedFile('/proc/' + pid + '/mountinfo', LIMITS.mountinfo, { io, processId: pid }).toString('utf8');
  for (const name of ['descriptor', 'binding', 'active', 'authorityPublicKey', 'workersReleased'])
    assertReadOnlyMount(lastMountinfo, FIXED_PATHS[name]);
  assertLatchAbsent(io);
  const finalUptime = readBoundedFile(FIXED_PATHS.uptime, LIMITS.uptime, { io }).toString('utf8').trim();
  assert.match(finalUptime, /^[0-9]+(?:\.[0-9]+)? [0-9]+(?:\.[0-9]+)?$/u);
  out.monotonicMs = Number(finalUptime.split(' ')[0]) * 1000;
  assert.ok(Number.isFinite(out.monotonicMs) && out.monotonicMs > 0);
  return out;
}
