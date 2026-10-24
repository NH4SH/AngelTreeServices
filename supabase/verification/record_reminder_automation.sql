-- Caller owns BEGIN/ROLLBACK. Only synthetic sources/identities are changed.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table automation_assertions(label text);
create function pg_temp.automation_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Automation assertion failed: %',label;end if;
 insert into pg_temp.automation_assertions values(label);
end $$;
create function pg_temp.reject_automation_cancel()returns trigger language plpgsql as $$begin
 if new.id::text=current_setting('ats_test.failure_queue',true) and new.status='cancelled' then
  raise exception 'SYNTHETIC_TRANSACTION_STOP';end if;return new;
end $$;
do $test$
<<f>>
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();job uuid:=gen_random_uuid();
 q uuid:=gen_random_uuid();i uuid:=gen_random_uuid();other_i uuid:=gen_random_uuid();actor uuid;owner_id uuid;
 source uuid;kind text;role_name text;target uuid;version timestamptz;before_source jsonb;before_queue jsonb;
 result jsonb;denied boolean;changed integer;protected_queue jsonb;pending_ids uuid[];failure_id uuid;
 global_before jsonb;history_before jsonb;
begin
 perform pg_temp.automation_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending switches start OFF');
 select to_jsonb(s)into global_before from public.communication_settings s where singleton;
 select jsonb_build_object('outbox',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events))into history_before;
 perform pg_temp.automation_check((select not prosecdef and proconfig@>array['search_path=""','lock_timeout=2s'] from pg_proc where oid='public.set_record_reminder_automation(text,uuid,boolean,timestamptz)'::regprocedure),'new command is invoker with empty path and bounded lock wait');
 perform pg_temp.automation_check(has_function_privilege('authenticated','public.set_record_reminder_automation(text,uuid,boolean,timestamptz)','EXECUTE'),'authenticated may call existing staff command');
 perform pg_temp.automation_check(not has_function_privilege('anon','public.set_record_reminder_automation(text,uuid,boolean,timestamptz)','EXECUTE'),'anonymous cannot execute');
 perform pg_temp.automation_check(not has_function_privilege('service_role','public.set_record_reminder_automation(text,uuid,boolean,timestamptz)','EXECUTE'),'no server-role fallback grant');
 insert into public.roles(name)values('owner'),('admin'),('payroll_admin'),('estimator'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into public.customers(id,display_name,email)values(party,'Synthetic automation customer','automation@example.invalid');
 insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
 insert into public.jobs(id,customer_id,service_location_id,status)values(job,party,site,'quoted');
 insert into public.quotes(id,customer_id,service_location_id,job_id,quote_number,status,subtotal_cents,total_cents)
 values(q,party,site,job,'SYNTHETIC-AUTOMATION-QUOTE','sent',10000,10000);
 insert into public.invoices(id,customer_id,job_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
 values(i,party,job,'SYNTHETIC-AUTOMATION-INVOICE','sent',10000,10000,10000),
 (other_i,party,null,'SYNTHETIC-AUTOMATION-OTHER','sent',12000,12000,12000);
 foreach kind in array array['quote','invoice']loop
  source:=case when kind='quote'then q else i end;
  insert into public.customer_communications(communication_type,reminder_stage,customer_id,quote_id,invoice_id,job_id,recipient_email,scheduled_for,is_automatic,idempotency_key,status)
  select case when kind='quote'then 'quote_follow_up'else case when n=2 then 'overdue_invoice_reminder'else 'invoice_payment_reminder'end end,
   'synthetic-automation',party,case when kind='quote'then q end,case when kind='invoice'then i end,job,'automation@example.invalid',clock_timestamp(),n<>3,
   'synthetic-automation/'||gen_random_uuid(),case when n<=3 then 'pending'when n=4 then 'processing'when n=5 then 'sent'when n=6 then 'failed'when n=7 then 'skipped'else 'cancelled'end
  from generate_series(1,8)n;
 end loop;
 insert into public.customer_communications(communication_type,reminder_stage,customer_id,invoice_id,recipient_email,scheduled_for,is_automatic,idempotency_key)
 values('payment_confirmation','synthetic-automation',party,i,'automation@example.invalid',clock_timestamp(),true,'synthetic-automation/'||gen_random_uuid()),
 ('invoice_payment_reminder','synthetic-automation',party,other_i,'automation@example.invalid',clock_timestamp(),true,'synthetic-automation/'||gen_random_uuid());
 select jsonb_agg(to_jsonb(c)order by c.id)into protected_queue from public.customer_communications c
 where c.customer_id=party and(not c.is_automatic or c.status<>'pending' or c.communication_type='payment_confirmation' or c.invoice_id=other_i);

 foreach role_name in array array['owner','admin','payroll_admin','estimator','crew','customer','property_manager','none','disabled','separated']loop
  actor:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(actor,'automation-'||actor||'@example.invalid','{}');
  update public.profiles set status=case when role_name='disabled'then 'disabled'else 'active'end where id=actor;
  insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic automation reviewer',true,'active');
  if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
  if role_name<>'none'then insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then 'owner'else role_name end;end if;
  if role_name='owner'then owner_id:=actor;end if;
  foreach kind in array array['quote','invoice']loop
   source:=case when kind='quote'then q else i end;
   if kind='quote'then select to_jsonb(x),updated_at into before_source,version from public.quotes x where id=source;
   else select to_jsonb(x),updated_at into before_source,version from public.invoices x where id=source;end if;
   perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);perform set_config('role','authenticated',true);
   denied:=false;
   begin result:=public.set_record_reminder_automation(kind,source,false,version);exception when insufficient_privilege then denied:=true;end;
   perform set_config('role','none',true);
   perform pg_temp.automation_check(denied=(role_name not in('owner','admin','payroll_admin','estimator')),kind||': stored role/effective access for '||role_name);
   if not denied then
    perform pg_temp.automation_check(result->>'record_id'=source::text and result->>'record_type'=kind and result->>'enabled'='false' and result->>'updated_at' is not null,kind||': checked acknowledgement for '||role_name);
    if kind='quote'then
     perform pg_temp.automation_check((select to_jsonb(x)-array['automatic_follow_ups_enabled','updated_at'] from public.quotes x where id=source)=before_source-array['automatic_follow_ups_enabled','updated_at'],'quote money/scope/history preserved for '||role_name);
    else
     perform pg_temp.automation_check((select to_jsonb(x)-array['automatic_reminders_enabled','updated_at'] from public.invoices x where id=source)=before_source-array['automatic_reminders_enabled','updated_at'],'invoice money/history preserved for '||role_name);
    end if;
   end if;
  end loop;
 end loop;
 perform pg_temp.automation_check((select count(*)from public.customer_communications where customer_id=party and status='cancelled'and skip_reason in('Automatic follow-ups disabled by staff.','Automatic reminders disabled by staff.'))=4,'both matching automatic reminder stages are cancelled');
 perform pg_temp.automation_check((select jsonb_agg(to_jsonb(c)order by c.id)from public.customer_communications c where c.customer_id=party and(not c.is_automatic or c.status not in('pending','cancelled')or c.communication_type='payment_confirmation'or c.invoice_id=other_i or(c.status='cancelled'and c.skip_reason is null)))=protected_queue,'manual reminders, receipts, unrelated sources and all nonpending history remain exact');

 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 foreach kind in array array['quote','invoice']loop
  source:=case when kind='quote'then q else i end;
  if kind='quote'then select updated_at into version from public.quotes where id=source;else select updated_at into version from public.invoices where id=source;end if;
  perform set_config('role','authenticated',true);result:=public.set_record_reminder_automation(kind,source,true,version);perform set_config('role','none',true);
  perform pg_temp.automation_check(result->>'enabled'='true'and(result->>'cancelled_count')::integer=0,kind||': enabling only changes the flag');
  denied:=false;perform set_config('role','authenticated',true);
  begin perform public.set_record_reminder_automation(kind,source,false,'2000-01-01T00:00:00Z');exception when serialization_failure then denied:=true;end;
  perform set_config('role','none',true);perform pg_temp.automation_check(denied,kind||': stale versions fail without overwriting');
 end loop;
 denied:=false;perform set_config('role','authenticated',true);
 begin perform public.set_record_reminder_automation('quote',gen_random_uuid(),false,clock_timestamp());exception when serialization_failure then denied:=true;end;
 perform set_config('role','none',true);perform pg_temp.automation_check(denied,'missing or invisible record cannot report success');
 foreach kind in array array['quote','invoice']loop
  source:=case when kind='quote'then q else i end;
  if kind='quote'then select to_jsonb(x),updated_at into before_source,version from public.quotes x where id=source;else select to_jsonb(x),updated_at into before_source,version from public.invoices x where id=source;end if;
  select id into failure_id from public.customer_communications where customer_id=party and case when kind='quote'then quote_id=source else invoice_id=source end and is_automatic and communication_type=case when kind='quote'then 'quote_follow_up'else 'invoice_payment_reminder'end limit 1;
  update public.customer_communications set status='pending'where id=failure_id;
  select to_jsonb(c)into before_queue from public.customer_communications c where id=failure_id;
  perform set_config('ats_test.failure_queue',failure_id::text,true);
  create trigger synthetic_automation_failure before update on public.customer_communications for each row execute function pg_temp.reject_automation_cancel();
  denied:=false;perform set_config('role','authenticated',true);
  begin perform public.set_record_reminder_automation(kind,source,false,version);exception when raise_exception then denied:=sqlerrm='SYNTHETIC_TRANSACTION_STOP';end;
  perform set_config('role','none',true);drop trigger synthetic_automation_failure on public.customer_communications;
  perform pg_temp.automation_check(denied,kind||': injected cancellation failure rejects the command');
  if kind='quote'then perform pg_temp.automation_check((select to_jsonb(x)from public.quotes x where id=source)=before_source,'quote flag and timestamp roll back with cancellation');
  else perform pg_temp.automation_check((select to_jsonb(x)from public.invoices x where id=source)=before_source,'invoice flag and timestamp roll back with cancellation');end if;
  perform pg_temp.automation_check((select to_jsonb(c)from public.customer_communications c where id=failure_id)=before_queue,kind||': cancellation failure preserves queue row exactly');
 end loop;
 delete from public.user_roles where user_id=owner_id;
 denied:=false;perform set_config('role','authenticated',true);begin perform public.set_record_reminder_automation('invoice',i,false,version);exception when insufficient_privilege then denied:=true;end;
 perform set_config('role','none',true);perform pg_temp.automation_check(denied,'removed staff role denies an old subject');
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"authenticated","user_metadata":{"role":"owner"}}',true);denied:=false;perform set_config('role','authenticated',true);
 begin perform public.set_record_reminder_automation('invoice',i,false,version);exception when insufficient_privilege then denied:=true;end;
 perform set_config('role','none',true);perform pg_temp.automation_check(denied,'subjectless spoofed role is denied');
 perform pg_temp.automation_check((select to_jsonb(s)from public.communication_settings s where singleton)=global_before,'global settings and OFF switches remain exact');
 perform pg_temp.automation_check(jsonb_build_object('outbox',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events))=history_before,'no outbound delivery or email history is created');
end $test$;
select jsonb_build_object('syntheticOnly',true,'sendingSwitchesStayedOff',true,'assertions',(select jsonb_agg(label order by label)from automation_assertions))verification;
