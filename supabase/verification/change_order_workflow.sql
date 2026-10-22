-- Synthetic-only workflow, invalidation and queue checks. Always rollback; never production.
begin;
set local lock_timeout='3s';set local statement_timeout='40s';
create temporary table coreview_assertions(label text);
create function pg_temp.coreview_check(ok boolean,label text)returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Workflow assertion failed: %',label;end if;insert into pg_temp.coreview_assertions values(label);end $$;
create function pg_temp.coreview_source(j uuid,c uuid,l uuid,u uuid)returns uuid language plpgsql as $$declare co uuid;begin
 insert into public.change_orders(change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,subtotal_cents,total_cents)values('',j,c,l,u,'Synthetic reviewed addition',10000,10000)returning id into co;
 insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(co,'Synthetic scope',1,10000,10000);return co;end $$;
create function pg_temp.coreview_fail()returns trigger language plpgsql as $$begin
 if(tg_table_name='change_order_workflow_requests'and current_setting('ats_test.workflow_fail',true)='receipt')or(tg_table_name='activity_log'and current_setting('ats_test.workflow_fail',true)='audit'and to_jsonb(new)->>'event_type'='change_order_cancelled')then raise exception 'Synthetic late workflow failure'using errcode='ZX002';end if;return new;end $$;
