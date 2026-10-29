// Independent archive-only verification of metadata compaction. No new packs,
// encryption identity, full-scrub clock reset, remote deletion or write admission.
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sourceCatalog } from './native-rotation.mjs';
import { sharedObjectDelta } from './shared-generation.mjs';
import { sha256, validateInventory, retentionPreview, inventoryIdentity } from './cloud-policy.mjs';
import { inspectIndexEvidence, validateIndexEvidence } from './index-evidence.mjs';
import { startResticReadProxy } from './restic-read-proxy.mjs';
import { nativeResticReader } from './native-restic-read.mjs';
import { signProof } from './failover-proof.mjs';

const locationHash = (pack, blob) => sha256(JSON.stringify([
  pack, blob.type, blob.id, blob.offset, blob.length, blob.uncompressed_length ?? 0,
]));
const blobHash = blob => sha256(blob.type + ':' + blob.id);
const encode = set => Buffer.concat([...set].sort().map(s => Buffer.from(s, 'hex'))).toString('base64url');

export function verifyReindex(indexes, current, previous, baseObjects) {
  const prior = validateIndexEvidence(previous, baseObjects);
  assert.deepEqual(indexes.map(i => i.name).sort(), current.filter(o => o.name.startsWith('index/')).map(o => o.name).sort());
  const sizes = new Map(current.filter(o => o.name.startsWith('data/')).map(o => [o.name.split('/').at(-1), o.size]));
  const covered = new Set(), locations = new Set(), blobs = new Set();
  for (const index of indexes) {
    assert.ok(!index.decoded.supersedes?.length, 'Superseded-index format requires a full scrub');
    assert.ok(Array.isArray(index.decoded.packs));
    for (const pack of index.decoded.packs) {
      assert.ok(sizes.has(pack.id) && prior.covered.has(pack.id)); covered.add(pack.id);
      assert.ok(Array.isArray(pack.blobs) && pack.blobs.length > 0);
      for (const blob of pack.blobs) {
        assert.match(blob.id, /^[a-f0-9]{64}$/); assert.ok(['data', 'tree'].includes(blob.type));
        assert.ok(Number.isSafeInteger(blob.offset) && Number.isSafeInteger(blob.length) &&
          blob.offset >= 0 && blob.length > 32 && blob.offset + blob.length <= sizes.get(pack.id));
        const location = locationHash(pack.id, blob), key = blobHash(blob);
        assert.ok(prior.locations.has(location) && prior.blobs.has(key), 'Index reinterprets certified ciphertext');
        locations.add(location); blobs.add(key);
      }
    }
  }
  assert.deepEqual([...covered].sort(), [...sizes.keys()].sort(), 'Unindexed retained pack');
  return { version: 1, indexNamesSha256: sha256(JSON.stringify(indexes.map(i => i.name).sort())),
    packs: [...covered].sort(), locations: encode(locations), blobs: encode(blobs) };
}

