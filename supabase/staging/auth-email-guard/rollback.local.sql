-- LOCAL REHEARSAL ONLY. Disable the hook on the owned test Auth service first.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $context$
begin
  if current_database() !~ '^ats_auth_email_guard_[a-f0-9]{32}$'
    or current_user <> 'postgres'
    or (select rolsuper from pg_roles where rolname=current_user)
    or pg_has_role(current_user,'supabase_admin','MEMBER') then
    raise exception 'Use the dedicated local email-guard rehearsal database.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='ats_staging_auth')<>1
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ats_staging_auth')
    or not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='ats_staging_auth' and p.proname='reject_email' and p.pronargs=1
      and pg_get_userbyid(p.proowner)='postgres' and not p.prosecdef and md5(p.prosrc)='3217b69110500f25a29e85e4cb945b7f') then
    raise exception 'Guard contents changed; review before removing anything.';
  end if;
end $context$;
drop function ats_staging_auth.reject_email(jsonb);
drop schema ats_staging_auth restrict;
commit;
