-- Native synthetic source/queue checks. No migration, send or persistent setting.
begin;
set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table reminder_planning_assertions(label text);
create temporary table reminder_planning_fixtures(input jsonb);
create function pg_temp.reminder_planning_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Reminder planning assertion failed: %',label;end if;
  insert into reminder_planning_assertions values(label);
end $$;
do $test$
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();family text;predicate text;cursor_id uuid;next_id uuid;n integer;total integer;
  customer jsonb;settings jsonb;history jsonb;facts jsonb;first_id uuid;denied boolean;
begin
  insert into public.customers(id,display_name,email)values(party,'Synthetic reminder planning','reminder-'||party||'@example.invalid');
  insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
  insert into public.quotes(customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents,sent_at,expires_at,automatic_follow_ups_enabled)
    select party,site,'SYNTHETIC-REMINDER-'||gen_random_uuid(),'sent',10000,10000,clock_timestamp(),null,true from generate_series(1,1001);
  insert into public.quotes(customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents,sent_at,expires_at,automatic_follow_ups_enabled)
    select party,site,'SYNTHETIC-EXCLUDED-'||gen_random_uuid(),case when k=2 then 'approved'else 'sent'end,10000,10000,
      case when k=3 then clock_timestamp()-interval '45 days'else clock_timestamp()end,
      case when k=1 then clock_timestamp()-interval '1 day'else null end,k<>4 from generate_series(1,4)k;
  insert into public.invoices(customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents,due_at,automatic_reminders_enabled)
    select party,'SYNTHETIC-REMINDER-'||gen_random_uuid(),'sent',10000,10000,10000,clock_timestamp(),true from generate_series(1,1001);
  insert into public.invoices(customer_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents,due_at,automatic_reminders_enabled)
    select party,'SYNTHETIC-EXCLUDED-'||gen_random_uuid(),case when k=1 then 'draft'else 'sent'end,10000,10000,case when k=2 then 0 else 10000 end,
      case when k=3 then clock_timestamp()-interval '80 days'when k=4 then null else clock_timestamp()end,k<>5 from generate_series(1,5)k;
  select jsonb_build_object('quotes',(select jsonb_agg(to_jsonb(q)order by id)from public.quotes q where customer_id=party),
    'invoices',(select jsonb_agg(to_jsonb(i)order by id)from public.invoices i where customer_id=party))into facts;
  select to_jsonb(c)into customer from public.customers c where id=party;
  select to_jsonb(s)||jsonb_build_object('automated_sending_enabled',true,'appointment_change_notices_enabled',false,
    'quote_follow_up_enabled',true,'quote_first_follow_up_days',3,'quote_second_follow_up_days',7,
    'invoice_reminder_enabled',true,'invoice_first_reminder_days',1,'invoice_second_reminder_days',7,'payment_confirmation_enabled',false)into settings
    from public.communication_settings s where singleton;
  insert into reminder_planning_fixtures select jsonb_build_object('party',party,'settings',settings,
    'quotes',(select jsonb_agg(to_jsonb(q)||jsonb_build_object('customers',customer,'organizations',null,'approval_contact',null,'recipient_contact',null)order by id)from public.quotes q where customer_id=party),
    'invoices',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('customers',customer,'organizations',null,'accounts_payable_contact',null,'billing_contact',null)order by id)from public.invoices i where customer_id=party));
  foreach family in array array['quotes','invoices']loop
    predicate:=case family when 'quotes'then $p$status='sent'and automatic_follow_ups_enabled and sent_at>=clock_timestamp()-interval '14 days'and(expires_at is null or expires_at>clock_timestamp())$p$
      else $p$status in('sent','partially_paid','overdue')and automatic_reminders_enabled and balance_due_cents>0 and due_at>=clock_timestamp()-interval '45 days'$p$end;
    cursor_id:=null;total:=0;
    perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
    loop
      execute format('select count(*),max(id::text)::uuid from(select id from public.%I where customer_id=$1 and %s and($2 is null or id>$2)order by id limit 200)x',family,predicate)
        into n,next_id using party,cursor_id;
      exit when n=0;total:=total+n;cursor_id:=next_id;
    end loop;
    if family='quotes'then
      insert into public.customer_communications(communication_type,reminder_stage,customer_id,quote_id,recipient_source,recipient_email,scheduled_for,source_version,is_automatic,idempotency_key)
        select 'quote_follow_up',s.stage,party,q.id,'customer','reminder-'||party||'@example.invalid',q.sent_at+make_interval(days=>s.days),q.updated_at,true,'auto:quote:'||q.id||':follow-up:'||s.stage
        from public.quotes q cross join(values('first',3),('second',7))s(stage,days)
        where q.customer_id=party and q.status='sent'and q.automatic_follow_ups_enabled and q.sent_at>=clock_timestamp()-interval '14 days'and(q.expires_at is null or q.expires_at>clock_timestamp())
        on conflict(idempotency_key)do nothing;
    else
      insert into public.customer_communications(communication_type,reminder_stage,customer_id,invoice_id,recipient_source,recipient_email,scheduled_for,source_version,is_automatic,idempotency_key)
        select case s.stage when 'first'then 'invoice_payment_reminder'else 'overdue_invoice_reminder'end,s.stage,party,i.id,'customer','reminder-'||party||'@example.invalid',i.due_at+make_interval(days=>s.days),i.updated_at,true,'auto:invoice:'||i.id||':reminder:'||s.stage
        from public.invoices i cross join(values('first',1),('second',7))s(stage,days)
        where i.customer_id=party and i.status in('sent','partially_paid','overdue')and i.automatic_reminders_enabled and i.balance_due_cents>0 and i.due_at>=clock_timestamp()-interval '45 days'
        on conflict(idempotency_key)do nothing;
    end if;
    get diagnostics n=row_count;perform set_config('role','none',true);
    perform pg_temp.reminder_planning_check(total=1001,family||': native UUID cursor covers every eligible source and retains exclusions');
    perform pg_temp.reminder_planning_check(n=2002,family||': two stable stages created per eligible source');
    select c.id into first_id from public.customer_communications c where c.customer_id=party and(case family when 'quotes'then c.quote_id is not null else c.invoice_id is not null end)order by c.id limit 1;
    update public.customer_communications set status='sent',provider_message_id='synthetic-retained-reminder',sent_at=clock_timestamp()where id=first_id;
    select jsonb_agg(to_jsonb(c)order by c.id)into history from public.customer_communications c where c.customer_id=party;
    -- Same-key retry must retain the exact rows, including saved accepted state.
    insert into public.customer_communications(communication_type,reminder_stage,customer_id,quote_id,invoice_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key)
      select c.communication_type,c.reminder_stage,c.customer_id,c.quote_id,c.invoice_id,c.recipient_source,c.recipient_email,c.scheduled_for,c.is_automatic,c.idempotency_key
      from public.customer_communications c where c.customer_id=party and(case family when 'quotes'then c.quote_id is not null else c.invoice_id is not null end)
      on conflict(idempotency_key)do nothing;
    get diagnostics n=row_count;
    perform pg_temp.reminder_planning_check(n=0,family||': repeated stage keys do not insert duplicates');
    perform pg_temp.reminder_planning_check((select jsonb_agg(to_jsonb(c)order by c.id)=history from public.customer_communications c where c.customer_id=party),family||': same-key recovery preserves exact history');
  end loop;
  perform pg_temp.reminder_planning_check((select jsonb_build_object('quotes',(select jsonb_agg(to_jsonb(q)order by id)from public.quotes q where customer_id=party),
    'invoices',(select jsonb_agg(to_jsonb(i)order by id)from public.invoices i where customer_id=party)))=facts,'source statuses, deadlines and financial facts are unchanged');
  perform pg_temp.reminder_planning_check(not exists(select 1 from public.email_events where related_customer_id=party)
    and not exists(select 1 from app_private.outbound_deliveries where context->>'customer_id'=party::text),'preparation creates no email acceptance or provider request');
  denied:=false;perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);
  begin insert into public.customer_communications(communication_type,reminder_stage,customer_id,recipient_source,recipient_email,scheduled_for,idempotency_key)
    values('quote_follow_up','first',party,'customer','synthetic@example.invalid',clock_timestamp(),'synthetic-denied/'||party);
  exception when insufficient_privilege then denied:=true;end;perform set_config('role','none',true);
  perform pg_temp.reminder_planning_check(denied,'anonymous queue writes remain denied');
  perform pg_temp.reminder_planning_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'stored sending controls remain OFF');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from reminder_planning_assertions),
  'fixtures',(select jsonb_agg(input)from reminder_planning_fixtures))verification;
rollback;
