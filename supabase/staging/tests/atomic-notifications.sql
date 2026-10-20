-- NEW EMPTY LOCAL REHEARSAL DATABASE ONLY. Every fixture and probe rolls back.
begin;
select plan(35);
select ok((select relrowsecurity from pg_class where oid='app_private.customer_activity_preparations'::regclass),'preparation receipts have RLS');
select ok((select relrowsecurity from pg_class where oid='app_private.customer_activity_deliveries'::regclass),'delivery links have RLS');
select ok(has_function_privilege('service_role','public.prepare_customer_activity(jsonb,jsonb,text)','execute'),'trusted service can prepare notifications');
select ok(not has_function_privilege('anon','public.prepare_customer_activity(jsonb,jsonb,text)','execute'),'anonymous cannot prepare notifications');
select ok(not has_function_privilege('authenticated','public.prepare_customer_activity(jsonb,jsonb,text)','execute'),'browser roles cannot prepare notifications');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['app_private.admin_activity_email_enabled(uuid,text)','app_private.admin_activity_email_eligible(jsonb,jsonb)','app_private.sync_admin_activity_delivery()']) f where has_function_privilege(r,f,'execute')),'private helpers have no API execution grants');
select ok(not exists(select 1 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['app_private.customer_activity_preparations','app_private.customer_activity_deliveries']) t cross join unnest(array['select','insert','update','delete','truncate','references','trigger']) p where has_table_privilege(r,t,p)),'private receipt/link tables have no direct API privileges');
select ok((select 'search_path=""'=any(proconfig) from pg_proc where oid='public.prepare_customer_activity(jsonb,jsonb,text)'::regprocedure),'public command pins empty search path');
insert into public.roles(name) values('owner'),('admin'),('crew') on conflict(name) do nothing;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f9500000-0000-0000-0000-000000000001','staging95-owner@example.invalid','{}'),
 ('f9500000-0000-0000-0000-000000000002','staging95-optout@example.invalid','{}'),
 ('f9500000-0000-0000-0000-000000000003','staging95-crew@example.invalid','{}'),
 ('f9500000-0000-0000-0000-000000000004','staging95-disabled@example.invalid','{}');
