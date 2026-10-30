// Native, local-only compaction rehearsal. The shared pool and source repository
// are immutable inputs. This module never deletes cloud objects or admits writes.
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nativeExecutor, verifyLocalCiphertext } from './native-rotation.mjs';
import { sha256, retentionPreview, inventoryIdentity } from './cloud-policy.mjs';

export function cipherFiles(repo) {
  const files = [];
  function walk(folder, prefix = '') {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      assert.ok(!entry.isSymbolicLink(), 'Repository symlink rejected');
      const name = prefix + entry.name;
      if (entry.isDirectory()) walk(join(folder, entry.name), name + '/');
      else {
        assert.ok(entry.isFile());
        const bytes = readFileSync(join(folder, entry.name));
        files.push({ name, size: bytes.length, sha256: sha256(bytes) });
      }
    }
  }
  walk(repo);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

// One physical object may be referenced by several logical generations. Keep
// both exact provider identity and content hash; a matching filename is not proof.
export function sharedObjectDelta(base, target) {
  const known = new Map(base.map(o => [o.name, o]));
  assert.equal(known.size, base.length);
  const names = new Set(), reused = [], added = [];
  for (const object of target) {
    assert.ok(!names.has(object.name));
    names.add(object.name);
    const previous = known.get(object.name);
    if (previous) {
      for (const key of ['size', 'sha256']) assert.equal(object[key], previous[key]);
      reused.push(object);
    } else {
      // Metadata-only rotation may rebuild indexes. It cannot introduce a new
      // encryption identity or silently re-encrypt/repack any data.
      assert.match(object.name, /^index\/[a-f0-9]{64}$/);
      added.push(object);
    }
  }
  assert.ok(names.has('config'));
  for (const o of base.filter(o => o.name === 'config' || o.name.startsWith('keys/'))) {
    assert.ok(names.has(o.name), 'Repository identity/key was removed');
  }
  return {
    reused, added,
    retiredReferences: base.filter(o => !names.has(o.name)),
    reusedBytes: reused.reduce((s, o) => s + o.size, 0),
    uploadBytes: added.reduce((s, o) => s + o.size, 0),
    physicalObjectsRemoved: 0,
  };
}

export function compactSharedGeneration({
  binary, binarySha256, sourceRepo, targetRepo, passwordFile, work,
  catalog, certifiedRoots = [], pinned = [], now = Date.now(),
}) {
  assert.ok(resolve(sourceRepo) !== resolve(targetRepo));
  assert.ok(!resolve(targetRepo).startsWith(resolve(sourceRepo) + '/'));
  assert.equal(existsSync(targetRepo), false);
  assert.ok(Date.parse(catalog.expiresAt) > now, 'Fresh full-read baseline required');
  assert.equal(Date.parse(catalog.expiresAt), Date.parse(catalog.fullVerifiedAt) + 86400000);
  verifyLocalCiphertext(sourceRepo, catalog);
  const before = cipherFiles(sourceRepo);
  const from = nativeExecutor({ binary, binarySha256, repo: sourceRepo, passwordFile, work });
  from(['check', '--read-data']);
  const snapshots = JSON.parse(from(['snapshots', '--json']));
  assert.deepEqual(snapshots.map(s => s.id).sort(),
    catalog.objects.filter(o => o.name.startsWith('snapshots/')).map(o => o.name.slice(10)).sort());
  for (const id of certifiedRoots) assert.ok(snapshots.some(s => s.id === id));
  const retention = retentionPreview(snapshots.map(s => ({
    snapshotId: s.id, captureStartedAt: s.time, verified: certifiedRoots.includes(s.id),
  })), { pinned, now });

  // Only the new disposable local view is modified. Never use hard links: prune
  // must not have a way to alter the retained source or any cloud generation.
  cpSync(sourceRepo, targetRepo, { recursive: true, errorOnExist: true, force: false });
  const run = nativeExecutor({ binary, binarySha256, repo: targetRepo, passwordFile, work });
  if (retention.retirementCandidates.length) run(['forget', ...retention.retirementCandidates]);
  run(['prune', '--max-repack-size', '0', '--max-unused', '0']);
  run(['check', '--read-data']);
  assert.deepEqual(JSON.parse(run(['snapshots', '--json'])).map(s => s.id).sort(),
    [...retention.protectedSnapshots].sort());
  assert.equal(JSON.parse(from(['cat', 'config'])).id, JSON.parse(run(['cat', 'config'])).id);
  const after = cipherFiles(targetRepo), delta = sharedObjectDelta(before, after);
  assert.deepEqual(cipherFiles(sourceRepo), before, 'Source repository changed');
  verifyLocalCiphertext(sourceRepo, catalog);

  const plan = {
    version: 1, kind: 'shared-generation-plan', writeAdmission: false,
    namespace: catalog.namespace, repositoryId: JSON.parse(run(['cat', 'config'])).id,
    sourceInventorySha256: inventoryIdentity(catalog.objects),
    // Preserve the original full-read clock. Rebuilding indexes is not a scrub.
    fullVerifiedAt: catalog.fullVerifiedAt, expiresAt: catalog.expiresAt,
    protectedSnapshotIds: retention.protectedSnapshots,
    retiredSnapshotReferences: retention.retirementCandidates,
    objects: after, createdAt: new Date(now).toISOString(),
    physicalDeletionAllowed: false,
  };
  return { plan: { ...plan, planId: sha256(JSON.stringify(plan)) }, delta,
    mapping: retention.protectedSnapshots.map(id => ({
      sourceSnapshotId: id, targetSnapshotId: id,
      capturePath: snapshots.find(s => s.id === id).paths[0],
    })) };
}

// The registry is append-only evidence, not an uploader-supplied list of files to
// delete. A retired generation still pins its objects until a separately verified
// retirement, grace period and positive uploader fence have all completed.
export function sharedPoolReferences(generations, { pinned = [], now = Date.now() } = {}) {
  assert.ok(Array.isArray(generations) && generations.length > 0 && generations.length <= 4096);
  const ids = new Set(), references = new Map();
  for (const generation of generations) {
    assert.match(generation.id, /^[a-f0-9]{64}$/);
    assert.ok(!ids.has(generation.id)); ids.add(generation.id);
    assert.ok(['active', 'retired', 'unverified'].includes(generation.status));
    assert.ok(Array.isArray(generation.objects) && generation.objects.length > 0);
    const names = new Set();
    // No physical GC implemented. In particular an unknown/unverified generation
    // and a retired generation both remain live references here.
    for (const object of generation.objects) {
      assert.ok(!names.has(object.name)); names.add(object.name);
      assert.match(object.sha256, /^[a-f0-9]{64}$/);
      assert.ok(Number.isSafeInteger(object.size) && object.size > 0);
      const previous = references.get(object.name);
      if (previous) for (const key of ['id', 'version', 'size', 'sha256']) {
        assert.equal(object[key], previous[key], 'Shared provider identity changed');
      }
      else {
        assert.match(object.id, /^[a-f0-9-]{36}$/);
        assert.ok(typeof object.version === 'string' && object.version.length > 0);
        references.set(object.name, { ...object, generations: [] });
      }
      references.get(object.name).generations.push(generation.id);
    }
  }
  for (const id of pinned) assert.ok(ids.has(id), 'Unknown generation pin');
  return { observedAt: new Date(now).toISOString(), generationCount: ids.size,
    objects: [...references.values()].sort((a, b) => a.name.localeCompare(b.name)),
    physicalDeletionAllowed: false, writerAdmission: false };
}
