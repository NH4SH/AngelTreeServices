begin;

select plan(14);

insert into public.roles (name) values ('owner'), ('crew')
on conflict (name) do nothing;

insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'owner-health@example.test'),
  ('d1000000-0000-0000-0000-000000000002', 'crew-health@example.test');
insert into public.profiles (id, email) select id, email from auth.users where email like '%-health@example.test'
on conflict (id) do nothing;
insert into public.user_roles(user_id, role_id)
select fixture.user_id, roles.id
from (values
  ('d1000000-0000-0000-0000-000000000001'::uuid, 'owner'),
  ('d1000000-0000-0000-0000-000000000002'::uuid, 'crew')
) fixture(user_id, role_name)
join public.roles roles on roles.name = fixture.role_name;

insert into public.system_health_components (
  component_key, label, category, critical, status, checked_at, last_success_at
) values (
  'test_component', 'Test component', 'crm', true, 'operational', now(), now()
);
insert into public.system_health_checks (
  component_key, status, checked_at, latency_ms, check_source
) values
  ('test_component', 'operational', now() - interval '10 minutes', 20, 'scheduled'),
  ('test_component', 'outage', now() - interval '5 minutes', 30, 'scheduled');

select ok((select relrowsecurity from pg_class where oid = 'public.system_health_components'::regclass), 'component state has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.system_health_checks'::regclass), 'check history has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.system_health_incidents'::regclass), 'incident history has RLS enabled');
select ok(not has_table_privilege('anon', 'public.system_health_components', 'SELECT'), 'anonymous users cannot read health state');
select ok(not has_table_privilege('authenticated', 'public.system_health_components', 'INSERT'), 'authenticated users cannot manufacture component state');
select ok(not has_table_privilege('authenticated', 'public.system_health_checks', 'INSERT'), 'authenticated users cannot manufacture check history');
select ok(not has_table_privilege('authenticated', 'public.system_health_incidents', 'INSERT'), 'authenticated users cannot manufacture incidents');
select ok(not has_sequence_privilege('authenticated', 'public.system_health_checks_id_seq', 'USAGE'), 'authenticated users cannot consume health-check sequence values');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_system_health_uptime()'::regprocedure), 'uptime function is security invoker');

set local role authenticated;
set local "request.jwt.claim.sub" = 'd1000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000002"}', true);
select is((select count(*)::integer from public.system_health_components), 0, 'crew cannot read component state');
select is((select count(*)::integer from public.system_health_checks), 0, 'crew cannot read check history');
select is((select count(*)::integer from public.get_system_health_uptime()), 0, 'crew cannot use the uptime function to bypass RLS');

set local "request.jwt.claim.sub" = 'd1000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-0000-0000-000000000001"}', true);
select is((select count(*)::integer from public.system_health_components), 1, 'owner can read component state');
select is((select uptime_24h from public.get_system_health_uptime() where component_key = 'test_component'), 50.00::numeric, 'owner sees uptime calculated from current check history');

select * from finish();
rollback;
