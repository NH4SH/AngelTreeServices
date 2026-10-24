-- Caller must own BEGIN/ROLLBACK. Synthetic household sales, no senders/workers.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table firewood_assertions(label text);
grant insert on pg_temp.firewood_assertions to authenticated;
create function pg_temp.firewood_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Firewood assertion failed: %',label;end if;
 insert into pg_temp.firewood_assertions values(label);
end $$;
do $test$
declare actor uuid:=gen_random_uuid();party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();req uuid;inv uuid;r jsonb;replay jsonb;header jsonb;lines jsonb;notes text:='Synthetic household-use confirmation. Virginia domestic-fuel exemption and Spotsylvania local exemption. Sales tax $0.';role_name text;reader uuid;denied boolean;baseline jsonb;settings_before jsonb;count_before bigint;version timestamptz;amount integer;kind text;
begin
 select to_jsonb(s)into settings_before from public.communication_settings s where singleton;
 perform pg_temp.firewood_check(not(settings_before->>'automated_sending_enabled')::boolean and not(settings_before->>'appointment_change_notices_enabled')::boolean,'automatic sending controls OFF');
 select jsonb_build_object('email',(select count(*)from public.email_events),'outbound',(select count(*)from app_private.outbound_deliveries),'queue',(select count(*)from public.customer_communications),'payments',(select count(*)from public.payments))into baseline;
 insert into public.roles(name)values('owner'),('admin'),('payroll_admin'),('estimator'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into auth.users(id,email)values(actor,'firewood-'||actor||'@example.invalid');update public.profiles set status='active'where id=actor;insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic firewood operator',true,'active');insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name='owner';
 insert into public.customers(id,display_name,email)values(party,'Synthetic firewood buyer','firewood@example.invalid');insert into public.service_locations(id,customer_id,street,city,state,postal_code)values(site,party,'1 Synthetic Ln','Fredericksburg','VA','22407');
 header:=jsonb_build_object('customer_id',party,'organization_id',null,'service_location_id',site,'due_at','2099-12-15T17:00:00Z');
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);perform set_config('role','authenticated',true);
 for kind,amount in select * from(values('full',45000),('half',30000),('full+stacking',60000),('half+stacking',45000),('editable-price',97610))q loop
  req:=gen_random_uuid();
  lines:=jsonb_build_array(jsonb_build_object('name','Firewood — '||case when kind like'half%'then'half'else'full'end||' cord, delivered','description',notes,'quantity',case when kind='editable-price'then 2 else 1 end,'unit_price_cents',case when kind='editable-price'then 42555 when kind like'half%'then 30000 else 45000 end,'total_cents',case when kind='editable-price'then 85110 when kind like'half%'then 30000 else 45000 end));
  if kind like'%stacking'or kind='editable-price'then lines:=lines||jsonb_build_array(jsonb_build_object('name','Firewood stacking','description','Per delivery','quantity',1,'unit_price_cents',case when kind='editable-price'then 12500 else 15000 end,'total_cents',case when kind='editable-price'then 12500 else 15000 end));end if;
  r:=public.create_standalone_invoice(req,header,lines,notes,null);inv:=(r->>'invoice_id')::uuid;
  perform pg_temp.firewood_check((select subtotal_cents=amount and total_cents=amount and tax_cents=0 and balance_due_cents=amount and status='draft'and sent_at is null from public.invoices where id=inv),kind||': exact draft total and exempt tax');
  perform pg_temp.firewood_check((select sum(total_cents)=amount from public.invoice_line_items where invoice_id=inv),kind||': native line totals match invoice');
  replay:=public.create_standalone_invoice(req,header,lines,notes,null);
  perform pg_temp.firewood_check(replay->>'invoice_id'=inv::text and(replay->>'replayed')::boolean,kind||': exact retry returns original invoice');
  perform pg_temp.firewood_check((select count(*)from public.invoices where id=inv)=1,kind||': no duplicate invoice');
 end loop;
 denied:=false;begin perform public.create_standalone_invoice(req,header,lines,'changed input',null);exception when check_violation then denied:=true;end;
 perform pg_temp.firewood_check(denied,'changed retry cannot create another invoice or overwrite first details');
 select updated_at into version from public.invoices where id=inv;
 lines:=(select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'quantity',quantity,'unit_price_cents',unit_price_cents,'total_cents',total_cents,'service_category_id',service_category_id)order by sort_order)from public.invoice_line_items where invoice_id=inv);
 r:=public.save_invoice_details(inv,version,'2099-12-16T17:00:00Z',lines);
 perform pg_temp.firewood_check((select tax_cents=0 and total_cents=97610 and balance_due_cents=97610 from public.invoices where id=inv),'regular edit preserves exempt cents and payment balance');
 denied:=false;begin perform public.save_invoice_details(inv,version-interval'1 second','2099-12-17T17:00:00Z',lines);exception when sqlstate 'PT409' then denied:=true;end;
 perform pg_temp.firewood_check(denied,'stale edit version is rejected');
 req:=gen_random_uuid();r:=public.create_standalone_invoice(req,jsonb_build_object('customer_id',null,'organization_id',null,'service_location_id',null,'due_at','2099-12-15T17:00:00Z'),jsonb_build_array(jsonb_build_object('name','Firewood — half cord, delivered','description',notes,'quantity',1,'unit_price_cents',30000,'total_cents',30000)),notes,jsonb_build_object('name','Synthetic walk-in','email','firewood-walkin-'||req||'@example.invalid','phone',null,'street','2 Synthetic Ln','city','Spotsylvania','state','VA','postal_code','22553'));
 perform pg_temp.firewood_check((r->>'customer_id')is not null and(r->>'service_location_id')is not null and not(r->>'note_warning')::boolean,'new customer, address and invoice are one acknowledged transaction');
 perform pg_temp.firewood_check((select body like'%household-use confirmation%'from public.notes where customer_id=(r->>'customer_id')::uuid limit 1),'domestic-use evidence retained in atomic customer note');
 perform set_config('role','none',true);
 foreach role_name in array array['owner','admin','estimator','payroll_admin','crew','customer','property_manager','none','disabled','separated']loop
  reader:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(reader,'firewood-reader-'||reader||'@example.invalid','{"role":"owner"}');update public.profiles set status=case when role_name='disabled'then'disabled'else'active'end where id=reader;insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(reader,'Synthetic firewood reader',true,'active');if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=reader;end if;
  if role_name<>'none'then insert into public.user_roles(user_id,role_id)select reader,id from public.roles where name=case when role_name in('disabled','separated')then'owner'else role_name end;end if;
  perform set_config('request.jwt.claim.sub',reader::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',reader,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);perform set_config('role','authenticated',true);
  denied:=false;begin r:=public.create_standalone_invoice(gen_random_uuid(),header,jsonb_build_array(jsonb_build_object('name','Firewood — full cord, delivered','description',notes,'quantity',1,'unit_price_cents',45000,'total_cents',45000)),notes,null);exception when insufficient_privilege then denied:=true;end;
  perform set_config('role','none',true);
  perform pg_temp.firewood_check(denied=(role_name not in('owner','admin','estimator','payroll_admin')),'native effective access: '||role_name);
 end loop;
 perform pg_temp.firewood_check(not has_function_privilege('anon','public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb)','execute')and not has_function_privilege('service_role','public.create_standalone_invoice(uuid,jsonb,jsonb,text,jsonb)','execute'),'anonymous and service-role execution remain denied');
 perform pg_temp.firewood_check((select relrowsecurity from pg_class where oid='public.invoices'::regclass),'invoice RLS remains enabled');
 perform pg_temp.firewood_check((select to_jsonb(s)from public.communication_settings s where singleton)=settings_before,'communication defaults unchanged');
 perform pg_temp.firewood_check(jsonb_build_object('email',(select count(*)from public.email_events),'outbound',(select count(*)from app_private.outbound_deliveries),'queue',(select count(*)from public.customer_communications),'payments',(select count(*)from public.payments))=baseline,'no email, reminder, provider delivery or payment created');
end $test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by label)from pg_temp.firewood_assertions),'sendingSwitchesStayedOff',(select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton))as verification;
