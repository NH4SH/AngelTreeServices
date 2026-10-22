-- Synthetic-only authority, atomicity and recovery proof. Always roll back.
begin;
set local lock_timeout='3s';set local statement_timeout='50s';
create temporary table quotelink_assertions(label text);
create function pg_temp.quotelink_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Quote link assertion failed: %',label;end if;insert into pg_temp.quotelink_assertions values(label);
end $$;
create function pg_temp.quotelink_candidate()returns jsonb language sql as $$
 select jsonb_build_object('token_hash',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),'token_hint','ABC123',
  'token_encrypted','v1.'||repeat('A',16)||'.'||repeat('B',58)||'.'||repeat('C',22),'expires_at',clock_timestamp()+interval '1 day');
$$;
create function pg_temp.quotelink_fail()returns trigger language plpgsql as $$begin
 if(current_setting('ats_test.quotelink_fail',true)='audit'and tg_table_name='activity_log')or(current_setting('ats_test.quotelink_fail',true)='receipt'and tg_table_name='quote_link_requests')or(current_setting('ats_test.quotelink_fail',true)='batch'and tg_table_name='quote_link_batches')then
  raise exception 'Synthetic late quote link transaction failure'using errcode='ZX002';end if;return new;
end $$;
create trigger quotelink_fail_audit before insert on public.activity_log for each row execute function pg_temp.quotelink_fail();
create trigger quotelink_fail_receipt before insert on app_private.quote_link_requests for each row execute function pg_temp.quotelink_fail();
create trigger quotelink_fail_batch before insert on app_private.quote_link_batches for each row execute function pg_temp.quotelink_fail();
do $test$
declare owner_id uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();other_customer uuid:=gen_random_uuid();
 quote uuid:=gen_random_uuid();other_quote uuid:=gen_random_uuid();org uuid:=gen_random_uuid();org_quote uuid:=gen_random_uuid();token uuid;old_token uuid;req uuid;generate_req uuid;regen_req uuid;revoke_req uuid;
 version text;generate_version text;regen_version text;revoke_version text;before_state jsonb;financial jsonb;r jsonb;again jsonb;state jsonb;candidate jsonb;routine regprocedure;failure text;closed text;
