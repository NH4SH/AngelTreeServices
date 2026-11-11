CREATE ROLE supabase_admin SUPERUSER LOGIN;

create role postgres superuser nologin;
create role ats_firewood_request login noinherit;
create role ats_firewood_worker login noinherit;
create role ats_firewood_health login noinherit;
create role qa_api login noinherit;
create role qa_other login noinherit;
grant ats_firewood_request to qa_other;
create schema hosting_guard;
revoke all on schema hosting_guard from public;
create table hosting_guard.state(
 singleton boolean primary key default true check(singleton),
 local_node text not null default 'ats-home-primary',
 epoch bigint not null default 0 check(epoch>=0),holder text,
 database_started_at timestamptz,issued_at timestamptz,expires_at timestamptz,
 capture_started_at timestamptz,topology_verified boolean not null default false,
 topology_fingerprint text,capture_in_progress boolean not null default true);
alter table hosting_guard.state enable row level security;
revoke all on hosting_guard.state from public;
insert into hosting_guard.state(singleton) values(true);
create schema app_private;
revoke all on schema app_private from public;
create function app_private.fwofficev2_native_context() returns jsonb
language plpgsql security definer set search_path='' as $$begin
 raise exception 'Baseline is held.' using errcode='PT503'; end $$;
revoke all on function app_private.fwofficev2_native_context() from public;
grant usage on schema app_private to ats_firewood_request,ats_firewood_worker,ats_firewood_health;
grant execute on function app_private.fwofficev2_native_context()
 to ats_firewood_request,ats_firewood_worker,ats_firewood_health;
create function hosting_guard.enforce_write() returns trigger
language plpgsql security definer set search_path='' as $$begin
 raise exception 'Baseline is held.' using errcode='PT503'; end $$;
revoke all on function hosting_guard.enforce_write() from public;
create table public.qa_records(id integer primary key,owner_role text not null,value text not null);
alter table public.qa_records enable row level security;
grant select,insert,update,delete on public.qa_records to qa_api;
create policy qa_owner on public.qa_records for all to qa_api
 using(owner_role=session_user) with check(owner_role=session_user);
create trigger qa_admission before insert or update or delete on public.qa_records
 for each row execute function hosting_guard.enforce_write();
create constraint trigger qa_commit after insert or update or delete on public.qa_records
 deferrable initially deferred for each row execute function hosting_guard.enforce_write();

create function hosting_guard.require_operator() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if session_user not in ('postgres','supabase_admin') then
    raise exception 'Operator required.' using errcode='42501';
  end if;
end $$;
create function hosting_guard.operator_truncate_only() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- TRUNCATE has no row events, so it cannot use the deferred row check.
  -- It is a maintenance operation, never an application/API write path.
  perform hosting_guard.require_operator();
  return null;
end $$;
create function hosting_guard.catalog_fingerprint() returns text
language sql stable security invoker set search_path='' as $$
  select md5(coalesce(string_agg(
    n.nspname||'.'||c.relname||':'||c.relkind::text||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text||':'||pg_get_userbyid(c.relowner)
    ||':'||coalesce((select string_agg(a.attname||':'||a.atttypid::text||':'||a.attnotnull::text,',' order by a.attnum) from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'')
    ||':'||coalesce((select string_agg(t.tgname||':'||t.tgenabled::text,',' order by t.tgname) from pg_catalog.pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),''),
    '|' order by n.nspname,c.relname),''))
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','app_private','auth','storage') and c.relkind in ('r','p');
$$;
revoke all on function hosting_guard.require_operator() from public;
revoke all on function hosting_guard.operator_truncate_only() from public;
revoke all on function hosting_guard.catalog_fingerprint() from public;
create trigger qa_truncate before truncate on public.qa_records for each statement execute function hosting_guard.operator_truncate_only();
grant usage on schema hosting_guard to supabase_admin;
