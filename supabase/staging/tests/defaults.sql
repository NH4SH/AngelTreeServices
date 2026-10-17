-- Disposable database only. Every probe object is rolled back.
begin;
select plan(7);
create table public.ats_permission_probe(id bigserial primary key, value text);
alter table public.ats_permission_probe enable row level security;
create function public.ats_permission_probe_function() returns integer language sql as $$select 1$$;
select ok(not has_table_privilege('anon','public.ats_permission_probe','SELECT'), 'new migration-owner tables do not auto-grant anonymous reads');
select ok(not has_table_privilege('authenticated','public.ats_permission_probe','INSERT'), 'new tables require explicit authenticated grants');
select ok(not has_table_privilege('service_role','public.ats_permission_probe','SELECT'), 'new tables require explicit server-role grants too');
select ok(not has_sequence_privilege('anon','public.ats_permission_probe_id_seq','USAGE') and not has_sequence_privilege('authenticated','public.ats_permission_probe_id_seq','UPDATE'), 'new sequences do not auto-grant API access');
select is((select count(*)::integer from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a join pg_roles r on r.oid=a.grantee where p.oid='public.ats_permission_probe_function()'::regprocedure and r.rolname in ('anon','authenticated','service_role')), 0, 'new functions have no direct named API-role grant');
select ok(has_function_privilege('anon','public.ats_permission_probe_function()','EXECUTE'), 'schema-scoped REVOKE does not remove PostgreSQL global PUBLIC EXECUTE');
revoke all on function public.ats_permission_probe_function() from public;
select ok(not has_function_privilege('anon','public.ats_permission_probe_function()','EXECUTE') and not has_function_privilege('authenticated','public.ats_permission_probe_function()','EXECUTE'), 'explicit per-function PUBLIC revocation closes implicit execution');
select * from finish();
rollback;
