-- Restore fidelity for actual managed catalog, read-only reviewed 2026-10-29.
-- This is an initial private-host adapter, not an application migration.
begin;
do $guard$ begin
 if current_setting('ats.hosting.primary_initial_install',true) is distinct from 'ats_crm_primary_20261029'
 or exists(select 1 from pg_namespace where nspname='hosting_guard')
 or (select md5(string_agg(version,',' order by version)) from supabase_migrations.schema_migrations) is distinct from '46394436fcbf2f2d7d516b69c84a45af'
 then raise exception 'Fresh private primary at published baseline required';end if;
end $guard$;
alter table public.profiles add column if not exists crew_view_reset_requested_at timestamptz;
alter table supabase_migrations.schema_migrations add column if not exists created_by text;
alter table supabase_migrations.schema_migrations add column if not exists idempotency_key text;
alter table supabase_migrations.schema_migrations add column if not exists rollback text[];
do $constraint$ begin if not exists(select 1 from pg_constraint where conrelid='supabase_migrations.schema_migrations'::regclass and conname='schema_migrations_idempotency_key_key') then alter table supabase_migrations.schema_migrations add constraint schema_migrations_idempotency_key_key unique(idempotency_key);end if;end $constraint$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS E'\r\nbegin\r\n  new.updated_at = now();\r\n  return new;\r\nend;\r\n'
;
commit;
