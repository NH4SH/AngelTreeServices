-- Synthetic fixtures and injected failure; always rollback. Never run on production.
begin;
set local lock_timeout='3s';set local statement_timeout='40s';
create temporary table comanual_assertions(label text);
create function pg_temp.comanual_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Manual approval assertion failed: %',label;end if;insert into pg_temp.comanual_assertions values(label);end $$;
create function pg_temp.comanual_source(j uuid,c uuid,l uuid,u uuid)returns uuid language plpgsql as $$declare co uuid;begin
 insert into public.change_orders(change_order_number,job_id,customer_id,service_location_id,created_by_user_id,title,subtotal_cents,tax_cents,fee_cents,total_cents)
 values('',j,c,l,u,'Synthetic manual authorization',15000,200,300,15500)returning id into co;
 insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(co,'Synthetic authorized scope',1,15000,15000);return co;end $$;
create function pg_temp.comanual_fail_receipt()returns trigger language plpgsql as $$begin
 if current_setting('ats_test.manual_fail',true)='receipt'then raise exception 'Synthetic final receipt failure'using errcode='ZX002';end if;return new;end $$;
create trigger comanual_synthetic_failure before insert on app_private.change_order_manual_approval_requests for each row execute function pg_temp.comanual_fail_receipt();
do $test$
<<fixture>>
declare owner_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();crew uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 co uuid;other_co uuid;req uuid:=gen_random_uuid();rev integer;r jsonb;again jsonb;proof jsonb:='{"name":"Synthetic customer","method":"phone","notes":"Customer confirmed the scope and price by phone.","contact_id":null}';
 snap jsonb;job_snap jsonb;method text;closed text;org uuid:=gen_random_uuid();orgloc uuid:=gen_random_uuid();orgjob uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();orgco uuid;
