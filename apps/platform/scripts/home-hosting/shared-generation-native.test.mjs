// Real native repository, encrypted archive and recovery checks. No network or
// production endpoint; originals are immutable and temporary views are disposable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { createCloudVerifier } from './cloud-verifier.mjs';
import { fullCatalogIssuer } from './incremental-verifier.mjs';
import { sha256 } from './cloud-policy.mjs';
import { compactSharedGeneration, cipherFiles } from './shared-generation.mjs';
import { nativeExecutor, verifyRotationRoots } from './native-rotation.mjs';
import { createSharedGenerationVerifier } from './shared-verifier.mjs';
import { validateCatalog } from './incremental-policy.mjs';
import { createPublicKey } from 'node:crypto';

test('native shared generations retain roots without re-encrypting static data', {
  skip: !process.env.ATS_ROTATION_FIXTURE, timeout: 120000,
}, async () => {
  const fixture = process.env.ATS_ROTATION_FIXTURE, binary = process.env.ATS_TEST_RESTIC;
  const sequence = Number(process.env.ATS_SHARED_SEQUENCE ?? 5);
  const ticket = JSON.parse(readFileSync(join(fixture, 'ticket-' + sequence + '.json')));
  const sourceRepo = join(fixture, 'repo-' + sequence), passwordFile = join(fixture, 'recovery-password.private');
  const binarySha256 = '06582569ff2f10e1935a6f12187c76db02f0bae99e6e54098f2cdc374766d768';
  const work = mkdtempSync(join(tmpdir(), 'ats-shared-native-'));
  const { privateKey } = generateKeyPairSync('ed25519'), identities = new Map();
  const inventory = cipherFiles(sourceRepo).map(o => ({ ...o, id: randomUUID(), version: 'v1' }));
  const storage = {
    download: async name => {
      const bytes = readFileSync(join(sourceRepo, name));
      identities.set(name, { size: bytes.length, sha256: sha256(bytes), etag: sha256(bytes) });
      return bytes;
    },
    read: async (o, start, end) => ({ bytes: readFileSync(join(sourceRepo, o.name)).subarray(start, end + 1), etag: identities.get(o.name).etag }),
    fullReadIdentity: name => identities.get(name), publicDenied: async () => true,
  };
  const ledger = async p => p.action === 'inventory' ? inventory : p.action === 'status' ? { roots: [] }
    : p.action === 'finish' ? { claims: p.claims, report: p.report } : { reserved: true };
  try {
    const full = await createCloudVerifier({ namespace: ticket.namespace, cacheRoot: join(work, 'full'),
      restic: binary, resticSha256: binarySha256, password: readFileSync(passwordFile, 'utf8'), privateKey,
      storage, ledger, onVerifiedRepository: fullCatalogIssuer({ storage, privateKey }),
    })({ requestId: randomUUID(), mode: 'archive', forceRemoteRead: true, ticket });
    const catalog = JSON.parse(Buffer.from(full.report.supplemental.catalogCertificate.payload, 'base64url'));
    const source = nativeExecutor({ binary, binarySha256, repo: sourceRepo, passwordFile, work });
    const snapshots = JSON.parse(source(['snapshots', '--json'])), certifiedRoots = snapshots.map(s => s.id);
    assert.ok(snapshots.length > 2);
    const before = cipherFiles(sourceRepo);
    const result = compactSharedGeneration({ binary, binarySha256, sourceRepo,
      targetRepo: join(work, 'view'), passwordFile, work, catalog, certifiedRoots });
    assert.equal(result.plan.fullVerifiedAt, catalog.fullVerifiedAt);
    assert.equal(result.plan.expiresAt, catalog.expiresAt);
    assert.equal(result.plan.protectedSnapshotIds.length, 2);
    assert.ok(result.plan.retiredSnapshotReferences.length > 0);
    assert.equal(result.delta.physicalObjectsRemoved, 0);
    assert.ok(result.delta.reusedBytes > 36000000);
    assert.ok(result.delta.uploadBytes < 65536);
    assert.ok(result.delta.added.every(o => o.name.startsWith('index/')));
    assert.deepEqual(cipherFiles(sourceRepo), before);
    const view = join(work, 'view');
    const pool = new Map(inventory.map(o => [o.name, { ...o, path: join(sourceRepo, o.name) }]));
    for (const o of result.plan.objects) if (!pool.has(o.name)) {
      pool.set(o.name, { ...o, id: randomUUID(), version: 'v1', path: join(view, o.name) });
    }
    let fault, finishes = 0;
    const sharedStorage = {
      inventory: async names => names.map(name => {
        const { path, ...object } = pool.get(name);
        return fault === 'version' && name === 'config' ? { ...object, version: 'v2' } : object;
      }),
      read: async (o, start, end) => {
        const bytes = readFileSync(pool.get(o.name).path), data = Buffer.from(bytes.subarray(start, end + 1));
        if (fault === 'ciphertext' && !inventory.some(old => old.name === o.name)) data[0] ^= 1;
        return { bytes: data, etag: sha256(bytes) };
      }, publicDenied: async () => fault !== 'public',
    };
    const sharedLedger = async p => {
      if (p.action === 'charge' && fault === 'budget') throw Error('Budget exhausted');
      if (p.action === 'status') return { roots: certifiedRoots.map(snapshot_id => ({ snapshot_id })) };
      if (p.action === 'finish') { finishes++; return { claims: p.claims, report: p.report }; }
      return { reserved: true };
    };
    const verify = () => createSharedGenerationVerifier({ namespace: ticket.namespace,
      restic: binary, resticSha256: binarySha256, password: readFileSync(passwordFile, 'utf8'),
      privateKey, scratchRoot: join(work, 'cloud'), storage: sharedStorage, ledger: sharedLedger });
    const request = () => ({ requestId: randomUUID(), catalogCertificate: full.report.supplemental.catalogCertificate,
      plan: result.plan });
    const independentlyVerified = await verify()(request());
    assert.equal(finishes, 1);
    const nextTicket = { ...ticket, sequence: ticket.sequence + 1,
      captureStartedAt: new Date(Date.parse(ticket.captureStartedAt) + 1000).toISOString() };
    const nextCatalog = validateCatalog(independentlyVerified.report.catalogCertificate,
      createPublicKey(privateKey), nextTicket);
    assert.equal(nextCatalog.fullVerifiedAt, catalog.fullVerifiedAt);
    assert.equal(nextCatalog.expiresAt, catalog.expiresAt);
    assert.equal(independentlyVerified.report.receiptPermitsWrites, false);
    assert.ok(independentlyVerified.report.downloadedBytes < 512 * 1024);
    for (fault of ['version', 'ciphertext', 'public', 'budget']) {
      await assert.rejects(verify()(request())); assert.equal(finishes, 1);
    }
    fault = undefined;
    const changed = request(); changed.plan = { ...changed.plan, expiresAt: new Date(Date.now() + 172800000).toISOString() };
    await assert.rejects(verify()(changed)); assert.equal(finishes, 1);
    const roots = await verifyRotationRoots({ binary, binarySha256, repo: join(work, 'view'),
      passwordFile, work, namespace: ticket.namespace, mapping: result.mapping,
      sourceRepo, sourcePasswordFile: passwordFile, sourceCertificates: [catalog] });
    assert.equal(roots.length, 2); assert.ok(roots.every(r => r.sourceArtifactsMatched));

    // A producer must not silently retire an unknown recovery point.
    const unknownWork = join(work, 'unknown'); mkdirSync(unknownWork, { mode: 0o700 });
    const unknown = compactSharedGeneration({ binary, binarySha256, sourceRepo,
      targetRepo: join(work, 'unknown-view'), passwordFile, work: unknownWork, catalog,
      certifiedRoots: [ticket.snapshotId] });
    assert.equal(unknown.plan.protectedSnapshotIds.length, snapshots.length);
    assert.deepEqual(cipherFiles(sourceRepo), before);
    assert.throws(() => compactSharedGeneration({ binary, binarySha256, sourceRepo,
      targetRepo: join(work, 'expired'), passwordFile, work, catalog,
      now: Date.parse(catalog.expiresAt), certifiedRoots }));
  } finally { rmSync(work, { recursive: true, force: true }); }
});
