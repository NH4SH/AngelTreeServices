-- Test-only pre-upgrade committed request. Caller owns outer BEGIN/ROLLBACK.
create temporary table firewood_terms_seed(actor uuid,party uuid,site uuid,request uuid,header jsonb,lines jsonb,notes text,invoice_id uuid,invoice_before jsonb,request_before jsonb);
grant select on pg_temp.firewood_terms_seed to authenticated;
do $seed$
declare actor uuid:=gen_random_uuid();party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();req uuid:=gen_random_uuid();header jsonb;lines jsonb;notes text:='Synthetic retained household-use confirmation';r jsonb;inv uuid;
begin
 insert into public.roles(name)values('owner')on conflict(name)do nothing;
 insert into auth.users(id,email)values(actor,'firewood-terms-'||actor||'@example.invalid');update public.profiles set status='active'where id=actor;
 insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic Firewood terms operator',true,'active');
 insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name='owner';
 insert into public.customers(id,display_name)values(party,'Synthetic Firewood terms buyer');
 insert into public.service_locations(id,customer_id,street,city,state,postal_code)values(site,party,'9 Synthetic Rd','Spotsylvania','VA','22553');
 header:=jsonb_build_object('customer_id',party,'organization_id',null,'service_location_id',site,'due_at','2099-12-15T17:00:00Z');
 lines:=jsonb_build_array(jsonb_build_object('name','Firewood — full cord, delivered','description','Synthetic retained line','quantity',1,'unit_price_cents',45000,'total_cents',45000));
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 r:=public.create_standalone_invoice(req,header,lines,notes,null);inv:=(r->>'invoice_id')::uuid;
 insert into pg_temp.firewood_terms_seed select actor,party,site,req,header,lines,notes,inv,to_jsonb(i),to_jsonb(q)from public.invoices i,app_private.standalone_invoice_requests q where i.id=inv and q.request_id=req;
end $seed$;
