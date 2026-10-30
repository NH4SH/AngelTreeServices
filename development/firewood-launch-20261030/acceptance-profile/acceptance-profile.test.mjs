import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp } from 'node:fs/promises';
import { createHash, createHmac } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUSINESS_POLICY, PRODUCTION_DESCRIPTOR, ACCEPTANCE_DESCRIPTOR,
  createHermeticAcceptanceFixture, assertKnownDescriptor, assertDerivableAcceptance,
  assertBoundAcceptance, validateAcceptanceDatabaseIdentity, bindAcceptanceReviewDescriptor } from './profiles.mjs';
import { readSourceLock, deriveAcceptanceArtifact, verifyDerivedArtifact,
  acceptanceSqlIdentityPrecondition, inversePinnedReplacements, applyPinnedReplacements } from './derive.mjs';
const here = dirname(fileURLToPath(import.meta.url));
await mkdir(join(here, 'test-runs'), { recursive: true, mode: 0o700 });
const run = await mkdtemp(join(here, 'test-runs', 'owned-run-'));
const fixture = createHermeticAcceptanceFixture(), lock = await readSourceLock();
const outputA = join(run, 'artifact-a'), outputB = join(run, 'artifact-b');
const first = await deriveAcceptanceArtifact({ descriptor: fixture, outputDirectory: outputA });
const second = await deriveAcceptanceArtifact({ descriptor: fixture, outputDirectory: outputB });
const derived = name => import(pathToFileURL(join(outputA, 'handoff', name + '.mjs')).href);
const original = name => import(pathToFileURL(join(lock.sourceRoot, 'crm/apps/platform/src/lib/firewood/handoff', name + '.mjs')).href);
const live = await original('live-contract'), acceptance = await derived('live-contract');
const office = await original('office-contract'), acceptanceOffice = await derived('office-contract');
const clone = value => structuredClone(value);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const nowMs = 1_793_376_000_000;
function evidence() {
  const expectedDatabase = { name: 'ats_firewood_acceptance_a1b2c3d4e5f6', oid: '24681', systemIdentifier: '7561234567890123456',
    markerId: '00000000-0000-4000-8000-000000000001', purpose: 'ats-firewood-acceptance-v1',
    comment: 'ats-firewood-acceptance-v1:00000000-0000-4000-8000-000000000001:synthetic-only',
    metaSchema: 'ats_firewood_acceptance_meta', metaTable: 'target', schemaFingerprint: 'a'.repeat(64),
    releaseDigest: 'b'.repeat(64), admissionBindingId: '00000000-0000-4000-8000-000000000002' };
  return { expectedDatabase, observedDatabase: clone(expectedDatabase), nowMs,
    approvedOrigins: { portalOrigin: 'https://qa-crm.example.com', websiteOrigin: 'https://qa-checkout.example.com',
      financialPathPrefix: ACCEPTANCE_DESCRIPTOR.financialPathPrefix, officePathPrefix: ACCEPTANCE_DESCRIPTOR.officePathPrefix,
      approvalId: '00000000-0000-4000-8000-000000000003', approvalEvidenceSha256: 'c'.repeat(64) },
    accountObservation: { accountId: ACCEPTANCE_DESCRIPTOR.expectedAccountId, livemode: false, mode: 'test',
      observedAt: new Date(nowMs).toISOString(), evidenceSha256: 'd'.repeat(64), method: 'independent-account-and-mode-readback' },
    admissionObservation: { bindingId: expectedDatabase.admissionBindingId, databaseName: expectedDatabase.name,
      databaseOid: expectedDatabase.oid, systemIdentifier: expectedDatabase.systemIdentifier, markerId: expectedDatabase.markerId,
      purpose: expectedDatabase.purpose, schemaFingerprint: expectedDatabase.schemaFingerprint, releaseDigest: expectedDatabase.releaseDigest,
      sourceId: ACCEPTANCE_DESCRIPTOR.sourceId, environmentId: ACCEPTANCE_DESCRIPTOR.environmentId,
      accountId: ACCEPTANCE_DESCRIPTOR.expectedAccountId, livemode: false, observedAt: new Date(nowMs).toISOString(), evidenceSha256: 'e'.repeat(64) } };
}

