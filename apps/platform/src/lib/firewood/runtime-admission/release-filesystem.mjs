// Internal filesystem policy. Callers cannot choose production paths through the public reader.
import assert from 'node:assert/strict';
import { constants, lstatSync, openSync, fstatSync, readSync, closeSync, statfsSync } from 'node:fs';
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
const fsOps = Object.freeze({ lstatSync, openSync, fstatSync, readSync, closeSync, statfsSync });
const missing = error => error?.code === 'ENOENT';
// Only these observed kernel paths may carry overflow IDs in a rootless
// namespace. Neither an arbitrary proc path nor a regular file gains this rule.
const KERNEL_DIRECTORIES = new Set(['/proc','/proc/sys','/proc/sys/kernel','/proc/sys/kernel/random']);
const KERNEL_LEAVES = new Set([FIXED_PATHS.bootId,FIXED_PATHS.uptime]);
function procFile(path, processId) {
  if (processId !== undefined) {
    assert.ok(Number.isSafeInteger(processId) && processId > 0);
    assert.equal(path, '/proc/' + processId + '/mountinfo');
    return true;
  }
  if (path === '/proc' || path.startsWith('/proc/')) { assert.ok(KERNEL_LEAVES.has(path), 'Unapproved kernel path'); return true; }
  return false;
}
function procFilesystem(path, io) { assert.equal(io.statfsSync(path, { bigint: true }).type, 0x9fa0n, 'Expected kernel procfs'); }
function procOwner(path, stat, io, processId) {
  procFilesystem(path, io);
  if (KERNEL_DIRECTORIES.has(path) || KERNEL_LEAVES.has(path)) {
    assert.ok(stat.uid === 0 && stat.gid === 0 || stat.uid === 65534 && stat.gid === 65534, 'Unapproved kernel owner pair');
  } else {
    assert.ok(Number.isSafeInteger(processId) && processId > 0);
    assert.ok(path === '/proc/' + processId || path === '/proc/' + processId + '/mountinfo');
    assert.equal(stat.uid, 1000); assert.equal(stat.gid, 1000);
  }
}
function procIdentity(a, b) { assert.ok(['dev','ino','uid','gid','mode','nlink','size','mtimeMs','ctimeMs'].every(key => a[key] === b[key]), 'Kernel file identity changed'); }
function safeParents(path, io, processId) {
  for (let parent = dirname(path);; parent = dirname(parent)) {
    const stat = io.lstatSync(parent);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    if (parent === '/proc' || parent.startsWith('/proc/')) procOwner(parent, stat, io, processId);
    else assert.equal(stat.uid, 0);
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
  const kernel = procFile(path, processId);
  safeParents(path, io, processId);
  const before = io.lstatSync(path);
  assert.ok(before.isFile() && !before.isSymbolicLink());
  if (kernel) procOwner(path, before, io, processId); else assert.equal(before.uid, 0);
  assert.equal(before.nlink, 1);
  if (control) { assert.equal(before.uid, 0); assert.equal(permission(before), 0o444); }
  else assert.equal(permission(before) & 0o7022, 0);
  assert.ok(before.size <= maximum);
  const fd = io.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const after = io.fstatSync(fd);
    if (kernel) { assert.ok(Number.isSafeInteger(fd) && fd >= 0); procFilesystem('/proc/self/fd/' + fd, io); procIdentity(before, after); }
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
    if (kernel) { procFilesystem('/proc/self/fd/' + fd, io); procOwner(path, io.lstatSync(path), io, processId); procIdentity(after, final); procIdentity(final, io.lstatSync(path)); safeParents(path, io, processId); }
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
  assertReadOnlyMount(mountinfo, FIXED_PATHS.descriptor);
  out.descriptor = readBoundedFile(FIXED_PATHS.descriptor, LIMITS.descriptor, { control: true, io });
  // A root-owned local-policy descriptor selects its own exact validator later.
  // Its proof has no cloud authority key. Legacy descriptors retain the original
  // PEM/mount checks; neither policy is inferred from an environment variable.
  const local = JSON.parse(out.descriptor.toString('utf8')).kind === 'ats-firewood-local-primary-release-v2';
  const controls = ['descriptor', 'binding', 'active', ...(local ? [] : ['authorityPublicKey']), 'workersReleased'];
  for (const name of controls) {
    assertReadOnlyMount(mountinfo, FIXED_PATHS[name]);
    if (name !== 'descriptor') out[name] = readBoundedFile(FIXED_PATHS[name], LIMITS[name], { control: true, io });
  }
  out.bootId = readBoundedFile(FIXED_PATHS.bootId, LIMITS.bootId, { io });
  const uptime = readBoundedFile(FIXED_PATHS.uptime, LIMITS.uptime, { io }).toString('utf8').trim();
  assert.match(uptime, /^[0-9]+(?:\.[0-9]+)? [0-9]+(?:\.[0-9]+)?$/u);
  out.monotonicMs = Number(uptime.split(' ')[0]) * 1000;
  assert.ok(Number.isFinite(out.monotonicMs) && out.monotonicMs > 0);
  assertLatchAbsent(io);
  // Verify control snapshots were not replaced while being read. Do not cache valid snapshots.
  for (const name of controls)
    assert.ok(out[name].equals(readBoundedFile(FIXED_PATHS[name], LIMITS[name], { control: true, io })));
  const lastMountinfo = readBoundedFile('/proc/' + pid + '/mountinfo', LIMITS.mountinfo, { io, processId: pid }).toString('utf8');
  for (const name of controls)
    assertReadOnlyMount(lastMountinfo, FIXED_PATHS[name]);
  assertLatchAbsent(io);
  const finalUptime = readBoundedFile(FIXED_PATHS.uptime, LIMITS.uptime, { io }).toString('utf8').trim();
  assert.match(finalUptime, /^[0-9]+(?:\.[0-9]+)? [0-9]+(?:\.[0-9]+)?$/u);
  out.monotonicMs = Number(finalUptime.split(' ')[0]) * 1000;
  assert.ok(Number.isFinite(out.monotonicMs) && out.monotonicMs > 0);
  return out;
}
