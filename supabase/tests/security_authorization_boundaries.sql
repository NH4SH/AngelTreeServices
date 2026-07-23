begin;

select plan(21);

insert into public.roles (name) values
  ('owner'), ('admin'), ('payroll_admin'), ('estimator'), ('crew'), ('customer'), ('property_manager')
on conflict (name) do nothing;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'owner-security@example.test'),
  ('a1000000-0000-0000-0000-000000000002', 'admin-security@example.test'),
  ('a1000000-0000-0000-0000-000000000003', 'payroll-security@example.test'),
  ('a1000000-0000-0000-0000-000000000004', 'estimator-security@example.test'),
  ('a1000000-0000-0000-0000-000000000005', 'crew-security@example.test'),
  ('a1000000-0000-0000-0000-000000000006', 'target-security@example.test');

insert into public.profiles (id, email, full_name) select id, email, email from auth.users where email like '%-security@example.test'
on conflict (id) do update set email = excluded.email;

insert into public.user_roles (user_id, role_id)
select fixture.user_id, r.id
from (values
  ('a1000000-0000-0000-0000-000000000001'::uuid, 'owner'),
  ('a1000000-0000-0000-0000-000000000002'::uuid, 'admin'),
  ('a1000000-0000-0000-0000-000000000003'::uuid, 'payroll_admin'),
  ('a1000000-0000-0000-0000-000000000004'::uuid, 'estimator'),
  ('a1000000-0000-0000-0000-000000000005'::uuid, 'crew')
) as fixture(user_id, role_name)
join public.roles r on r.name = fixture.role_name;

set local role authenticated;
set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000004';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004"}', true);
select throws_ok(
  $$insert into public.user_roles(user_id, role_id) select 'a1000000-0000-0000-0000-000000000004', id from public.roles where name = 'owner'$$,
  '42501', 'permission denied for table user_roles', 'estimator cannot insert a role assignment directly'
);
select throws_ok($$update public.roles set description = 'changed' where name = 'owner'$$, '42501', 'permission denied for table roles', 'estimator cannot update canonical roles');
select throws_ok($$delete from public.user_roles where user_id = 'a1000000-0000-0000-0000-000000000005'$$, '42501', 'permission denied for table user_roles', 'estimator cannot delete assignments');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003"}', true);
select throws_ok($$update public.user_roles set role_id = role_id where user_id = 'a1000000-0000-0000-0000-000000000003'$$, '42501', 'permission denied for table user_roles', 'payroll cannot update role assignments');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000005';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000005"}', true);
select throws_ok($$delete from public.roles where name = 'admin'$$, '42501', 'permission denied for table roles', 'crew cannot delete roles');
select throws_ok($$select public.replace_platform_user_roles('a1000000-0000-0000-0000-000000000005', array['admin'], 'self promotion')$$, '42501', 'Users cannot change their own platform roles.', 'crew cannot promote itself through the RPC');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000002"}', true);
select throws_ok($$select public.replace_platform_user_roles('a1000000-0000-0000-0000-000000000006', array['owner'], 'invalid admin assignment')$$, '42501', 'Admins cannot assign or modify the owner role.', 'admin cannot assign owner');
select is(public.replace_platform_user_roles('a1000000-0000-0000-0000-000000000006', array['crew'], 'valid admin assignment'), array['crew']::text[], 'admin can assign a non-owner role');
select ok(exists(select 1 from public.role_assignment_events where target_user_id = 'a1000000-0000-0000-0000-000000000006'), 'role assignment has an audit event');
select throws_ok($$update public.role_assignment_events set reason = 'rewrite history'$$, '42501', 'permission denied for table role_assignment_events', 'role audit events cannot be changed by browser roles');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', true);
select is(public.replace_platform_user_roles('a1000000-0000-0000-0000-000000000006', array['admin'], 'owner assignment'), array['admin']::text[], 'owner can assign admin');
select throws_ok($$select public.replace_platform_user_roles('a1000000-0000-0000-0000-000000000001', array['admin'], 'remove final owner')$$, '42501', 'Users cannot change their own platform roles.', 'owners cannot modify their own role');

reset role;
insert into public.organizations (id, name, organization_type) values ('b1000000-0000-0000-0000-000000000001', 'Security Fixture LLC', 'commercial');
insert into public.service_locations (id, organization_id, street, city, state) values ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', '1 Security Way', 'Fredericksburg', 'VA');
insert into public.invoices (id, organization_id, service_location_id, status, total_cents, balance_due_cents) values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'sent', 10000, 10000);

set local role authenticated;
set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000004';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004"}', true);
select throws_ok($$insert into public.payments(invoice_id, organization_id, amount_cents, total_collected_cents, provider, status) values ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 100, 100, 'manual', 'succeeded')$$, '42501', 'permission denied for table payments', 'estimator cannot insert payments');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003"}', true);
select throws_ok($$update public.payments set status = 'cancelled'$$, '42501', 'permission denied for table payments', 'payroll cannot update payments');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000005';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000005"}', true);
select is((select count(*)::integer from public.payments), 0, 'crew cannot read payment rows');
select throws_ok($$delete from public.payments$$, '42501', 'permission denied for table payments', 'crew cannot delete payments');

set local "request.jwt.claim.sub" = 'a1000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001"}', true);
select lives_ok($$select public.record_manual_invoice_payment('b3000000-0000-0000-0000-000000000001', 4000, now(), 'check', 'security-test', null)$$, 'owner can record a manual payment');
select is((select balance_due_cents from public.invoices where id = 'b3000000-0000-0000-0000-000000000001'), 6000, 'manual payment updates invoice balance transactionally');
select is((select count(*)::integer from public.activity_log where subject_id = 'b3000000-0000-0000-0000-000000000001' and event_type = 'manual_payment_recorded'), 1, 'manual payment writes one audit event');
select lives_ok($$select public.cancel_manual_invoice_payment('b3000000-0000-0000-0000-000000000001', (select id from public.payments where invoice_id = 'b3000000-0000-0000-0000-000000000001'), 'fixture correction')$$, 'owner can correct a manual payment');
select is((select balance_due_cents from public.invoices where id = 'b3000000-0000-0000-0000-000000000001'), 10000, 'manual correction restores invoice balance once');

select * from finish();
rollback;
