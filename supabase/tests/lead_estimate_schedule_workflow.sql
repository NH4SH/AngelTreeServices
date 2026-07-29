begin;

select plan(17);

insert into public.roles (name) values ('owner'), ('crew')
on conflict (name) do nothing;

insert into auth.users (id, email) values
  ('81000000-0000-0000-0000-000000000001', 'owner-lead-estimate@example.test'),
  ('81000000-0000-0000-0000-000000000002', 'crew-lead-estimate@example.test');

insert into public.profiles (id, email, full_name)
select id, email, email
from auth.users
where email like '%-lead-estimate@example.test'
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id)
select fixture.user_id, role.id
from (values
  ('81000000-0000-0000-0000-000000000001'::uuid, 'owner'),
  ('81000000-0000-0000-0000-000000000002'::uuid, 'crew')
) as fixture(user_id, role_name)
join public.roles as role on role.name = fixture.role_name;

insert into public.customers (
  id, display_name, primary_contact_name, customer_type, email, phone
) values (
  '82000000-0000-0000-0000-000000000001',
  'Original Lead Name',
  'Original Lead Name',
  'residential',
  'original@example.test',
  '540-555-0100'
);

insert into public.service_locations (
  id, customer_id, label, street, city, state, postal_code, access_notes, service_notes
) values (
  '83000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  'Primary service location',
  '1 Old Street',
  'Fredericksburg',
  'VA',
  '22401',
  'Old access note',
  'Old property note'
);

insert into public.jobs (
  id, customer_id, service_location_id, status, service_type, requested_scope,
  website_submission_id, source_detail, submitted_at
) values (
  '84000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'new_lead',
  'other',
  'Original scope',
  'website-estimate-fixture-1',
  'Public website request',
  '2026-07-28 12:00:00+00'
);

select has_column('public', 'schedule_events', 'lead_intake_job_id', 'schedule events preserve a stable website-lead association');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.schedule_lead_estimate(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid)'::regprocedure),
  'lead scheduling function is security invoker'
);
select ok(
  not has_function_privilege('anon', 'public.schedule_lead_estimate(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,uuid)', 'EXECUTE'),
  'anonymous callers cannot schedule lead estimates'
);

set local role authenticated;
set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$select public.schedule_lead_estimate(
    '84000000-0000-0000-0000-000000000001',
    'Corrected Lead Name', null, '540-555-0199', 'corrected@example.test',
    '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553',
    'Use side gate', 'Dog remains inside', 'trimming',
    'Trim oak over driveway', 'Customer reported hanging limb',
    'text', 'Tuesday afternoon', 'Estimate - driveway oak',
    'Meet customer by driveway', '2026-07-30 14:30:00+00', null,
    '81000000-0000-0000-0000-000000000001'
  )$$,
  'owner can schedule a complete website lead'
);
select is((select status from public.jobs where id = '84000000-0000-0000-0000-000000000001'), 'estimate_scheduled', 'successful scheduling advances the lead status');
select is((select display_name from public.customers where id = '82000000-0000-0000-0000-000000000001'), 'Corrected Lead Name', 'edited contact data updates the linked customer');
select is((select street from public.service_locations where id = '83000000-0000-0000-0000-000000000001'), '6917 Bloomsbury Ln', 'edited address updates the linked service location');
select is((select requested_scope from public.jobs where id = '84000000-0000-0000-0000-000000000001'), 'Trim oak over driveway', 'edited work details update the original lead');
select is((select count(*)::integer from public.schedule_events where lead_intake_job_id = '84000000-0000-0000-0000-000000000001'), 1, 'one estimate event is created');
select ok(exists(
  select 1
  from public.schedule_events
  where lead_intake_job_id = '84000000-0000-0000-0000-000000000001'
    and job_id = '84000000-0000-0000-0000-000000000001'
    and service_location_id = '83000000-0000-0000-0000-000000000001'
    and event_type = 'estimate'
), 'estimate remains linked to the lead job and property');
select is((select count(*)::integer from public.schedule_event_assignments where event_id = (
  select id from public.schedule_events where lead_intake_job_id = '84000000-0000-0000-0000-000000000001'
)), 1, 'selected estimator is assigned');

select lives_ok(
  $$select public.schedule_lead_estimate(
    '84000000-0000-0000-0000-000000000001',
    'Corrected Lead Name', null, '540-555-0199', 'corrected@example.test',
    '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553',
    'Use side gate', 'Dog remains inside', 'trimming',
    'Trim oak over driveway', 'Customer reported hanging limb',
    'text', 'Wednesday morning', 'Estimate - driveway oak',
    'Updated calendar note', '2026-07-31 13:00:00+00', null,
    '81000000-0000-0000-0000-000000000001'
  )$$,
  'retrying the same lead updates the existing estimate'
);
select is((select count(*)::integer from public.schedule_events where lead_intake_job_id = '84000000-0000-0000-0000-000000000001'), 1, 'a retry cannot create a duplicate appointment');
select is((select calendar_notes from public.schedule_events where lead_intake_job_id = '84000000-0000-0000-0000-000000000001'), 'Updated calendar note', 'retry preserves corrected schedule fields');

set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000002"}', true);
select throws_ok(
  $$select public.schedule_lead_estimate(
    '84000000-0000-0000-0000-000000000001',
    'Corrected Lead Name', null, '540-555-0199', null,
    '6917 Bloomsbury Ln', 'Spotsylvania', 'VA', '22553',
    null, null, 'trimming', 'Trim oak', null, 'phone', null,
    'Estimate', null, '2026-08-01 13:00:00+00', null, null
  )$$,
  '42501',
  'Only owners and admins can schedule lead estimates.',
  'crew cannot schedule or update another lead estimate'
);

set local "request.jwt.claim.sub" = '81000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001"}', true);
select lives_ok(
  $$insert into public.schedule_events (
    title, event_type, status, starts_at, ends_at, created_by_user_id
  ) values (
    'Manual estimate', 'estimate', 'scheduled',
    '2026-08-02 13:00:00+00', '2026-08-02 14:00:00+00',
    '81000000-0000-0000-0000-000000000001'
  )$$,
  'manual estimate scheduling remains available without a lead'
);
select is((select count(*)::integer from public.schedule_events where title = 'Manual estimate' and lead_intake_job_id is null), 1, 'manual events do not receive a false lead association');

select * from finish();
rollback;
