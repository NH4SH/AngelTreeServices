-- LOCAL REHEARSAL ONLY. Not a production migration or a hosted installer.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $context$
begin
  if current_database() !~ '^ats_auth_email_guard_[a-f0-9]{32}$'
    or current_user <> 'postgres'
    or (select rolsuper from pg_roles where rolname=current_user)
    or pg_has_role(current_user,'supabase_admin','MEMBER') then
    raise exception 'Use a new dedicated local email-guard rehearsal database with the normal migration owner.';
  end if;
end $context$;
-- A separate schema avoids widening access to existing private app helpers.
create schema ats_staging_auth authorization postgres;
revoke all on schema ats_staging_auth from public,anon,authenticated,service_role;
create function ats_staging_auth.reject_email(event jsonb) returns jsonb
language sql immutable security invoker set search_path='' as $guard$
  select pg_catalog.jsonb_build_object('error',pg_catalog.jsonb_build_object(
    'http_code',503,
    'message','Email delivery is disabled in staging. Use the local test environment for email testing.'
  ));
$guard$;
comment on function ats_staging_auth.reject_email(jsonb) is 'ATS staging no-send Auth hook v1. Does not inspect, log, persist or deliver its payload.';
revoke all on function ats_staging_auth.reject_email(jsonb) from public,anon,authenticated,service_role;
grant usage on schema ats_staging_auth to supabase_auth_admin;
grant execute on function ats_staging_auth.reject_email(jsonb) to supabase_auth_admin;
commit;
