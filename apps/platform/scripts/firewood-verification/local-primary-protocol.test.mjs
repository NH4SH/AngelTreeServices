// Pure local-primary and financial-boundary tests. No DB/provider/key/config IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateReleasedSnapshot, FIXED_RELEASE, MODES } from '../../src/lib/firewood/runtime-admission/released-context-core.mjs';
import { isReleasedFirewoodMode, sameCollectorRelease, continuesCollectorRelease, createLiveCollectorAdmission } from '../../src/lib/firewood/handoff/collector-admission.mjs';
import { createFirewoodReceiptSourceGate } from '../../src/lib/firewood/handoff/receipt-source-gate.mjs';
import { LIVE_TERMS_POLICY } from '../../src/lib/firewood/handoff/live-contract.mjs';
const now = 1800000000000, boot = '11111111-1111-1111-1111-111111111111';
const bytes = x => Buffer.from(JSON.stringify(x)), sha = x => createHash('sha256').update(x).digest('hex');
const key = ['rk', 'live', 'SYNTHETICFIXTUREONLY1'].join('_');
function snapshot() {
  const b = { version: 2, admissionProtocol: 'local-primary-operation-v1', namespace: 'ats-home-primary-112233445566',
    generation: 20, sourceId: 'ats_crm_primary_20261029', sourceScope: 'crm-v1', environment: 'home-primary-local-v2',
    sourceMigrationCount: 102, systemIdentifier: '7000000000000000001', topology: 'a'.repeat(32), timeline: 1,
    primaryInstallationId: 'b'.repeat(32), installationOverlaySha256: 'c'.repeat(64),
    volumeName: 'ats_crm_primary_20261029_pg-data-v3', sourceDbImage: 'sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706' };
  const binding = bytes(b), digest = sha(binding), modes = Object.fromEntries(MODES.map(m => [m, true]));
  const d = { kind: 'ats-firewood-local-primary-release-v2', bindingSha256: digest, namespace: b.namespace,
    generation: b.generation, sourceId: b.sourceId, sourceScope: b.sourceScope, sourceEnvironment: b.environment,
    sourceMigrationCount: 102, admissionProtocol: b.admissionProtocol, systemIdentifier: b.systemIdentifier,
    topologyFingerprint: b.topology, timeline: 1, primaryInstallationId: b.primaryInstallationId,
    schemaSha256: 'd'.repeat(64), releaseComponentDigest: 'e'.repeat(64), installationOverlaySha256: b.installationOverlaySha256,
    signingKeyId: 'synthetic_key_id', signingKeyFingerprint: 'f'.repeat(64), stripeKeyFingerprint: sha(key), modes, ...FIXED_RELEASE };
  const a = { kind: 'ats-local-primary-operation-v1', bindingSha256: digest, namespace: b.namespace, generation: 20,
    operationSequence: 20, sourceBoot: boot, databaseBoot: new Date(now - 60000).toISOString(),
    systemIdentifier: b.systemIdentifier, topologyFingerprint: b.topology, primaryInstallationId: b.primaryInstallationId,
    observedAtMs: now - 1000, observedMonotonicMs: 99000, expiresAtMs: now + 13000, expiresAtBootMs: 113000 };
  return { platform: 'linux', uid: 1000, latchAbsent: true, wallMs: now, monotonicMs: 100000,
    descriptor: bytes(d), binding, active: bytes(a), workersReleased: bytes({ namespace: b.namespace, generation: 20, providerReconciliationVerified: true }),
    bootId: Buffer.from(boot + '\n') };
}
const context = mode => validateReleasedSnapshot(snapshot(), mode);
const change = (s, name, fn) => { const v = JSON.parse(s[name]); fn(v); s[name] = bytes(v); };
test('current release reader emits local operation proof with no legacy backup fields', () => {
  for (const mode of MODES) {
    const c = context(mode); assert.equal(c.admissionProtocol, 'local-primary-operation-v1');
    assert.equal(c.operationAgeMs, 1000); assert.equal(c.operationSequence, 20);
    for (const key of ['authorityPublicKeyFingerprint', 'backupAgeMs', 'receiptSequence', 'receiptComponentSha256']) assert(!Object.hasOwn(c, key));
  }
});
for (const [name, mutate] of Object.entries({
  'operator hold': s => { s.latchAbsent = false; },
  'host reboot': s => { s.bootId = Buffer.from('22222222-2222-2222-2222-222222222222'); },
  'different installation': s => change(s, 'active', a => { a.primaryInstallationId = 'c'.repeat(32); }),
  'extended local lease': s => change(s, 'active', a => { a.expiresAtMs++; }),
  'legacy proof relabel': s => change(s, 'active', a => { a.receiptSequence = 1; }),
  'unreconciled workers': s => change(s, 'workersReleased', a => { a.providerReconciliationVerified = false; }),
})) test(`${name} is rejected by the actual candidate core`, () => { const s = snapshot(); mutate(s); assert.throws(() => validateReleasedSnapshot(s, 'collection')); });
test('collection and sending accept the explicit local protocol without backup-key provenance', () => {
  assert(isReleasedFirewoodMode(context('collection'), 'collection', now));
  assert(isReleasedFirewoodMode(context('sending'), 'sending', now));
});
for (const [name, mutate] of Object.entries({
  'unknown protocol': c => { c.admissionProtocol = 'unreviewed'; },
  'legacy namespace': c => { c.namespace = 'ats-home-continuous-112233445566'; },
  'hybrid authority field': c => { c.authorityPublicKeyFingerprint = undefined; },
  'fabricated backup age': c => { c.backupAgeMs = 0; },
  'stale local operation': c => { c.operationAgeMs = 14000; },
  'future SQL operation': c => { c.operationObservedAtMs = now + 1; },
  'disabled requested mode': c => { c.modes = { ...c.modes, collection: false }; },
})) test(`${name} cannot open a local financial mode`, () => {
  const c = structuredClone(context('collection')); mutate(c); assert.equal(isReleasedFirewoodMode(c, 'collection', now), false);
});
test('same static release permits advancing operations and rejects sequence regression', () => {
  const a = context('collection'), b = { ...a, operationSequence: 21 };
  assert(sameCollectorRelease(a, b)); assert(continuesCollectorRelease(a, b)); assert.equal(continuesCollectorRelease(b, a), false);
  assert.equal(continuesCollectorRelease(a, { ...b, primaryInstallationId: 'f'.repeat(32) }), false);
});
const invoiceId = '00000000-0000-4000-8000-000000000010', orderId = '00000000-0000-4000-8000-000000000020';
const paymentId = '00000000-0000-4000-8000-000000000030', deliveryId = '00000000-0000-4000-8000-000000000040';
const invoice = { id: invoiceId, invoice_number: 'INV-FW-' + orderId.toUpperCase(), document_terms_version: LIVE_TERMS_POLICY.version };
const source = () => ({ managed: true, contract: FIXED_RELEASE.contract, source_id: FIXED_RELEASE.source,
  environment_id: FIXED_RELEASE.environment, account_id: FIXED_RELEASE.account, mode: 'live', livemode: true,
  terms_hash: FIXED_RELEASE.termsHash, payment_policy_hash: FIXED_RELEASE.paymentPolicyHash,
  receipt_authority: 'crm', surcharge_reporting: true, order_id: orderId, invoice_id: invoiceId,
  allowed: true, already_paid: false, review_required: false, sender_enabled: true });
