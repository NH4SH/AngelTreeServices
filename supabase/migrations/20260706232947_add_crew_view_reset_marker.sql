-- Admin-triggered crew UI reset marker.
-- This stores only a timestamp. Crew pages use it to clear browser-side
-- display preferences and saved filters without touching jobs, time entries,
-- payroll records, photos, roles, or schedule events.

alter table public.profiles
  add column if not exists crew_view_reset_requested_at timestamptz;
