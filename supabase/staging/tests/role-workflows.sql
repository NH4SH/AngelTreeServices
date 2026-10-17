-- Disposable database only; synthetic identities/data and audit rows roll back.
begin;
select plan(29);
select ok(not has_table_privilege('anon','public.customers','SELECT'), 'anonymous customer reads are not granted');
select ok(not has_function_privilege('anon','public.attach_approved_change_orders_to_invoice(uuid)','EXECUTE'), 'anonymous invoice helper execution is removed');
select ok(not has_table_privilege('authenticated','public.invoice_checkout_sessions','SELECT'), 'browser roles cannot inspect provider checkout records directly');
select ok(has_table_privilege('service_role','public.customers','INSERT'), 'server-side customer operations retain their explicit grant');
select ok(not has_function_privilege('service_role','public.set_employee_access_status(uuid,text,text)','EXECUTE'), 'server credentials cannot bypass the employee actor command');
select ok(has_table_privilege('service_role','public.employee_access_requests','INSERT') and not has_table_privilege('anon','public.employee_access_requests','INSERT') and not has_table_privilege('authenticated','public.employee_access_requests','INSERT'), 'validated server-side access requests remain available without direct browser insertion');
insert into public.roles(name) values ('owner'),('admin'),('estimator'),('payroll_admin'),('crew'),('customer') on conflict(name) do nothing;
insert into auth.users(id,email) values
 ('f0100000-0000-0000-0000-000000000001','permission-owner@example.invalid'),
 ('f0100000-0000-0000-0000-000000000002','permission-admin@example.invalid'),
 ('f0100000-0000-0000-0000-000000000003','permission-estimator@example.invalid'),
 ('f0100000-0000-0000-0000-000000000004','permission-payroll@example.invalid'),
 ('f0100000-0000-0000-0000-000000000005','permission-crew@example.invalid'),
 ('f0100000-0000-0000-0000-000000000006','permission-customer@example.invalid');
insert into public.user_roles(user_id,role_id) select v.id,r.id from (values
 ('f0100000-0000-0000-0000-000000000001'::uuid,'owner'),
 ('f0100000-0000-0000-0000-000000000002'::uuid,'admin'),
 ('f0100000-0000-0000-0000-000000000003'::uuid,'estimator'),
 ('f0100000-0000-0000-0000-000000000004'::uuid,'payroll_admin'),
 ('f0100000-0000-0000-0000-000000000005'::uuid,'crew'),
 ('f0100000-0000-0000-0000-000000000006'::uuid,'customer')) v(id,role_name) join public.roles r on r.name=v.role_name;
insert into public.employee_records(id,auth_user_id,legal_name,employment_status,is_active) values
 ('f0200000-0000-0000-0000-000000000005','f0100000-0000-0000-0000-000000000005','Synthetic Crew','active',true);
insert into public.time_clock_permissions(user_id,is_enabled) values ('f0100000-0000-0000-0000-000000000005',true);
insert into public.customers(id,display_name) values ('f0300000-0000-0000-0000-000000000001','Synthetic permission customer');
insert into public.service_locations(id,customer_id,street,city,state) values ('f0400000-0000-0000-0000-000000000001','f0300000-0000-0000-0000-000000000001','1 Synthetic Street','Fredericksburg','VA');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.create_quote_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001","service_location_id":"f0400000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'owner can create a quote');
select lives_ok($$select public.create_invoice_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'owner can create an invoice');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.create_quote_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001","service_location_id":"f0400000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'admin can create a quote');
select lives_ok($$select public.create_invoice_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'admin can create an invoice');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.create_quote_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001","service_location_id":"f0400000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'estimator can create a quote');
select lives_ok($$select public.create_invoice_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'estimator can create an invoice');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000004","role":"authenticated"}',true);
select lives_ok($$select public.create_quote_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001","service_location_id":"f0400000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'payroll administrator can create a quote');
select lives_ok($$select public.create_invoice_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001"}', '[{"name":"Synthetic work","quantity":1,"unit_price_cents":1000,"total_cents":1000}]')$$, 'payroll administrator can create an invoice');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.create_quote_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001","service_location_id":"f0400000-0000-0000-0000-000000000001"}', '[]')$$,'42501',null,'crew cannot create a quote');
select throws_ok($$select public.begin_invoice_void('00000000-0000-0000-0000-000000000000')$$,'42501',null,'crew cannot use financial administration');
select is((select count(*)::integer from public.employee_records),1,'crew can read their own employee record');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000006","role":"authenticated"}',true);
select throws_ok($$select public.create_invoice_draft('{"customer_id":"f0300000-0000-0000-0000-000000000001"}', '[]')$$,'42501',null,'customer cannot create an invoice');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_employee_access_status('f0200000-0000-0000-0000-000000000005','inactive','Synthetic permission offboarding')$$,'owner can deactivate an employee');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select is(public.has_effective_platform_access(),false,'the same stale identity loses effective access');
select is((select count(*)::integer from public.employee_records),0,'deactivated employee cannot read HR data');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.set_employee_access_status('f0200000-0000-0000-0000-000000000005','active','Synthetic permission reactivation')$$,'owner can reactivate an employee');
select set_config('request.jwt.claims','{"sub":"f0100000-0000-0000-0000-000000000005","role":"authenticated"}',true);
select is(public.has_effective_platform_access(),true,'reactivation restores effective access for the same identity');
select is((select count(*)::integer from public.employee_records),1,'reactivated employee can read their own record');
reset role;
select is((select is_enabled from public.time_clock_permissions where user_id='f0100000-0000-0000-0000-000000000005'),false,'reactivation requires a separate clock-access review');
select ok(exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id='f0100000-0000-0000-0000-000000000005' and r.name='crew'),'offboarding/reactivation retains previous role assignments');
select is((select count(*)::integer from public.activity_log where subject_id='f0200000-0000-0000-0000-000000000005' and event_type in ('employee_marked_inactive','employee_access_reactivated')),2,'both access transitions retain their audit events');
select is((select count(*)::integer from public.quotes),4,'all four allowed staff roles kept quote creation');
select is((select count(*)::integer from public.invoices),4,'all four allowed staff roles kept invoice creation');
select * from finish();
rollback;
