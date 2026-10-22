-- Synthetic-only link authority, atomicity and capability recovery checks.
-- Always rollback. Run through the guarded disposable/staging verifier, never production.
-- Candidate ciphertext is deliberately synthetic; no real capability or provider is used.
begin;
set local lock_timeout='3s';set local statement_timeout='50s';
create temporary table colink_assertions(label text);
create function pg_temp.colink_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Change-order link assertion failed: %',label;end if;insert into pg_temp.colink_assertions values(label);
end $$;
create function pg_temp.colink_source(j uuid,c uuid,l uuid,u uuid)returns uuid language plpgsql as $$declare co uuid;begin
 insert into public.change_orders(change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,subtotal_cents,total_cents)
 values('',j,c,l,u,'Synthetic customer-link review',10000,10000)returning id into co;
 insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(co,'Synthetic link scope',1,10000,10000);return co;
end $$;
create function pg_temp.colink_candidate()returns jsonb language sql as $$
 select jsonb_build_object('token_hash',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),'token_hint','ABC123',
  'token_encrypted','v1.'||repeat('A',16)||'.'||repeat('B',58)||'.'||repeat('C',22),'expires_at',clock_timestamp()+interval '1 day');
$$;
create function pg_temp.colink_fail()returns trigger language plpgsql as $$begin
 if(current_setting('ats_test.link_fail',true)='audit'and tg_table_name='activity_log')or
  (current_setting('ats_test.link_fail',true)='receipt'and tg_table_name='change_order_link_requests')then
  raise exception 'Synthetic late link transaction failure'using errcode='ZX002';end if;return new;
end $$;
create trigger colink_fail_audit before insert on public.activity_log for each row execute function pg_temp.colink_fail();
create trigger colink_fail_receipt before insert on app_private.change_order_link_requests for each row execute function pg_temp.colink_fail();
do $test$
<<fixture>>
declare owner_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 co uuid;other_co uuid;token uuid;old_token uuid;req uuid;generate_req uuid;regenerate_req uuid;revoke_req uuid;rev integer;saved_rev integer;version text;old_version text;generate_version text;regenerate_version text;revoke_version text;
 state jsonb;r jsonb;again jsonb;candidate jsonb;header jsonb;source jsonb;payload jsonb;claim jsonb;delivery uuid;routine regprocedure;failure text;closed text;
 org uuid:=gen_random_uuid();org_location uuid:=gen_random_uuid();org_job uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();other_contact uuid:=gen_random_uuid();org_co uuid;hash text;updated timestamptz;
