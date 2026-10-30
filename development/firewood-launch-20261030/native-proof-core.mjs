// Pure comparison only. The production entry obtains signed, fixed-path context
// and a real native SQL result. This module is not an admission certificate.
import assert from 'node:assert/strict';
import { sameRelease } from './runtime-admission/released-context-core.mjs';

export const NATIVE_CONTEXT_SQL = 'SELECT app_private.fwofficev2_native_context() AS proof';
const roles = Object.freeze({ web: 'ats_firewood_request', worker: 'ats_firewood_worker', health: 'ats_firewood_health' });
const hash = /^[a-f0-9]{64}$/u;
const modes = ['status', 'preparation', 'office', 'collection', 'sending'];
const number = value => Number.isSafeInteger(value) && value > 0;

export function validateVerifierBinding({ descriptor, role, mode, binding }) {
  assert.ok(Object.hasOwn(roles, role) && modes.includes(mode));
  assert.equal(binding?.role, roles[role]);
  assert.equal(binding?.database, 'postgres');
  assert.equal(binding?.schema, 'app_private');
  assert.equal(binding?.profile, 'production-live');
  assert.match(binding.systemIdentifier, /^\d{16,20}$/u);
  for (const key of ['releaseSha256', 'schemaSha256', 'recoveryBindingSha256', 'authorityPublicKeyFingerprint'])
    assert.match(binding[key], hash);
  assert.equal(descriptor?.version, 1);
  assert.equal(descriptor?.profile, 'production-live');
  assert.equal(descriptor?.roles?.[role], roles[role]);
  assert.equal(descriptor.sourceId, 'website_firewood_invoice_live_v1');
  assert.equal(descriptor.environmentId, 'ats_firewood_live_v1');
  assert.equal(descriptor.accountId, 'acct_1Tv92EI7tY6VHUvU');
  assert.equal(descriptor.mode, 'live');
  assert.equal(descriptor.origin, 'https://checkout.angeltreeservices.org');
  for (const key of ['database', 'schema', 'profile', 'systemIdentifier', 'releaseSha256', 'schemaSha256',
    'recoveryBindingSha256', 'authorityPublicKeyFingerprint']) assert.equal(binding[key], descriptor.binding?.[key]);
  return Object.freeze({ role, mode, binding: Object.freeze(structuredClone(binding)) });
}

export function combineNativeAdmission({ expected, before, native, after, nowMs }) {
  assert.ok(before && after && sameRelease(before, after));
  // A fresh receipt can arrive while SQL is awaited. Retry that query instead of joining
  // two authority observations, even when the static release and recovery generation agree.
  assert.ok(number(before.receiptSequence) && number(after.receiptSequence));
  for (const key of ['receiptSequence', 'backupCaptureStartedAtMs', 'captureStartedBootMs',
    'receiptComponentSha256', 'receiptExpiresAtMs']) assert.equal(before[key], after[key]);
  assert.match(after.receiptComponentSha256, hash);
  assert.ok(number(after.backupCaptureStartedAtMs) && number(after.receiptExpiresAtMs));
  assert.ok(Number.isFinite(after.captureStartedBootMs) && after.captureStartedBootMs > 0);
  assert.equal(after.mode, expected.mode);
  assert.equal(after.modes?.[expected.mode], true);
  assert.equal(after.account, 'acct_1Tv92EI7tY6VHUvU');
  assert.equal(after.source, 'website_firewood_invoice_live_v1');
  for (const [bound, actual] of [['systemIdentifier', 'systemIdentifier'], ['releaseSha256', 'releaseSha256'],
    ['schemaSha256', 'schemaSha256'], ['recoveryBindingSha256', 'bindingSha256'],
    ['authorityPublicKeyFingerprint', 'authorityPublicKeyFingerprint']])
    assert.equal(after[actual], expected.binding[bound]);
  assert.equal(native?.admitted, true);
  assert.equal(native.database, 'postgres');
  assert.equal(native.systemIdentifier, after.systemIdentifier);
  assert.equal(native.databaseStartedAtMs, after.databaseStartedAtMs);
  assert.equal(native.leaseEpoch, String(after.generation));
  assert.equal(native.nodeIdentity, 'ats-home-primary');
  assert.equal(native.topologyFingerprint, after.topologyFingerprint);
  assert.equal(native.captureStartedAtMs, after.backupCaptureStartedAtMs);
  for (const key of ['databaseStartedAtMs', 'captureStartedAtMs', 'leaseIssuedAtMs', 'expiresAtMs', 'observedAtMs'])
    assert.ok(number(native[key]));
  assert.ok(number(nowMs) && number(before.observedAtMs) && number(after.observedAtMs));
  assert.ok(before.observedAtMs <= after.observedAtMs && after.observedAtMs <= nowMs);
  assert.ok(nowMs - before.observedAtMs < 5000, 'Slow native verification must be retried');
  assert.ok(Math.abs(native.observedAtMs - after.observedAtMs) <= 1000, 'Native clock mismatch');
  assert.ok(native.captureStartedAtMs <= native.leaseIssuedAtMs && native.leaseIssuedAtMs <= native.observedAtMs);
  // The actual corrected primary controller renews at issued_at +14 seconds.
  // The SQL helper's additional observed_at+14s cap cannot broaden that publisher policy.
  assert.ok(native.expiresAtMs <= native.leaseIssuedAtMs + 14000);
  assert.ok(Number.isSafeInteger(after.backupAgeMs) && after.backupAgeMs >= 0);
  const backupAgeMs = after.backupAgeMs + (nowMs - after.observedAtMs);
  assert.ok(backupAgeMs < 280000);
  const expiresAtMs = Math.min(native.expiresAtMs, after.expiresAtMs, nowMs + 280000 - backupAgeMs, nowMs + 14000);
  assert.ok(Number.isSafeInteger(expiresAtMs) && expiresAtMs > nowMs);
  return Object.freeze({ admitted: true, systemIdentifier: after.systemIdentifier,
    releaseSha256: after.releaseSha256, schemaSha256: after.schemaSha256,
    recoveryBindingSha256: after.bindingSha256, authorityPublicKeyFingerprint: after.authorityPublicKeyFingerprint,
    backupAgeMs, expiresAtMs });
}
