import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ACCEPTANCE, validateDatabaseProposal, validateNativeRoleProposal,
  reviewBindingConsistency, testKeyMatchesReviewedCandidate } from './binding-contract.mjs';

// In-memory synthetic values only; no value here is an actual target or key.
const hash = text => createHash('sha256').update(text).digest('hex');
const key = 'rk_test_SYNTHETICFIXTUREONLY';
const nowMs = Date.parse('2026-10-30T12:00:00.000Z');
function fixture() {
  const expectedDatabase = { name: 'ats_firewood_acceptance_012345abcdef', oid: '17001', systemIdentifier: '7700000000000000001',
    markerId: '11111111-1111-4111-8111-111111111111', purpose: 'ats-firewood-acceptance-v1',
    comment: 'ats-firewood-acceptance-v1:11111111-1111-4111-8111-111111111111:synthetic-only',
    metaSchema: 'ats_firewood_acceptance_meta', metaTable: 'target', schemaFingerprint: 'a'.repeat(64),
    releaseDigest: 'b'.repeat(64), admissionBindingId: '22222222-2222-4222-8222-222222222222' };
  const roles = Object.fromEntries(['request', 'worker', 'health'].map(kind => [kind, 'ats_firewood_acceptance_' + kind + '_012345abcdef']));
  return { expectedDatabase, observedDatabase: structuredClone(expectedDatabase), roles, nowMs,
    accountObservation: { accountId: ACCEPTANCE.accountId, mode: 'test', livemode: false, keyFingerprint: hash(key),
      evidenceSha256: 'c'.repeat(64), observedAt: new Date(nowMs).toISOString() },
    nativeObservation: { databaseName: expectedDatabase.name, databaseOid: expectedDatabase.oid,
      systemIdentifier: expectedDatabase.systemIdentifier, markerId: expectedDatabase.markerId,
      admissionBindingId: expectedDatabase.admissionBindingId, roles: structuredClone(roles),
      schemaFingerprint: expectedDatabase.schemaFingerprint, releaseDigest: expectedDatabase.releaseDigest,
      proofSha256: 'd'.repeat(64), observedAt: new Date(nowMs).toISOString() } };
}
test('unbound, postgres, production names and marker substitutions reject', () => {
  assert.throws(() => validateDatabaseProposal(null));
  for (const name of ['postgres', 'ats_firewood_acceptance_012345ABCDEf', 'ats_firewood_acceptance_012345abcdef_extra', 'ats_primary_012345abcdef']) {
    const f = fixture(); f.expectedDatabase.name = name; assert.throws(() => validateDatabaseProposal(f.expectedDatabase));
  }
  const f = fixture(); f.expectedDatabase.markerId = '33333333-3333-4333-8333-333333333333';
  assert.throws(() => validateDatabaseProposal(f.expectedDatabase));
});
test('all three native roles use this exact target suffix; production roles reject', () => {
  const f = fixture(); assert.equal(validateNativeRoleProposal(f.roles, f.expectedDatabase.name), true);
  for (const kind of ['request', 'worker', 'health']) {
    const f = fixture(); f.roles[kind] = 'ats_firewood_' + kind;
    assert.throws(() => reviewBindingConsistency(f));
  }
  const f2 = fixture(); delete f2.roles.health; assert.throws(() => reviewBindingConsistency(f2));
});
test('matching observations yield review consistency without admission or runtime authority', () => {
  const candidate = reviewBindingConsistency(fixture());
  for (const key of ['actualAdmission', 'providerReady', 'runtimeLoadable', 'activationAuthority']) assert.equal(candidate[key], false);
  assert.equal(Object.isFrozen(candidate), true);
});
test('test key requires registered candidate and exact fingerprint; live, broad test and forged candidates reject', () => {
  const candidate = reviewBindingConsistency(fixture());
  assert.equal(testKeyMatchesReviewedCandidate(candidate, key), true);
  for (const other of ['rk_live_SYNTHETICFIXTUREONLY', 'sk_test_SYNTHETICFIXTUREONLY', 'rkcs_test_SYNTHETICFIXTUREONLY', key + 'x', ' ' + key])
    assert.equal(testKeyMatchesReviewedCandidate(candidate, other), false);
  assert.equal(testKeyMatchesReviewedCandidate({ ...candidate }, key), false);
  assert.equal(testKeyMatchesReviewedCandidate(null, key), false);
});
test('account mode, freshness, native proof and literal DB mismatch fail closed', () => {
  const mutate = [f => { f.accountObservation.livemode = true; }, f => { f.accountObservation.mode = 'live'; },
    f => { f.accountObservation.accountId = 'acct_1Tv92EI7tY6VHUvU'; },
    f => { f.accountObservation.observedAt = new Date(nowMs - 600001).toISOString(); },
    f => { f.nativeObservation.observedAt = new Date(nowMs + 1).toISOString(); },
    f => { f.observedDatabase.oid = '17002'; }, f => { f.nativeObservation.databaseName = 'postgres'; },
    f => { f.nativeObservation.roles.health = 'ats_firewood_health'; },
    f => { f.nativeObservation.proofSha256 = null; }, f => { f.expectedDatabase = null; }];
  for (const change of mutate) { const f = fixture(); change(f); assert.throws(() => reviewBindingConsistency(f)); }
});
test('delivered unbound handoff keeps every actual evidence field null and cannot pass consistency review', async () => {
  const value = JSON.parse(await readFile(new URL('./BINDING_UNBOUND.json', import.meta.url), 'utf8'));
  assert.equal(value.state, 'UNBOUND_REVIEW_ONLY');
  for (const name of ['expectedDatabase', 'observedDatabase', 'roles', 'accountObservation', 'nativeObservation',
    'origins', 'releaseAndRecovery', 'credentials']) assert.equal(value[name], null);
  for (const name of ['actualAdmission', 'providerReady', 'runtimeLoadable', 'activationAuthority']) assert.equal(value[name], false);
  assert.throws(() => reviewBindingConsistency(value));
});
