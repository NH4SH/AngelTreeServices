import assert from 'node:assert/strict';
import test from 'node:test';
import { assessRecoveryCopy, assessPromotion } from './recovery-policy.mjs';

const now = Date.parse('2026-10-27T13:00:00Z');
const copy = () => ({
  captureStartedAt: new Date(now - 120_000).toISOString(),
  captureCompletedAt: new Date(now - 100_000).toISOString(),
  offsiteVerifiedAt: new Date(now - 80_000).toISOString(),
  backupExitCode: 0, remoteReadVerified: true,
  coherentDatabaseAndFiles: true, applicationAndSchemaMatched: true,
  authIncluded: true, paymentAndDeliveryStateIncluded: true,
});

test('a recent verified coherent recovery copy meets the five-minute target', () => {
  assert.equal(assessRecoveryCopy(copy(), now).usableWithinTarget, true);
});

test('uploading an old capture now does not reset its data-loss window', () => {
  const c = { ...copy(), captureStartedAt: new Date(now - 300_001).toISOString(), offsiteVerifiedAt: new Date(now).toISOString() };
  assert.ok(assessRecoveryCopy(c, now).problems.includes('recovery_copy_older_than_five_minutes'));
});

test('the five-minute boundary is measured from capture start', () => {
  assert.equal(assessRecoveryCopy({ ...copy(), captureStartedAt: new Date(now - 300_000).toISOString() }, now).usableWithinTarget, true);
});

test('partial backups and copies not read back from the destination are unusable', () => {
  for (const changes of [{ backupExitCode: 3 }, { backupExitCode: 1 }, { remoteReadVerified: false }]) {
    assert.equal(assessRecoveryCopy({ ...copy(), ...changes }, now).usableWithinTarget, false);
  }
});

test('database-only or mismatched app/schema copies cannot be promoted', () => {
  for (const key of ['coherentDatabaseAndFiles', 'applicationAndSchemaMatched', 'authIncluded', 'paymentAndDeliveryStateIncluded']) {
    assert.equal(assessRecoveryCopy({ ...copy(), [key]: false }, now).usableWithinTarget, false, key);
  }
});

test('future, missing, and reversed timestamps do not give false freshness', () => {
  for (const changes of [
    { captureStartedAt: null }, { offsiteVerifiedAt: 'invalid' },
    { offsiteVerifiedAt: new Date(now + 1).toISOString() },
    { captureCompletedAt: new Date(now - 130_000).toISOString() },
    { offsiteVerifiedAt: new Date(now - 110_000).toISOString() },
  ]) assert.equal(assessRecoveryCopy({ ...copy(), ...changes }, now).usableWithinTarget, false);
});

const promotion = () => ({
  copy: copy(), oldPrimaryFenced: true, allIngressAndWorkersFenced: true,
  writesFencedAt: new Date(now).toISOString(),
  restoredDataAndPermissionsVerified: true,
  uncertainProviderOutcomesHeld: true, newWorkersDisabled: true,
});

test('unreachable host and DNS changes alone cannot authorize promotion', () => {
  assert.ok(assessPromotion({ ...promotion(), oldPrimaryFenced: false, dnsChanged: true, oldHostUnreachable: true }, now).problems.includes('old_primary_not_fenced'));
});

test('a second sender, unfenced mobile API or unreviewed provider result blocks promotion', () => {
  for (const key of ['allIngressAndWorkersFenced', 'uncertainProviderOutcomesHeld', 'newWorkersDisabled']) {
    assert.equal(assessPromotion({ ...promotion(), [key]: false }, now).readyForControlledPromotion, false, key);
  }
});

test('manual recovery still requires a verified restore and fresh recovery copy', () => {
  assert.equal(assessPromotion(promotion(), now).readyForControlledPromotion, true);
  assert.equal(assessPromotion({ ...promotion(), restoredDataAndPermissionsVerified: false }, now).readyForControlledPromotion, false);
  assert.equal(assessPromotion(promotion(), now + 3_600_000).readyForControlledPromotion, true);
  assert.equal(assessPromotion({ ...promotion(), writesFencedAt: new Date(now + 300_000).toISOString() }, now + 300_000).readyForControlledPromotion, false);
  assert.equal(assessPromotion({ ...promotion(), writesFencedAt: null }, now).readyForControlledPromotion, false);
  assert.equal(assessPromotion({}, now).readyForControlledPromotion, false);
});
