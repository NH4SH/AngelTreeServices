-- Caller owns BEGIN/ROLLBACK. Synthetic fixtures only; no sender/provider call.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table cancellation_assertions(label text);
create function pg_temp.cancellation_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Cancellation assertion failed: %',label;end if;
 insert into pg_temp.cancellation_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();invoice uuid:=gen_random_uuid();target uuid:=gen_random_uuid();other uuid:=gen_random_uuid();receipt uuid:=gen_random_uuid();actor uuid;owner_id uuid;role_name text;
 version timestamptz;changed integer;state text;before_row jsonb;other_row jsonb;settings_before jsonb;invoice_before jsonb;history_before jsonb;
begin
 select to_jsonb(s)into settings_before from public.communication_settings s where singleton;
 perform pg_temp.cancellation_check((settings_before->>'automated_sending_enabled')::boolean=false and(settings_before->>'appointment_change_notices_enabled')::boolean=false,'sending switches start OFF');
 perform pg_temp.cancellation_check((select relrowsecurity from pg_class where oid='public.customer_communications'::regclass),'existing queue RLS remains enabled');
 select jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))into history_before;
 insert into public.roles(name)values('owner'),('admin'),('payroll_admin'),('estimator'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into public.customers(id,display_name,email)values(party,'Synthetic cancellation customer','cancel@example.invalid');
 insert into public.invoices(id,customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)values(invoice,party,'SYNTHETIC-CANCELLATION-INVOICE','sent',10000,10000,10000);
 select to_jsonb(i)into invoice_before from public.invoices i where id=invoice;
 insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,invoice_id,recipient_email,scheduled_for,is_automatic,idempotency_key)
 values(target,'invoice_payment_reminder','synthetic-cancel',party,invoice,'cancel@example.invalid',clock_timestamp(),false,'synthetic-cancel/'||target),
 (other,'overdue_invoice_reminder','synthetic-cancel',party,invoice,'cancel@example.invalid',clock_timestamp(),true,'synthetic-cancel/'||other),
 (receipt,'payment_confirmation','synthetic-cancel',party,invoice,'cancel@example.invalid',clock_timestamp(),true,'synthetic-cancel/'||receipt);
 select to_jsonb(c)into other_row from public.customer_communications c where id=other;
 foreach role_name in array array['owner','admin','estimator','payroll_admin','crew','customer','property_manager','none','disabled','separated']loop
  actor:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(actor,'cancel-'||actor||'@example.invalid','{"role":"owner"}');
  update public.profiles set status=case when role_name='disabled'then 'disabled'else 'active'end where id=actor;
  insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic cancellation reviewer',true,'active');
  if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
  if role_name<>'none'then insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then 'owner'else role_name end;end if;
  if role_name='owner'then owner_id:=actor;end if;
  update public.customer_communications set status='pending',cancelled_at=null,skip_reason=null where id=target;
  select to_jsonb(c),c.updated_at into before_row,version from public.customer_communications c where id=target;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);perform set_config('role','authenticated',true);
  update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='Cancelled by staff.'where id=target and status='pending'and updated_at=version;
  get diagnostics changed=row_count;perform set_config('role','none',true);
  perform pg_temp.cancellation_check((changed=1)=(role_name in('owner','admin','estimator','payroll_admin')),'existing stored-role/effective-access cancellation: '||role_name);
  if changed=0 then perform pg_temp.cancellation_check((select to_jsonb(c)from public.customer_communications c where id=target)=before_row,'denied cancellation preserves the whole row: '||role_name);end if;
 end loop;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 update public.customer_communications set status='pending',cancelled_at=null,skip_reason=null,scheduled_for=clock_timestamp()+interval '4 days'where id=target;
 select to_jsonb(c),c.updated_at into before_row,version from public.customer_communications c where id=target;
 perform set_config('role','authenticated',true);
 update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='Cancelled by staff.'where id=target and status='pending'and updated_at=version-interval '1 microsecond';
 get diagnostics changed=row_count;perform set_config('role','none',true);
 perform pg_temp.cancellation_check(changed=0,'older reviewed version cannot cancel the current reminder');
 perform pg_temp.cancellation_check((select to_jsonb(c)from public.customer_communications c where id=target)=before_row,'stale cancellation preserves the complete reminder');
 foreach state in array array['processing','sent','failed','skipped','cancelled']loop
  update public.customer_communications set status=state,attempt_count=2,processing_started_at=case when state='processing'then clock_timestamp()end,provider_message_id=case when state='sent'then 'synthetic-provider'end where id=target;
  select to_jsonb(c),c.updated_at into before_row,version from public.customer_communications c where id=target;
  perform set_config('role','authenticated',true);update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='Cancelled by staff.'where id=target and status='pending'and updated_at=version;
  get diagnostics changed=row_count;perform set_config('role','none',true);
  perform pg_temp.cancellation_check(changed=0,'nonpending state cannot be cancelled: '||state);
  perform pg_temp.cancellation_check((select to_jsonb(c)from public.customer_communications c where id=target)=before_row,'nonpending claim/history remains exact: '||state);
 end loop;
 perform set_config('role','authenticated',true);update public.customer_communications set status='cancelled'where id=gen_random_uuid()and status='pending'and updated_at=version;get diagnostics changed=row_count;perform set_config('role','none',true);
 perform pg_temp.cancellation_check(changed=0,'missing reminder cannot acknowledge a cancellation');
 select updated_at into version from public.customer_communications where id=receipt;
 perform set_config('role','authenticated',true);update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='Cancelled by staff.'where id=receipt and status='pending'and updated_at=version;get diagnostics changed=row_count;perform set_config('role','none',true);
 perform pg_temp.cancellation_check(changed=1,'staff retains explicit cancellation of a chosen pending receipt');
 perform pg_temp.cancellation_check((select to_jsonb(c)from public.customer_communications c where id=other)=other_row,'other pending automatic reminders remain exact');
 perform pg_temp.cancellation_check((select to_jsonb(i)from public.invoices i where id=invoice)=invoice_before,'invoice and financial fields remain exact');
 perform pg_temp.cancellation_check((select to_jsonb(s)from public.communication_settings s where singleton)=settings_before,'all global sending defaults remain exact and OFF');
 perform pg_temp.cancellation_check(jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))=history_before,'no delivery, email or payment mutation');
end $test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by label)from pg_temp.cancellation_assertions),'sendingSwitchesStayedOff',(select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton))as verification;
