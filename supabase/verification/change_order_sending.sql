-- Synthetic-only sending, immutable-request recovery and cancellation checks.
-- Run only through the guarded disposable/staging verifier. Never production.
-- Provider outcomes below are database fixtures; no transport or provider is called.
begin;
set local lock_timeout='3s';set local statement_timeout='50s';
create temporary table cosend_assertions(label text);
create function pg_temp.cosend_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Change-order sending assertion failed: %',label;end if;
 insert into pg_temp.cosend_assertions values(label);
end $$;
create function pg_temp.cosend_source(j uuid,c uuid,l uuid,u uuid)returns uuid language plpgsql as $$declare co uuid;begin
 insert into public.change_orders(change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,subtotal_cents,total_cents)
 values('',j,c,l,u,'Synthetic reviewed email',10000,10000)returning id into co;
 insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(co,'Synthetic additional scope',1,10000,10000);
 update public.change_orders set status='ready_to_send',internally_reviewed_at=clock_timestamp(),internally_reviewed_by_user_id=u where id=co;
 return co;
end $$;
create function pg_temp.cosend_token(co uuid,c uuid)returns uuid language plpgsql as $$declare t uuid:=gen_random_uuid();begin
 insert into public.change_order_portal_tokens(id,change_order_id,customer_id,token_hash,expires_at)
 values(t,co,c,encode(sha256(convert_to(t::text,'UTF8')),'hex'),clock_timestamp()+interval '1 day');return t;
end $$;
create function pg_temp.cosend_fail_receipt()returns trigger language plpgsql as $$begin
 if current_setting('ats_test.send_fail',true)='receipt'then raise exception 'Synthetic final send-receipt failure'using errcode='ZX002';end if;return new;
end $$;
create trigger cosend_fail_receipt before insert on app_private.change_order_send_requests for each row execute function pg_temp.cosend_fail_receipt();
do $test$
<<fixture>>
declare owner_id uuid:=gen_random_uuid();other_staff uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 co uuid;other_co uuid;token uuid;other_token uuid;req uuid;copy_req uuid;rev integer;current_rev integer;src jsonb;r jsonb;again jsonb;claim jsonb;payload jsonb;legacy_context jsonb;snap jsonb;header jsonb;
 delivery uuid;copy_delivery uuid;copy_b uuid;legacy_delivery uuid;routine regprocedure;before_count integer;closed text;
