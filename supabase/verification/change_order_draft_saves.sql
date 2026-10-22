-- Synthetic only; always rollback. Never run on production.
begin;
set local lock_timeout='3s';set local statement_timeout='40s';
create temporary table coedit_assertions(label text);
create function pg_temp.coedit_check(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Draft save assertion failed: %',label;end if;insert into pg_temp.coedit_assertions values(label);end $$;
do $test$
<<fixture>>
declare owner_id uuid:=gen_random_uuid();estimator uuid:=gen_random_uuid();other_owner uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();location uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 id uuid;line_id uuid;req uuid:=gen_random_uuid();second uuid;h jsonb;lines jsonb;r jsonb;again jsonb;snap jsonb;rev integer;count_before integer;closed text;closeout_id uuid:=gen_random_uuid();
 org uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();orgjob uuid:=gen_random_uuid();orgloc uuid:=gen_random_uuid();
begin
 insert into public.roles(name)values('owner'),('estimator')on conflict(name)do nothing;
 insert into auth.users(id,email,raw_user_meta_data)values(owner_id,'coedit-'||owner_id||'@example.invalid','{}'),(estimator,'coedit-'||estimator||'@example.invalid','{}'),(other_owner,'coedit-'||other_owner||'@example.invalid','{}');
 update public.profiles set status='active' where profiles.id in(owner_id,estimator,other_owner);
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(owner_id,'Synthetic draft owner',true,'active'),(estimator,'Synthetic estimator',true,'active'),(other_owner,'Synthetic second owner',true,'active');
 insert into public.user_roles(user_id,role_id)select owner_id,r.id from public.roles r where r.name='owner';
 insert into public.user_roles(user_id,role_id)select other_owner,r.id from public.roles r where r.name='owner';
 insert into public.user_roles(user_id,role_id)select estimator,r.id from public.roles r where r.name='estimator';
 insert into public.customers(id,display_name,email)values(customer,'Synthetic draft customer','coedit-'||customer||'@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(location,customer,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(job,customer,location,'accepted','other','Synthetic draft scope');
 perform pg_temp.coedit_check(not has_function_privilege('anon','public.save_change_order_draft(uuid,uuid,integer,jsonb,jsonb)','EXECUTE'),'anonymous save denied');
 perform pg_temp.coedit_check(not has_function_privilege('service_role','public.save_change_order_draft(uuid,uuid,integer,jsonb,jsonb)','EXECUTE'),'service key cannot impersonate office editor');
 perform pg_temp.coedit_check(not has_table_privilege('authenticated','app_private.change_order_draft_requests','SELECT'),'receipt ledger private');
 h:=jsonb_build_object('job_id',job,'title','Synthetic new addition','tax_cents',200,'fee_cents',300,'schedule_impact',jsonb_build_object('equipment',true));
 lines:='[{"title":"Original scope","description":"Synthetic scope\n- Keep this line break","quantity":1,"unit":"each","unit_price_cents":10000,"amount_cents":10000,"internal_cost_estimate_cents":4000}]';
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);perform set_config('role','authenticated',true);
 r:=public.save_change_order_draft(req,null,null,h,lines);again:=public.save_change_order_draft(req,null,null,h,lines);perform set_config('role','none',true);
 id:=(r->>'id')::uuid;line_id:=(r->'line_ids'->>0)::uuid;rev:=(r->>'edit_revision')::integer;
 perform pg_temp.coedit_check(r->>'replayed'='false' and again->>'replayed'='true' and again->>'id'=fixture.id::text,'creation acknowledgement replay reuses one addition');
 perform pg_temp.coedit_check((select subtotal_cents=10000 and tax_cents=200 and fee_cents=300 and total_cents=10500 and customer_id=customer and job_id=job from public.change_orders where change_orders.id=fixture.id),'authoritative party and complete totals saved');
 perform pg_temp.coedit_check((select description=E'Synthetic scope\n- Keep this line break' and internal_cost_estimate_cents=4000 from public.change_order_line_items where change_order_line_items.id=line_id),'scope formatting and internal cost preserved');
 perform pg_temp.coedit_check((select count(*)=1 from public.activity_log where subject_id=fixture.id and event_type='change_order_created'),'one creation audit');
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(req,null,null,h||'{"title":"Changed uncertain input"}',lines);raise exception using errcode='ZX001';exception when sqlstate '22023' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select title='Synthetic new addition' from public.change_orders where change_orders.id=fixture.id),'request collision cannot become a different creation');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',other_owner)::text,true);
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(req,null,null,h,lines);raise exception using errcode='ZX001';exception when sqlstate '22023' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select actor_user_id=owner_id from app_private.change_order_draft_requests where request_id=req),'another editor cannot claim a receipt');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 lines:=jsonb_build_array((lines->0)||jsonb_build_object('id',line_id,'title','Edited scope'),jsonb_build_object('title','Second scope','quantity',2,'unit_price_cents',2500,'amount_cents',5000));
 h:='{"title":"Updated addition","tax_cents":100,"fee_cents":400}';req:=gen_random_uuid();
 perform set_config('role','authenticated',true);r:=public.save_change_order_draft(req,fixture.id,rev,h,lines);perform set_config('role','none',true);
 perform pg_temp.coedit_check((select title='Updated addition' and subtotal_cents=15000 and total_cents=15500 from public.change_orders where change_orders.id=fixture.id),'header and changed lines commit together');
 perform pg_temp.coedit_check((r->'line_ids'->>0)::uuid=line_id and jsonb_array_length(r->'line_ids')=2,'retained line identity and new line acknowledgement');
 perform pg_temp.coedit_check((r->>'edit_revision')::integer>rev,'revision advances after a full save');
 perform pg_temp.coedit_check((select count(*)=1 from public.activity_log where subject_id=fixture.id and event_type='change_order_edited'),'one edit audit');
 perform set_config('role','authenticated',true);again:=public.save_change_order_draft(req,fixture.id,rev,h,lines);perform set_config('role','none',true);
 perform pg_temp.coedit_check(again->>'replayed'='true' and (select count(*)=1 from public.activity_log where subject_id=fixture.id and event_type='change_order_edited'),'edit replay adds no audit or line');
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h,lines);raise exception using errcode='ZX001';exception when sqlstate 'PT409' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select count(*)=2 from public.change_order_line_items where change_order_id=fixture.id),'stale editor cannot overwrite the saved lines');
 rev:=(r->>'edit_revision')::integer;second:=(r->'line_ids'->>1)::uuid;
 snap:=(select to_jsonb(c) from public.change_orders c where c.id=fixture.id);
 -- Fail after a header and retained line update, while inserting a new line.
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,'{"title":"Must roll back"}',jsonb_build_array(lines->0,jsonb_build_object('title','Bad material','quantity',1,'unit_price_cents',1,'amount_cents',1,'material_id',gen_random_uuid())));raise exception using errcode='ZX001';exception when foreign_key_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check(snap=(select to_jsonb(c) from public.change_orders c where c.id=fixture.id),'late line failure rolls back header, totals and revision');
 perform pg_temp.coedit_check(exists(select 1 from public.change_order_line_items where change_order_line_items.id=second),'late failure restores a line deleted earlier in the save');
 perform pg_temp.coedit_check((select count(*)=1 from public.activity_log where subject_id=fixture.id and event_type='change_order_edited'),'failed save creates no audit');
 -- An ordinary line writer must also invalidate a loaded editor.
 perform set_config('role','authenticated',true);update public.change_order_line_items set description='Concurrent source edit' where change_order_line_items.id=line_id;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select edit_revision>rev from public.change_orders where change_orders.id=fixture.id),'line-only writers invalidate revision');
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h,lines);raise exception using errcode='ZX001';exception when sqlstate 'PT409' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select description='Concurrent source edit' from public.change_order_line_items where change_order_line_items.id=line_id),'stale save retains the other writer scope');
 select edit_revision into rev from public.change_orders where change_orders.id=fixture.id;
 perform set_config('request.jwt.claims','{}',true);update public.change_order_line_items set description='Trusted maintenance edit' where change_order_line_items.id=line_id;
 perform pg_temp.coedit_check((select edit_revision>rev from public.change_orders where change_orders.id=fixture.id),'trusted maintenance line edits also invalidate editors');
 -- Estimator cannot clear hidden costs or forge a financial-access input.
 select edit_revision into rev from public.change_orders where change_orders.id=fixture.id;
 lines:=jsonb_build_array((lines->0)-'internal_cost_estimate_cents');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',estimator)::text,true);perform set_config('role','authenticated',true);
 r:=public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,'{"title":"Estimator scope edit"}',lines);perform set_config('role','none',true);
 perform pg_temp.coedit_check((select internal_cost_estimate_cents=4000 from public.change_order_line_items where change_order_line_items.id=line_id),'nonfinancial editor preserves existing hidden cost');
 rev:=(r->>'edit_revision')::integer;
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h,jsonb_build_array((lines->0)||'{"internal_cost_estimate_cents":0}'));raise exception using errcode='ZX001';exception when sqlstate '42501' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select internal_cost_estimate_cents=4000 from public.change_order_line_items where change_order_line_items.id=line_id),'forged financial field rejected');
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 for closed in select unnest(array['approved','declined','cancelled','expired']) loop
  perform set_config('request.jwt.claims','{}',true);update public.change_orders set status=closed where change_orders.id=fixture.id;
  select edit_revision into rev from public.change_orders where change_orders.id=fixture.id;
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
  begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h,lines);raise exception using errcode='ZX001';exception when sqlstate '23514' then null;end;perform set_config('role','none',true);
  perform pg_temp.coedit_check((select status=closed from public.change_orders where change_orders.id=fixture.id),'closed scope not editable: '||closed);
 end loop;
 perform set_config('request.jwt.claims','{}',true);update public.change_orders set status='draft' where change_orders.id=fixture.id;select edit_revision into rev from public.change_orders where change_orders.id=fixture.id;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h||jsonb_build_object('customer_id',gen_random_uuid()),lines);raise exception using errcode='ZX001';exception when sqlstate '22023' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select customer_id=customer from public.change_orders where change_orders.id=fixture.id),'forged contracting party cannot enter the editor command');
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h,jsonb_build_array((lines->0)||'{"quantity":0.29,"unit_price_cents":50,"amount_cents":14}'));raise exception using errcode='ZX001';exception when sqlstate '22023' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select total_cents=10500 from public.change_orders where change_orders.id=fixture.id),'incorrect fractional-quantity rounding rolls back');
 update public.profiles set status='disabled' where profiles.id=owner_id;
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),fixture.id,rev,h,lines);raise exception using errcode='ZX001';exception when sqlstate '42501' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select title='Estimator scope edit' from public.change_orders where change_orders.id=fixture.id),'offboarded editor denied with old identity');
 update public.profiles set status='active' where profiles.id=owner_id;
 insert into public.job_closeouts(id,job_id,additional_work_description,crew_internal_notes,incident_description)
 values(closeout_id,job,'Synthetic crew request','Private crew note','Synthetic exception')
 on conflict(job_id) do update set additional_work_description=excluded.additional_work_description,crew_internal_notes=excluded.crew_internal_notes,incident_description=excluded.incident_description returning job_closeouts.id into closeout_id;
 h:=jsonb_build_object('job_id',job,'source_closeout_id',closeout_id,'title','Closeout draft','internal_notes','Office note');
 lines:='[{"title":"Closeout scope","quantity":1,"unit_price_cents":100,"amount_cents":100}]';
 select count(*) into count_before from public.change_orders where created_by_user_id=owner_id;
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),null,null,h,jsonb_build_array((lines->0)||jsonb_build_object('material_id',gen_random_uuid())));raise exception using errcode='ZX001';exception when foreign_key_violation then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select count(*)=count_before from public.change_orders where created_by_user_id=owner_id),'late creation failure leaves no orphan draft');
 perform pg_temp.coedit_check((select change_order_id is null from public.job_closeouts where job_closeouts.id=closeout_id),'failed creation leaves closeout unlinked');
 req:=gen_random_uuid();perform set_config('role','authenticated',true);r:=public.save_change_order_draft(req,null,null,h,lines);again:=public.save_change_order_draft(req,null,null,h,lines);perform set_config('role','none',true);
 perform pg_temp.coedit_check((select change_order_id=(r->>'id')::uuid from public.job_closeouts where job_closeouts.id=closeout_id),'closeout link commits with draft');
 perform pg_temp.coedit_check((select internal_notes like '%Office note%Private crew note%Synthetic exception%' from public.change_orders where change_orders.id=(r->>'id')::uuid),'existing supporting notes retained privately');
 perform pg_temp.coedit_check(again->>'id'=r->>'id' and again->>'replayed'='true','closeout retry confirms original draft');
 perform set_config('role','authenticated',true);
 r:=public.save_change_order_draft(gen_random_uuid(),null,null,jsonb_build_object('job_id',job,'title','Fractional-quantity rounding'),
  '[{"title":"Fractional scope","quantity":0.29,"unit_price_cents":50,"amount_cents":15}]');perform set_config('role','none',true);
 perform pg_temp.coedit_check((select subtotal_cents=15 from public.change_orders where change_orders.id=(r->>'id')::uuid),'fractional quantity uses the established nearest-cent rounding');
 insert into public.organizations(id,name)values(org,'Synthetic organization');
 insert into public.organization_contacts(id,organization_id,full_name)values(contact,org,'Synthetic approver');
 insert into public.service_locations(id,organization_id,street,city,state)values(orgloc,org,'456 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,organization_id,service_location_id,status,service_type,requested_scope)values(orgjob,org,orgloc,'accepted','other','Synthetic organization scope');
 h:=jsonb_build_object('job_id',orgjob,'title','Organization draft','approval_contact_id',contact,'submit_for_review',true);
 lines:=jsonb_build_array(jsonb_build_object('title','Organization scope','quantity',1,'unit_price_cents',100,'amount_cents',100));
 perform set_config('role','authenticated',true);r:=public.save_change_order_draft(gen_random_uuid(),null,null,h,lines);perform set_config('role','none',true);
 perform pg_temp.coedit_check((select organization_id=org and customer_id is null and status='pending_internal_review' and approval_contact_id=contact from public.change_orders where change_orders.id=(r->>'id')::uuid),'organization ownership and save-for-review retained');
 update public.organization_contacts set is_active=false where organization_contacts.id=contact;
 select count(*) into count_before from public.change_orders where created_by_user_id=owner_id;
 begin perform set_config('role','authenticated',true);perform public.save_change_order_draft(gen_random_uuid(),null,null,h,lines);raise exception using errcode='ZX001';exception when sqlstate '23514' then null;end;perform set_config('role','none',true);
 perform pg_temp.coedit_check((select count(*)=count_before from public.change_orders where created_by_user_id=owner_id),'inactive approver rejection leaves no partial new draft');
 perform pg_temp.coedit_check(not exists(select 1 from public.email_events e join public.change_orders c on c.id=e.related_change_order_id where c.created_by_user_id in(owner_id,estimator,other_owner)),'no provider or customer email');
end $test$;
select count(*)::integer as passed_assertions from pg_temp.coedit_assertions;
rollback;