begin
 insert into public.roles(name)values('owner'),('estimator'),('crew')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)select v,'comanual-'||v||'@example.invalid','{}'from unnest(array[owner_id,estimator,crew])v;
 update public.profiles set status='active'where id=any(array[owner_id,estimator,crew]);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)select v,'Synthetic manual approval staff',true,'active'from unnest(array[owner_id,estimator,crew])v;
 insert into public.user_roles(user_id,role_id)select owner_id,id from public.roles where name='owner';insert into public.user_roles(user_id,role_id)select estimator,id from public.roles where name='estimator';insert into public.user_roles(user_id,role_id)select crew,id from public.roles where name='crew';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic authorization customer','comanual-'||customer||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,customer,location,'accepted','other','Synthetic work');
 co:=pg_temp.comanual_source(job,customer,location,owner_id);select edit_revision into rev from public.change_orders where id=co;
 perform pg_temp.comanual_check(not has_function_privilege('anon','public.record_change_order_manual_approval(uuid,uuid,integer,jsonb)','EXECUTE'),'anonymous new command denied');
 perform pg_temp.comanual_check(not has_function_privilege('service_role','public.record_change_order_manual_approval(uuid,uuid,integer,jsonb)','EXECUTE'),'service cannot impersonate recording staff');
 perform pg_temp.comanual_check(not has_function_privilege('authenticated','public.approve_change_order(uuid,text,uuid,text,uuid,text)','EXECUTE'),'unversioned authenticated approval revoked');
 perform pg_temp.comanual_check(has_function_privilege('service_role','public.approve_change_order(uuid,text,uuid,text,uuid,text)','EXECUTE'),'service-only portal transaction retained');
 perform pg_temp.comanual_check(not has_table_privilege('authenticated','app_private.change_order_manual_approval_requests','SELECT')and(select relrowsecurity from pg_class where oid='app_private.change_order_manual_approval_requests'::regclass),'receipt private and RLS enabled');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);update public.change_orders set status='approved'where id=co;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select status='draft'from public.change_orders where id=co),'direct status approval denied');
 begin perform set_config('role','authenticated',true);update public.change_orders set approved_at=now(),approval_recorded_by_user_id=estimator where id=co;raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=co),'direct approval metadata and forged actor denied');
 begin perform set_config('role','authenticated',true);insert into public.change_orders(change_order_number,job_id,customer_id,created_by_user_id,title,status)values('',job,customer,owner_id,'Forged approved insert','approved');raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check(not exists(select 1 from public.change_orders where title='Forged approved insert'),'approved insert bypass denied');
 -- Editing can keep status unchanged; the reviewed version must still reject it.
 update public.change_orders set title='Changed while customer permission was recorded'where id=co;
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(req,co,rev,proof);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'stale manual review adds no work scope');
 perform pg_temp.comanual_check(not exists(select 1 from app_private.change_order_manual_approval_requests where request_id=req),'stale manual review creates no receipt');
 select edit_revision into rev from public.change_orders where id=co;
 foreach method in array array['portal','','invalid']loop
  begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),co,rev,proof||jsonb_build_object('method',method));raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 end loop;
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=co),'manual approval cannot masquerade as portal approval');
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(req,co,rev,proof||'{"notes":""}');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=co),'documentation required');
 snap:=(select to_jsonb(c)from public.change_orders c where id=co);job_snap:=(select to_jsonb(j)from public.jobs j where id=job);
 perform set_config('ats_test.manual_fail','receipt',true);
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(req,co,rev,proof);raise exception using errcode='ZX001';exception when sqlstate 'ZX002'then null;end;perform set_config('role','none',true);perform set_config('ats_test.manual_fail','',true);
 perform pg_temp.comanual_check(snap=(select to_jsonb(c)from public.change_orders c where id=co),'late receipt failure restores approval header and revision');
 perform pg_temp.comanual_check(job_snap=(select to_jsonb(j)from public.jobs j where id=job),'late receipt failure restores job value');
 perform pg_temp.comanual_check(not exists(select 1 from public.job_change_order_scope_items where change_order_id=co),'late receipt failure restores scope');
 perform pg_temp.comanual_check(not exists(select 1 from public.activity_log where subject_id=co and event_type='change_order_approved'),'late receipt failure restores audit');
 perform set_config('role','authenticated',true);r:=public.record_change_order_manual_approval(req,co,rev,proof);again:=public.record_change_order_manual_approval(req,co,rev,proof);perform set_config('role','none',true);
 perform pg_temp.comanual_check(r->>'newly_approved'='true'and r->>'replayed'='false'and again->>'replayed'='true','approval and exact receipt replay acknowledged');
 perform pg_temp.comanual_check((select status='approved'and approved_by_name='Synthetic customer'and approval_recorded_by_user_id=owner_id and approval_method='phone'and approval_notes=proof->>'notes'from public.change_orders where id=co),'original documented permission and real actor retained');
 perform pg_temp.comanual_check((select count(*)=1 from public.job_change_order_scope_items where change_order_id=co),'one authorized scope item after retry');
 perform pg_temp.comanual_check((select projected_value_cents=15500 from public.jobs where id=job),'existing job-value semantics retained');
 perform pg_temp.comanual_check((select count(*)=1 and bool_and(actor_type='staff'and actor_user_id=owner_id)from public.activity_log where subject_id=co and event_type='change_order_approved'),'one staff approval audit after retry');
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(req,co,rev,proof||'{"notes":"Changed after unknown outcome"}');raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select count(*)=1 from app_private.change_order_manual_approval_requests where request_id=req),'request cannot change authorization details');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(req,co,rev,proof);raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select actor_user_id=owner_id from app_private.change_order_manual_approval_requests where request_id=req),'another staff actor cannot claim approval');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 update public.change_orders set updated_at=clock_timestamp()where id=co;
 perform set_config('role','authenticated',true);again:=public.record_change_order_manual_approval(req,co,rev,proof);perform set_config('role','none',true);
 perform pg_temp.comanual_check((again->>'current_revision')::integer>(r->>'edit_revision')::integer and again->>'edit_revision'=r->>'edit_revision','later record refresh does not reapply approval');
 -- All five existing non-portal authorization methods remain available to office staff.
 foreach method in array array['phone','email','in_person','signed_paper','other']loop
  other_co:=pg_temp.comanual_source(job,customer,location,owner_id);select edit_revision into rev from public.change_orders where id=other_co;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);
  again:=public.record_change_order_manual_approval(gen_random_uuid(),other_co,rev,proof||jsonb_build_object('method',method));perform set_config('role','none',true);
  perform pg_temp.comanual_check((select approval_method=method and approval_recorded_by_user_id=estimator from public.change_orders where id=other_co),'office method retained: '||method);
 end loop;
 other_co:=pg_temp.comanual_source(job,customer,location,owner_id);select edit_revision into rev from public.change_orders where id=other_co;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',crew,'user_metadata',jsonb_build_object('role','owner'))::text,true);
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),other_co,rev,proof);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=other_co),'crew and forged metadata denied');
 update public.profiles set status='disabled'where id=owner_id;perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(req,co,(r->>'reviewed_revision')::integer,proof);raise exception using errcode='ZX001';exception when insufficient_privilege then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select count(*)=1 from app_private.change_order_manual_approval_requests where request_id=req),'offboarded session denied even on replay');
 update public.profiles set status='active'where id=owner_id;
 foreach closed in array array['declined','cancelled','expired']loop
  update public.change_orders set status=closed where id=other_co;select edit_revision into rev from public.change_orders where id=other_co;
  begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),other_co,rev,proof);raise exception using errcode='ZX001';exception when sqlstate 'PT409'then null;end;perform set_config('role','none',true);
  perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=other_co),'closed addition cannot approve: '||closed);
 end loop;
 -- Corrupt or empty legacy scope must not become authorized work.
 other_co:=pg_temp.comanual_source(job,customer,location,owner_id);delete from public.change_order_line_items where change_order_id=other_co;select edit_revision into rev from public.change_orders where id=other_co;
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),other_co,rev,proof);raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=other_co),'empty scope cannot approve');
 other_co:=pg_temp.comanual_source(job,customer,location,owner_id);update public.change_order_line_items set amount_cents=1 where change_order_id=other_co;select edit_revision into rev from public.change_orders where id=other_co;
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),other_co,rev,proof);raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=other_co),'inconsistent total cannot approve');
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),other_co,rev,proof||jsonb_build_object('recorded_by',estimator));raise exception using errcode='ZX001';exception when invalid_parameter_value then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=other_co),'forged approval authority input rejected');
 perform set_config('request.jwt.claims','{}',true);insert into public.organizations(id,name)values(org,'Synthetic manual organization');insert into public.service_locations(id,organization_id,street,city)values(orgloc,org,'456 Synthetic Road','Fredericksburg');
 insert into public.jobs(id,organization_id,service_location_id,status)values(orgjob,org,orgloc,'accepted');insert into public.organization_contacts(id,organization_id,full_name,is_active)values(contact,org,'Synthetic organization authorizer',true);
 insert into public.change_orders(change_order_number,job_id,organization_id,service_location_id,created_by_user_id,title,subtotal_cents,total_cents)values('',orgjob,org,orgloc,owner_id,'Synthetic organization permission',100,100)returning id into orgco;
 insert into public.change_order_line_items(change_order_id,title,quantity,unit_price_cents,amount_cents)values(orgco,'Organization scope',1,100,100);select edit_revision into rev from public.change_orders where id=orgco;
 update public.organization_contacts set is_active=false where id=contact;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.record_change_order_manual_approval(gen_random_uuid(),orgco,rev,proof||jsonb_build_object('contact_id',contact));raise exception using errcode='ZX001';exception when check_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_at is null from public.change_orders where id=orgco),'inactive organization authorizer denied');
 update public.organization_contacts set is_active=true where id=contact;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);
 again:=public.record_change_order_manual_approval(gen_random_uuid(),orgco,rev,proof||jsonb_build_object('contact_id',contact));perform set_config('role','none',true);
 perform pg_temp.comanual_check((select approved_by_contact_id=contact and organization_id=org from public.change_orders where id=orgco),'organization approval contact and property preserved');
 perform pg_temp.comanual_check(not exists(select 1 from public.email_events where related_change_order_id in(co,orgco)),'manual approval sends no customer email');
end $test$;
select count(*)as passed_assertions from comanual_assertions;
rollback;