begin
 insert into public.roles(name)values('owner'),('admin'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'quotelink-'||v||'@example.invalid','{}'from unnest(array[owner_id,admin_id,estimator,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,admin_id,estimator,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic quote-link staff',true,'active'from unnest(array[owner_id,admin_id,estimator,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';insert into public.user_roles(user_id,role_id)select admin_id,id from public.roles where name='admin';insert into public.user_roles(user_id,role_id)select estimator,id from public.roles where name='estimator';insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic quote customer','quotelink-'||customer||'@example.invalid'),(other_customer,'Other synthetic quote customer',null);
 insert into public.quotes(id,customer_id,quote_number,status,subtotal_cents,total_cents)values(quote,customer,'QUOTELINK-'||quote::text, 'sent',10000,10000),(other_quote,other_customer,'QUOTELINK-'||other_quote::text,'draft',10000,10000);
 insert into public.quote_line_items(quote_id,name,quantity,unit_price_cents,total_cents)values(quote,'Synthetic quote work',1,10000,10000);
 financial:=jsonb_build_object('quote',(select to_jsonb(i)from public.quotes i where id=quote),'lines',(select jsonb_agg(to_jsonb(l)order by id)from public.quote_line_items l where quote_id=quote),'jobs',(select jsonb_agg(to_jsonb(j)order by id)from public.jobs j where source_quote_id=quote));
 for routine in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('get_quote_link_state','get_quote_link_request','manage_quote_portal_link')loop
  perform pg_temp.quotelink_check(has_function_privilege('authenticated',routine,'EXECUTE')and not has_function_privilege('anon',routine,'EXECUTE')and not has_function_privilege('service_role',routine,'EXECUTE'),'authenticated admin command only: '||routine::text);
 end loop;
 perform pg_temp.quotelink_check(not has_table_privilege('authenticated','app_private.quote_link_requests','SELECT')and(select relrowsecurity from pg_class where oid='app_private.quote_link_requests'::regclass),'receipt ledger private and RLS protected');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);insert into public.quote_portal_tokens(quote_id,customer_id,token_hash)values(quote,customer,repeat('f',64));raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check(not exists(select 1 from public.quote_portal_tokens where quote_id=quote),'direct authenticated insertion denied');
 perform set_config('role','authenticated',true);state:=public.get_quote_link_state(quote);again:=public.get_quote_link_request(gen_random_uuid(),quote,state->>'link_version','generate');perform set_config('role','none',true);version:=state->>'link_version';
 perform pg_temp.quotelink_check(version~'^[a-f0-9]{64}$'and jsonb_array_length(state->'tokens')=0 and again is null,'empty state exposes reviewed version without mutation');
 foreach failure in array array['audit','receipt']loop
  req:=gen_random_uuid();candidate:=pg_temp.quotelink_candidate();perform set_config('ats_test.quotelink_fail',failure,true);
  begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(req,quote,version,'generate',null,candidate);raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.quotelink_fail','',true);
  perform pg_temp.quotelink_check(not exists(select 1 from public.quote_portal_tokens where quote_id=quote)and not exists(select 1 from app_private.quote_link_requests where request_id=req)and not exists(select 1 from public.activity_log where subject_id=quote),'late '||failure||' failure rolls back capability history and receipt');
 end loop;
 generate_req:=gen_random_uuid();generate_version:=version;candidate:=pg_temp.quotelink_candidate();perform set_config('role','authenticated',true);r:=public.manage_quote_portal_link(generate_req,quote,version,'generate',null,candidate);again:=public.get_quote_link_request(generate_req,quote,version,'generate');perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.quotelink_check(r->>'outcome'='created'and r->>'token_available'='true'and(select count(*)=1 from public.quote_portal_tokens where quote_id=quote),'generate creates exactly one capability');
 perform pg_temp.quotelink_check((select receipt::text not like '%'||(candidate->>'token_encrypted')||'%'and not receipt?'token_hash'from app_private.quote_link_requests where request_id=generate_req),'durable receipt has no capability ciphertext or hash');
 perform pg_temp.quotelink_check(again->>'replayed'='true'and again->>'token_id'=token::text and again->>'token_encrypted'=candidate->>'token_encrypted','lost acknowledgement recovers original capability');
 perform set_config('role','authenticated',true);again:=public.manage_quote_portal_link(generate_req,quote,generate_version,'generate',null,pg_temp.quotelink_candidate());perform set_config('role','none',true);
 perform pg_temp.quotelink_check(again->>'token_id'=token::text and(select count(*)=1 from public.quote_portal_tokens where quote_id=quote),'same request ignores newly generated candidate');
 perform set_config('role','authenticated',true);again:=public.manage_quote_portal_link(gen_random_uuid(),quote,version,'generate');perform set_config('role','none',true);
 perform pg_temp.quotelink_check(again->>'outcome'='reused'and again->>'token_id'=token::text and(select expires_at=(candidate->>'expires_at')::timestamptz from public.quote_portal_tokens where id=token),'ordinary generate reuses link without extending lifetime');
 begin perform set_config('role','authenticated',true);update public.quote_portal_tokens set revoked_at=now()where id=token;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select revoked_at is null from public.quote_portal_tokens where id=token),'direct authenticated revocation denied');
 begin perform set_config('role','authenticated',true);delete from public.quote_portal_tokens where id=token;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check(exists(select 1 from public.quote_portal_tokens where id=token),'direct authenticated deletion cannot erase history');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);update public.quote_portal_tokens set used_at=clock_timestamp()where id=token;perform set_config('role','none',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_quote_link_state(quote);perform set_config('role','none',true);
 perform pg_temp.quotelink_check(state->>'link_version'=version and(select used_at is not null from public.quote_portal_tokens where id=token),'service view telemetry preserved without invalidating review');
 update public.quotes set first_viewed_at=clock_timestamp(),last_viewed_at=clock_timestamp(),view_count=view_count+1 where id=quote;
 perform pg_temp.quotelink_check(app_private.quote_link_version(quote)=version,'quote engagement telemetry does not invalidate loaded authority');
 alter table public.quotes disable trigger user;
 update public.quotes set first_viewed_at=null,last_viewed_at=null,view_count=0,updated_at=(financial->'quote'->>'updated_at')::timestamptz where id=quote;
 alter table public.quotes enable trigger user;
 old_token:=token;regen_req:=gen_random_uuid();regen_version:=version;candidate:=pg_temp.quotelink_candidate();
 perform set_config('role','authenticated',true);r:=public.manage_quote_portal_link(regen_req,quote,version,'regenerate',null,candidate);perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.quotelink_check(r->>'outcome'='regenerated'and(r->>'revoked_count')::integer=1 and token<>old_token and(select revoked_at is not null from public.quote_portal_tokens where id=old_token)and(select count(*)=1 from public.quote_portal_tokens where quote_id=quote and revoked_at is null),'regeneration revokes prior and creates one replacement atomically');
 begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),quote,regen_version,'revoke',token);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select revoked_at is null from public.quote_portal_tokens where id=token),'stale link review rejects revocation after regeneration');
 perform set_config('role','authenticated',true);again:=public.get_quote_link_request(generate_req,quote,generate_version,'generate');perform set_config('role','none',true);
 perform pg_temp.quotelink_check(again->>'token_available'='false'and again->>'token_encrypted'is null and again->>'token_hash'is null,'superseded retry exposes no obsolete capability');
 foreach failure in array array['audit','receipt']loop
  perform set_config('ats_test.quotelink_fail',failure,true);req:=gen_random_uuid();
  begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(req,quote,version,'regenerate',null,pg_temp.quotelink_candidate());raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.quotelink_fail','',true);
  perform pg_temp.quotelink_check((select count(*)=2 from public.quote_portal_tokens where quote_id=quote)and(select revoked_at is null from public.quote_portal_tokens where id=token)and not exists(select 1 from app_private.quote_link_requests where request_id=req),'late regeneration '||failure||' failure retains original current capability');
 end loop;
 begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),other_quote,app_private.quote_link_version(other_quote),'revoke',token);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 -- Evaluate the other quote version as trusted fixture setup, not in the API role.
 state:=jsonb_build_object('link_version',app_private.quote_link_version(other_quote));
 begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),other_quote,state->>'link_version','revoke',token);raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select revoked_at is null from public.quote_portal_tokens where id=token),'per-link revoke cannot target another quote');
 revoke_req:=gen_random_uuid();revoke_version:=version;perform set_config('role','authenticated',true);r:=public.manage_quote_portal_link(revoke_req,quote,version,'revoke',token);again:=public.manage_quote_portal_link(revoke_req,quote,version,'revoke',token);perform set_config('role','none',true);version:=r->>'current_link_version';
 perform pg_temp.quotelink_check(r->>'outcome'='revoked'and r->>'token_available'='false'and again->>'replayed'='true'and(select count(*)=1 from public.activity_log where subject_id=quote and event_type='quote_portal_link_revoked'),'revoke needs no candidate and retries keep one audit');
 perform set_config('role','authenticated',true);again:=public.get_quote_link_request(regen_req,quote,regen_version,'regenerate');r:=public.manage_quote_portal_link(gen_random_uuid(),quote,version,'generate',null,pg_temp.quotelink_candidate());perform set_config('role','none',true);old_token:=token;token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.quotelink_check(again->>'token_available'='false'and again->>'token_encrypted'is null,'recovered regeneration cannot expose later revoked link');
 perform set_config('role','authenticated',true);again:=public.get_quote_link_request(revoke_req,quote,revoke_version,'revoke',old_token);perform set_config('role','none',true);
 perform pg_temp.quotelink_check(again->>'replayed'='true'and(select revoked_at is null from public.quote_portal_tokens where id=token),'replaying older revoke never disables a later link');
 before_state:=(select to_jsonb(i)from public.quotes i where id=quote);update public.quotes set expires_at=clock_timestamp()+interval '7 days'where id=quote;
 begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),quote,version,'revoke',token);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select revoked_at is null from public.quote_portal_tokens where id=token),'quote edit invalidates loaded link-action version');
 -- Restore only this synthetic fixture's deliberate edit and revision bookkeeping.
 alter table public.quotes disable trigger user;
 update public.quotes set expires_at=(before_state->>'expires_at')::timestamptz,updated_at=(before_state->>'updated_at')::timestamptz,edit_revision=(before_state->>'edit_revision')::integer,last_edited_at=(before_state->>'last_edited_at')::timestamptz,last_edited_by_user_id=(before_state->>'last_edited_by_user_id')::uuid where id=quote;
 alter table public.quotes enable trigger user;
 perform pg_temp.quotelink_check(financial=jsonb_build_object('quote',(select to_jsonb(i)from public.quotes i where id=quote),'lines',(select jsonb_agg(to_jsonb(l)order by id)from public.quote_line_items l where quote_id=quote),'jobs',(select jsonb_agg(to_jsonb(j)order by id)from public.jobs j where source_quote_id=quote)),'all link operations preserve quote totals status lines payments and checkout');
 foreach closed in array array['declined','expired','cancelled']loop
  old_token:=gen_random_uuid();insert into public.quotes(id,customer_id,quote_number,status,subtotal_cents,total_cents)values(old_token,customer,'QUOTELINK-'||old_token::text,closed,10000,10000);version:=app_private.quote_link_version(old_token);
  perform set_config('role','authenticated',true);r:=public.manage_quote_portal_link(gen_random_uuid(),old_token,version,'generate',null,pg_temp.quotelink_candidate());perform set_config('role','none',true);
  perform pg_temp.quotelink_check(r->>'token_available'='true'and(select status=closed from public.quotes where id=old_token),'historical closed quote remains shareable without reopening: '||closed);
 end loop;
 insert into public.organizations(id,name)values(org,'Synthetic quote organization');insert into public.quotes(id,organization_id,quote_number,status,subtotal_cents,total_cents)values(org_quote,org,'QUOTELINK-'||org_quote::text,'draft',10000,10000);version:=app_private.quote_link_version(org_quote);req:=gen_random_uuid();
 perform set_config('role','authenticated',true);r:=public.manage_quote_portal_link(req,org_quote,version,'generate',null,pg_temp.quotelink_candidate());perform set_config('role','none',true);token:=(r->>'token_id')::uuid;
 perform pg_temp.quotelink_check((select customer_id is null and organization_id=org from public.quote_portal_tokens where id=token),'organization contracting party copied canonically');
 update public.quote_portal_tokens set organization_id=null,customer_id=customer where id=token;
 perform set_config('role','authenticated',true);state:=public.get_quote_link_state(org_quote);again:=public.get_quote_link_request(req,org_quote,version,'generate');perform set_config('role','none',true);
 perform pg_temp.quotelink_check(state->'tokens'->0->>'usable'='false'and again->>'token_available'='false'and again->>'token_encrypted'is null,'mismatched contracting party is never shareable or recoverable');
 version:=app_private.quote_link_version(org_quote);
 begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),org_quote,version,'generate');raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select revoked_at is null from public.quote_portal_tokens where id=token),'generate never silently replaces wrong-party link');
 version:=app_private.quote_link_version(quote);
 foreach failure in array array['hash','expiry']loop
  candidate:=pg_temp.quotelink_candidate();if failure='hash'then candidate:=jsonb_set(candidate,'{token_hash}','"bad"');else candidate:=jsonb_set(candidate,'{expires_at}',to_jsonb(clock_timestamp()-interval '1 minute'));end if;
  begin perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),quote,version,'regenerate',null,candidate);raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
  perform pg_temp.quotelink_check((select count(*)=1 from public.quote_portal_tokens where quote_id=quote and revoked_at is null),'invalid replacement '||failure||' cannot revoke the active capability');
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_quote_link_state(quote);perform set_config('role','none',true);
 perform pg_temp.quotelink_check(state is not null,'active admin retains quote link access');
 begin perform set_config('role','authenticated',true);perform public.get_quote_link_request(generate_req,quote,generate_version,'generate');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select actor_user_id=owner_id from app_private.quote_link_requests where request_id=generate_req),'other administrator cannot adopt request identity');
 foreach owner_id in array array[crew]loop
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
  begin perform set_config('role','authenticated',true);perform public.get_quote_link_state(quote);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
  perform pg_temp.quotelink_check(not app_private.has_staff_role(),'estimator or crew cannot manage quote links');
 end loop;
 owner_id:=(select actor_user_id from app_private.quote_link_requests where request_id=generate_req);perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);update public.profiles set status='disabled'where id=owner_id;
 begin perform set_config('role','authenticated',true);perform public.get_quote_link_request(generate_req,quote,generate_version,'generate');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check((select count(*)=1 from app_private.quote_link_requests where request_id=generate_req),'offboarded owner denied on receipt recovery');update public.profiles set status='active'where id=owner_id;
 -- Legacy quote email helper can only create/reuse under the same transaction locks.
 candidate:=pg_temp.quotelink_candidate();perform set_config('role','authenticated',true);select to_jsonb(x)into r from public.create_or_get_quote_portal_token(quote,candidate->>'token_hash',candidate->>'token_hint',candidate->>'token_encrypted',(candidate->>'expires_at')::timestamptz)x;perform set_config('role','none',true);
 perform pg_temp.quotelink_check(r->>'created'='false'and(select count(*)=1 from public.quote_portal_tokens where quote_id=quote and revoked_at is null),'legacy email generation reuses current capability and cannot rotate it');


 -- A current token for a different contracting party must fail at both customer response boundaries.
 candidate:=(select jsonb_build_object('hash',token_hash)from public.quote_portal_tokens where id=token);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
 begin perform public.approve_quote_by_portal(candidate->>'hash',1);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;
 begin perform public.request_quote_changes_by_portal(gen_random_uuid(),candidate->>'hash',1,'Synthetic request');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;
 perform set_config('role','none',true);
 perform pg_temp.quotelink_check(not exists(select 1 from app_private.quote_change_requests where quote_id=org_quote)and(select status='draft'from public.quotes where id=org_quote),'wrong-party token denied by approval and change-request transactions');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 -- Staff estimator access remains supported; crew must stay denied.
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);state:=public.get_quote_link_state(quote);perform set_config('role','none',true);
 perform pg_temp.quotelink_check(state is not null,'estimator retains quote link access');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 -- One batch, two quotes for the same customer. Later errors roll back earlier replacements.
 update public.quotes set customer_id=customer where id=other_quote;
 version:=app_private.quote_link_version(quote);regen_version:=app_private.quote_link_version(other_quote);req:=gen_random_uuid();
 before_state:=jsonb_build_object('tokens',(select jsonb_agg(to_jsonb(t)order by id)from public.quote_portal_tokens t where quote_id in(quote,other_quote)),'receipts',(select count(*)from app_private.quote_link_requests),'audit',(select count(*)from public.activity_log));
 begin perform set_config('role','authenticated',true);r:=public.recover_quote_portal_links(req,jsonb_build_array(jsonb_build_object('id',quote,'version',version,'intent','regenerate','candidate',case when quote>other_quote then jsonb_build_object('token_hash','bad')else pg_temp.quotelink_candidate()end),jsonb_build_object('id',other_quote,'version',regen_version,'intent','regenerate','candidate',case when other_quote>quote then jsonb_build_object('token_hash','bad')else pg_temp.quotelink_candidate()end)));raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check(before_state=jsonb_build_object('tokens',(select jsonb_agg(to_jsonb(t)order by id)from public.quote_portal_tokens t where quote_id in(quote,other_quote)),'receipts',(select count(*)from app_private.quote_link_requests),'audit',(select count(*)from public.activity_log))and not exists(select 1 from app_private.quote_link_batches where request_id=req),'later batch candidate failure rolls back all tokens audits and receipts');
 state:=jsonb_build_array(jsonb_build_object('id',quote,'version',version,'intent','regenerate','candidate',pg_temp.quotelink_candidate()),jsonb_build_object('id',other_quote,'version',regen_version,'intent','regenerate','candidate',pg_temp.quotelink_candidate()));
 perform set_config('ats_test.quotelink_fail','batch',true);
 begin perform set_config('role','authenticated',true);perform public.recover_quote_portal_links(req,state);raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.quotelink_fail','',true);
 perform pg_temp.quotelink_check(before_state=jsonb_build_object('tokens',(select jsonb_agg(to_jsonb(t)order by id)from public.quote_portal_tokens t where quote_id in(quote,other_quote)),'receipts',(select count(*)from app_private.quote_link_requests),'audit',(select count(*)from public.activity_log))and not exists(select 1 from app_private.quote_link_batches where request_id=req),'final batch receipt failure rolls back all successful child replacements');
 perform set_config('role','authenticated',true);r:=public.recover_quote_portal_links(req,state);again:=public.get_quote_link_batch_request(req,state);perform set_config('role','none',true);
 perform pg_temp.quotelink_check(jsonb_array_length(r->'results')=2 and again->>'replayed'='true'and(select count(*)=2 from public.quote_portal_tokens where quote_id in(quote,other_quote)and revoked_at is null),'batch creates one current capability per quote and recovers without new writes');
 perform pg_temp.quotelink_check((select not(receipt::text~'token_encrypted|token_hash|https://')from app_private.quote_link_batches where request_id=req),'batch receipt contains only opaque identities');
 begin perform set_config('role','authenticated',true);perform public.get_quote_link_batch_request(req,jsonb_build_array(jsonb_build_object('id',quote,'version',version)));raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check(jsonb_array_length(r->'results')=2,'batch retry cannot silently change selection');
 perform set_config('role','authenticated',true);perform public.manage_quote_portal_link(gen_random_uuid(),quote,r->'results'->(case when r->'results'->0->>'id'=quote::text then 0 else 1 end)->>'current_link_version','regenerate',null,pg_temp.quotelink_candidate());again:=public.get_quote_link_batch_request(req,state);perform set_config('role','none',true);
 perform pg_temp.quotelink_check(exists(select 1 from jsonb_array_elements(again->'results')x where x->>'id'=quote::text and x->>'token_available'='false'and x->>'token_encrypted'is null),'batch recovery cannot expose superseded quote capability');
 update public.quotes set customer_id=other_customer where id=other_quote;version:=app_private.quote_link_version(quote);regen_version:=app_private.quote_link_version(other_quote);
 begin perform set_config('role','authenticated',true);perform public.recover_quote_portal_links(gen_random_uuid(),jsonb_build_array(jsonb_build_object('id',quote,'version',version,'intent','regenerate','candidate',pg_temp.quotelink_candidate()),jsonb_build_object('id',other_quote,'version',regen_version,'intent','regenerate','candidate',pg_temp.quotelink_candidate())));raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.quotelink_check(true,'mixed customer batch denied');
 perform pg_temp.quotelink_check(not has_table_privilege('authenticated','app_private.quote_link_batches','SELECT')and(select relrowsecurity from pg_class where oid='app_private.quote_link_batches'::regclass),'batch ledger private RLS');
 perform pg_temp.quotelink_check(not exists(select 1 from public.customer_communications where customer_id in(customer,other_customer))and not exists(select 1 from app_private.outbound_deliveries where context->>'quote_id'in(quote::text,other_quote::text)),'link actions do not queue or send customer emails');
end $test$;
select count(*)as passed_assertions from pg_temp.quotelink_assertions;
rollback;
