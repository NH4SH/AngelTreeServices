-- Isolated SELF-HOSTED candidate prototype only. This is not a production
-- migration, external lease authority, or authorization to promote a standby.
-- Install as the local operator after all Auth/Storage/business migrations.
begin;
create schema hosting_guard;
revoke all on schema hosting_guard from public;
create table hosting_guard.state (
  singleton boolean primary key default true check(singleton),
  local_node text not null default 'synthetic-home',
  epoch bigint not null default 0 check(epoch>=0),
  holder text,
  database_started_at timestamptz,
  issued_at timestamptz,
  expires_at timestamptz,
  capture_started_at timestamptz,
  topology_verified boolean not null default false,
  topology_fingerprint text
);
alter table hosting_guard.state enable row level security;
revoke all on hosting_guard.state from public;
insert into hosting_guard.state(singleton) values(true);

create function hosting_guard.require_operator() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if session_user not in ('postgres','supabase_admin') then
    raise exception 'Operator required.' using errcode='42501';
  end if;
end $$;
revoke all on function hosting_guard.require_operator() from public;

create function hosting_guard.enforce_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare s hosting_guard.state%rowtype;
begin
  -- SESSION_USER stays the API/GoTrue/Storage login even inside a business
  -- SECURITY DEFINER command. CURRENT_USER would incorrectly bypass this fence.
  if session_user not in ('postgres','supabase_admin') then
    select * into s from hosting_guard.state where singleton;
    if not found or not s.topology_verified or s.holder is distinct from s.local_node
      or s.database_started_at is distinct from pg_catalog.pg_postmaster_start_time()
      or s.issued_at is null or s.issued_at>pg_catalog.clock_timestamp()
      or s.expires_at is null or s.expires_at<=pg_catalog.clock_timestamp()
      or s.capture_started_at is null
      or s.capture_started_at>pg_catalog.clock_timestamp()
      or s.capture_started_at+interval '5 minutes'<=pg_catalog.clock_timestamp() then
      raise exception 'CRM writes are temporarily unavailable.' using errcode='PT503';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function hosting_guard.enforce_write() from public;

create function hosting_guard.operator_truncate_only() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- TRUNCATE has no row events, so it cannot use the deferred row check.
  -- It is a maintenance operation, never an application/API write path.
  perform hosting_guard.require_operator();
  return null;
end $$;
revoke all on function hosting_guard.operator_truncate_only() from public;

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
revoke all on function hosting_guard.catalog_fingerprint() from public;

create function hosting_guard.enroll_tables() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; n integer:=0;
begin
  perform hosting_guard.require_operator();
  for r in select n.nspname,c.relname,c.oid from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','app_private','auth','storage') and c.relkind='r'
    order by n.nspname,c.relname loop
    if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=r.oid and t.tgname='ats_hosting_admission') then
      execute format('create trigger ats_hosting_admission before insert or update or delete on %I.%I for each row execute function hosting_guard.enforce_write()',r.nspname,r.relname);
    end if;
    if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=r.oid and t.tgname='ats_hosting_commit') then
      execute format('create constraint trigger ats_hosting_commit after insert or update or delete on %I.%I deferrable initially deferred for each row execute function hosting_guard.enforce_write()',r.nspname,r.relname);
    end if;
    if not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=r.oid and t.tgname='ats_hosting_truncate') then
      execute format('create trigger ats_hosting_truncate before truncate on %I.%I for each statement execute function hosting_guard.operator_truncate_only()',r.nspname,r.relname);
    end if;
    n:=n+1;
  end loop;
  update hosting_guard.state set topology_verified=true,topology_fingerprint=hosting_guard.catalog_fingerprint() where singleton;
  return n;
end $$;
revoke all on function hosting_guard.enroll_tables() from public;

create function hosting_guard.accept_rehearsal_lease(p_epoch bigint,p_holder text,p_issued_at timestamptz,p_expires_at timestamptz,p_capture_started_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare s hosting_guard.state%rowtype;
begin
  perform hosting_guard.require_operator();
  select * into strict s from hosting_guard.state where singleton for update;
  if p_epoch is null or p_epoch<s.epoch or (p_epoch=s.epoch and s.holder is not null and p_holder is distinct from s.holder)
    or p_holder is null or p_holder !~ '^[a-z][a-z0-9-]{0,63}$'
    or p_issued_at is null or p_issued_at>clock_timestamp() or p_issued_at<clock_timestamp()-interval '5 seconds'
    or p_expires_at is null or p_expires_at<=clock_timestamp() or p_expires_at>p_issued_at+interval '30 seconds'
    or p_capture_started_at is null or p_capture_started_at>p_issued_at
    or p_capture_started_at+interval '5 minutes'<=clock_timestamp()
    or not s.topology_verified then
    raise exception 'Invalid or stale rehearsal lease.' using errcode='22023';
  end if;
  update hosting_guard.state set epoch=p_epoch,holder=p_holder,issued_at=p_issued_at,
    expires_at=least(p_expires_at,p_capture_started_at+interval '5 minutes'),
    capture_started_at=p_capture_started_at,database_started_at=pg_postmaster_start_time()
  where singleton;
end $$;
revoke all on function hosting_guard.accept_rehearsal_lease(bigint,text,timestamptz,timestamptz,timestamptz) from public;

create function hosting_guard.invalidate_topology() returns event_trigger
language plpgsql security definer set search_path='' as $$
begin
  if hosting_guard.catalog_fingerprint() is distinct from (select topology_fingerprint from hosting_guard.state where singleton) then
    -- Otherwise a service with schema CREATE could commit to an unenrolled new
    -- table in the same DDL transaction. Upgrades require operator maintenance.
    perform hosting_guard.require_operator();
    update hosting_guard.state set topology_verified=false where singleton;
  end if;
end $$;
revoke all on function hosting_guard.invalidate_topology() from public;
select hosting_guard.enroll_tables();
create event trigger ats_hosting_topology_changed on ddl_command_end
  when tag in ('CREATE TABLE','CREATE TABLE AS','ALTER TABLE','DROP TABLE','CREATE TRIGGER','ALTER TRIGGER','DROP TRIGGER')
  execute function hosting_guard.invalidate_topology();
commit;