create trigger coreview_fail_audit before insert on public.activity_log for each row execute function pg_temp.coreview_fail();
create trigger coreview_fail_receipt before insert on app_private.change_order_workflow_requests for each row execute function pg_temp.coreview_fail();
do $test$
<<fixture>>
declare owner_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 co uuid;other_co uuid;req uuid;rev integer;r jsonb;again jsonb;snap jsonb;state text;failure text;token_hash text;context jsonb;payload jsonb;delivery uuid:=gen_random_uuid();
begin
 insert into public.roles(name)values('owner'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'coreview-'||v||'@example.invalid','{}'from unnest(array[owner_id,estimator,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,estimator,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic office reviewer',true,'active'from unnest(array[owner_id,estimator,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';insert into public.user_roles(user_id,role_id)select estimator,id from public.roles where name='estimator';insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic review customer','coreview-'||customer||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status)values(job,customer,location,'accepted');
 co:=pg_temp.coreview_source(job,customer,location,owner_id);select edit_revision into rev from public.change_orders where id=co;
 perform pg_temp.coreview_check(not has_function_privilege('anon','public.transition_change_order_workflow(uuid,uuid,integer,text)','EXECUTE'),'anonymous denied');
 perform pg_temp.coreview_check(not has_function_privilege('service_role','public.transition_change_order_workflow(uuid,uuid,integer,text)','EXECUTE'),'service cannot impersonate office review');
 perform pg_temp.coreview_check(has_function_privilege('authenticated','public.transition_change_order_workflow(uuid,uuid,integer,text)','EXECUTE'),'authenticated command available');
 perform pg_temp.coreview_check(not has_table_privilege('authenticated','app_private.change_order_workflow_requests','SELECT')and(select relrowsecurity from pg_class where oid='app_private.change_order_workflow_requests'::regclass),'private RLS receipt ledger');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);update public.change_orders set status='ready_to_send'where id=co;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='draft'from public.change_orders where id=co),'direct status change denied');
 begin perform set_config('role','authenticated',true);update public.change_orders set internally_reviewed_by_user_id=estimator,internally_reviewed_at=now(),cancelled_at=now()where id=co;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select internally_reviewed_at is null and cancelled_at is null from public.change_orders where id=co),'forged review and cancellation metadata denied');
 req:=gen_random_uuid();perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(req,co,rev,'request_review');again:=public.transition_change_order_workflow(req,co,rev,'request_review');perform set_config('role','none',true);
 perform pg_temp.coreview_check(r->>'to_status'='pending_internal_review'and again->>'replayed'='true','request review and exact retry');
 perform pg_temp.coreview_check((select count(*)=1 from public.activity_log where subject_id=co and event_type='change_order_review_requested'),'one review-request history');
 select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(gen_random_uuid(),co,rev,'approve_internal');perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='ready_to_send'and internally_reviewed_by_user_id=owner_id and internally_reviewed_at is not null from public.change_orders where id=co),'internal review records actual staff and server time');
 perform pg_temp.coreview_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co)and(select projected_value_cents=0 from public.jobs where id=job),'internal review does not authorize scope or job value');
 select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(gen_random_uuid(),co,rev,'return_clarification');perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='draft'and internally_reviewed_by_user_id is null and internally_reviewed_at is null from public.change_orders where id=co),'clarification returns to draft and clears review');
 perform set_config('role','authenticated',true);again:=public.transition_change_order_workflow(req,co,(again->>'reviewed_revision')::integer,'request_review');perform set_config('role','none',true);
 perform pg_temp.coreview_check(again->>'current_status'='draft'and again->>'to_status'='pending_internal_review','old request never reverts a later transition');
 begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(req,co,(again->>'reviewed_revision')::integer,'cancel');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='draft'from public.change_orders where id=co),'request cannot switch intent');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);
 begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(req,co,(again->>'reviewed_revision')::integer,'request_review');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select actor_user_id=owner_id from app_private.change_order_workflow_requests where request_id=req),'another actor cannot claim a workflow receipt');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 select edit_revision into rev from public.change_orders where id=co;update public.change_orders set title='Changed since screen review'where id=co;
 begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(gen_random_uuid(),co,rev,'cancel');raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='draft'from public.change_orders where id=co),'stale cancellation rejected even if status unchanged');
 select edit_revision into rev from public.change_orders where id=co;snap:=(select to_jsonb(c)from public.change_orders c where id=co);
 foreach failure in array array['audit','receipt']loop
  req:=gen_random_uuid();perform set_config('ats_test.workflow_fail',failure,true);
  begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(req,co,rev,'cancel');raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.workflow_fail','',true);
  perform pg_temp.coreview_check(snap=(select to_jsonb(c)from public.change_orders c where id=co),'late failure rolls back status timestamp revision: '||failure);
  perform pg_temp.coreview_check(not exists(select 1 from app_private.change_order_workflow_requests where request_id=req)and not exists(select 1 from public.activity_log where subject_id=co and event_type='change_order_cancelled'),'late failure rolls back receipt and audit: '||failure);
 end loop;
 -- Pre-send source edits invalidate review once; timestamp-only changes do not.
 perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(gen_random_uuid(),co,rev,'approve_internal');perform set_config('role','none',true);
 update public.change_orders set updated_at=clock_timestamp()where id=co;
 perform pg_temp.coreview_check((select status='ready_to_send'from public.change_orders where id=co),'technical touch does not invalidate review');
 perform set_config('role','authenticated',true);update public.change_orders set customer_notes='Changed customer instructions'where id=co;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='pending_internal_review'and internally_reviewed_at is null and internally_reviewed_by_user_id is null from public.change_orders where id=co),'detail edit returns ready work to review');
 perform pg_temp.coreview_check((select count(*)=1 from public.activity_log where subject_id=co and event_type='change_order_internal_review_invalidated'),'detail invalidation audited once');
 select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(gen_random_uuid(),co,rev,'approve_internal');update public.change_order_line_items set description='Changed line instructions'where change_order_id=co;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='pending_internal_review'and internally_reviewed_at is null from public.change_orders where id=co),'line-only edit invalidates pre-send review');
 perform pg_temp.coreview_check((select count(*)=2 from public.activity_log where subject_id=co and event_type='change_order_internal_review_invalidated'),'line invalidation audited once');
 -- Existing sent links remain valid after edits; cancelled links cannot authorize work.
 perform set_config('request.jwt.claims','{}',true);update public.change_orders set status='sent'where id=co;
 token_hash:=encode(sha256(convert_to(co::text,'UTF8')),'hex');insert into public.change_order_portal_tokens(change_order_id,customer_id,token_hash,expires_at)values(co,customer,token_hash,now()+interval '1 day');
 update public.change_orders set customer_notes='Normal sent edit'where id=co;
 perform pg_temp.coreview_check((select status='sent'from public.change_orders where id=co)and exists(select 1 from public.change_order_portal_tokens where change_order_id=co and revoked_at is null),'sent edits retain status and active customer link');
 select edit_revision into rev from public.change_orders where id=co;
 context:=jsonb_build_object('kind','change_order','email_type','change_order','actor_id',owner_id,'job_id',job,'change_order_id',co);
 payload:=jsonb_build_object('to',jsonb_build_array('coreview-'||customer||'@example.invalid'),'cc','[]'::jsonb,'subject','Synthetic approval email','text','Synthetic local-only message.');
 perform pg_temp.coreview_check(app_private.email_source_eligible(context,payload),'queued email fixture was eligible before cancellation');
 insert into app_private.outbound_deliveries(id,business_key,provider_key,payload,payload_hash,context,source_snapshot,actor_id)values(delivery,delivery::text,delivery::text,payload,encode(sha256(convert_to(payload::text,'UTF8')),'hex'),context,app_private.email_source_snapshot(context),owner_id);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);req:=gen_random_uuid();perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(req,co,rev,'cancel');again:=public.transition_change_order_workflow(req,co,rev,'cancel');perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='cancelled'and cancelled_at is not null from public.change_orders where id=co)and again->>'replayed'='true','cancellation and retry preserve closed result');
 perform pg_temp.coreview_check((select count(*)=1 from public.activity_log where subject_id=co and event_type='change_order_cancelled'),'one cancellation history after retry');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
 again:=public.claim_outbound_delivery(delivery);perform set_config('role','none',true);perform pg_temp.coreview_check(again is null,'prepared customer approval message cannot dispatch after cancellation');
 perform pg_temp.coreview_check((select d.state='cancelled'and d.attempt_count=0 from app_private.outbound_deliveries d where d.id=delivery),'cancelled source adds no email attempt');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',crew,'user_metadata',jsonb_build_object('role','owner'))::text,true);
 begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(gen_random_uuid(),co,rev,'request_review');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='cancelled'from public.change_orders where id=co),'crew and forged metadata denied');
 update public.profiles set status='disabled'where id=owner_id;perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(req,co,rev,'cancel');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select count(*)=1 from app_private.change_order_workflow_requests where request_id=req),'offboarded actor denied on replay');update public.profiles set status='active'where id=owner_id;
 foreach state in array array['draft','pending_internal_review','ready_to_send','sent','change_requested']loop
  perform set_config('request.jwt.claims','{}',true);other_co:=pg_temp.coreview_source(job,customer,location,owner_id);update public.change_orders set status=state where id=other_co;select edit_revision into rev from public.change_orders where id=other_co;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);r:=public.transition_change_order_workflow(gen_random_uuid(),other_co,rev,'cancel');perform set_config('role','none',true);
  perform pg_temp.coreview_check(r->>'to_status'='cancelled','same office cancellation capability retained: '||state);
 end loop;
 perform set_config('request.jwt.claims','{}',true);other_co:=pg_temp.coreview_source(job,customer,location,owner_id);update public.change_orders set status='approved',approved_at=now()where id=other_co;select edit_revision into rev from public.change_orders where id=other_co;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.transition_change_order_workflow(gen_random_uuid(),other_co,rev,'cancel');raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.coreview_check((select status='approved'from public.change_orders where id=other_co),'approved work cannot be cancelled by workflow');
 perform pg_temp.coreview_check(not exists(select 1 from public.email_events where related_change_order_id in(co,other_co)),'workflow creates no customer email');
end $test$;
select count(*)as passed_assertions from coreview_assertions;
rollback;
