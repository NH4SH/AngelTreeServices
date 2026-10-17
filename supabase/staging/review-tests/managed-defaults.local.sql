-- LOCAL DISPOSABLE FIXTURE ONLY. Run using the already-existing local admin
-- connection, never a hosted account. This does not grant or change any role.
-- All fixture objects, grants, data and default-ACL probes roll back together.
begin;
do $$begin
 if current_database() not like 'ats_defaults_review_%' or session_user<>'supabase_admin'
 then raise exception 'Requires a new named local defaults-review database and existing local fixture connection'; end if;
end$$;
set local search_path=public,extensions;
set local role postgres;
select plan(25);
select ok(current_user='postgres' and not (select rolsuper from pg_roles where rolname=current_user)
 and not pg_has_role(current_user,'supabase_admin','MEMBER'), 'migration probes use the normal non-superuser migration role');
select is((select count(*)::integer from pg_default_acl where defaclrole='supabase_admin'::regrole and defaclnamespace='public'::regnamespace),3,'fixture reproduces all three protected public defaults');
select throws_ok($$alter default privileges for role supabase_admin in schema public revoke all on tables from anon$$,
 '42501','permission denied to change default privileges','normal migration role cannot alter the protected defaults');
create table public.ats_defaults_owner_probe(id bigserial primary key, value text);
alter table public.ats_defaults_owner_probe enable row level security;
create function public.ats_defaults_owner_fn() returns integer language sql as $$select 1$$;
select is((select pg_get_userbyid(relowner) from pg_class where oid='public.ats_defaults_owner_probe'::regclass),'postgres','current creator owns the new migration table');
select is((select count(*)::integer from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 where c.oid='public.ats_defaults_owner_probe'::regclass and a.grantee in ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),0,'managed table defaults do not flow to postgres-created tables');
select is((select count(*)::integer from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('s',c.relowner))) a
 where c.oid='public.ats_defaults_owner_probe_id_seq'::regclass and a.grantee in ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),0,'managed sequence defaults do not flow to postgres-created sequences');
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.oid='public.ats_defaults_owner_fn()'::regprocedure and a.grantee in ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole)),0,'managed function defaults do not flow to postgres-created functions');
select ok(has_function_privilege('anon','public.ats_defaults_owner_fn()','EXECUTE'),'implicit global PUBLIC EXECUTE still applies');
alter default privileges for role postgres in schema public revoke execute on functions from public;
create function public.ats_defaults_scope_fn() returns integer language sql as $$select 1$$;
select ok(has_function_privilege('anon','public.ats_defaults_scope_fn()','EXECUTE'),'schema-scoped PUBLIC revocation cannot subtract global defaults');
revoke all on function public.ats_defaults_owner_fn() from public;
select ok(not has_function_privilege('anon','public.ats_defaults_owner_fn()','EXECUTE')
 and not has_function_privilege('authenticated','public.ats_defaults_owner_fn()','EXECUTE')
 and not has_function_privilege('service_role','public.ats_defaults_owner_fn()','EXECUTE'),'explicit per-function PUBLIC revocation closes implicit execution');
grant execute on function public.ats_defaults_owner_fn() to authenticated;
select ok(has_function_privilege('authenticated','public.ats_defaults_owner_fn()','EXECUTE')
 and not has_function_privilege('anon','public.ats_defaults_owner_fn()','EXECUTE'),'explicit reviewed function grants preserve intended callers');

-- RESET returns to the existing local fixture connection; no SET ROLE privilege
-- is granted to postgres. These objects simulate future provider-created objects.
reset role;
create table public.ats_defaults_managed_probe(id bigserial primary key, value text);
alter table public.ats_defaults_managed_probe enable row level security;
insert into public.ats_defaults_managed_probe(value) values ('synthetic local fixture');
create function public.ats_defaults_managed_fn() returns integer language sql as $$select 1$$;
select is((select pg_get_userbyid(relowner) from pg_class where oid='public.ats_defaults_managed_probe'::regclass),'supabase_admin','provider fixture is actually created by the protected role');
select ok(has_table_privilege('anon','public.ats_defaults_managed_probe','SELECT'),'provider-created tables inherit anonymous SELECT');
select ok(has_table_privilege('anon','public.ats_defaults_managed_probe','TRUNCATE'),'provider defaults include non-DML rights despite RLS');
set local role anon;
select is((select count(*)::integer from public.ats_defaults_managed_probe),0,'deny-by-default RLS blocks anonymous row reads');
select lives_ok($$truncate public.ats_defaults_managed_probe$$,'TRUNCATE ignores RLS when the role has that privilege');
reset role;
select is((select count(*)::integer from public.ats_defaults_managed_probe),0,'actual local TRUNCATE removed the synthetic row');
select ok(has_sequence_privilege('anon','public.ats_defaults_managed_probe_id_seq','USAGE')
 and has_sequence_privilege('authenticated','public.ats_defaults_managed_probe_id_seq','UPDATE'),'provider-created sequences inherit named API grants');
select ok(exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a
 where p.oid='public.ats_defaults_managed_fn()'::regprocedure and a.grantee='anon'::regrole),'provider-created functions inherit direct anonymous execution');
revoke all on function public.ats_defaults_managed_fn() from public;
select ok(has_function_privilege('anon','public.ats_defaults_managed_fn()','EXECUTE'),'PUBLIC-only revocation does not remove a direct named-role grant');
revoke all on function public.ats_defaults_managed_fn() from anon,authenticated,service_role;
select ok(not has_function_privilege('anon','public.ats_defaults_managed_fn()','EXECUTE')
 and not has_function_privilege('authenticated','public.ats_defaults_managed_fn()','EXECUTE'),'all unintended grant sources must be revoked');
revoke all on table public.ats_defaults_managed_probe from public,anon,authenticated,service_role;
select ok(not has_table_privilege('anon','public.ats_defaults_managed_probe','SELECT')
 and not has_table_privilege('anon','public.ats_defaults_managed_probe','TRUNCATE')
 and not has_table_privilege('authenticated','public.ats_defaults_managed_probe','TRIGGER'),'object-specific owner cleanup removes extra DML and non-DML rights');
select ok(has_function_privilege('authenticated','public.ats_defaults_owner_fn()','EXECUTE')
 and not has_table_privilege('anon','public.ats_defaults_owner_probe','SELECT'),'provider fixture cleanup does not change migration-owned grants');
set local role postgres;
select ok(not has_schema_privilege('anon','public','CREATE') and not has_schema_privilege('authenticated','public','CREATE'),'browser roles cannot create public application objects');
select is((select count(*)::integer from supabase_migrations.schema_migrations),92,'the original migration ledger is preserved');
select * from finish();
rollback;
