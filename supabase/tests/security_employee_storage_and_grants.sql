begin;

select plan(14);

insert into public.roles (name) values
  ('owner'), ('admin'), ('payroll_admin'), ('estimator'), ('crew'), ('customer'), ('property_manager')
on conflict (name) do nothing;

select ok(exists(select 1 from storage.buckets where id = 'job-photos'), 'clean migrations create the job-photos bucket');
select is((select public from storage.buckets where id = 'job-photos'), false, 'job-photos is private');
select is((select file_size_limit from storage.buckets where id = 'job-photos'), 6291456::bigint, 'job-photos enforces the six MB limit');
select is((select allowed_mime_types from storage.buckets where id = 'job-photos'), array['image/jpeg','image/png','image/webp']::text[], 'job-photos has the intended MIME allowlist');

select ok(not exists(
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
), 'browser roles have no ownership-like table privileges');

select ok(not has_table_privilege('authenticated', 'public.roles', 'INSERT'), 'authenticated cannot insert canonical roles');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'UPDATE'), 'authenticated cannot update role assignments directly');
select ok(not has_table_privilege('authenticated', 'public.payments', 'DELETE'), 'authenticated cannot delete payments directly');

insert into auth.users (id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'owner-pii@example.test'),
  ('c1000000-0000-0000-0000-000000000002', 'estimator-pii@example.test'),
  ('c1000000-0000-0000-0000-000000000003', 'crew-pii@example.test');
insert into public.profiles (id, email) select id, email from auth.users where email like '%-pii@example.test'
on conflict (id) do nothing;
insert into public.user_roles(user_id, role_id)
select fixture.user_id, r.id from (values
  ('c1000000-0000-0000-0000-000000000001'::uuid, 'owner'),
  ('c1000000-0000-0000-0000-000000000002'::uuid, 'estimator'),
  ('c1000000-0000-0000-0000-000000000003'::uuid, 'crew')
) fixture(user_id, role_name) join public.roles r on r.name = fixture.role_name;
insert into public.employee_records (
  id, auth_user_id, legal_name, preferred_name, employment_status, is_active,
  home_address, contact_email, separation_reason
) values (
  'c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003',
  'Crew Person', 'Crew', 'active', true, 'PRIVATE HOME ADDRESS', 'private@example.test', 'PRIVATE HR REASON'
);
insert into public.employee_emergency_contacts (employee_id, full_name, phone, is_primary)
values ('c2000000-0000-0000-0000-000000000001', 'Emergency Person', '555-0100', true);

set local role authenticated;
set local "request.jwt.claim.sub" = 'c1000000-0000-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000002"}', true);
select is((select count(*)::integer from public.employee_records), 0, 'estimator cannot read full employee HR rows');
select ok(jsonb_array_length(public.get_employee_operational_directory()->'employees') = 1, 'estimator can read the operational directory');
select ok(not (public.get_employee_operational_directory()::text like '%PRIVATE HOME ADDRESS%'), 'operational directory excludes home address');
select ok(not (public.get_employee_operational_directory()::text like '%PRIVATE HR REASON%'), 'operational directory excludes separation reason');
select is((select count(*)::integer from public.employee_emergency_contacts), 0, 'estimator cannot read emergency contacts');

set local "request.jwt.claim.sub" = 'c1000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claims', '{"sub":"c1000000-0000-0000-0000-000000000003"}', true);
select is((select count(*)::integer from public.employee_records where auth_user_id = auth.uid()), 1, 'employee can read their own employee record');

select * from finish();
rollback;
