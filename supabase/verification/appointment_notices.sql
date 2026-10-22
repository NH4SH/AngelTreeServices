-- SYNTHETIC ONLY. Run through the guarded local/staging verifier. Always rolled back.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
create temporary table notice_assertions(label text);
create function pg_temp.notice_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Appointment notice assertion failed: %',label;end if;
 insert into pg_temp.notice_assertions values(label);end $$;
do $test$
declare u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); l2 uuid:=gen_random_uuid(); j uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); bridged uuid:=gen_random_uuid(); e uuid; e2 uuid; d uuid; attempt uuid;
 initial timestamptz:=date_trunc('hour',clock_timestamp())+interval '10 days'; rev integer; n bigint; r jsonb; ctx jsonb; payload jsonb; snap jsonb;
begin
 perform pg_temp.notice_assert(not (select appointment_change_notices_enabled from public.communication_settings where singleton),'new switch defaults off');
 perform pg_temp.notice_assert(not has_table_privilege('authenticated','app_private.appointment_notice_events','SELECT') and not has_table_privilege('service_role','app_private.appointment_notice_events','INSERT'),'private immutable event ledger');
 perform pg_temp.notice_assert(not has_function_privilege('anon','public.get_appointment_change_notice(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.get_appointment_notice_coverage()','EXECUTE'),'new delivery RPCs are service only');
 insert into auth.users(id,email,raw_user_meta_data) values(u,'notice-'||u||'@example.invalid','{}');
 update public.profiles set status='active' where id=u;
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status) values(u,'Synthetic notice owner',true,'active');
 insert into public.roles(name) values('owner') on conflict(name) do nothing;
 insert into public.user_roles(user_id,role_id) select u,id from public.roles where name='owner';
 insert into public.customers(id,display_name,email) values(c,'Synthetic appointment notice','notice-'||c||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state) values(l,c,'123 Synthetic Lane','Fredericksburg','VA'),(l2,c,'456 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope) values(j,c,l,'new_lead','other','Synthetic notice rollback test');
 insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at) values(a,j,l,'estimate','scheduled',initial,initial+interval '1 hour');
 update public.appointments set starts_at=initial+interval '1 day',ends_at=initial+interval '25 hours' where id=a;
 perform pg_temp.notice_assert(not exists(select 1 from public.customer_communications where appointment_id=a),'disabled switch does not backfill or queue');
 update public.communication_settings set automated_sending_enabled=true,appointment_change_notices_enabled=true where singleton;
 perform pg_temp.notice_assert(not exists(select 1 from public.customer_communications where appointment_id=a),'enabling sends no historical changes');
 select count(*) into n from app_private.appointment_notice_events where source_id=a;
 update public.appointments set calendar_notes='PRIVATE INTERNAL NOTE',status='confirmed' where id=a;
 perform pg_temp.notice_assert((select count(*)=n from app_private.appointment_notice_events where source_id=a),'notes and confirmation do not notify');
 -- Exercise the existing authorized command, including its old pending-reminder cleanup.
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u)::text,true);
 perform set_config('role','authenticated',true);
 select edit_revision into rev from public.appointments where id=a;
 r:=public.save_legacy_appointment(a,j,rev,jsonb_build_object('starts_at',initial+interval '2 days','ends_at',initial+interval '49 hours','calendar_notes','PRIVATE INTERNAL NOTE','assigned_id',null),'details',null);
 perform set_config('role','none',true);
 select id into e from public.customer_communications where appointment_id=a and status='pending';
 perform pg_temp.notice_assert(e is not null,'authorized legacy save atomically retains one pending update');
 perform pg_temp.notice_assert((select scheduled_for>clock_timestamp() and is_automatic and attempt_count=0 from public.customer_communications where id=e),'settling delay and stable automatic identity');
 perform pg_temp.notice_assert((select before_state->>'starts_at'=(to_jsonb(initial+interval '1 day')#>>'{}') from app_private.appointment_notice_events where id=e),'before state is captured');
 update public.appointments set starts_at=initial+interval '3 days',ends_at=initial+interval '73 hours' where id=a;
 select id into e2 from public.customer_communications where appointment_id=a and status='pending';
 perform pg_temp.notice_assert(e2<>e and (select status='cancelled' from public.customer_communications where id=e),'rapid edits supersede without deleting history');
 perform pg_temp.notice_assert((select before_state=(select before_state from app_private.appointment_notice_events where id=e) from app_private.appointment_notice_events where id=e2),'rapid edits retain the customer-visible baseline');
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e)->>'status'='obsolete','superseded notice cannot send');
 update public.customer_communications set scheduled_for=clock_timestamp()-interval '1 minute' where id=e2;
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e2)->>'status'='ready','latest source is eligible after settling');
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e2)::text not like '%PRIVATE INTERNAL NOTE%','customer payload excludes internal notes');
 perform pg_temp.notice_assert(exists(select 1 from app_private.appointment_notice_coverage() where source_id=a and suppress_reminder),'pending updates suppress duplicate confirmation/reminder');
 -- Prepare/claim with actual server-only transaction admission, no provider I/O.
 ctx:=jsonb_build_object('kind','other','email_type','appointment_changed','communication_id',e2,'appointment_id',a,'job_id',j,'customer_id',c);
 payload:=jsonb_build_object('from','office@example.invalid','reply_to','office@example.invalid','to',jsonb_build_array('notice-'||c||'@example.invalid'),'cc','[]'::jsonb,'subject','Synthetic visit update','text','No provider is called.');
 update public.customer_communications set status='processing',attempt_count=1,processing_started_at=clock_timestamp() where id=e2;
 perform set_config('role','service_role',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 snap:=public.get_outbound_source_snapshot(ctx);
 r:=public.prepare_outbound_delivery('customer-communication/'||e2,payload,ctx,snap);d:=(r->>'id')::uuid;
 r:=public.claim_outbound_delivery(d);attempt:=(r->>'attempt_id')::uuid;
 perform set_config('role','none',true);
 perform pg_temp.notice_assert(attempt is not null,'first immutable revision can claim once');
 perform set_config('role','service_role',true);r:=public.claim_outbound_delivery(d);perform set_config('role','none',true);
 perform pg_temp.notice_assert(r is null,'repeat claim cannot create another send');
 update public.appointments set status='cancelled' where id=a;
 select id into e from public.customer_communications where appointment_id=a and communication_type='appointment_cancelled' and status='pending';
 update public.customer_communications set scheduled_for=clock_timestamp()-interval '1 minute' where id=e;
 perform pg_temp.notice_assert(e is not null and app_private.current_appointment_notice(e)->>'status'='held','cancellation waits for an in-flight prior delivery');
 perform set_config('role','service_role',true);r:=public.finish_outbound_delivery(d,attempt,'unknown',null);perform set_config('role','none',true);
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e)->>'status'='held','uncertain provider result cannot be automatically replayed or overtaken');
 -- Synthetic accepted receipt resolves uncertainty, using the original attempt identity.
 perform set_config('role','service_role',true);r:=public.record_outbound_provider_event('synthetic-'||gen_random_uuid(),repeat('a',64),'synthetic-'||d,d,'email.sent',clock_timestamp(),payload->'to');perform set_config('role','none',true);
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e)->>'status'='ready','resolved acceptance releases the newer cancellation');
 ctx:=ctx||jsonb_build_object('communication_id',e,'email_type','appointment_cancelled');
 update public.customer_communications set status='processing',attempt_count=1,processing_started_at=clock_timestamp() where id=e;
 perform set_config('role','service_role',true);
 r:=public.prepare_outbound_delivery('customer-communication/'||e,payload,ctx,public.get_outbound_source_snapshot(ctx));d:=(r->>'id')::uuid;
 r:=public.claim_outbound_delivery(d);perform set_config('role','none',true);
 perform pg_temp.notice_assert(r->>'attempt_id' is not null,'genuine cancellation is not blocked by the reminder cooldown');
 attempt:=(r->>'attempt_id')::uuid;
 perform set_config('role','service_role',true);r:=public.finish_outbound_delivery(d,attempt,'accepted','synthetic-'||d);perform set_config('role','none',true);
 -- A restored visit gets a fresh revision; no replay of the original confirmation.
 update public.appointments set status='scheduled' where id=a;
 perform pg_temp.notice_assert(exists(select 1 from public.customer_communications where appointment_id=a and communication_type='appointment_changed' and status='pending'),'reactivated visit gets its own update');
 select id into e from public.customer_communications where appointment_id=a and communication_type='appointment_changed' and status='pending';
 update public.customer_communications set scheduled_for=clock_timestamp()-interval '1 minute',status='processing',attempt_count=1,processing_started_at=clock_timestamp() where id=e;
 ctx:=ctx||jsonb_build_object('communication_id',e,'email_type','appointment_changed');
 perform set_config('role','service_role',true);
 r:=public.prepare_outbound_delivery('customer-communication/'||e,payload,ctx,public.get_outbound_source_snapshot(ctx));d:=(r->>'id')::uuid;
 r:=public.claim_outbound_delivery(d);perform set_config('role','none',true);
 perform pg_temp.notice_assert(r->>'attempt_id' is not null,'second genuine change of the SAME type is allowed inside 24 hours');
 -- Canonical schedule visits, including end-time and location-only edits.
 insert into public.schedule_events(id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)
 values(v,j,l,'Synthetic visit','estimate','scheduled',initial,initial+interval '1 hour');
 update public.schedule_events set ends_at=ends_at+interval '30 minutes' where id=v;
 perform pg_temp.notice_assert(exists(select 1 from public.customer_communications where schedule_event_id=v and status='pending'),'end-only change captures a notice');
 update public.schedule_events set service_location_id=l2 where id=v;
 select id into e from public.customer_communications where schedule_event_id=v and status='pending';
 update public.customer_communications set scheduled_for=clock_timestamp()-interval '1 minute' where id=e;
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e)#>>'{location,street}'='456 Synthetic Lane','location-only update uses current address');
 -- A prepared payload cannot use an obsolete address even when the location ID is unchanged.
 update public.customer_communications set status='processing',attempt_count=1,processing_started_at=clock_timestamp() where id=e;
 ctx:=jsonb_build_object('kind','other','email_type','appointment_changed','communication_id',e,'schedule_event_id',v,'job_id',j,'customer_id',c);
 perform set_config('role','service_role',true);
 r:=public.prepare_outbound_delivery('customer-communication/'||e,payload,ctx,public.get_outbound_source_snapshot(ctx));d:=(r->>'id')::uuid;
 perform set_config('role','none',true);
 update public.service_locations set street='789 Synthetic Lane' where id=l2;
 perform set_config('role','service_role',true);r:=public.claim_outbound_delivery(d);perform set_config('role','none',true);
 perform pg_temp.notice_assert(r is null and (select state='cancelled' from app_private.outbound_deliveries where id=d),'address race invalidates frozen payload before dispatch');
 -- Return this never-dispatched queue row to pending to exercise rapid-edit coalescing below.
 update public.customer_communications set status='pending',attempt_count=0,processing_started_at=null where id=e;
 update public.appointments set status='cancelled' where id=a;
 insert into public.schedule_events(id,source_appointment_id,job_id,service_location_id,title,event_type,status,starts_at,ends_at)
 values(bridged,a,j,l,'Synthetic bridged visit','estimate','scheduled',initial+interval '5 days',initial+interval '121 hours');
 select count(*) into n from app_private.appointment_notice_events where source_id=a;
 update public.appointments set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=a;
 perform pg_temp.notice_assert((select count(*)=n from app_private.appointment_notice_events where source_id=a),'legacy bridge cannot generate a second notice');
 update public.schedule_events set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=bridged;
 perform pg_temp.notice_assert(exists(select 1 from app_private.appointment_notice_coverage() where source_kind='appointment' and source_id=a),'canonical notice also suppresses legacy polling');
 -- Same-day reversion to the unsent baseline needs no customer email.
 update public.schedule_events set ends_at=initial+interval '1 hour',service_location_id=l where id=v;
 perform pg_temp.notice_assert(not exists(select 1 from public.customer_communications where schedule_event_id=v and status='pending'),'reverting unsent changes sends no misleading update');
 update public.customers set email=null where id=c;
 update public.schedule_events set ends_at=ends_at+interval '30 minutes' where id=v;
 perform pg_temp.notice_assert(exists(select 1 from public.customer_communications where schedule_event_id=v and status='skipped' and skip_reason like 'Customer email%'),'missing email is visible as a skipped notice');
 -- A source edit rollback also removes its intent and queue row.
 select count(*) into n from app_private.appointment_notice_events;
 begin
  update public.schedule_events set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=v;
  raise exception using errcode='ZX001',message='synthetic rollback';
 exception when sqlstate 'ZX001' then null;end;
 perform pg_temp.notice_assert((select count(*)=n from app_private.appointment_notice_events),'source rollback is atomic with event and queue');
 perform pg_temp.notice_assert((select count(*)=3 from app_private.outbound_delivery_attempts where delivery_id in (select id from app_private.outbound_deliveries where context->>'job_id'=j::text)),'only three claimed synthetic attempts, no provider calls');
 -- Adding/toggling this setting must preserve old saved email snapshots exactly.
 update public.customers set email='notice-'||c||'@example.invalid' where id=c;
 a:=gen_random_uuid();e:=gen_random_uuid();
 insert into public.appointments(id,job_id,service_location_id,appointment_type,status,starts_at,ends_at) values(a,j,l,'estimate','scheduled',initial,initial+interval '1 hour');
 insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,job_id,appointment_id,recipient_source,recipient_email,scheduled_for,source_version,idempotency_key)
 values(e,'estimate_confirmation','confirmation',c,j,a,'customer','notice-'||c||'@example.invalid',clock_timestamp(),initial,'synthetic-legacy/'||e);
 ctx:=jsonb_build_object('kind','other','email_type','estimate_confirmation','communication_id',e,'appointment_id',a,'job_id',j,'customer_id',c);
 snap:=app_private.email_source_snapshot(ctx);
 perform pg_temp.notice_assert(not (snap->'automation' ? 'appointment_change_notices_enabled'),'legacy saved automation shape is unchanged');
 update public.communication_settings set appointment_change_notices_enabled=false where singleton;
 perform pg_temp.notice_assert(app_private.email_source_snapshot(ctx)=snap,'new notice setting does not invalidate unrelated frozen deliveries');
 update public.customer_communications set status='processing',attempt_count=1,processing_started_at=clock_timestamp() where id=e;
 perform set_config('role','service_role',true);
 r:=public.prepare_outbound_delivery('synthetic-legacy/'||e,payload,ctx,public.get_outbound_source_snapshot(ctx));d:=(r->>'id')::uuid;
 r:=public.claim_outbound_delivery(d);attempt:=(r->>'attempt_id')::uuid;
 perform set_config('role','none',true);
 if attempt is null then raise exception 'Synthetic booking confirmation was not admitted';end if;
 update public.communication_settings set appointment_change_notices_enabled=true where singleton;
 update public.appointments set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id=a;
 select id into e2 from public.customer_communications where appointment_id=a and communication_type='appointment_changed' and status='pending';
 update public.customer_communications set scheduled_for=clock_timestamp()-interval '1 minute' where id=e2;
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e2)->>'status'='held','new correction cannot overtake an original booking confirmation in flight');
 perform set_config('role','service_role',true);r:=public.finish_outbound_delivery(d,attempt,'accepted','synthetic-'||d);perform set_config('role','none',true);
 perform pg_temp.notice_assert(app_private.current_appointment_notice(e2)->>'status'='ready','confirmed original receipt releases the newer correction without a resend');
end $test$;
select count(*)::integer as passed_assertions from pg_temp.notice_assertions;
rollback;