test('production and acceptance descriptors are explicit, immutable, distinct, unbound and disabled', () => {
  assert.equal(PRODUCTION_DESCRIPTOR.financialContract, live.LIVE_HANDOFF_CONTRACT);
  assert.equal(PRODUCTION_DESCRIPTOR.officeContract, office.OFFICE_CONTRACT);
  assert.equal(PRODUCTION_DESCRIPTOR.expectedAccountId, live.LIVE_ACCOUNT);
  assert.equal(PRODUCTION_DESCRIPTOR.mode, 'live'); assert.equal(PRODUCTION_DESCRIPTOR.livemode, true);
  assert.equal(ACCEPTANCE_DESCRIPTOR.mode, 'test'); assert.equal(ACCEPTANCE_DESCRIPTOR.livemode, false);
  for (const key of ['profile', 'financialContract', 'officeContract', 'sourceId', 'environmentId', 'expectedAccountId',
    'sqlIdentityPrefix', 'financialPathPrefix', 'officePathPrefix', 'financialHmacDomain', 'officeHmacDomain'])
    assert.notEqual(PRODUCTION_DESCRIPTOR[key], ACCEPTANCE_DESCRIPTOR[key], key);
  for (const value of [PRODUCTION_DESCRIPTOR, ACCEPTANCE_DESCRIPTOR, fixture]) {
    assert.equal(value.providerReady, false); assert.equal(value.runtimeLoadable, false);
    assert.equal(value.accountVerification, 'UNVERIFIED'); assert.equal(value.bindings, null);
    assert.ok(Object.values(value.activation).every(flag => flag === false)); assert.ok(Object.isFrozen(value.activation));
  }
  assert.equal(ACCEPTANCE_DESCRIPTOR.origins, null);
  assert.throws(() => { ACCEPTANCE_DESCRIPTOR.mode = 'live'; });
});
test('unbound, cloned, environment-toggle and production descriptors cannot derive acceptance or SQL envelopes', () => {
  assert.throws(() => assertDerivableAcceptance(ACCEPTANCE_DESCRIPTOR));
  assert.throws(() => assertDerivableAcceptance(PRODUCTION_DESCRIPTOR));
  assert.throws(() => assertKnownDescriptor({ ...clone(fixture), providerReady: true, ENABLED: true }));
  assert.throws(() => assertKnownDescriptor(clone(fixture)));
  assert.throws(() => assertBoundAcceptance(fixture));
  assert.throws(() => acceptanceSqlIdentityPrecondition(fixture));
});
test('complete source allowlist derives deterministically and inverse bytes match every frozen source', async () => {
  assert.equal(lock.sources.length, 20); assert.equal(first.identitySpans, 539);
  assert.equal(first.manifestSha256, second.manifestSha256);
  assert.deepEqual(await readFile(join(outputA, 'DERIVATION_MANIFEST.json')), await readFile(join(outputB, 'DERIVATION_MANIFEST.json')));
  const manifest = JSON.parse(await readFile(join(outputA, 'DERIVATION_MANIFEST.json'), 'utf8'));
  assert.equal(manifest.files.length, 21); assert.equal(manifest.databaseConnected, false);
  for (const entry of manifest.files.filter(item => item.source)) {
    const bytes = await readFile(join(outputA, entry.output));
    assert.equal(sha(inversePinnedReplacements(bytes, entry.spans)), entry.sourceSha256);
    assert.deepEqual(inversePinnedReplacements(bytes, entry.spans), await readFile(join(lock.sourceRoot, entry.source)));
  }
  assert.deepEqual(await verifyDerivedArtifact(outputA), { verified: true, files: 21, providerReady: false });
});
test('source preimage changes and output changes are rejected; existing artifacts cannot be overwritten', async () => {
  const entry = lock.sources.find(value => value.output === 'handoff/live-contract.mjs');
  const source = await readFile(join(lock.sourceRoot, entry.source)), changed = Buffer.from(source); changed[12] ^= 1;
  assert.throws(() => applyPinnedReplacements(changed, entry, fixture), /preimage changed/);
  await assert.rejects(deriveAcceptanceArtifact({ descriptor: fixture, outputDirectory: outputA }), /EEXIST/);
  const tampered = join(run, 'tampered'); await cp(outputB, tampered, { recursive: true });
  await writeFile(join(tampered, 'handoff/live-contract.mjs'), '// changed business logic\n', { flag: 'w' });
  await assert.rejects(verifyDerivedArtifact(tampered), /output hash changed/);
});
test('business terms, policy bytes, six catalog totals and accounting behavior remain exact', async () => {
  assert.equal(acceptance.LIVE_TERMS_HASH, BUSINESS_POLICY.termsHash);
  assert.equal(acceptance.LIVE_PAYMENT_POLICY_HASH, BUSINESS_POLICY.paymentPolicyHash);
  assert.equal(acceptance.canonicalLiveHandoff(acceptance.LIVE_ACCEPTED_TERMS), live.canonicalLiveHandoff(live.LIVE_ACCEPTED_TERMS));
  assert.equal(acceptance.canonicalLiveHandoff(acceptance.LIVE_PAYMENT_POLICY), live.canonicalLiveHandoff(live.LIVE_PAYMENT_POLICY));
  for (const quantity of ['half', 'full', 'two']) for (const stacking of [false, true])
    assert.deepEqual(acceptance.priceLiveOrder({ quantity, stacking }), live.priceLiveOrder({ quantity, stacking }));
  const expected = await original('office-accounting'), actual = await derived('office-accounting');
  const accounting = { issued_at: new Date(nowMs).toISOString(), original_principal_cents: 60000,
    raw_balance_due_cents: 60000, credited_principal_cents: 60000, collectible_balance_cents: 0,
    credit_id: '00000000-0000-4000-8000-000000000020' };
  const invoice = { total_cents: 60000, balance_due_cents: 0, status: 'credited', paid_at: null };
  assert.deepEqual(actual.validateOfficeAccounting(accounting, invoice), expected.validateOfficeAccounting(accounting, invoice));
  assert.deepEqual(actual.officeSettlementInvoice(invoice, accounting), expected.officeSettlementInvoice(invoice, accounting));
  assert.throws(() => actual.validateOfficeAccounting({ ...accounting, credited_principal_cents: 30000 }, invoice));
});
test('legacy cash reducer and capability helper closure remain byte-identical', async () => {
  for (const name of ['handler', 'contract', 'settlement', 'staging-profile', 'live-terms']) {
    const entry = lock.sources.find(value => value.output === 'handoff/' + name + '.mjs');
    assert.equal(entry.replacements.length, 0);
    assert.deepEqual(await readFile(join(outputA, entry.output)), await readFile(join(lock.sourceRoot, entry.source)));
  }
});
test('acceptance bindings and exact mode are rejected by live parsers and the reverse', () => {
  const id = '00000000-0000-4000-8000-000000000005', invoiceId = '00000000-0000-4000-8000-000000000006';
  const financial = { contract: acceptance.LIVE_HANDOFF_CONTRACT, source_id: acceptance.LIVE_HANDOFF_SOURCE,
    environment_id: acceptance.LIVE_HANDOFF_ENVIRONMENT, account_id: acceptance.LIVE_ACCOUNT, mode: 'test', order_id: id,
    reference: 'FW-00000000', snapshot_hash: 'a'.repeat(64), invoice_id: invoiceId, known_revision: null };
  assert.deepEqual(acceptance.parseLiveStatusRequest(financial), financial);
  assert.throws(() => live.parseLiveStatusRequest(financial));
  const liveInput = { ...financial, contract: live.LIVE_HANDOFF_CONTRACT, source_id: live.LIVE_HANDOFF_SOURCE,
    environment_id: live.LIVE_HANDOFF_ENVIRONMENT, account_id: live.LIVE_ACCOUNT, mode: 'live' };
  assert.deepEqual(live.parseLiveStatusRequest(liveInput), liveInput);
  assert.throws(() => acceptance.parseLiveStatusRequest(liveInput));
  for (const patch of [{ account_id: live.LIVE_ACCOUNT }, { mode: 'live' }, { source_id: live.LIVE_HANDOFF_SOURCE },
    { environment_id: live.LIVE_HANDOFF_ENVIRONMENT }, { contract: live.LIVE_HANDOFF_CONTRACT }])
    assert.throws(() => acceptance.parseLiveStatusRequest({ ...financial, ...patch }));
  const officeInput = acceptanceOffice.officeBinding(id); assert.equal(officeInput.mode, 'test');
  assert.equal(officeInput.contract, ACCEPTANCE_DESCRIPTOR.officeContract);
  assert.throws(() => office.parseOfficePriceStatusRequest({ ...officeInput, draft_hash: 'a'.repeat(64) }));
});
test('financial and office HMAC signatures cannot cross profiles, domains or paths even with the same test secret', () => {
  const raw = '{"synthetic":true}', timestamp = String(Math.floor(nowMs / 1000)), secret = 'synthetic_only_'.repeat(4);
  const sign = acceptance.signLiveHandoff(raw, timestamp, secret, acceptance.LIVE_PREPARE_PATH);
  assert.ok(acceptance.verifyLiveHandoffSignature({ raw, timestamp, secret, path: acceptance.LIVE_PREPARE_PATH, signature: sign, nowMs }));
  assert.equal(live.verifyLiveHandoffSignature({ raw, timestamp, secret, path: live.LIVE_PREPARE_PATH, signature: sign, nowMs }), false);
  assert.equal(acceptance.verifyLiveHandoffSignature({ raw, timestamp, secret, path: live.LIVE_PREPARE_PATH, signature: sign, nowMs }), false);
  const officeSign = acceptanceOffice.signOfficeRequest(raw, timestamp, secret, acceptanceOffice.OFFICE_PRICE_REQUEST_PATH);
  assert.ok(acceptanceOffice.verifyOfficeSignature({ raw, timestamp, secret, path: acceptanceOffice.OFFICE_PRICE_REQUEST_PATH, signature: officeSign, nowMs }));
  assert.equal(office.verifyOfficeSignature({ raw, timestamp, secret, path: office.OFFICE_PRICE_REQUEST_PATH, signature: officeSign, nowMs }), false);
  assert.equal(acceptanceOffice.verifyOfficeSignature({ raw, timestamp, secret, path: acceptanceOffice.OFFICE_PRICE_STATUS_PATH, signature: officeSign, nowMs }), false);
  assert.throws(() => acceptance.signLiveHandoff(raw, timestamp, secret, live.LIVE_PREPARE_PATH));
  const wrongDomain = 'v1=' + createHmac('sha256', secret).update(PRODUCTION_DESCRIPTOR.financialHmacDomain + '\n' + timestamp + '\nPOST\n' + acceptance.LIVE_PREPARE_PATH + '\n' + raw).digest('hex');
  assert.equal(acceptance.verifyLiveHandoffSignature({ raw, timestamp, secret, path: acceptance.LIVE_PREPARE_PATH, signature: wrongDomain, nowMs }), false);
});
test('acceptance handler and collector validators require test/false and cannot accept live context', async () => {
  const handler = await derived('live-handler'), collector = await derived('live-collector');
  const config = { enabled: true, profile: 'test', mode: 'test', contract: acceptance.LIVE_HANDOFF_CONTRACT,
    sourceId: acceptance.LIVE_HANDOFF_SOURCE, environmentId: acceptance.LIVE_HANDOFF_ENVIRONMENT, accountId: acceptance.LIVE_ACCOUNT,
    portalOrigin: acceptance.LIVE_PORTAL_ORIGIN, websiteOrigin: acceptance.LIVE_WEBSITE_ORIGIN,
    termsHash: acceptance.LIVE_TERMS_HASH, paymentPolicyHash: acceptance.LIVE_PAYMENT_POLICY_HASH,
    keyId: 'acceptance-unit-key', signingSecret: 'synthetic_only_'.repeat(4), encryptionKey: Buffer.alloc(32, 8), collectorReady: false };
  assert.equal(handler.isLiveHandoffConfiguration(config), true);
  assert.equal(handler.isLiveHandoffConfiguration({ ...config, mode: 'live' }), false);
  assert.equal(handler.isLiveHandoffConfiguration({ ...config, accountId: live.LIVE_ACCOUNT }), false);
  const invoiceId = '00000000-0000-4000-8000-000000000030';
  const context = { managed: true, contract: acceptance.LIVE_HANDOFF_CONTRACT, source_id: acceptance.LIVE_HANDOFF_SOURCE,
    environment_id: acceptance.LIVE_HANDOFF_ENVIRONMENT, account_id: acceptance.LIVE_ACCOUNT, mode: 'test', livemode: false,
    terms_hash: acceptance.LIVE_TERMS_HASH, payment_policy_hash: acceptance.LIVE_PAYMENT_POLICY_HASH, receipt_authority: 'crm',
    surcharge_reporting: true, order_id: '00000000-0000-4000-8000-000000000031', invoice_id: invoiceId,
    allowed: true, already_paid: false, review_required: false };
  assert.equal(collector.validateLiveCollectorContext(context, invoiceId).mode, 'test');
  assert.throws(() => collector.validateLiveCollectorContext({ ...context, livemode: true }, invoiceId));
  assert.throws(() => collector.validateLiveCollectorContext({ ...context, account_id: live.LIVE_ACCOUNT }, invoiceId));
});
test('SQL identities have separate table/RPC/advisory namespaces; ordinary finance routine names and business literals remain', async () => {
  for (const name of ['boundary', 'office-workflows', 'accounting', 'reporting-accounting']) {
    const sql = await readFile(join(outputA, 'sql', name + '.sql.review-only.txt'), 'utf8');
    assert.doesNotMatch(sql, /firewood_live_/u);
    assert.doesNotMatch(sql, /firewood-live-v1-order:/u);
    assert.doesNotMatch(sql, /website_firewood_invoice_live_v1/u);
    assert.doesNotMatch(sql, /acct_1Tv92EI7tY6VHUvU/u);
    assert.doesNotMatch(sql, /'mode','live'|->>'mode' is distinct from 'live'|'livemode',true/u);
  }
  const sql = await readFile(join(outputA, 'sql/accounting.sql.review-only.txt'), 'utf8');
  assert.match(sql, /public\.reconcile_invoice_balance\(uuid\)/u);
  assert.match(sql, /app_private\.reconcile_outbound_delivery\(uuid\)/u);
  assert.match(sql, /app_private\.firewood_acceptance_cancellation_credits/u);
  assert.match(sql, /raw_balance_due_cents/u); assert.match(sql, /credited_principal_cents/u);
  const boundary = await readFile(join(outputA, 'sql/boundary.sql.review-only.txt'), 'utf8');
  assert.ok(boundary.includes(BUSINESS_POLICY.termsHash)); assert.ok(boundary.includes(BUSINESS_POLICY.paymentPolicyHash));
  assert.match(boundary, /'mode','test','livemode',false/u);
});
test('wrong account/mode/livemode, stale observations and boolean-only approval cannot bind acceptance', () => {
  for (const patch of [{ accountId: PRODUCTION_DESCRIPTOR.expectedAccountId }, { livemode: true }, { mode: 'live' },
    { observedAt: new Date(nowMs - 600001).toISOString() }, { evidenceSha256: null }]) {
    const data = evidence(); Object.assign(data.accountObservation, patch);
    assert.throws(() => bindAcceptanceReviewDescriptor(data));
  }
  const data = evidence(); data.accountObservation = { verified: true, testMode: true };
  assert.throws(() => bindAcceptanceReviewDescriptor(data));
});
test('production or mismatched database purpose/name/OID/system/marker/registry cannot bind acceptance', () => {
  for (const patch of [{ name: 'postgres' }, { purpose: 'production' }, { comment: 'production' }, { metaSchema: 'hosting_guard' },
    { schemaFingerprint: 'changed' }, { admissionBindingId: 'not-a-uuid' }])
    assert.throws(() => validateAcceptanceDatabaseIdentity({ ...evidence().expectedDatabase, ...patch }));
  for (const patch of [{ oid: '24682' }, { systemIdentifier: '7561234567890123457' }, { markerId: '00000000-0000-4000-8000-000000000099' }]) {
    const data = evidence(); Object.assign(data.observedDatabase, patch);
    assert.throws(() => bindAcceptanceReviewDescriptor(data));
  }
  const data = evidence(); data.admissionObservation.purpose = 'production';
  assert.throws(() => bindAcceptanceReviewDescriptor(data));
});
test('operator-approved actual HTTPS origins and exact acceptance path prefixes are required', () => {
  for (const patch of [{ portalOrigin: fixture.origins.portalOrigin }, { portalOrigin: 'http://127.0.0.1:3102' },
    { portalOrigin: 'https://username:password@example.com' }, { portalOrigin: 'https://example.com/' },
    { financialPathPrefix: PRODUCTION_DESCRIPTOR.financialPathPrefix }, { officePathPrefix: PRODUCTION_DESCRIPTOR.officePathPrefix },
    { approvalEvidenceSha256: null }]) {
    const data = evidence(); Object.assign(data.approvedOrigins, patch); assert.throws(() => bindAcceptanceReviewDescriptor(data));
  }
});
test('matching synthetic binding observations still grant no provider/runtime/activation authority', async () => {
  const value = bindAcceptanceReviewDescriptor(evidence());
  assert.equal(value.state, 'binding-consistent-review-only'); assert.equal(value.providerReady, false);
  assert.equal(value.runtimeLoadable, false); assert.ok(Object.values(value.activation).every(flag => flag === false));
  const guard = acceptanceSqlIdentityPrecondition(value);
  assert.match(guard, /current_database\(\) IS DISTINCT FROM 'ats_firewood_acceptance_a1b2c3d4e5f6'/u);
  assert.match(guard, /oid::text/u); assert.match(guard, /system_identifier::text/u);
  assert.match(guard, /shobj_description/u); assert.match(guard, /ats_firewood_acceptance_meta\.target/u);
  assert.match(guard, /purpose='ats-firewood-acceptance-v1'/u);
  const result = await deriveAcceptanceArtifact({ descriptor: value, outputDirectory: join(run, 'bound-review') });
  assert.equal(result.providerReady, false); assert.equal(result.files, 27);
  const manifest = JSON.parse(await readFile(join(result.outputDirectory, 'DERIVATION_MANIFEST.json'), 'utf8'));
  const envelopes = manifest.files.filter(file => file.type === 'guarded-review-envelope'); assert.equal(envelopes.length, 6);
  for (const entry of envelopes) {
    const bytes = await readFile(join(result.outputDirectory, entry.output), 'utf8');
    assert.ok(bytes.startsWith(guard)); const ddl = bytes.search(/\b(?:alter|create)\s+(?:or\s+replace\s+)?(?:table|function|view|trigger|type)\b/iu);
    assert.ok(ddl < 0 || bytes.indexOf('DO $ats_acceptance_target$') < ddl);
    assert.equal(entry.executableAuthority, false);
  }
});
test('profile module has no ambient credentials, key/database/network loading or environment-toggle path', async () => {
  const source = await readFile(join(here, 'profiles.mjs'), 'utf8');
  assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|readFile|node:(?:net|tls|http|https|fs)|createConnection|new Pool|STRIPE_SECRET/u);
  const before = clone(ACCEPTANCE_DESCRIPTOR);
  const old = process.env.FIREWOOD_ACCEPTANCE_ENABLED; process.env.FIREWOOD_ACCEPTANCE_ENABLED = 'true';
  try { assert.deepEqual(ACCEPTANCE_DESCRIPTOR, before); assert.throws(() => assertDerivableAcceptance(ACCEPTANCE_DESCRIPTOR)); }
  finally { if (old === undefined) delete process.env.FIREWOOD_ACCEPTANCE_ENABLED; else process.env.FIREWOOD_ACCEPTANCE_ENABLED = old; }
});

