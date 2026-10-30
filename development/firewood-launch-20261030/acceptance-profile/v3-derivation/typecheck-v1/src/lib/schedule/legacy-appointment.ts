import type { SupabaseClient } from '@supabase/supabase-js';
import type { LegacyAppointmentCommandArgs } from '../types/rpc-contracts.ts';
import { withDeadline } from '../runtime/deadline.ts';
import { safeStaffMessage } from '../security/errors.ts';

export type LegacyAppointmentInput = {
  id: string; jobId: string; revision: number | null; mode: 'create' | 'details' | 'status';
  values: Record<string, string | null>; overrideReason?: string | null;
};
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function saveLegacyAppointment(db: SupabaseClient, input: LegacyAppointmentInput) {
  if (!uuid.test(input.id) || !uuid.test(input.jobId) || (input.mode !== 'create' && (!Number.isSafeInteger(input.revision) || input.revision! < 1))) {
    return { status: 'error' as const, message: 'Refresh the calendar before saving this appointment.' };
  }
  try {
    const args = {
      p_appointment_id: input.id, p_job_id: input.jobId, p_expected_revision: input.revision,
      p_values: input.values, p_mode: input.mode, p_override_reason: input.overrideReason ?? null,
    } satisfies LegacyAppointmentCommandArgs;
    const { data, error } = await withDeadline(signal => db.rpc('save_legacy_appointment', args).abortSignal(signal), 15000);
    if (error) return { status: 'error' as const, message: (error.code === "PT409" || error.code === "40001")
      ? 'This appointment changed. Refresh the calendar and review it before saving again. Your changes have not been applied.'
      : error.code === '42501' ? 'You no longer have permission to change this appointment.'
      : safeStaffMessage(error.message) };
    if (!data || data.id !== input.id || !Number.isSafeInteger(data.revision) || data.revision < 1
      || typeof data.replayed !== 'boolean' || !Number.isSafeInteger(data.warning_count) || data.warning_count < 0) {
      return { status: 'error' as const, message: 'The save could not be confirmed. Review the calendar before trying again.' };
    }
    return { status: data.warning_count ? 'warning' as const : 'success' as const,
      message: data.warning_count ? 'Appointment saved with a qualification warning. Review the assigned employee.'
        : data.replayed ? 'This appointment was already saved. The existing appointment is shown.'
        : input.mode === 'create' ? 'Appointment saved.' : 'Appointment updated.',
      appointmentId: String(data.id), revision: Number(data.revision) };
  } catch {
    return { status: 'error' as const, message: 'The save could not be confirmed. Review the calendar before trying again.' };
  }
}