begin
 insert into public.roles(name)values('owner'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'cosend-'||v||'@example.invalid','{}'from unnest(array[owner_id,other_staff,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,other_staff,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic send reviewer',true,'active'from unnest(array[owner_id,other_staff,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';
 insert into public.user_roles(user_id,role_id)select other_staff,id from public.roles where name='estimator';
 insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic email customer','cosend-'||customer||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status)values(job,customer,location,'accepted');
 payload:=jsonb_build_object('from','Angel Tree <synthetic@example.invalid>','reply_to','synthetic@example.invalid','to',jsonb_build_array('cosend-'||customer||'@example.invalid'),'cc','[]'::jsonb,'subject','Synthetic additional-work approval','text','Synthetic current-version approval. No provider call.');
 for routine in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('get_change_order_send_source','get_change_order_send_request','prepare_change_order_send')loop
  perform pg_temp.cosend_check(has_function_privilege('service_role',routine,'EXECUTE')and not has_function_privilege('authenticated',routine,'EXECUTE')and not has_function_privilege('anon',routine,'EXECUTE'),'service-only command: '||routine::text);
 end loop;
 perform pg_temp.cosend_check(not has_table_privilege('authenticated','app_private.change_order_send_requests','SELECT')and not has_table_privilege('service_role','app_private.change_order_send_requests','SELECT')and(select relrowsecurity from pg_class where oid='app_private.change_order_send_requests'::regclass),'send-request receipt ledger private with RLS');
 co:=pg_temp.cosend_source(job,customer,location,owner_id);token:=pg_temp.cosend_token(co,customer);select edit_revision into rev from public.change_orders where id=co;req:=gen_random_uuid();
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
 src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id);
 again:=public.get_change_order_send_request(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false);
 perform set_config('role','none',true);
 perform pg_temp.cosend_check(src#>>'{order,id}'=co::text and src#>>'{order,customers,email}'=payload#>>'{to,0}'and src#>>'{context,change_order_send_version}'='1'and jsonb_typeof(src->'snapshot')='object','one reviewed source includes canonical recipient and versioned snapshot');
 perform pg_temp.cosend_check(again is null,'unknown request lookup has no mutation');
 begin perform set_config('role','service_role',true);perform public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev-1,p_actor_id=>owner_id);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;
 perform set_config('role','none',true);
 perform pg_temp.cosend_check(not exists(select 1 from app_private.change_order_send_requests where change_order_id=co),'stale source creates no send request');
 other_co:=pg_temp.cosend_source(job,customer,location,owner_id);other_token:=pg_temp.cosend_token(other_co,customer);
 begin perform set_config('role','service_role',true);perform public.prepare_change_order_send(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>other_token,p_expected_snapshot=>src->'snapshot');raise exception using errcode='ZX001';exception when check_violation or insufficient_privilege then null;end;
 perform set_config('role','none',true);
 perform pg_temp.cosend_check(not exists(select 1 from app_private.outbound_deliveries where context->>'change_order_id'=co::text),'another addition token cannot prepare an unusable email');
 update public.change_order_portal_tokens set expires_at=clock_timestamp()-interval '1 minute'where id=token;
 begin perform set_config('role','service_role',true);perform public.prepare_change_order_send(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');raise exception using errcode='ZX001';exception when check_violation or insufficient_privilege then null;end;
 perform set_config('role','none',true);update public.change_order_portal_tokens set expires_at=clock_timestamp()+interval '1 day'where id=token;
 perform pg_temp.cosend_check(not exists(select 1 from app_private.change_order_send_requests where request_id=req),'expired link creates no request receipt');
 update public.customers set display_name='Changed after email source read'where id=customer;
 begin perform set_config('role','service_role',true);perform public.prepare_change_order_send(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');raise exception using errcode='ZX001';exception when sqlstate '40001'or sqlstate 'PT409'then null;end;
 perform set_config('role','none',true);
 perform pg_temp.cosend_check(not exists(select 1 from app_private.outbound_deliveries where context->>'change_order_id'=co::text),'related-party change rejects stale composition without outbox writes');
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id);perform set_config('role','none',true);
 header:=(select to_jsonb(c)from public.change_orders c where id=co);select count(*)into before_count from app_private.outbound_delivery_requests;
 perform set_config('ats_test.send_fail','receipt',true);
 begin perform set_config('role','service_role',true);perform public.prepare_change_order_send(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;
 perform set_config('role','none',true);perform set_config('ats_test.send_fail','',true);
 perform pg_temp.cosend_check(header=(select to_jsonb(c)from public.change_orders c where id=co),'late mapping failure preserves source revision status and review');
 perform pg_temp.cosend_check(not exists(select 1 from app_private.change_order_send_requests where request_id=req)and not exists(select 1 from app_private.outbound_deliveries where context->>'change_order_id'=co::text)and(select count(*)=before_count from app_private.outbound_delivery_requests),'late mapping failure rolls back outbox and request aliases');
 perform set_config('role','service_role',true);
 r:=public.prepare_change_order_send(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');
 again:=public.get_change_order_send_request(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false);perform set_config('role','none',true);delivery:=(r->>'delivery_id')::uuid;
 perform pg_temp.cosend_check(r->>'request_id'=req::text and r->>'id'=co::text and(r->>'reviewed_revision')::integer=rev and r->>'replayed'='false','prepared delivery receipt binds request source actor and reviewed revision');
 perform pg_temp.cosend_check(again->>'delivery_id'=delivery::text and again->>'replayed'='true','lost prepare response recovers immutable delivery');
 perform pg_temp.cosend_check((select count(*)=1 and bool_and(d.payload=fixture.payload and d.attempt_count=0)from app_private.outbound_deliveries d where d.context->>'change_order_id'=co::text),'one frozen payload before any dispatch');
 begin perform set_config('role','service_role',true);perform public.get_change_order_send_request(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>other_staff,p_additional_copy=>false);raise exception using errcode='ZX001';exception when invalid_parameter_value or insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.cosend_check((select count(*)=1 from app_private.change_order_send_requests where request_id=req),'another active actor cannot adopt a send request');
 begin perform set_config('role','service_role',true);perform public.get_change_order_send_request(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>true);raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.cosend_check((select count(*)=1 from app_private.change_order_send_requests where request_id=req),'retry cannot change normal send to additional copy');
 perform set_config('role','service_role',true);claim:=public.claim_outbound_delivery(delivery);again:=public.finish_outbound_delivery(delivery,(claim->>'attempt_id')::uuid,'unknown',null);perform set_config('role','none',true);
 update public.change_orders set status='sent',customer_notes='Edited while provider outcome is uncertain'where id=co;select edit_revision into current_rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id);perform set_config('role','none',true);
 begin perform set_config('role','service_role',true);perform public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.cosend_check((select count(*)=1 from app_private.outbound_deliveries where context->>'change_order_id'=co::text),'new request and edited source cannot bypass unknown delivery family');
 begin perform set_config('role','service_role',true);perform public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>true,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.cosend_check((select count(*)=1 from app_private.outbound_delivery_attempts where delivery_id=delivery),'explicit copy cannot bypass unknown provider outcome');
 perform set_config('role','service_role',true);again:=public.get_change_order_send_request(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false);perform set_config('role','none',true);
 perform pg_temp.cosend_check(again->>'delivery_id'=delivery::text and(again->>'current_revision')::integer=current_rev,'unknown result lookup recovers original without recomposing edited email');
 -- A clean acceptance changes bookkeeping; it must not create a new ordinary send.
 co:=other_co;token:=other_token;req:=gen_random_uuid();select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id);
 r:=public.prepare_change_order_send(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');delivery:=(r->>'delivery_id')::uuid;
 claim:=public.claim_outbound_delivery(delivery);again:=public.finish_outbound_delivery(delivery,(claim->>'attempt_id')::uuid,'accepted','synthetic-'||delivery::text);perform set_config('role','none',true);
 perform pg_temp.cosend_check(again->>'repair_state'='complete'and(select status='sent'from public.change_orders where id=co),'synthetic provider acceptance reconciles existing source transaction');
 select edit_revision into current_rev from public.change_orders where id=co;perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id);
 again:=public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');perform set_config('role','none',true);
 perform pg_temp.cosend_check(again->>'delivery_id'=delivery::text and(select count(*)=1 from app_private.outbound_deliveries where context->>'change_order_id'=co::text),'acceptance revision bump cannot create a second ordinary email');
 copy_req:=gen_random_uuid();perform set_config('role','service_role',true);
 r:=public.prepare_change_order_send(p_request_id=>copy_req,p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>true,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');copy_delivery:=(r->>'delivery_id')::uuid;
 again:=public.get_change_order_send_request(p_request_id=>copy_req,p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>true);perform set_config('role','none',true);
 perform pg_temp.cosend_check(copy_delivery<>delivery and r->>'additional_copy'='true'and(select context->>'confirmed_copy'='true'from app_private.outbound_deliveries where id=copy_delivery),'additional copy requires distinct explicit durable intent');
 perform pg_temp.cosend_check(again->>'delivery_id'=copy_delivery::text and again->>'replayed'='true'and(select count(*)=2 from app_private.outbound_deliveries where context->>'change_order_id'=co::text),'additional-copy retry does not create a third email');
 update public.change_orders set customer_notes='Current link reflects a normal sent edit'where id=co;
 perform pg_temp.cosend_check((select status='sent'from public.change_orders where id=co)and exists(select 1 from public.change_order_portal_tokens where id=token and revoked_at is null),'sent edits keep source status and existing active customer link');
 update public.change_orders set status='cancelled',cancelled_at=clock_timestamp()where id=co;
 perform set_config('role','service_role',true);claim:=public.claim_outbound_delivery(copy_delivery);again:=public.get_change_order_send_request(p_request_id=>copy_req,p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>true);perform set_config('role','none',true);
 perform pg_temp.cosend_check(claim is null and(select state='cancelled'and attempt_count=0 from app_private.outbound_deliveries where id=copy_delivery),'cancellation before claim prevents queued additional email');
 perform pg_temp.cosend_check(again->>'delivery_id'=copy_delivery::text and again->>'current_status'='cancelled','recovering earlier send after cancellation never reopens source');
 update public.profiles set status='disabled'where id=owner_id;
 begin perform set_config('role','service_role',true);perform public.get_change_order_send_request(p_request_id=>req,p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);update public.profiles set status='active'where id=owner_id;
 perform pg_temp.cosend_check((select state='accepted'from app_private.outbound_deliveries where id=delivery),'offboarded actor cannot recover or dispatch accepted request');
 begin perform set_config('role','service_role',true);perform public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>crew);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.cosend_check(not exists(select 1 from app_private.change_order_send_requests where actor_user_id=crew),'crew has no office send authority');
 -- A line edit invalidates internal review and prevents an already prepared first email.
 co:=pg_temp.cosend_source(job,customer,location,owner_id);token:=pg_temp.cosend_token(co,customer);select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id);
 r:=public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');delivery:=(r->>'delivery_id')::uuid;perform set_config('role','none',true);
 update public.change_order_line_items set description='Changed before first dispatch'where change_order_id=co;
 perform pg_temp.cosend_check((select status='pending_internal_review'and internally_reviewed_at is null from public.change_orders where id=co),'line edit preserves migration110 internal-review invalidation');
 perform set_config('role','service_role',true);claim:=public.claim_outbound_delivery(delivery);perform set_config('role','none',true);
 perform pg_temp.cosend_check(claim is null and(select state='cancelled'and attempt_count=0 from app_private.outbound_deliveries where id=delivery),'invalidated internal review stops prepared first email without attempt');
 -- Both explicit copies can be prepared before either dispatches. Recovery of an
 -- existing prepared request must still honor another copy's uncertain outcome.
 co:=pg_temp.cosend_source(job,customer,location,owner_id);token:=pg_temp.cosend_token(co,customer);select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id);
 r:=public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');delivery:=(r->>'delivery_id')::uuid;
 claim:=public.claim_outbound_delivery(delivery);again:=public.finish_outbound_delivery(delivery,(claim->>'attempt_id')::uuid,'accepted','synthetic-'||delivery::text);perform set_config('role','none',true);
 select edit_revision into current_rev from public.change_orders where id=co;perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id);
 r:=public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>true,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');copy_delivery:=(r->>'delivery_id')::uuid;
 r:=public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>true,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');copy_b:=(r->>'delivery_id')::uuid;
 claim:=public.claim_outbound_delivery(copy_delivery);again:=public.finish_outbound_delivery(copy_delivery,(claim->>'attempt_id')::uuid,'unknown',null);
 claim:=public.claim_outbound_delivery(copy_b);perform set_config('role','none',true);
 perform pg_temp.cosend_check(copy_delivery<>copy_b and claim is null
  and(select state='unknown'from app_private.outbound_deliveries where id=copy_delivery)
  and(select state='prepared'and repair_state='needs_review'and problem_code='matching_delivery'and attempt_count=0 from app_private.outbound_deliveries where id=copy_b)
  and(select count(*)=1 from app_private.outbound_delivery_attempts where delivery_id in(copy_delivery,copy_b)),
  'previously prepared second copy cannot bypass an uncertain sibling at claim and retains its immutable intent');
 -- Old snapshots remain byte-shaped as before; only marked requests normalize revisions.
 co:=pg_temp.cosend_source(job,customer,location,owner_id);token:=pg_temp.cosend_token(co,customer);select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>rev,p_actor_id=>owner_id);perform set_config('role','none',true);
 legacy_context:=(src->'context')-'change_order_send_version';snap:=app_private.email_source_snapshot(legacy_context);header:=app_private.email_source_snapshot(src->'context');
 update public.change_orders set updated_at=clock_timestamp()where id=co;
 perform pg_temp.cosend_check(snap<>app_private.email_source_snapshot(legacy_context),'legacy snapshots retain original revision sensitivity');
 perform pg_temp.cosend_check(header=app_private.email_source_snapshot(src->'context'),'new marked snapshot ignores technical revision only');
 select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);r:=public.prepare_outbound_delivery('cosend-legacy/'||co::text,payload,legacy_context,null);legacy_delivery:=(r->>'id')::uuid;claim:=public.claim_outbound_delivery(legacy_delivery);again:=public.finish_outbound_delivery(legacy_delivery,(claim->>'attempt_id')::uuid,'accepted','synthetic-'||legacy_delivery::text);perform set_config('role','none',true);
 select edit_revision into current_rev from public.change_orders where id=co;
 perform set_config('role','service_role',true);src:=public.get_change_order_send_source(p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id);
 r:=public.prepare_change_order_send(p_request_id=>gen_random_uuid(),p_change_order_id=>co,p_expected_revision=>current_rev,p_actor_id=>owner_id,p_additional_copy=>false,p_payload=>payload,p_portal_token_id=>token,p_expected_snapshot=>src->'snapshot');perform set_config('role','none',true);
 perform pg_temp.cosend_check(r->>'delivery_id'=legacy_delivery::text and(select count(*)=1 from app_private.outbound_deliveries where context->>'change_order_id'=co::text),'matching accepted legacy email is reused without a new provider request');
 perform pg_temp.cosend_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id in(select id from public.change_orders where job_id=job))and(select projected_value_cents=0 from public.jobs where id=job),'sending and fixture acceptance do not authorize scope or financial value');
end $test$;
select count(*)as passed_assertions from cosend_assertions;
rollback;
