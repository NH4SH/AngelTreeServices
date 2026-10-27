// Offline acceptance checks for the hosting rehearsal. This is not a runtime
// write fence: production stays unchanged until a separate fence is tested.
export const recoveryPolicy = Object.freeze({
  mode: 'controlled-manual',
  maximumDataLossMs: 5 * 60_000,
  proposedBackupIntervalMs: 2 * 60_000,
});

function timestamp(value) {
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

export function assessRecoveryCopy(copy, now = Date.now(), writeCutoff = now) {
  const problems = [];
  const started = timestamp(copy?.captureStartedAt);
  const completed = timestamp(copy?.captureCompletedAt);
  const verified = timestamp(copy?.offsiteVerifiedAt);
  const datesValid = [started, completed, verified].every(Number.isFinite) &&
    started <= completed && completed <= verified && verified <= now;
  if (!datesValid) problems.push('invalid_capture_or_verification_time');
  // A recovery taking an hour does not mean an hour of lost writes. During
  // promotion, measure to the proven write cutoff; during monitoring, to now.
  if (!Number.isFinite(writeCutoff) || writeCutoff > now || writeCutoff < started) problems.push('invalid_write_cutoff');
  if (datesValid && writeCutoff - started > recoveryPolicy.maximumDataLossMs) problems.push('recovery_copy_older_than_five_minutes');
  if (copy?.backupExitCode !== 0) problems.push('backup_incomplete');
  if (copy?.remoteReadVerified !== true) problems.push('offsite_bytes_not_verified');
  if (copy?.coherentDatabaseAndFiles !== true) problems.push('database_and_files_not_paired');
  if (copy?.applicationAndSchemaMatched !== true) problems.push('release_and_schema_not_matched');
  if (copy?.authIncluded !== true) problems.push('auth_not_included');
  if (copy?.paymentAndDeliveryStateIncluded !== true) problems.push('payment_or_delivery_history_missing');
  return { usableWithinTarget: problems.length === 0, problems };
}

export function assessPromotion(evidence, now = Date.now()) {
  const copy = assessRecoveryCopy(evidence?.copy, now, timestamp(evidence?.writesFencedAt));
  const problems = [...copy.problems];
  // DNS changes or an unreachable host do not prove the old primary is fenced.
  if (evidence?.oldPrimaryFenced !== true) problems.push('old_primary_not_fenced');
  if (evidence?.allIngressAndWorkersFenced !== true) problems.push('alternate_writers_not_fenced');
  if (evidence?.restoredDataAndPermissionsVerified !== true) problems.push('restore_not_verified');
  if (evidence?.uncertainProviderOutcomesHeld !== true) problems.push('uncertain_payments_or_messages_not_held');
  if (evidence?.newWorkersDisabled !== true) problems.push('workers_enabled_before_reconciliation');
  return { readyForControlledPromotion: problems.length === 0, problems };
}
