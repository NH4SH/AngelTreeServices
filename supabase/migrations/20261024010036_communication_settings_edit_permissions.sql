begin;
-- Normalize this one table across broad local defaults and narrow staging grants.
-- Restore the existing owner/admin settings form without table-wide UPDATE,
-- INSERT, DELETE, identity/timestamp writes or a new privileged routine.
-- The existing admin and effective-access RLS policies remain authoritative.
revoke all on public.communication_settings from authenticated;
grant select on public.communication_settings to authenticated;
grant update (
  automated_sending_enabled, business_timezone, minimum_send_interval_hours,
  estimate_confirmation_enabled, estimate_reminder_enabled, estimate_reminder_hours_before,
  work_confirmation_enabled, work_reminder_enabled, work_reminder_hours_before,
  quote_follow_up_enabled, quote_first_follow_up_days, quote_second_follow_up_days,
  invoice_reminder_enabled, invoice_first_reminder_days, invoice_second_reminder_days,
  payment_confirmation_enabled, appointment_change_notices_enabled
) on public.communication_settings to authenticated;
notify pgrst, 'reload schema';
commit;
