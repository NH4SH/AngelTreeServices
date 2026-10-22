-- Synthetic-only authority, atomicity and recovery proof. Always roll back.
begin;
set local lock_timeout='3s';set local statement_timeout='50s';
create temporary table invlink_assertions(label text);
create function pg_temp.invlink_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Invoice link assertion failed: %',label;end if;insert into pg_temp.invlink_assertions values(label);
end $$;
create function pg_temp.invlink_candidate()returns jsonb language sql as $$
 select jsonb_build_object('token_hash',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),'token_hint','ABC123',
  'token_encrypted','v1.'||repeat('A',16)||'.'||repeat('B',58)||'.'||repeat('C',22),'expires_at',clock_timestamp()+interval '1 day');
$$;
create function pg_temp.invlink_fail()returns trigger language plpgsql as $$begin
 if(current_setting('ats_test.invlink_fail',true)='audit'and tg_table_name='activity_log')or(current_setting('ats_test.invlink_fail',true)='receipt'and tg_table_name='invoice_link_requests')then
  raise exception 'Synthetic late invoice link transaction failure'using errcode='ZX002';end if;return new;
end $$;
create trigger invlink_fail_audit before insert on public.activity_log for each row execute function pg_temp.invlink_fail();
create trigger invlink_fail_receipt before insert on app_private.invoice_link_requests for each row execute function pg_temp.invlink_fail();
do $test$
declare owner_id uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();other_customer uuid:=gen_random_uuid();
 invoice uuid:=gen_random_uuid();other_invoice uuid:=gen_random_uuid();org uuid:=gen_random_uuid();org_invoice uuid:=gen_random_uuid();token uuid;old_token uuid;req uuid;generate_req uuid;regen_req uuid;revoke_req uuid;
 version text;generate_version text;regen_version text;revoke_version text;before_state jsonb;financial jsonb;r jsonb;again jsonb;state jsonb;candidate jsonb;routine regprocedure;failure text;closed text;