begin
 insert into public.roles(name)values('owner'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'colink-'||v||'@example.invalid','{}'from unnest(array[owner_id,estimator,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,estimator,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic customer-link staff',true,'active'from unnest(array[owner_id,estimator,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';insert into public.user_roles(user_id,role_id)select estimator,id from public.roles where name='estimator';insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic link customer','colink-'||customer||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status)values(job,customer,location,'accepted');
 co:=pg_temp.colink_source(job,customer,location,owner_id);select edit_revision into rev from public.change_orders where id=co;
 for routine in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('get_change_order_link_state','get_change_order_link_request','manage_change_order_portal_link')loop
  perform pg_temp.colink_check(has_function_privilege('authenticated',routine,'EXECUTE')and not has_function_privilege('anon',routine,'EXECUTE')and not has_function_privilege('service_role',routine,'EXECUTE'),'authenticated office command only: '||routine::text);
 end loop;
 perform pg_temp.colink_check(not has_table_privilege('authenticated','app_private.change_order_link_requests','SELECT')and(select relrowsecurity from pg_class where oid='app_private.change_order_link_requests'::regclass),'link request ledger private with RLS');
 perform pg_temp.colink_check(not has_function_privilege('authenticated','public.create_or_get_change_order_portal_token(uuid,text,text,text,timestamptz)','EXECUTE'),'unversioned create-or-get endpoint retired');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);insert into public.change_order_portal_tokens(change_order_id,customer_id,token_hash)values(co,customer,repeat('f',64));raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check(not exists(select 1 from public.change_order_portal_tokens where change_order_id=co),'direct authenticated insertion denied');
 perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(co);again:=public.get_change_order_link_request(gen_random_uuid(),co,rev,state->>'link_version','generate');perform set_config('role','none',true);version:=state->>'link_version';
 perform pg_temp.colink_check(version~'^[a-f0-9]{64}$'and jsonb_array_length(state->'tokens')=0 and again is null,'empty state has opaque reviewed version and lookup does not mutate');
 header:=(select to_jsonb(c)from public.change_orders c where id=co);
 foreach failure in array array['audit','receipt']loop
  req:=gen_random_uuid();candidate:=pg_temp.colink_candidate();perform set_config('ats_test.link_fail',failure,true);
  begin perform set_config('role','authenticated',true);perform public.manage_change_order_portal_link(req,co,rev,version,'generate',candidate);raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.link_fail','',true);
  perform pg_temp.colink_check(header=(select to_jsonb(c)from public.change_orders c where id=co)and not exists(select 1 from public.change_order_portal_tokens where change_order_id=co)and not exists(select 1 from app_private.change_order_link_requests where request_id=req)and not exists(select 1 from public.activity_log where subject_id=co),'late '||failure||' failure rolls back token history receipt and source');
 end loop;
 generate_req:=gen_random_uuid();candidate:=pg_temp.colink_candidate();old_version:=version;generate_version:=version;
 perform set_config('role','authenticated',true);r:=public.manage_change_order_portal_link(generate_req,co,rev,version,'generate',candidate);again:=public.get_change_order_link_request(generate_req,co,rev,version,'generate');perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.colink_check(r->>'outcome'='created'and r->>'replayed'='false'and r->>'token_available'='true'and(select count(*)=1 from public.change_order_portal_tokens where change_order_id=co and revoked_at is null),'generate creates exactly one recoverable capability');
 perform pg_temp.colink_check((select receipt->>'token_encrypted'is null and receipt::text not like '%'||(candidate->>'token_encrypted')||'%'from app_private.change_order_link_requests where request_id=generate_req),'immutable receipt contains no ciphertext or raw capability');
 perform pg_temp.colink_check(again->>'replayed'='true'and again->>'token_id'=token::text and again->>'token_encrypted'=candidate->>'token_encrypted'and again->>'token_available'='true','lost response recovers original currently valid token');
 perform set_config('role','authenticated',true);again:=public.manage_change_order_portal_link(generate_req,co,rev,old_version,'generate',pg_temp.colink_candidate());perform set_config('role','none',true);
 perform pg_temp.colink_check(again->>'replayed'='true'and again->>'token_id'=token::text and(select count(*)=1 from public.change_order_portal_tokens where change_order_id=co),'exact retry ignores a newly proposed candidate');
 perform set_config('role','authenticated',true);again:=public.manage_change_order_portal_link(gen_random_uuid(),co,rev,version,'generate',null);perform set_config('role','none',true);
 perform pg_temp.colink_check(again->>'outcome'='reused'and again->>'token_id'=token::text and(select expires_at=(candidate->>'expires_at')::timestamptz from public.change_order_portal_tokens where id=token),'ordinary generate reuses matching token without extending its lifetime');
 begin perform set_config('role','authenticated',true);update public.change_order_portal_tokens set revoked_at=now()where id=token;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check((select revoked_at is null from public.change_order_portal_tokens where id=token),'direct authenticated revocation denied');
 begin perform set_config('role','authenticated',true);delete from public.change_order_portal_tokens where id=token;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check(exists(select 1 from public.change_order_portal_tokens where id=token),'direct authenticated deletion cannot erase capability history');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);update public.change_order_portal_tokens set viewed_at=clock_timestamp(),used_at=clock_timestamp()where id=token;perform set_config('role','none',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(co);perform set_config('role','none',true);
 perform pg_temp.colink_check(state->>'link_version'=version and(select viewed_at is not null and used_at is not null from public.change_order_portal_tokens where id=token),'trusted service telemetry remains allowed without changing reviewed link digest');
 regenerate_req:=gen_random_uuid();candidate:=pg_temp.colink_candidate();saved_rev:=rev;old_token:=token;old_version:=version;regenerate_version:=version;
 perform set_config('role','authenticated',true);r:=public.manage_change_order_portal_link(regenerate_req,co,rev,version,'regenerate',candidate);perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.colink_check(r->>'outcome'='regenerated'and(r->>'revoked_count')::integer=1 and token<>old_token and(select revoked_at is not null from public.change_order_portal_tokens where id=old_token)and(select count(*)=1 from public.change_order_portal_tokens where change_order_id=co and revoked_at is null),'regeneration replaces and revokes atomically while preserving history');
 begin perform set_config('role','authenticated',true);perform public.manage_change_order_portal_link(gen_random_uuid(),co,rev,old_version,'revoke',null);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check((select edit_revision=saved_rev from public.change_orders where id=co)and(select revoked_at is null from public.change_order_portal_tokens where id=token),'stale token digest rejects another office action even when CO revision is unchanged');
 -- The original generation used the empty token-set digest, not the regeneration digest.
 perform set_config('role','authenticated',true);again:=public.get_change_order_link_request(generate_req,co,rev,generate_version,'generate');perform set_config('role','none',true);
 perform pg_temp.colink_check(again->>'replayed'='true'and again->>'token_available'='false'and again->>'token_encrypted'is null and again->>'token_hash'is null and(select revoked_at is not null from public.change_order_portal_tokens where id=old_token),'superseded generation retry confirms history without exposing or restoring old capability');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);
 begin perform set_config('role','authenticated',true);perform public.get_change_order_link_request(regenerate_req,co,rev,old_version,'regenerate');raise exception using errcode='ZX001';exception when invalid_parameter_value or insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check((select actor_user_id=owner_id from app_private.change_order_link_requests where request_id=regenerate_req),'another active staff member cannot adopt prior request');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.get_change_order_link_request(regenerate_req,co,rev,old_version,'revoke');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check((select count(*)=1 from app_private.change_order_link_requests where request_id=regenerate_req),'request identity cannot switch regeneration into revocation');
 revoke_req:=gen_random_uuid();old_version:=version;revoke_version:=version;perform set_config('role','authenticated',true);r:=public.manage_change_order_portal_link(revoke_req,co,rev,version,'revoke',null);again:=public.manage_change_order_portal_link(revoke_req,co,rev,version,'revoke',null);perform set_config('role','none',true);version:=r->>'current_link_version';
 perform pg_temp.colink_check(r->>'outcome'='revoked'and(r->>'revoked_count')::integer=1 and again->>'replayed'='true'and(select count(*)=1 from public.activity_log where subject_id=co and event_type='change_order_portal_link_revoked')and not exists(select 1 from public.change_order_portal_tokens where change_order_id=co and revoked_at is null),'revoke retries preserve one audit and cannot revoke a later capability');
 perform set_config('role','authenticated',true);again:=public.get_change_order_link_request(regenerate_req,co,rev,regenerate_version,'regenerate');perform set_config('role','none',true);
 perform pg_temp.colink_check(again->>'token_available'='false'and again->>'token_encrypted'is null and again->>'token_hash'is null,'lost regeneration acknowledgement after revocation reveals no revoked capability');
 req:=gen_random_uuid();candidate:=pg_temp.colink_candidate();old_version:=version;perform set_config('role','authenticated',true);r:=public.manage_change_order_portal_link(req,co,rev,version,'generate',candidate);perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform set_config('role','authenticated',true);again:=public.manage_change_order_portal_link(revoke_req,co,rev,revoke_version,'revoke',null);perform set_config('role','none',true);
 perform pg_temp.colink_check(again->>'replayed'='true'and(select revoked_at is null from public.change_order_portal_tokens where id=token)and(select count(*)=1 from public.activity_log where subject_id=co and event_type='change_order_portal_link_revoked'),'replaying an older revoke never disables a subsequently created customer capability');
 update public.change_order_portal_tokens set expires_at=clock_timestamp()-interval '1 minute'where id=token;
 perform set_config('role','authenticated',true);again:=public.get_change_order_link_request(req,co,rev,old_version,'generate');perform set_config('role','none',true);
 perform pg_temp.colink_check(again->>'token_available'='false'and again->>'token_encrypted'is null,'expired original capability cannot be exposed through request recovery');
 update public.profiles set status='disabled'where id=owner_id;
 begin perform set_config('role','authenticated',true);perform public.get_change_order_link_request(req,co,rev,old_version,'generate');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);update public.profiles set status='active'where id=owner_id;
 perform pg_temp.colink_check((select count(*)=1 from app_private.change_order_link_requests where request_id=req),'offboarded actor denied even on immutable recovery');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',crew,'user_metadata',jsonb_build_object('role','owner'))::text,true);
 begin perform set_config('role','authenticated',true);perform public.get_change_order_link_state(co);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check(not exists(select 1 from app_private.change_order_link_requests where actor_user_id=crew),'crew and forged user metadata cannot manage customer capabilities');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 -- An office edit must preserve the matching active link and its authority digest.
 perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(co);perform set_config('role','none',true);version:=state->>'link_version';candidate:=pg_temp.colink_candidate();
 perform set_config('role','authenticated',true);r:=public.manage_change_order_portal_link(gen_random_uuid(),co,rev,version,'regenerate',candidate);perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 update public.change_orders set customer_notes='A normal synthetic office edit'where id=co;select edit_revision into rev from public.change_orders where id=co;
 perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(co);perform set_config('role','none',true);
 perform pg_temp.colink_check(state->>'link_version'=version and exists(select 1 from jsonb_array_elements(state->'tokens')t where t->>'id'=token::text and t->>'usable'='true'),'normal office edits keep matching existing links usable');
 -- Frozen queued email references the exact old token. Replacing it must prevent dispatch.
 perform set_config('request.jwt.claims','{}',true);other_co:=pg_temp.colink_source(job,customer,location,owner_id);update public.change_orders set status='ready_to_send',internally_reviewed_by_user_id=owner_id,internally_reviewed_at=clock_timestamp()where id=other_co;select edit_revision into saved_rev from public.change_orders where id=other_co;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(other_co);r:=public.manage_change_order_portal_link(gen_random_uuid(),other_co,saved_rev,state->>'link_version','generate',pg_temp.colink_candidate());perform set_config('role','none',true);old_token:=(r->>'token_id')::uuid;old_version:=r->>'current_link_version';
 payload:=jsonb_build_object('from','Angel Tree <synthetic@example.invalid>','reply_to','synthetic@example.invalid','to',jsonb_build_array('colink-'||customer||'@example.invalid'),'cc','[]'::jsonb,'subject','Synthetic link replacement check','text','No provider called.');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);source:=public.get_change_order_send_source(other_co,saved_rev,owner_id);r:=public.prepare_change_order_send(gen_random_uuid(),other_co,saved_rev,owner_id,false,payload,old_token,source->'snapshot');delivery:=(r->>'delivery_id')::uuid;perform set_config('role','none',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);again:=public.manage_change_order_portal_link(gen_random_uuid(),other_co,saved_rev,old_version,'regenerate',pg_temp.colink_candidate());perform set_config('role','none',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);claim:=public.claim_outbound_delivery(delivery);perform set_config('role','none',true);
 perform pg_temp.colink_check(claim is null and(select d.state='cancelled'and d.attempt_count=0 from app_private.outbound_deliveries d where d.id=delivery),'replaced customer capability blocks its already prepared email before provider attempt');
 -- Freshly reviewed closed records retain their existing read-only link-management capability.
 foreach closed in array array['approved','declined','cancelled','expired']loop
  perform set_config('request.jwt.claims','{}',true);other_co:=pg_temp.colink_source(job,customer,location,owner_id);update public.change_orders set status=closed where id=other_co;select edit_revision into saved_rev from public.change_orders where id=other_co;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(other_co);r:=public.manage_change_order_portal_link(gen_random_uuid(),other_co,saved_rev,state->>'link_version','generate',pg_temp.colink_candidate());perform set_config('role','none',true);
  perform pg_temp.colink_check(r->>'token_available'='true'and(select status=closed from public.change_orders where id=other_co),'fresh closed-record link management preserves status: '||closed);
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(co);perform set_config('role','none',true);version:=state->>'link_version';
 begin perform set_config('role','authenticated',true);perform public.manage_change_order_portal_link(gen_random_uuid(),co,rev,version,'regenerate',pg_temp.colink_candidate()||jsonb_build_object('expires_at',clock_timestamp()+interval '40 days'));raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check((select revoked_at is null from public.change_order_portal_tokens where id=token),'invalid candidate cannot revoke existing valid capability');
 perform set_config('request.jwt.claims','{}',true);insert into public.change_order_portal_tokens(change_order_id,customer_id,token_hash,token_encrypted,expires_at)values(co,customer,encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),candidate->>'token_encrypted',clock_timestamp()+interval '1 day');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(co);r:=public.manage_change_order_portal_link(gen_random_uuid(),co,rev,state->>'link_version','regenerate',pg_temp.colink_candidate());perform set_config('role','none',true);
 perform pg_temp.colink_check((r->>'revoked_count')::integer>=2 and(select count(*)=1 from public.change_order_portal_tokens where change_order_id=co and revoked_at is null),'regeneration repairs multiple legacy unrevoked siblings without deleting history');
 -- A superseded organization contact cannot retain response authority through its old token.
 perform set_config('request.jwt.claims','{}',true);insert into public.organizations(id,name,billing_email)values(org,'Synthetic link organization','organization@example.invalid');insert into public.service_locations(id,organization_id,street,city)values(org_location,org,'456 Synthetic Road','Fredericksburg');insert into public.jobs(id,organization_id,service_location_id,status)values(org_job,org,org_location,'accepted');
 insert into public.organization_contacts(id,organization_id,full_name,email,is_active)values(contact,org,'Original synthetic approver','first@example.invalid',true),(other_contact,org,'Replacement synthetic approver','second@example.invalid',true);
 insert into public.change_orders(change_order_number,job_id,organization_id,service_location_id,created_by_user_id,title,status,approval_contact_id,subtotal_cents,total_cents)values('',org_job,org,org_location,owner_id,'Synthetic contact boundary','sent',contact,100,100)returning id into org_co;
 insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(org_co,'Synthetic organization scope',1,100,100);hash:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');insert into public.change_order_portal_tokens(change_order_id,organization_id,intended_contact_id,token_hash,expires_at)values(org_co,org,contact,hash,clock_timestamp()+interval '1 day');update public.change_orders set approval_contact_id=other_contact where id=org_co;select updated_at into updated from public.change_orders where id=org_co;
 begin perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);perform public.respond_to_change_order_by_portal(gen_random_uuid(),hash,updated,'decline','Synthetic outdated-contact response');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.colink_check((select status='sent'from public.change_orders where id=org_co)and not exists(select 1 from public.notes where job_id=org_job),'obsolete organization-contact capability cannot decline or request changes');
 -- Deactivation does not touch the CO/token rows. Dynamic usability must still
 -- match the portal's live active-contact check instead of exposing a dead link.
 select edit_revision into saved_rev from public.change_orders where id=org_co;req:=gen_random_uuid();
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);
 state:=public.get_change_order_link_state(org_co);old_version:=state->>'link_version';r:=public.manage_change_order_portal_link(req,org_co,saved_rev,old_version,'regenerate',pg_temp.colink_candidate());perform set_config('role','none',true);token:=(r->>'token_id')::uuid;
 update public.organization_contacts set is_active=false where id=other_contact;
 perform set_config('role','authenticated',true);state:=public.get_change_order_link_state(org_co);again:=public.get_change_order_link_request(req,org_co,saved_rev,old_version,'regenerate');perform set_config('role','none',true);
 perform pg_temp.colink_check(exists(select 1 from jsonb_array_elements(state->'tokens')t where t->>'id'=token::text and t->>'usable'='false'),'deactivated organization contact makes current customer-link state unusable');
 perform pg_temp.colink_check(again->>'replayed'='true'and again->>'token_available'='false'and again->>'token_encrypted'is null and again->>'token_hash'is null and(select revoked_at is null from public.change_order_portal_tokens where id=token),'inactive-contact receipt recovery confirms prior action without exposing or resurrecting capability');
 perform pg_temp.colink_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id in(select id from public.change_orders where job_id in(job,org_job)))and(select projected_value_cents=0 from public.jobs where id=job)and not exists(select 1 from public.email_events where related_job_id in(job,org_job)),'link management preserves scope financial value and customer delivery history');
end $test$;
select count(*)as passed_assertions from colink_assertions;
rollback;
