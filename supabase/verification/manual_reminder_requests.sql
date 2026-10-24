-- Caller owns BEGIN/ROLLBACK. Synthetic subjects/identities only; no worker/send.
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table manual_request_assertions(label text);
create function pg_temp.manual_request_check(ok boolean,label text)returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'Manual request assertion failed: %',label;end if;
 insert into pg_temp.manual_request_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();quote uuid:=gen_random_uuid();actor uuid;owner_id uuid;role_name text;request uuid:=gen_random_uuid();target uuid:=gen_random_uuid();key text;denied boolean;changed integer;before_row jsonb;source_before jsonb;settings_before jsonb;history_before jsonb;
begin
 select to_jsonb(s)into settings_before from public.communication_settings s where singleton;
 perform pg_temp.manual_request_check((settings_before->>'automated_sending_enabled')::boolean=false and(settings_before->>'appointment_change_notices_enabled')::boolean=false,'sending controls start OFF');
 perform pg_temp.manual_request_check((select relrowsecurity from pg_class where oid='public.customer_communications'::regclass),'existing queue RLS enabled');
 select jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))into history_before;
 insert into public.roles(name)values('owner'),('admin'),('payroll_admin'),('estimator'),('crew'),('customer'),('property_manager')on conflict(name)do nothing;
 insert into public.customers(id,display_name,email)values(party,'Synthetic manual reminder customer','manual@example.invalid');
 insert into public.quotes(id,customer_id,quote_number,status,subtotal_cents,total_cents)values(quote,party,'SYNTHETIC-MANUAL-REQUEST','sent',10000,10000);
 select to_jsonb(q)into source_before from public.quotes q where id=quote;
 foreach role_name in array array['owner','admin','estimator','payroll_admin','crew','customer','property_manager','none','disabled','separated']loop
  actor:=gen_random_uuid();insert into auth.users(id,email,raw_user_meta_data)values(actor,'manual-'||actor||'@example.invalid','{"role":"owner"}');
  update public.profiles set status=case when role_name='disabled'then 'disabled'else 'active'end where id=actor;
  insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status)values(actor,'Synthetic manual reminder reviewer',true,'active');
  if role_name='separated'then update public.employee_records set is_active=false,employment_status='separated'where auth_user_id=actor;end if;
  if role_name<>'none'then insert into public.user_roles(user_id,role_id)select actor,id from public.roles where name=case when role_name in('disabled','separated')then 'owner'else role_name end;end if;
  if role_name='owner'then owner_id:=actor;end if;
  key:='manual-request:v1:'||actor||':'||gen_random_uuid();denied:=false;
  perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);perform set_config('role','authenticated',true);
  begin
   insert into public.customer_communications(communication_type,reminder_stage,customer_id,quote_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key,created_by_user_id)
   values('quote_follow_up','manual_scheduled',party,quote,'customer','manual@example.invalid','2099-12-01T17:00:00Z',false,key,actor);
  exception when insufficient_privilege then denied:=true;end;
  perform set_config('role','none',true);
  perform pg_temp.manual_request_check(denied=(role_name not in('owner','admin','estimator','payroll_admin')),'stored-role/effective-access insertion: '||role_name);
  if not denied then perform pg_temp.manual_request_check((select count(*)=1 and bool_and(created_by_user_id=actor and not is_automatic and status='pending')from public.customer_communications where idempotency_key=key),'caller-owned manual acknowledgement: '||role_name);end if;
 end loop;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);key:='manual-request:v1:'||owner_id||':'||request;
 perform set_config('role','authenticated',true);
 insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,quote_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key,created_by_user_id)
 values(target,'quote_follow_up','manual_scheduled',party,quote,'customer','manual@example.invalid','2099-12-01T17:00:00Z',false,key,owner_id);
 changed:=0;begin delete from public.customer_communications where id=target;get diagnostics changed=row_count;exception when insufficient_privilege then changed:=0;end;
 perform set_config('role','none',true);perform pg_temp.manual_request_check(changed=0,'existing native permissions/RLS prevent staff erasing request history');select to_jsonb(c)into before_row from public.customer_communications c where id=target;
 perform set_config('role','authenticated',true);
 insert into public.customer_communications(communication_type,reminder_stage,customer_id,quote_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key,created_by_user_id)
 values('quote_follow_up','manual_scheduled',party,quote,'customer','manual@example.invalid','2099-12-01T17:00:00Z',false,key,owner_id)on conflict(idempotency_key)do nothing;get diagnostics changed=row_count;
 perform set_config('role','none',true);perform pg_temp.manual_request_check(changed=0,'existing native unique key refuses a second identical request');
 perform pg_temp.manual_request_check((select to_jsonb(c)from public.customer_communications c where id=target)=before_row,'duplicate does not mutate existing row or timestamps');
 perform set_config('role','authenticated',true);
 insert into public.customer_communications(communication_type,reminder_stage,customer_id,quote_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key,created_by_user_id)
 values('quote_follow_up','manual_scheduled',party,quote,'customer','other@example.invalid','2099-12-02T17:00:00Z',false,key,owner_id)on conflict(idempotency_key)do nothing;get diagnostics changed=row_count;
 perform set_config('role','none',true);perform pg_temp.manual_request_check(changed=0,'changed request body cannot replace native unique winner');
 perform pg_temp.manual_request_check((select to_jsonb(c)from public.customer_communications c where id=target)=before_row,'first committed recipient and date remain intact');
 update public.customer_communications set status='cancelled',cancelled_at=clock_timestamp(),skip_reason='Synthetic reviewed cancellation'where id=target;select to_jsonb(c)into before_row from public.customer_communications c where id=target;
 perform set_config('role','authenticated',true);perform id from public.customer_communications where idempotency_key=key;perform set_config('role','none',true);
 perform pg_temp.manual_request_check((select to_jsonb(c)from public.customer_communications c where id=target)=before_row,'read-only cancellation review does not reopen history');
 perform pg_temp.manual_request_check((select to_jsonb(q)from public.quotes q where id=quote)=source_before,'source scope, money and status remain intact');
 perform pg_temp.manual_request_check((select to_jsonb(s)from public.communication_settings s where singleton)=settings_before,'global defaults stay exact and OFF');
 perform pg_temp.manual_request_check(jsonb_build_object('outbound',(select count(*)from app_private.outbound_deliveries),'email',(select count(*)from public.email_events),'payments',(select count(*)from public.payments))=history_before,'no delivery, email or payment side effect');
end $test$;
select jsonb_build_object('assertions',(select jsonb_agg(label order by label)from pg_temp.manual_request_assertions),'sendingSwitchesStayedOff',(select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton))as verification;
