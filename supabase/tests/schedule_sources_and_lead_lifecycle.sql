begin;

select plan(15);

select has_column('public', 'schedule_events', 'source_request_key', 'estimate events have a retry-safe request key');
select has_column('public', 'schedule_events', 'source_customer_id', 'estimate events preserve their customer source');
select has_column('public', 'schedule_events', 'source_organization_id', 'estimate events preserve their organization source');
select has_column('public', 'jobs', 'lead_disposition', 'website leads have a reversible office disposition');

insert into public.roles(name) values ('owner'), ('crew') on conflict (name) do nothing;
insert into auth.users(id, email) values
  ('91000000-0000-0000-0000-000000000001', 'source-owner@example.test'),
  ('91000000-0000-0000-0000-000000000002', 'source-crew@example.test');
insert into public.profiles(id, email, full_name)
select id, email, email from auth.users where email like 'source-%@example.test'
on conflict (id) do update set full_name = excluded.full_name;
insert into public.user_roles(user_id, role_id)
select fixture.user_id, role.id
from (values
  ('91000000-0000-0000-0000-000000000001'::uuid, 'owner'),
  ('91000000-0000-0000-0000-000000000002'::uuid, 'crew')
) fixture(user_id, role_name)
join public.roles role on role.name = fixture.role_name;

insert into public.customers(id, display_name, primary_contact_name, customer_type, email, phone)
values ('92000000-0000-0000-0000-000000000001', 'Schedule Source Customer', 'Original Contact', 'residential', 'original@example.test', '540-555-0100');
insert into public.service_locations(id, customer_id, label, street, city, state, postal_code)
values ('93000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Home', '1 Old St', 'Fredericksburg', 'VA', '22401');

set local role authenticated;
set local "request.jwt.claim.sub" = '91000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$select public.schedule_party_estimate(
    '94000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001', null, null,
    '93000000-0000-0000-0000-000000000001',
    'Corrected Contact', '540-555-0199', 'corrected@example.test',
    '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553',
    'Use side gate', 'Dog inside', 'trimming', 'Trim oak over driveway',
    'Estimate - oak', 'Customer prefers afternoon',
    '2026-08-03 14:00:00+00', null, null
  )$$,
  'owner can schedule from an existing customer'
);
select is((select count(*)::integer from public.schedule_events where source_request_key = '94000000-0000-0000-0000-000000000001'), 1, 'one event is created');
select is((select primary_contact_name from public.customers where id = '92000000-0000-0000-0000-000000000001'), 'Corrected Contact', 'editable customer contact fields are saved');
select is((select street from public.service_locations where id = '93000000-0000-0000-0000-000000000001'), '6917 Bloomsbury Ln', 'editable property fields are saved');

select lives_ok(
  $$select public.schedule_party_estimate(
    '94000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001', null, null,
    '93000000-0000-0000-0000-000000000001',
    'Corrected Contact', '540-555-0199', 'corrected@example.test',
    '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553',
    'Use side gate', 'Dog inside', 'trimming', 'Trim oak and maple',
    'Estimate - two trees', 'Updated',
    '2026-08-04 14:00:00+00', null, null
  )$$,
  'retry updates the same customer estimate'
);
select is((select count(*)::integer from public.schedule_events where source_request_key = '94000000-0000-0000-0000-000000000001'), 1, 'retry cannot create a duplicate event');
select is((select description from public.schedule_events where source_request_key = '94000000-0000-0000-0000-000000000001'), 'Trim oak and maple', 'retry keeps the latest saved fields');

set local "request.jwt.claim.sub" = '91000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000002"}', true);
select throws_ok(
  $$select public.schedule_party_estimate(
    gen_random_uuid(), '92000000-0000-0000-0000-000000000001', null, null,
    '93000000-0000-0000-0000-000000000001', 'Contact', '540-555-0199', null,
    '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553', null, null,
    'other', 'Scope', 'Estimate', null, '2026-08-05 14:00:00+00', null, null
  )$$,
  '42501',
  'Only owners and admins can schedule estimates from customer records.',
  'crew cannot schedule from customer records'
);

reset role;
insert into public.jobs(
  id, customer_id, service_location_id, status, website_submission_id, requested_scope
) values (
  '95000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000001',
  'new_lead', 'spam-fixture', 'Suspicious request'
);
select is((select lead_disposition from public.jobs where id = '95000000-0000-0000-0000-000000000001'), 'active', 'new leads safely backfill and default active');
update public.jobs set lead_disposition = 'spam' where id = '95000000-0000-0000-0000-000000000001';
select throws_ok(
  $$update public.jobs set status = 'estimate_scheduled' where id = '95000000-0000-0000-0000-000000000001'$$,
  '22023',
  'Restore this lead before converting or scheduling it.',
  'spam leads cannot be converted accidentally'
);
update public.jobs set lead_disposition = 'active' where id = '95000000-0000-0000-0000-000000000001';
select lives_ok(
  $$update public.jobs set status = 'estimate_scheduled' where id = '95000000-0000-0000-0000-000000000001'$$,
  'restored leads can resume normal workflow'
);

select * from finish();
rollback;
