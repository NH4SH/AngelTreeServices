-- Caller owns BEGIN/ROLLBACK; synthetic identities and records only. No sender.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table queue_visibility_assertions(label text);
create function pg_temp.queue_visibility_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Queue visibility assertion failed: %',label;end if;
 insert into pg_temp.queue_visibility_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();invoice uuid:=gen_random_uuid();actor uuid;role_name text;expected jsonb;actual jsonb;queue_before jsonb;source_before jsonb;settings_before jsonb;history_before jsonb;visible_count integer;denied boolean;
begin
 select to_jsonb(s)into settings_before from public.communication_settings s where singleton;
 perform pg_temp.queue_visibility_check((settings_before->>'automated_sending_enabled')::boolean=false and(settings_before->>'appointment_change_notices_enabled')::boolean=false,'sending controls start OFF');
 perform pg_temp.queue_visibility_check((select relrowsecurity from pg_class where oid='public.customer_communications'::regclass),'queue retains RLS');
 select jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))into history_before;
 insert into public.roles(name)values('owner'),('admin'),('payroll_admin'),('estimator'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into public.customers(id,display_name,email)values(party,'Synthetic queue customer','queue@example.invalid');
 insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)values(invoice,party,'SYNTHETIC-QUEUE-'||invoice,'sent',10000,10000,10000);
 insert into public.customer_communications(communication_type,reminder_stage,customer_id,invoice_id,recipient_source,recipient_email,scheduled_for,status,is_automatic,idempotency_key,created_at)
 select 'invoice_payment_reminder','synthetic_queue',party,invoice,'customer','queue@example.invalid','2099-12-01T17:00:00Z'::timestamptz+(n%7)*interval'1 minute',st,false,'synthetic-queue:'||invoice||':'||st||':'||n,'2026-10-01T12:00:00Z'::timestamptz+n*interval'1 minute'from generate_series(1,37)n cross join unnest(array['pending','failed','sent','processing','skipped','cancelled'])st;
 select to_jsonb(i)into source_before from public.invoices i where id=invoice;
 select jsonb_agg(to_jsonb(c)order by id)into queue_before from public.customer_communications c where invoice_id=invoice;
 select jsonb_agg(id order by scheduled_for,id)into expected from(select id,scheduled_for from public.customer_communications where invoice_id=invoice and status='pending'order by scheduled_for,id limit 30)c;
 perform pg_temp.queue_visibility_check((select count(*)=37 from public.customer_communications where invoice_id=invoice and status='pending'),'pending total exceeds original page cap');
 perform pg_temp.queue_visibility_check((select count(*)=7 from(select id from public.customer_communications where invoice_id=invoice and status='pending'order by scheduled_for,id offset 30 limit 30)c),'second scheduled page retains remaining reminders');
 perform pg_temp.queue_visibility_check((select count(*)=37 from public.customer_communications where invoice_id=invoice and status='failed'),'failed total is not a page length');
 perform pg_temp.queue_visibility_check((select count(*)=148 from public.customer_communications where invoice_id=invoice and status in('processing','sent','skipped','cancelled')),'history includes every preserved nonfailed outcome');
 foreach role_name in array array['owner','admin','estimator','payroll_admin','crew','customer','property_manager','none','disabled','separated']loop
  actor:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(actor,'queue-'||actor||'@example.invalid','{"role":"owner"}');
  update public.profiles set status=case when role_name='disabled'then 'disabled'else 'active'end where id=actor;
  insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic queue reader',true,'active');
  if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
  if role_name<>'none'then insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then 'owner'else role_name end;end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);perform set_config('role','authenticated',true);
  select count(*)into visible_count from public.customer_communications where invoice_id=invoice;
  perform set_config('role','none',true);
  perform pg_temp.queue_visibility_check(visible_count=case when role_name in('owner','admin','estimator','payroll_admin')then 222 else 0 end,'native count visibility: '||role_name);
  perform set_config('role','authenticated',true);
  select jsonb_agg(id order by scheduled_for,id)into actual from(select id,scheduled_for from public.customer_communications where invoice_id=invoice and status='pending'order by scheduled_for,id limit 30)c;
  perform set_config('role','none',true);
  perform pg_temp.queue_visibility_check(actual is not distinct from case when role_name in('owner','admin','estimator','payroll_admin')then expected else null end,'native page visibility and tied-date order: '||role_name);
 end loop;
 denied:=false;perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);
 begin select count(*)into visible_count from public.customer_communications where invoice_id=invoice;denied:=visible_count=0;exception when insufficient_privilege then denied:=true;end;
 perform set_config('role','none',true);perform pg_temp.queue_visibility_check(denied,'anonymous count/page not exposed');
 perform pg_temp.queue_visibility_check((select jsonb_agg(to_jsonb(c)order by id)from public.customer_communications c where invoice_id=invoice)=queue_before,'reads preserve exact queue rows and delivery identities');
 perform pg_temp.queue_visibility_check((select to_jsonb(i)from public.invoices i where id=invoice)=source_before,'invoice money and status remain exact');
 perform pg_temp.queue_visibility_check((select to_jsonb(s)from public.communication_settings s where singleton)=settings_before,'global defaults stay exact and OFF');
 perform pg_temp.queue_visibility_check(jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))=history_before,'no delivery, email or payment side effect');
end $test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by label)from pg_temp.queue_visibility_assertions),'sendingSwitchesStayedOff',(select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton))as verification;
