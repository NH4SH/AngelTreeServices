-- Synthetic only; transaction and injected failures always roll back. Never run on production.
begin;
set local lock_timeout='3s';set local statement_timeout='40s';
create temporary table cocopy_assertions(label text);
create function pg_temp.cocopy_check(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Copy assertion failed: %',label;end if;insert into pg_temp.cocopy_assertions values(label);end $$;
create function pg_temp.cocopy_fail_audit() returns trigger language plpgsql as $$begin
 if new.event_type='change_order_duplicated' and current_setting('ats_test.copy_fail',true)='audit' then raise exception 'Synthetic late audit failure' using errcode='ZX002';end if;return new;end $$;
create trigger cocopy_synthetic_audit before insert on public.activity_log for each row execute function pg_temp.cocopy_fail_audit();
do $test$
<<fixture>>
declare owner_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();other_owner uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();
 customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();job uuid:=gen_random_uuid();source_id uuid:=gen_random_uuid();source_line uuid:=gen_random_uuid();
 req uuid:=gen_random_uuid();rev integer;target_id uuid;r jsonb;again jsonb;snap jsonb;line_snap jsonb;n integer;status_name text;closed_id uuid;quote_id uuid:=gen_random_uuid();
 org uuid:=gen_random_uuid();orgloc uuid:=gen_random_uuid();orgjob uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();inactive uuid:=gen_random_uuid();orgsource uuid:=gen_random_uuid();
begin
 insert into public.roles(name)values('owner'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'cocopy-'||v||'@example.invalid','{}' from unnest(array[owner_id,estimator,other_owner,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,estimator,other_owner,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic copy operator',true,'active'from unnest(array[owner_id,estimator,other_owner,crew])v;
 insert into public.user_roles(user_id,role_id)select v,r.id from unnest(array[owner_id,other_owner])v cross join public.roles r where r.name='owner';
 insert into public.user_roles(user_id,role_id)select estimator,id from public.roles where name='estimator';
 insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic copy customer','cocopy-'||customer||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,customer,location,'accepted','other','Synthetic copy scope');
 insert into public.change_orders(id,change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,reason,customer_description,customer_notes,internal_notes,status,subtotal_cents,tax_cents,fee_cents,total_cents,original_approved_amount_cents,schedule_impact,expires_at)
 values(source_id,'',job,customer,location,owner_id,'Synthetic original','Synthetic reason',E'Tree scope\n- Keep this formatting','Customer-visible note','Private office note','sent',15000,200,300,15500,50000,'{"equipment":true}',now()+interval '1 day');
 insert into public.change_order_line_items(id,change_order_id,title,description,quantity,unit,unit_price_cents,amount_cents,internal_cost_estimate_cents,sort_order)
 values(source_line,source_id,'Prune tree',E'Keep this\nline',1,'tree',10000,10000,4000,0),(gen_random_uuid(),source_id,'Remove debris',null,2,'load',2500,5000,1500,1);
 insert into public.change_order_portal_tokens(change_order_id,customer_id,token_hash,expires_at)values(source_id,customer,encode(sha256(convert_to(source_id::text,'UTF8')),'hex'),now()+interval '1 day');
 select edit_revision,to_jsonb(c) into rev,snap from public.change_orders c where id=source_id;
 select jsonb_agg(to_jsonb(l)-array['id','change_order_id','created_at','updated_at']order by sort_order,title)into line_snap from public.change_order_line_items l where change_order_id=source_id;
 perform pg_temp.cocopy_check(not has_function_privilege('anon','public.copy_change_order_draft(uuid,uuid,integer)','EXECUTE'),'anonymous copy denied');
 perform pg_temp.cocopy_check(not has_function_privilege('service_role','public.copy_change_order_draft(uuid,uuid,integer)','EXECUTE'),'service role cannot impersonate office staff');
 perform pg_temp.cocopy_check(has_function_privilege('authenticated','public.copy_change_order_draft(uuid,uuid,integer)','EXECUTE'),'authenticated command available');
 perform pg_temp.cocopy_check(not has_table_privilege('authenticated','app_private.change_order_copy_requests','SELECT'),'copy receipts private');
 perform pg_temp.cocopy_check((select relrowsecurity from pg_class where oid='app_private.change_order_copy_requests'::regclass),'receipt RLS enabled');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);
 r:=public.copy_change_order_draft(req,source_id,rev);again:=public.copy_change_order_draft(req,source_id,rev);perform set_config('role','none',true);
 target_id:=(r->>'id')::uuid;
 perform pg_temp.cocopy_check(target_id<>source_id and r->>'replayed'='false'and again->>'replayed'='true'and again->>'id'=target_id::text,'retry reuses the same fresh draft');
 perform pg_temp.cocopy_check((select title='Copy of Synthetic original'and customer_id=customer and job_id=job and service_location_id=location and created_by_user_id=estimator from public.change_orders where id=target_id),'title party property creator preserved');
 perform pg_temp.cocopy_check((select subtotal_cents=15000 and tax_cents=200 and fee_cents=300 and total_cents=15500 and original_approved_amount_cents=50000 from public.change_orders where id=target_id),'all amounts preserved');
 perform pg_temp.cocopy_check(line_snap=(select jsonb_agg(to_jsonb(l)-array['id','change_order_id','created_at','updated_at']order by sort_order,title)from public.change_order_line_items l where change_order_id=target_id),'every line and hidden cost preserved without client input');
 perform pg_temp.cocopy_check(not exists(select 1 from public.change_order_line_items a join public.change_order_line_items b on a.id=b.id where a.change_order_id=source_id and b.change_order_id=target_id),'copied lines have fresh IDs');
 perform pg_temp.cocopy_check((select status='draft'and approved_at is null and sent_at is null and invoice_id is null and source_closeout_id is null and expires_at is null and internally_reviewed_at is null and approval_method is null from public.change_orders where id=target_id),'copy starts with fresh approval delivery billing and expiry');
 perform pg_temp.cocopy_check((select customer_description=E'Tree scope\n- Keep this formatting'and internal_notes='Private office note'and schedule_impact='{"equipment":true}'from public.change_orders where id=target_id),'notes formatting and coordination retained');
 perform pg_temp.cocopy_check((select count(*)=1 from public.activity_log where subject_id=target_id and event_type='change_order_duplicated'),'one duplication audit');
 perform pg_temp.cocopy_check((select count(*)=1 from app_private.change_order_copy_requests where request_id=req),'one private receipt');
 perform pg_temp.cocopy_check(not exists(select 1 from public.change_order_portal_tokens where change_order_id=target_id)and not exists(select 1 from public.job_change_order_scope_items where change_order_id=target_id)and not exists(select 1 from public.invoice_line_items i join public.change_order_line_items l on l.id=i.source_change_order_line_item_id where l.change_order_id=target_id),'no customer link scope or invoice copied');
 perform pg_temp.cocopy_check(not(r?'internal_notes')and not(r?'internal_cost_estimate_cents')and not(r?'lines'),'receipt exposes no notes costs or line contents');
 perform pg_temp.cocopy_check(snap=(select to_jsonb(c)from public.change_orders c where id=source_id),'source header unchanged');
 -- Lost acknowledgement recovery survives later source and target edits.
 perform set_config('request.jwt.claims','{}',true);update public.change_orders set title='Later source'where id=source_id;update public.change_orders set title='Later target',status='cancelled'where id=target_id;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);
 again:=public.copy_change_order_draft(req,source_id,rev);perform set_config('role','none',true);
 perform pg_temp.cocopy_check(again->>'id'=target_id::text and again->>'current_status'='cancelled'and(again->>'current_revision')::integer>(r->>'edit_revision')::integer,'replay opens the existing changed target');
 perform pg_temp.cocopy_check((select title='Later target'from public.change_orders where id=target_id),'replay never overwrites target');
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(req,source_id,rev+1);raise exception using errcode='ZX001';exception when sqlstate '22023'then null;end;perform set_config('role','none',true);
 perform pg_temp.cocopy_check((select count(*)=1 from app_private.change_order_copy_requests where request_id=req),'revision collision rejected');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',other_owner)::text,true);
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(req,source_id,rev);raise exception using errcode='ZX001';exception when sqlstate '22023'then null;end;perform set_config('role','none',true);
 perform pg_temp.cocopy_check((select actor_user_id=estimator from app_private.change_order_copy_requests where request_id=req),'another actor cannot claim receipt');
 select count(*)into n from public.change_orders;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(gen_random_uuid(),source_id,rev);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.cocopy_check((select count(*)=n from public.change_orders),'changed source creates no draft');
 select edit_revision into rev from public.change_orders where id=source_id;
 -- Audit failure occurs after header and lines; all must roll back.
 perform set_config('ats_test.copy_fail','audit',true);
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(gen_random_uuid(),source_id,rev);raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.copy_fail','',true);
 perform pg_temp.cocopy_check((select count(*)=n from public.change_orders),'late audit failure leaves no orphan header');
 perform pg_temp.cocopy_check((select count(*)=4 from public.change_order_line_items where change_order_id in(source_id,target_id)),'late audit failure leaves no partial lines');
 perform pg_temp.cocopy_check((select count(*)=1 from app_private.change_order_copy_requests cr where cr.source_id=fixture.source_id),'late failure leaves no receipt');
 -- Historical states remain copyable, without carrying approval authority forward.
 foreach status_name in array array['approved','declined','cancelled','expired']loop
  perform set_config('request.jwt.claims','{}',true);update public.change_orders set status=status_name,approved_at=case when status_name='approved'then now()else null end where id=source_id;
  select edit_revision into rev from public.change_orders where id=source_id;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);
  again:=public.copy_change_order_draft(gen_random_uuid(),source_id,rev);perform set_config('role','none',true);
  perform pg_temp.cocopy_check((select status='draft'and approved_at is null from public.change_orders where id=(again->>'id')::uuid),'closed source creates a draft: '||status_name);
 end loop;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',crew,'user_metadata',jsonb_build_object('role','owner'))::text,true);
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(gen_random_uuid(),source_id,rev);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.cocopy_check(not exists(select 1 from app_private.change_order_copy_requests where actor_user_id=crew),'crew and forged metadata cannot copy');
 update public.profiles set status='disabled'where id=estimator;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(req,source_id,(r->>'source_revision')::integer);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.cocopy_check((select count(*)=1 from public.activity_log where subject_id=target_id and event_type='change_order_duplicated'),'offboarded old session denied even on replay');
 -- Deleting a target retains the request tombstone, so a retry cannot resurrect it.
 perform set_config('request.jwt.claims','{}',true);delete from public.change_orders where id=target_id;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 -- First actor must still be used to test the tombstone, after restoring access.
 update public.profiles set status='active'where id=estimator;perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);
 begin perform set_config('role','authenticated',true);perform public.copy_change_order_draft(req,source_id,(r->>'source_revision')::integer);raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.cocopy_check(exists(select 1 from app_private.change_order_copy_requests where request_id=req and change_order_id is null),'deleted copy cannot be recreated by retry');
 -- Preserve empty quote-only legacy drafts.
 perform set_config('request.jwt.claims','{}',true);
 insert into public.quotes(id,quote_number,customer_id,service_location_id,status,total_cents)values(quote_id,'',customer,location,'draft',0);
 insert into public.change_orders(id,change_order_number,source_quote_id,customer_id,service_location_id,created_by_user_id,title)values(gen_random_uuid(),'',quote_id,customer,location,owner_id,'Empty quote-only draft')returning id,edit_revision into closed_id,rev;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);
 again:=public.copy_change_order_draft(gen_random_uuid(),closed_id,rev);perform set_config('role','none',true);
 perform pg_temp.cocopy_check(again->>'job_id'is null and again->>'line_count'='0','empty quote-only legacy source remains copyable');
 -- Organization contact handling matches the existing copy action.
 perform set_config('request.jwt.claims','{}',true);
 insert into public.organizations(id,name)values(org,'Synthetic copy organization');
 insert into public.service_locations(id,organization_id,street,city,state)values(orgloc,org,'456 Synthetic Road','Fredericksburg','VA');
 insert into public.jobs(id,organization_id,service_location_id,status,service_type,requested_scope)values(orgjob,org,orgloc,'accepted','other','Synthetic organization copy');
 insert into public.organization_contacts(id,organization_id,full_name,is_active)values(contact,org,'Synthetic active contact',true),(inactive,org,'Synthetic inactive contact',false);
 insert into public.change_orders(id,change_order_number,job_id,organization_id,service_location_id,created_by_user_id,title,requested_by_contact_id,approval_contact_id)
 values(orgsource,'',orgjob,org,orgloc,owner_id,'Organization draft',contact,inactive)returning edit_revision into rev;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);
 again:=public.copy_change_order_draft(gen_random_uuid(),orgsource,rev);perform set_config('role','none',true);
 perform pg_temp.cocopy_check((select organization_id=org and requested_by_contact_id=contact and approval_contact_id is null from public.change_orders where id=(again->>'id')::uuid),'active org contact retained inactive contact cleared');
 perform pg_temp.cocopy_check(not exists(select 1 from public.email_events where related_change_order_id in(source_id,orgsource,closed_id)),'copy does not prepare or send customer communication');
end $test$;
select count(*)as passed_assertions from cocopy_assertions;
rollback;
