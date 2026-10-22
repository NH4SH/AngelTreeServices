-- Synthetic transactional verification. Always ROLLBACK. Never run on production.
begin;
set local lock_timeout='3s';set local statement_timeout='30s';
create temporary table co_assertions(label text);
create function pg_temp.co_check(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Change-order assertion failed: %',label;end if;
 insert into pg_temp.co_assertions values(label);end $$;
create function pg_temp.co_fixture(p_status text default 'sent') returns jsonb language plpgsql as $$
declare u uuid:=current_setting('test.co_actor')::uuid;c uuid:=gen_random_uuid();l uuid:=gen_random_uuid();j uuid:=gen_random_uuid();co uuid:=gen_random_uuid();t uuid:=gen_random_uuid();h text:=encode(sha256(convert_to(t::text,'UTF8')),'hex');
begin
 insert into public.customers(id,display_name,email) values(c,'Synthetic additional-work customer','co-'||c||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state) values(l,c,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope) values(j,c,l,'accepted','other','Synthetic additional work');
 insert into public.change_orders(id,change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,status,subtotal_cents,total_cents,internal_notes)
 values(co,'',j,c,l,u,'Synthetic tree work',p_status,10000,10000,'PRIVATE NOTE NOT FOR CUSTOMER');
 insert into public.change_order_line_items(change_order_id,title,description,quantity,unit_price_cents,amount_cents,sort_order) values(co,'Synthetic scope','Customer-visible description',1,10000,10000,0);
 insert into public.change_order_portal_tokens(id,change_order_id,customer_id,token_hash,expires_at) values(t,co,c,h,clock_timestamp()+interval '1 day');
 return jsonb_build_object('id',co,'token_id',t,'hash',h,'job_id',j,'customer_id',c);
end $$;
do $tests$
declare u uuid:=gen_random_uuid();f jsonb;doc jsonb;ack jsonb;again jsonb;request uuid;co uuid;v timestamptz;h text;n integer;s text;
 invoice uuid:=gen_random_uuid();org uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'co-owner-'||u||'@example.invalid','{}');
 update public.profiles set status='active' where id=u;
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status) values(u,'Synthetic additional-work owner',true,'active');
 perform set_config('test.co_actor',u::text,true);
 perform pg_temp.co_check(not has_function_privilege('anon','public.approve_change_order_by_portal(uuid,text,timestamptz,text,text)','EXECUTE'),'anonymous approval RPC denied');
 perform pg_temp.co_check(not has_function_privilege('authenticated','public.get_change_order_portal_review(text)','EXECUTE'),'customer lookup stays server only');
 perform pg_temp.co_check(not has_table_privilege('service_role','app_private.change_order_approval_requests','SELECT'),'approval receipts stay private');
 f:=pg_temp.co_fixture();co:=(f->>'id')::uuid;
 perform set_config('role','service_role',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 doc:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 perform pg_temp.co_check(doc->>'id'=co::text and doc->>'review_hash' ~ '^[a-f0-9]{64}$','one scoped snapshot includes reviewed digest');
 perform pg_temp.co_check(not(doc ? 'internal_notes') and not(doc ? 'created_by_user_id') and doc::text not like '%PRIVATE NOTE%' and doc::text not like '%@example.invalid%','customer projection excludes private fields and contact emails');
 v:=(doc->>'updated_at')::timestamptz;h:=doc->>'review_hash';request:=gen_random_uuid();
 perform set_config('role','service_role',true);
 ack:=public.approve_change_order_by_portal(request,f->>'hash',v,h,'Synthetic Owner');
 again:=public.approve_change_order_by_portal(request,f->>'hash',v,h,'Synthetic Owner');perform set_config('role','none',true);
 perform pg_temp.co_check(ack->>'replayed'='false' and again=ack||'{"replayed":true}'::jsonb,'lost acknowledgement returns original receipt');
 perform pg_temp.co_check((select count(*)=1 from public.job_change_order_scope_items where change_order_id=co),'scope copied once');
 perform pg_temp.co_check((select count(*)=1 from public.activity_log where subject_id=co and event_type='change_order_approved'),'one approval audit');
 perform pg_temp.co_check((select count(*)=1 from app_private.customer_source_events where source_key='change-order:'||co||':portal-approved'),'one durable notification source event');
 perform pg_temp.co_check((select used_at is not null from public.change_order_portal_tokens where id=(f->>'token_id')::uuid),'token usage commits with approval');
 perform pg_temp.co_check((select projected_value_cents=10000 from public.jobs where id=(f->>'job_id')::uuid),'existing projected-value calculation retained');
 begin perform set_config('role','service_role',true);perform public.approve_change_order_by_portal(request,f->>'hash',v,h,'Different name');raise exception using errcode='ZX001';
 exception when sqlstate '22023' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check((select approved_by_name='Synthetic Owner' from public.change_orders where id=co),'request collision cannot change recorded authorizer');
 begin perform set_config('role','service_role',true);update public.change_order_line_items set title='Racing late edit' where change_order_id=co;raise exception using errcode='ZX001';
 exception when sqlstate '23514' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check((select title='Synthetic scope' from public.change_order_line_items where change_order_id=co),'closed scope rejects a late line edit');
 begin perform set_config('role','service_role',true);update public.change_orders set title='Racing header edit' where id=co;raise exception using errcode='ZX001';
 exception when sqlstate '23514' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check((select title='Synthetic tree work' from public.change_orders where id=co),'closed scope rejects a late header edit');
 -- Existing idempotent staff/financial command remains callable and adds no scope.
 perform set_config('role','service_role',true);perform public.approve_change_order(co,'Synthetic Owner',null,'portal',null,null);perform set_config('role','none',true);
 perform pg_temp.co_check((select count(*)=1 from public.job_change_order_scope_items where change_order_id=co),'legacy approval remains idempotent');
 -- The existing office invoice-attachment command may still link approved work.
 insert into public.roles(name) values('owner') on conflict(name) do nothing;
 insert into public.user_roles(user_id,role_id) select u,id from public.roles where name='owner';
 insert into public.invoices(id,job_id,customer_id,status) values(invoice,(f->>'job_id')::uuid,(f->>'customer_id')::uuid,'draft');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',u)::text,true);
 perform set_config('role','authenticated',true);perform public.attach_approved_change_orders_to_invoice(invoice);perform set_config('role','none',true);
 perform pg_temp.co_check((select invoice_id=invoice from public.change_orders where id=co),'existing invoice attachment can link approved work');
 perform pg_temp.co_check((select count(*)=1 and sum(total_cents)=10000 from public.invoice_line_items where invoice_id=invoice),'existing invoice scope and price retained');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 for s in select unnest(array['draft','pending_internal_review','ready_to_send','change_requested','declined','cancelled','expired']) loop
  f:=pg_temp.co_fixture(s);co:=(f->>'id')::uuid;
  perform set_config('role','service_role',true);doc:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
  begin perform set_config('role','service_role',true);perform public.approve_change_order_by_portal(gen_random_uuid(),f->>'hash',(doc->>'updated_at')::timestamptz,doc->>'review_hash','Synthetic Owner');raise exception using errcode='ZX001';
  exception when sqlstate '23514' then null;end;perform set_config('role','none',true);
  perform pg_temp.co_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'non-response state stays closed: '||s);
 end loop;
 f:=pg_temp.co_fixture();co:=(f->>'id')::uuid;
 perform set_config('role','service_role',true);doc:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 -- Database-maintenance fixture changes a line without advancing the timestamp.
 update public.change_order_line_items set title='Revised source' where change_order_id=co;
 begin perform set_config('role','service_role',true);perform public.approve_change_order_by_portal(gen_random_uuid(),f->>'hash',(doc->>'updated_at')::timestamptz,doc->>'review_hash','Synthetic Owner');raise exception using errcode='ZX001';
 exception when sqlstate 'PT409' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'line-only change invalidates reviewed document even at the same timestamp');
 update public.change_order_line_items set amount_cents=20000 where change_order_id=co;
 perform set_config('role','service_role',true);again:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 begin perform set_config('role','service_role',true);perform public.approve_change_order_by_portal(gen_random_uuid(),f->>'hash',(again->>'updated_at')::timestamptz,again->>'review_hash','Synthetic Owner');raise exception using errcode='ZX001';
 exception when sqlstate 'PT409' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'partially saved header and line amounts cannot be approved');
 perform set_config('role','service_role',true);doc:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 update public.change_order_portal_tokens set revoked_at=clock_timestamp() where id=(f->>'token_id')::uuid;
 begin perform set_config('role','service_role',true);perform public.approve_change_order_by_portal(gen_random_uuid(),f->>'hash',(doc->>'updated_at')::timestamptz,doc->>'review_hash','Synthetic Owner');raise exception using errcode='ZX001';
 exception when sqlstate '42501' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'revocation after review prevents approval');
 perform set_config('role','service_role',true);again:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 perform pg_temp.co_check(again is null,'revoked link has no document');
 update public.change_order_portal_tokens set revoked_at=null,expires_at=clock_timestamp()-interval '1 second' where id=(f->>'token_id')::uuid;
 perform set_config('role','service_role',true);again:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 perform pg_temp.co_check(again is null,'expired link has no document');
 update public.change_order_portal_tokens set expires_at=clock_timestamp()+interval '1 day',customer_id=null where id=(f->>'token_id')::uuid;
 perform set_config('role','service_role',true);again:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 perform pg_temp.co_check(again is null,'foreign contracting-party link has no document');
 -- Organization capabilities remain bound to an active intended approver.
 insert into public.organizations(id,name) values(org,'Synthetic organization');
 insert into public.organization_contacts(id,organization_id,full_name) values(contact,org,'Synthetic organization approver');
 f:=pg_temp.co_fixture();co:=(f->>'id')::uuid;
 update public.service_locations set customer_id=null,organization_id=org where id=(select service_location_id from public.change_orders where id=co);
 update public.jobs set customer_id=null,organization_id=org where id=(f->>'job_id')::uuid;
 update public.change_orders set customer_id=null,organization_id=org,approval_contact_id=contact where id=co;
 update public.change_order_portal_tokens set customer_id=null,organization_id=org,intended_contact_id=contact where id=(f->>'token_id')::uuid;
 perform set_config('role','service_role',true);doc:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 perform pg_temp.co_check(doc->>'organization_id'=org::text and doc->'approval_contact'->>'full_name'='Synthetic organization approver','organization review uses intended approver');
 update public.organization_contacts set is_active=false where id=contact;
 perform set_config('role','service_role',true);again:=public.get_change_order_portal_review(f->>'hash');perform set_config('role','none',true);
 perform pg_temp.co_check(again is null,'inactive organization approver cannot read document');
 begin perform set_config('role','service_role',true);perform public.approve_change_order_by_portal(gen_random_uuid(),f->>'hash',(doc->>'updated_at')::timestamptz,doc->>'review_hash','Synthetic Approver');raise exception using errcode='ZX001';
 exception when sqlstate '42501' then null;end;perform set_config('role','none',true);
 perform pg_temp.co_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'inactive intended approver cannot approve reviewed document');
 perform pg_temp.co_check(not exists(select 1 from public.email_events e join public.change_orders c on c.id=e.related_change_order_id where c.created_by_user_id=u),'no customer/provider email sent');
end $tests$;
select count(*)::integer as passed_assertions from pg_temp.co_assertions;
rollback;
