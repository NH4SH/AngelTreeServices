-- Adds explicit job priority support for the first admin jobs form.
-- Apply after 0001_initial_platform_schema.sql.

alter table public.jobs
  add column if not exists priority text not null default 'normal'
  check (priority in ('normal', 'urgent', 'emergency'));