export function createSharedGenerationVerifier({
  namespace, restic, resticSha256, password, privateKey, scratchRoot,
  storage, ledger, now = () => Date.now(),
}) {
  let active = false;
  return async request => {
    assert.equal(active, false, 'Verifier busy'); active = true;
    let phase = 'policy', work, sourceProxy, targetProxy, job;
    const started = now(), deadline = started + 50000;
    try {
      assert.match(request.requestId, /^[a-f0-9-]{36}$/);
      const parent = sourceCatalog(request.catalogCertificate, createPublicKey(privateKey), namespace, now());
      const { planId, ...plan } = request.plan;
      assert.equal(planId, sha256(JSON.stringify(plan)));
      assert.equal(plan.kind, 'shared-generation-plan'); assert.equal(plan.version, 1);
      assert.equal(plan.namespace, namespace); assert.equal(plan.writeAdmission, false);
      assert.equal(plan.physicalDeletionAllowed, false);
      assert.equal(plan.sourceInventorySha256, inventoryIdentity(parent.objects));
      for (const key of ['fullVerifiedAt', 'expiresAt']) assert.equal(plan[key], parent[key]);
      assert.ok(Array.isArray(plan.objects) && plan.objects.length > 0 && plan.objects.length <= 96);
      sharedObjectDelta(parent.objects, plan.objects);
      const bodySha = sha256(JSON.stringify(request));
      job = { namespace, requestId: request.requestId, bodySha };
      const rpc = (action, fields = {}) => ledger({ ...job, action, ...fields });
      phase = 'reserve'; const opened = await rpc('start');
      if (opened.completed) return { envelope: signProof(opened.claims, privateKey), report: opened.report, replayed: true };

      phase = 'inventory';
      // The storage adapter must return exact provider UUID/version/size for the
      // requested names. A logical view never hides or deletes other generations.
      const names = [...new Set([...parent.objects, ...plan.objects].map(o => o.name))].sort();
      const physical = validateInventory(await storage.inventory(names)).rows;
      assert.deepEqual(physical.map(o => o.name), names);
      const inventoryHash = inventoryIdentity(physical), byName = new Map(physical.map(o => [o.name, o]));
      const old = new Map(parent.objects.map(o => [o.name, o]));
      for (const object of parent.objects) {
        for (const key of ['id', 'version', 'size']) assert.equal(byName.get(object.name)[key], object[key]);
      }
      const target = plan.objects.map(o => {
        const physicalObject = byName.get(o.name); assert.ok(physicalObject);
        assert.equal(physicalObject.size, o.size);
        return { ...physicalObject, sha256: o.sha256 };
      });
      validateInventory(target);
      const cache = new Map(), observed = new Map(); let downloadedBytes = 0, reads = 0, rangeBytes = 0;
      async function read(object, start, end) {
        assert.ok(now() < deadline); await rpc('charge', { bytes: end - start + 1 });
        const result = await storage.read(object, start, end); reads++;
        assert.equal(result.bytes.length, end - start + 1); assert.ok(result.etag && !result.etag.startsWith('W/'));
        if (old.has(object.name)) assert.equal(result.etag, old.get(object.name).etag);
        downloadedBytes += result.bytes.length; observed.set(object.name, result.etag); return result.bytes;
      }
      phase = 'metadata';
      for (const object of physical.filter(o => !o.name.startsWith('data/'))) {
        const bytes = await read(object, 0, object.size - 1), hash = sha256(bytes);
        assert.equal(hash, old.get(object.name)?.sha256 ?? plan.objects.find(o => o.name === object.name)?.sha256);
        if (object.name !== 'config') assert.equal(hash, object.name.split('/').at(-1));
        cache.set(object.name, bytes);
      }
      const ranges = new Map();
      const rangeRead = async (object, start, end) => {
        if (cache.has(object.name)) return cache.get(object.name).subarray(start, end + 1);
        const key = object.name + ':' + start + ':' + end;
        if (!ranges.has(key)) {
          rangeBytes += end - start + 1; assert.ok(rangeBytes <= 2 * 1024 * 1024);
          ranges.set(key, await read(object, start, end));
        }
        return ranges.get(key);
      };
      mkdirSync(scratchRoot, { recursive: true, mode: 0o700 });
      work = join(scratchRoot, request.requestId); mkdirSync(work, { mode: 0o700 });
      const passwordFile = join(work, 'password'); writeFileSync(passwordFile, password, { mode: 0o600 });
      sourceProxy = await startResticReadProxy(parent.objects, rangeRead);
      targetProxy = await startResticReadProxy(target, rangeRead);
      const reader = repo => nativeResticReader({ binary: restic, expectedSha256: resticSha256,
        repo, passwordFile, scratch: work, deadline });
      const source = reader(sourceProxy.repo), run = reader(targetProxy.repo);
      phase = 'retention';
      const sourceSnapshots = JSON.parse(await source(['snapshots', '--json']));
      assert.deepEqual(sourceSnapshots.map(s => s.id).sort(), parent.objects.filter(o => o.name.startsWith('snapshots/')).map(o => o.name.slice(10)).sort());
      const history = await rpc('status'), verified = new Set(history.roots.map(r => r.snapshot_id));
      // This parent's latest root was independently verified even when the
      // durable root list is paged. No other producer claim becomes trusted.
      verified.add(parent.snapshotId);
      const keep = retentionPreview(sourceSnapshots.map(s => ({ snapshotId: s.id,
        captureStartedAt: s.time, verified: verified.has(s.id),
      })), { pinned: history.pinned ?? [], now: now() });
      assert.deepEqual([...plan.protectedSnapshotIds].sort(), [...keep.protectedSnapshots].sort());
      assert.deepEqual([...plan.retiredSnapshotReferences].sort(), [...keep.retirementCandidates].sort());
      assert.ok(plan.protectedSnapshotIds.includes(parent.snapshotId));
      assert.equal(JSON.parse(await run(['cat', 'config'])).id, plan.repositoryId);
      phase = 'native-graph'; await run(['check']);
      const currentSnapshots = JSON.parse(await run(['snapshots', '--json']));
      assert.deepEqual(currentSnapshots.map(s => s.id).sort(), [...keep.protectedSnapshots].sort());
      for (const s of currentSnapshots) {
        const previous = sourceSnapshots.find(p => p.id === s.id); assert.ok(previous);
        for (const key of ['tree', 'time', 'paths', 'hostname']) assert.deepEqual(s[key], previous[key]);
      }
      const decode = async (objects, runner) => {
        const result = [];
        for (const o of objects.filter(o => o.name.startsWith('index/'))) {
          result.push({ name: o.name, decoded: JSON.parse(await runner(['cat', 'index', o.name.slice(6)])) });
        }
        return result;
      };
      const prior = parent.indexEvidence ?? inspectIndexEvidence(await decode(parent.objects, source), parent.objects, parent.objects).evidence;
      const indexEvidence = verifyReindex(await decode(target, run), target, prior, parent.objects);
      phase = 'fresh-observation';
      for (const object of physical) if (!observed.has(object.name)) await read(object, 0, 0);
      assert.equal(observed.size, physical.length);
      assert.equal(inventoryIdentity(await storage.inventory(names)), inventoryHash);
      assert.equal(await storage.publicDenied(), true);
      assert.ok(Date.parse(parent.expiresAt) > now() && now() < deadline);
      const at = new Date(now()).toISOString(), catalog = { ...parent,
        issuedAt: at, parentCertificateSha256: sha256(JSON.stringify(request.catalogCertificate)),
        objects: target.map(o => ({ ...o, etag: observed.get(o.name) })), indexEvidence,
        logicalGeneration: planId,
      };
      assert.ok(Buffer.byteLength(JSON.stringify(catalog)) <= 40960);
      const report = { catalogCertificate: signProof(catalog, privateKey),
        protectedRoots: keep.protectedSnapshots.length, uploadedIndexBytes: sharedObjectDelta(parent.objects, plan.objects).uploadBytes,
        downloadedBytes, storageReads: reads, rangeBytes, physicallyObserved: observed.size,
        durationMs: now() - started, fullVerifiedAt: parent.fullVerifiedAt, catalogExpiresAt: parent.expiresAt,
        fullDataRead: false, nativeGraphCheck: true, physicalObjectsRemoved: 0, receiptPermitsWrites: false,
      };
      const claims = { version: 1, kind: 'shared-generation', namespace, planId,
        snapshotId: parent.snapshotId, sourceInventorySha256: inventoryIdentity(parent.objects),
        targetInventorySha256: inventoryIdentity(target), issuedAt: at,
        expiresAt: new Date(now() + 60000).toISOString(), writeAdmission: false };
      phase = 'commit'; const result = await rpc('finish', { claims, report, inventory: physical });
      return { envelope: signProof(result.claims, privateKey), report: result.report, replayed: false };
    } catch {
      if (job) try { await ledger({ ...job, action: 'fail', phase }); } catch {}
      throw Object.assign(Error('Shared generation verification withheld'), { phase });
    } finally {
      if (sourceProxy) await sourceProxy.close(); if (targetProxy) await targetProxy.close();
      if (work) rmSync(work, { recursive: true, force: true }); active = false;
    }
  };
}