test('collector mint crosses a local renewal while preserving invoice/account policy', async () => {
  let sequence = 20;
  const gate = createLiveCollectorAdmission({ readContext: mode => ({ ...context(mode), operationSequence: sequence++ }),
    readKey: () => key, readCollectorContext: async () => source(), now: () => now });
  const policy = await gate.mint({}, invoice, true); assert(policy && gate.isMinted(policy));
  assert.equal(policy.accountId, FIXED_RELEASE.account); assert.equal(policy.orderId, orderId);
});
test('collector cannot mint across a regressed local operation', async () => {
  let sequence = 20;
  const gate = createLiveCollectorAdmission({ readContext: mode => ({ ...context(mode), operationSequence: sequence-- }),
    readKey: () => key, readCollectorContext: async () => source(), now: () => now });
  assert.equal(await gate.mint({}, invoice, true), null);
});
test('receipt ticket cannot cross an older operation at the transport boundary', async () => {
  let sequence = 20;
  const gate = createFirewoodReceiptSourceGate({ readSendingContext: mode => ({ ...context(mode), operationSequence: sequence++ }),
    readPayment: async () => ({ id: paymentId, invoice_id: invoiceId, status: 'succeeded' }),
    readInvoice: async () => invoice, readCollectorContext: async () => source(), now: () => now });
  const input = { email_type: 'payment_confirmation', payment_id: paymentId, invoice_id: invoiceId };
  const claim = await gate.beforeClaim(deliveryId, input); assert.equal(claim.ok, true);
  sequence = 18;
  const result = await gate.beforeTransport(deliveryId, input, claim.ticket); assert.equal(result.ok, false);
  assert.equal(result.code, 'receipt_sending_held');
});