update profiles set status=case when id='f9500000-0000-0000-0000-000000000004' then 'disabled' else 'active' end,full_name='Synthetic <office>' where id::text like 'f9500000-%';
insert into user_roles(user_id,role_id) select 'f9500000-0000-0000-0000-000000000001',id from roles where name in ('owner','admin');
insert into user_roles(user_id,role_id) select 'f9500000-0000-0000-0000-000000000002',id from roles where name='admin';
insert into user_roles(user_id,role_id) select 'f9500000-0000-0000-0000-000000000003',id from roles where name='crew';
insert into user_roles(user_id,role_id) select 'f9500000-0000-0000-0000-000000000004',id from roles where name='admin';
insert into admin_notification_preferences(user_id,quote_email_enabled) values('f9500000-0000-0000-0000-000000000002',false);
create temporary table notification_probe(event jsonb,envelope jsonb);
insert into notification_probe values('{"category":"quotes","changes":{},"metadata":{},"destination_path":"/admin","event_type":"staging95_local_probe","idempotency_key":"staging95-local-atomic","summary":"Synthetic local only","title":"Synthetic notice","subject_id":"f9510000-0000-0000-0000-000000000001","subject_type":"quote"}', '{"from":"office@example.invalid","reply_to":"office@example.invalid"}');
grant select on notification_probe to service_role,anon,authenticated;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.prepare_customer_activity(event,envelope,null) from notification_probe$$,'real service command prepares complete audience and saved requests');
select lives_ok($$select public.prepare_customer_activity(event,envelope,null) from notification_probe$$,'identical retry reuses original preparation');
reset role;
select is((select count(*)::integer from activity_log where idempotency_key='staging95-local-atomic'),1,'one activity after replay');
select is((select count(*)::integer from app_private.customer_activity_preparations where request_key='staging95-local-atomic'),1,'one private preparation receipt');
select is((select count(*)::integer from admin_notifications n join activity_log a on a.id=n.activity_id where a.idempotency_key='staging95-local-atomic'),2,'full eligible audience has no role duplicates or disabled/crew recipients');
select is((select email_status from admin_notifications where recipient_user_id='f9500000-0000-0000-0000-000000000002'),'skipped','opt-out retains an in-app notice with email skipped');
select is((select count(*)::integer from app_private.outbound_deliveries where context->>'kind'='admin_activity'),1,'only enabled email has a saved request');
select is((select count(*)::integer from app_private.customer_activity_deliveries),1,'saved email links to one notification');
select ok((select provider_key='admin-activity:'||(context->>'notification_id') from app_private.outbound_deliveries where context->>'kind'='admin_activity'),'provider identity remains bound to the notification');
select ok((select payload->>'html' like '%Synthetic &lt;office&gt;%' from app_private.outbound_deliveries where context->>'kind'='admin_activity'),'saved HTML escapes names');
select ok((select payload#>>'{to,0}'='staging95-owner@example.invalid' and payload->>'from'='office@example.invalid' from app_private.outbound_deliveries where context->>'kind'='admin_activity'),'recipient and envelope are frozen');
set local role service_role;
select throws_ok($$select public.prepare_customer_activity(event||'{"summary":"Changed facts"}'::jsonb,envelope,null) from notification_probe$$,'23505',null,'same identity cannot prepare different event facts');
select set_config('request.jwt.claims','{"role":"service_role","sub":"f9500000-0000-0000-0000-000000000001"}',true);
select throws_ok($$select public.prepare_customer_activity(event,envelope,null) from notification_probe$$,'42501',null,'service invocation with end-user subject is refused');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.prepare_customer_activity(event,envelope,null) from notification_probe$$,'42501',null,'actual anonymous role cannot bypass endpoint');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"f9500000-0000-0000-0000-000000000001"}',true);
select throws_ok($$select public.prepare_customer_activity(event,envelope,null) from notification_probe$$,'42501',null,'actual signed-in role cannot bypass endpoint');
select is((select count(*)::integer from admin_notifications),1,'recipient can read only their own notification');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select throws_ok($$select delivery_id from app_private.customer_activity_deliveries$$,'42501',null,'actual service role cannot read private links');
reset role;
-- Service cannot read the link table; claim the known request through its public
-- service-only lookup instead, then finish with a synthetic acceptance. No I/O.
set local role service_role;
select lives_ok($$select public.claim_outbound_delivery(public.find_outbound_delivery_request('admin-activity:'||n.id)) from admin_notifications n where recipient_user_id='f9500000-0000-0000-0000-000000000001'$$,'normal PR14 claim accepts the saved request');
reset role;
set local role service_role;
select lives_ok($$with d as materialized (select public.get_outbound_delivery(public.find_outbound_delivery_request('admin-activity:'||n.id)) r from admin_notifications n where recipient_user_id='f9500000-0000-0000-0000-000000000001') select public.finish_outbound_delivery((r->>'id')::uuid,(r->>'attempt_id')::uuid,'accepted','staging95-local-synthetic-acceptance') from d$$,'synthetic provider acceptance reconciles through the existing command');
reset role;
select is((select email_status from admin_notifications where recipient_user_id='f9500000-0000-0000-0000-000000000001'),'sent','original notice follows durable provider acceptance');
select is((select count(*)::integer from email_events where outbound_delivery_id in (select delivery_id from app_private.customer_activity_deliveries)),1,'one durable email history receipt exists');
update admin_notification_preferences set quote_email_enabled=true where user_id='f9500000-0000-0000-0000-000000000002';
set local role service_role;
select lives_ok($$select public.prepare_customer_activity(event,envelope||'{"from":"changed@example.invalid"}'::jsonb,'https://changed.example.invalid/admin') from notification_probe$$,'later configuration and preference changes do not reconstruct the original audience');
reset role;
select is((select count(*)::integer from app_private.outbound_deliveries where context->>'kind'='admin_activity'),1,'replay never expands the original email audience');
select ok((select payload->>'from'='office@example.invalid' and payload->>'text' not like '%changed.example.invalid%' from app_private.outbound_deliveries where context->>'kind'='admin_activity'),'replay retains original sender and content');
select is((select attempt_count from app_private.outbound_deliveries where context->>'kind'='admin_activity'),1,'replay does not dispatch an accepted request again');
select ok(has_function_privilege('supabase_auth_admin','ats_staging_auth.reject_email(jsonb)','execute'),'Auth service retains email-guard execution');
select is(ats_staging_auth.reject_email('{"synthetic":"staging95-no-send"}'::jsonb)->'error'->'http_code','503'::jsonb,'unchanged Auth hook refuses synthetic delivery without provider I/O');
select * from finish();
rollback;