test('artifact verification rejects rewritten identity metadata and target SQL even if local file hashes are updated', async () => {
  const tampered = join(run, 'forged-descriptor'); await cp(outputB, tampered, { recursive: true });
  const path = join(tampered, 'REVIEW_ONLY_PROFILE.json'), value = JSON.parse(await readFile(path, 'utf8'));
  value.expectedAccountId = PRODUCTION_DESCRIPTOR.expectedAccountId; const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  await writeFile(path, bytes);
  const manifestPath = join(tampered, 'DERIVATION_MANIFEST.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files.find(item => item.type === 'descriptor').outputSha256 = sha(bytes);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await assert.rejects(verifyDerivedArtifact(tampered), /serialized descriptor/);
  const bound = bindAcceptanceReviewDescriptor(evidence()), boundRoot = join(run, 'forged-envelope');
  const proof = await deriveAcceptanceArtifact({ descriptor: bound, outputDirectory: boundRoot });
  const mp = join(boundRoot, 'DERIVATION_MANIFEST.json'), mm = JSON.parse(await readFile(mp, 'utf8'));
  const entry = mm.files.find(item => item.type === 'guarded-review-envelope');
  const data = Buffer.from('-- target guard removed\nselect 1;\n');
  await writeFile(join(boundRoot, entry.output), data); entry.outputSha256 = sha(data);
  await writeFile(mp, JSON.stringify(mm, null, 2) + '\n');
  await assert.rejects(verifyDerivedArtifact(boundRoot), /SQL target precondition/);
  await assert.rejects(verifyDerivedArtifact(boundRoot, { expectedManifestSha256: proof.manifestSha256 }), /trusted manifest digest/);
});
test('derived key classifier only classifies test restricted keys without exposing or constructing a client', async () => {
  const value = await derived('live-profile');
  assert.equal(value.isLiveRestrictedStripeKey('rk_test_SYNTHETICFIXTUREONLY'), true);
  assert.equal(value.isLiveRestrictedStripeKey('rk_live_SYNTHETICFIXTUREONLY'), false);
  assert.equal(value.FIREWOOD_LIVE_REVIEW_PROFILE.mode, 'test');
  assert.equal(value.FIREWOOD_LIVE_REVIEW_PROFILE.runtimeLoadable, false);
});