begin
 insert into public.roles(name)values('owner'),('admin'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'invlink-'||v||'@example.invalid','{}'from unnest(array[owner_id,admin_id,estimator,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,admin_id,estimator,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic invoice-link staff',true,'active'from unnest(array[owner_id,admin_id,estimator,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';insert into public.user_roles(user_id,role_id)select admin_id,id from public.roles where name='admin';insert into public.user_roles(user_id,role_id)select estimator,id from public.roles where name='estimator';insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic invoice customer','invlink-'||customer||'@example.invalid'),(other_customer,'Other synthetic invoice customer',null);
 insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents)values(invoice,customer,'INVLINK-'||invoice::text, 'sent',10000,10000),(other_invoice,other_customer,'INVLINK-'||other_invoice::text,'draft',10000,10000);
 insert into public.invoice_line_items(invoice_id,name,quantity,unit_price_cents,total_cents)values(invoice,'Synthetic invoice work',1,10000,10000);
 financial:=jsonb_build_object('invoice',(select to_jsonb(i)from public.invoices i where id=invoice),'lines',(select jsonb_agg(to_jsonb(l)order by id)from public.invoice_line_items l where invoice_id=invoice),'payments',(select jsonb_agg(to_jsonb(p)order by id)from public.payments p where invoice_id=invoice),'checkout',(select jsonb_agg(to_jsonb(c)order by id)from public.invoice_checkout_sessions c where invoice_id=invoice));
 for routine in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('get_invoice_link_state','get_invoice_link_request','manage_invoice_portal_link')loop
  perform pg_temp.invlink_check(has_function_privilege('authenticated',routine,'EXECUTE')and not has_function_privilege('anon',routine,'EXECUTE')and not has_function_privilege('service_role',routine,'EXECUTE'),'authenticated admin command only: '||routine::text);
 end loop;
 perform pg_temp.invlink_check(not has_table_privilege('authenticated','app_private.invoice_link_requests','SELECT')and(select relrowsecurity from pg_class where oid='app_private.invoice_link_requests'::regclass),'receipt ledger private and RLS protected');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);insert into public.invoice_portal_tokens(invoice_id,customer_id,token_hash)values(invoice,customer,repeat('f',64));raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check(not exists(select 1 from public.invoice_portal_tokens where invoice_id=invoice),'direct authenticated insertion denied');
 perform set_config('role','authenticated',true);state:=public.get_invoice_link_state(invoice);again:=public.get_invoice_link_request(gen_random_uuid(),invoice,state->>'link_version','generate');perform set_config('role','none',true);version:=state->>'link_version';
 perform pg_temp.invlink_check(version~'^[a-f0-9]{64}$'and jsonb_array_length(state->'tokens')=0 and again is null,'empty state exposes reviewed version without mutation');
 foreach failure in array array['audit','receipt']loop
  req:=gen_random_uuid();candidate:=pg_temp.invlink_candidate();perform set_config('ats_test.invlink_fail',failure,true);
  begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(req,invoice,version,'generate',null,candidate);raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.invlink_fail','',true);
  perform pg_temp.invlink_check(not exists(select 1 from public.invoice_portal_tokens where invoice_id=invoice)and not exists(select 1 from app_private.invoice_link_requests where request_id=req)and not exists(select 1 from public.activity_log where subject_id=invoice),'late '||failure||' failure rolls back capability history and receipt');
 end loop;
 generate_req:=gen_random_uuid();generate_version:=version;candidate:=pg_temp.invlink_candidate();perform set_config('role','authenticated',true);r:=public.manage_invoice_portal_link(generate_req,invoice,version,'generate',null,candidate);again:=public.get_invoice_link_request(generate_req,invoice,version,'generate');perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.invlink_check(r->>'outcome'='created'and r->>'token_available'='true'and(select count(*)=1 from public.invoice_portal_tokens where invoice_id=invoice),'generate creates exactly one capability');
 perform pg_temp.invlink_check((select receipt::text not like '%'||(candidate->>'token_encrypted')||'%'and not receipt?'token_hash'from app_private.invoice_link_requests where request_id=generate_req),'durable receipt has no capability ciphertext or hash');
 perform pg_temp.invlink_check(again->>'replayed'='true'and again->>'token_id'=token::text and again->>'token_encrypted'=candidate->>'token_encrypted','lost acknowledgement recovers original capability');
 perform set_config('role','authenticated',true);again:=public.manage_invoice_portal_link(generate_req,invoice,generate_version,'generate',null,pg_temp.invlink_candidate());perform set_config('role','none',true);
 perform pg_temp.invlink_check(again->>'token_id'=token::text and(select count(*)=1 from public.invoice_portal_tokens where invoice_id=invoice),'same request ignores newly generated candidate');
 perform set_config('role','authenticated',true);again:=public.manage_invoice_portal_link(gen_random_uuid(),invoice,version,'generate');perform set_config('role','none',true);
 perform pg_temp.invlink_check(again->>'outcome'='reused'and again->>'token_id'=token::text and(select expires_at=(candidate->>'expires_at')::timestamptz from public.invoice_portal_tokens where id=token),'ordinary generate reuses link without extending lifetime');
 begin perform set_config('role','authenticated',true);update public.invoice_portal_tokens set revoked_at=now()where id=token;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select revoked_at is null from public.invoice_portal_tokens where id=token),'direct authenticated revocation denied');
 begin perform set_config('role','authenticated',true);delete from public.invoice_portal_tokens where id=token;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check(exists(select 1 from public.invoice_portal_tokens where id=token),'direct authenticated deletion cannot erase history');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);update public.invoice_portal_tokens set viewed_at=clock_timestamp()where id=token;perform set_config('role','none',true);
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_invoice_link_state(invoice);perform set_config('role','none',true);
 perform pg_temp.invlink_check(state->>'link_version'=version and(select viewed_at is not null from public.invoice_portal_tokens where id=token),'service view telemetry preserved without invalidating review');
 old_token:=token;regen_req:=gen_random_uuid();regen_version:=version;candidate:=pg_temp.invlink_candidate();
 perform set_config('role','authenticated',true);r:=public.manage_invoice_portal_link(regen_req,invoice,version,'regenerate',null,candidate);perform set_config('role','none',true);token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.invlink_check(r->>'outcome'='regenerated'and(r->>'revoked_count')::integer=1 and token<>old_token and(select revoked_at is not null from public.invoice_portal_tokens where id=old_token)and(select count(*)=1 from public.invoice_portal_tokens where invoice_id=invoice and revoked_at is null),'regeneration revokes prior and creates one replacement atomically');
 begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(gen_random_uuid(),invoice,regen_version,'revoke',token);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select revoked_at is null from public.invoice_portal_tokens where id=token),'stale link review rejects revocation after regeneration');
 perform set_config('role','authenticated',true);again:=public.get_invoice_link_request(generate_req,invoice,generate_version,'generate');perform set_config('role','none',true);
 perform pg_temp.invlink_check(again->>'token_available'='false'and again->>'token_encrypted'is null and again->>'token_hash'is null,'superseded retry exposes no obsolete capability');
 foreach failure in array array['audit','receipt']loop
  perform set_config('ats_test.invlink_fail',failure,true);req:=gen_random_uuid();
  begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(req,invoice,version,'regenerate',null,pg_temp.invlink_candidate());raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.invlink_fail','',true);
  perform pg_temp.invlink_check((select count(*)=2 from public.invoice_portal_tokens where invoice_id=invoice)and(select revoked_at is null from public.invoice_portal_tokens where id=token)and not exists(select 1 from app_private.invoice_link_requests where request_id=req),'late regeneration '||failure||' failure retains original current capability');
 end loop;
 begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(gen_random_uuid(),other_invoice,app_private.invoice_link_version(other_invoice),'revoke',token);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 -- Evaluate the other invoice version as trusted fixture setup, not in the API role.
 state:=jsonb_build_object('link_version',app_private.invoice_link_version(other_invoice));
 begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(gen_random_uuid(),other_invoice,state->>'link_version','revoke',token);raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select revoked_at is null from public.invoice_portal_tokens where id=token),'per-link revoke cannot target another invoice');
 revoke_req:=gen_random_uuid();revoke_version:=version;perform set_config('role','authenticated',true);r:=public.manage_invoice_portal_link(revoke_req,invoice,version,'revoke',token);again:=public.manage_invoice_portal_link(revoke_req,invoice,version,'revoke',token);perform set_config('role','none',true);version:=r->>'current_link_version';
 perform pg_temp.invlink_check(r->>'outcome'='revoked'and r->>'token_available'='false'and again->>'replayed'='true'and(select count(*)=1 from public.activity_log where subject_id=invoice and event_type='invoice_portal_link_revoked'),'revoke needs no candidate and retries keep one audit');
 perform set_config('role','authenticated',true);again:=public.get_invoice_link_request(regen_req,invoice,regen_version,'regenerate');r:=public.manage_invoice_portal_link(gen_random_uuid(),invoice,version,'generate',null,pg_temp.invlink_candidate());perform set_config('role','none',true);old_token:=token;token:=(r->>'token_id')::uuid;version:=r->>'current_link_version';
 perform pg_temp.invlink_check(again->>'token_available'='false'and again->>'token_encrypted'is null,'recovered regeneration cannot expose later revoked link');
 perform set_config('role','authenticated',true);again:=public.get_invoice_link_request(revoke_req,invoice,revoke_version,'revoke',old_token);perform set_config('role','none',true);
 perform pg_temp.invlink_check(again->>'replayed'='true'and(select revoked_at is null from public.invoice_portal_tokens where id=token),'replaying older revoke never disables a later link');
 before_state:=(select to_jsonb(i)from public.invoices i where id=invoice);update public.invoices set due_at=clock_timestamp()+interval '7 days'where id=invoice;
 begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(gen_random_uuid(),invoice,version,'revoke',token);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select revoked_at is null from public.invoice_portal_tokens where id=token),'invoice edit invalidates loaded link-action version');
 update public.invoices set due_at=(before_state->>'due_at')::timestamptz,updated_at=(before_state->>'updated_at')::timestamptz where id=invoice;
 -- Restore bookkeeping explicitly after its trigger, for the financial invariance comparison.
 alter table public.invoices disable trigger invoices_set_updated_at;
 update public.invoices set updated_at=(before_state->>'updated_at')::timestamptz where id=invoice;
 alter table public.invoices enable trigger invoices_set_updated_at;
 perform pg_temp.invlink_check(financial=jsonb_build_object('invoice',(select to_jsonb(i)from public.invoices i where id=invoice),'lines',(select jsonb_agg(to_jsonb(l)order by id)from public.invoice_line_items l where invoice_id=invoice),'payments',(select jsonb_agg(to_jsonb(p)order by id)from public.payments p where invoice_id=invoice),'checkout',(select jsonb_agg(to_jsonb(c)order by id)from public.invoice_checkout_sessions c where invoice_id=invoice)),'all link operations preserve invoice totals status lines payments and checkout');
 foreach closed in array array['paid','void']loop
  other_invoice:=gen_random_uuid();insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents)values(other_invoice,other_customer,'INVLINK-'||other_invoice::text,case when closed='void'then 'draft'else closed end,10000,10000);
  if closed='void'then perform set_config('role','authenticated',true);r:=public.begin_invoice_void(other_invoice);perform public.finalize_invoice_void(other_invoice,(r->>'token')::uuid);perform set_config('role','none',true);end if;version:=app_private.invoice_link_version(other_invoice);
  perform set_config('role','authenticated',true);r:=public.manage_invoice_portal_link(gen_random_uuid(),other_invoice,version,'regenerate',null,pg_temp.invlink_candidate());perform set_config('role','none',true);
  perform pg_temp.invlink_check(r->>'token_available'='true'and(select status=closed from public.invoices where id=other_invoice),'closed historical invoice link management preserved: '||closed);
 end loop;
 insert into public.organizations(id,name)values(org,'Synthetic invoice organization');insert into public.invoices(id,organization_id,invoice_number,status,subtotal_cents,total_cents)values(org_invoice,org,'INVLINK-'||org_invoice::text,'draft',10000,10000);version:=app_private.invoice_link_version(org_invoice);req:=gen_random_uuid();
 perform set_config('role','authenticated',true);r:=public.manage_invoice_portal_link(req,org_invoice,version,'generate',null,pg_temp.invlink_candidate());perform set_config('role','none',true);token:=(r->>'token_id')::uuid;
 perform pg_temp.invlink_check((select customer_id is null and organization_id=org from public.invoice_portal_tokens where id=token),'organization contracting party copied canonically');
 update public.invoice_portal_tokens set organization_id=null,customer_id=customer where id=token;
 perform set_config('role','authenticated',true);state:=public.get_invoice_link_state(org_invoice);again:=public.get_invoice_link_request(req,org_invoice,version,'generate');perform set_config('role','none',true);
 perform pg_temp.invlink_check(state->'tokens'->0->>'usable'='false'and again->>'token_available'='false'and again->>'token_encrypted'is null,'mismatched contracting party is never shareable or recoverable');
 version:=app_private.invoice_link_version(org_invoice);
 begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(gen_random_uuid(),org_invoice,version,'generate');raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select revoked_at is null from public.invoice_portal_tokens where id=token),'generate never silently replaces wrong-party link');
 perform set_config('role','service_role',true);
 begin perform public.record_invoice_payment_preference((select token_hash from public.invoice_portal_tokens where id=token),'check_mail');raise exception using errcode='ZX001';exception when no_data_found then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select payment_preference is null from public.invoices where id=org_invoice),'wrong-party capability cannot change payment preference');
 version:=app_private.invoice_link_version(invoice);
 foreach failure in array array['hash','expiry']loop
  candidate:=pg_temp.invlink_candidate();if failure='hash'then candidate:=jsonb_set(candidate,'{token_hash}','"bad"');else candidate:=jsonb_set(candidate,'{expires_at}',to_jsonb(clock_timestamp()-interval '1 minute'));end if;
  begin perform set_config('role','authenticated',true);perform public.manage_invoice_portal_link(gen_random_uuid(),invoice,version,'regenerate',null,candidate);raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
  perform pg_temp.invlink_check((select count(*)=1 from public.invoice_portal_tokens where invoice_id=invoice and revoked_at is null),'invalid replacement '||failure||' cannot revoke the active capability');
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',admin_id)::text,true);perform set_config('role','authenticated',true);state:=public.get_invoice_link_state(invoice);perform set_config('role','none',true);
 perform pg_temp.invlink_check(state is not null,'active admin retains invoice link access');
 begin perform set_config('role','authenticated',true);perform public.get_invoice_link_request(generate_req,invoice,generate_version,'generate');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select actor_user_id=owner_id from app_private.invoice_link_requests where request_id=generate_req),'other administrator cannot adopt request identity');
 foreach owner_id in array array[estimator,crew]loop
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
  begin perform set_config('role','authenticated',true);perform public.get_invoice_link_state(invoice);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
  perform pg_temp.invlink_check(not app_private.has_platform_admin_role(),'estimator or crew cannot manage invoice links');
 end loop;
 owner_id:=(select actor_user_id from app_private.invoice_link_requests where request_id=generate_req);perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);update public.profiles set status='disabled'where id=owner_id;
 begin perform set_config('role','authenticated',true);perform public.get_invoice_link_request(generate_req,invoice,generate_version,'generate');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.invlink_check((select count(*)=1 from app_private.invoice_link_requests where request_id=generate_req),'offboarded owner denied on receipt recovery');update public.profiles set status='active'where id=owner_id;
 -- Legacy invoice email helper can only create/reuse under the same transaction locks.
 candidate:=pg_temp.invlink_candidate();perform set_config('role','authenticated',true);select to_jsonb(x)into r from public.create_or_get_invoice_portal_token(invoice,candidate->>'token_hash',candidate->>'token_hint',candidate->>'token_encrypted',(candidate->>'expires_at')::timestamptz)x;perform set_config('role','none',true);
 perform pg_temp.invlink_check(r->>'created'='false'and(select count(*)=1 from public.invoice_portal_tokens where invoice_id=invoice and revoked_at is null),'legacy email generation reuses current capability and cannot rotate it');
end $test$;
select count(*)as passed_assertions from pg_temp.invlink_assertions;
rollback;
