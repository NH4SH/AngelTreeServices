-- Rollback-only reminder-link fixtures. Session-local synthetic ciphertexts
-- must be supplied by the verification harness. No real token/key is used.
-- Controlled read faults are applied only by the application test adapter.
begin;
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table source_read_assertions(label text);
create temporary table source_read_fixtures(label text,communication jsonb,tables jsonb,principal jsonb,anonymous_error_code text);
create function pg_temp.source_read_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Communication source read assertion failed: %',label;end if;
  insert into pg_temp.source_read_assertions values(label);
end $$;
do $test$
<<fixture>>
declare party uuid:=gen_random_uuid();org uuid:=gen_random_uuid();site uuid:=gen_random_uuid();quote_id uuid:=gen_random_uuid();
  invoice_id uuid:=gen_random_uuid();org_invoice uuid:=gen_random_uuid();payment_id uuid:=gen_random_uuid();queue_id uuid;
  target text;source_id uuid;kind text;is_org boolean;row_invoice uuid;row_quote uuid;row_payment uuid;original_row jsonb;
  sources jsonb;principal jsonb;settings jsonb;token_rows jsonb;claim_at timestamptz;n bigint;denied boolean;code text;
begin
  perform pg_temp.source_read_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'automatic sending and appointment notices remain OFF');
  select to_jsonb(c)into settings from public.communication_settings c where singleton;
  perform pg_temp.source_read_check(settings->>'singleton'='true'and jsonb_typeof(settings->'automated_sending_enabled')='boolean','native settings are one complete singleton object');
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  select count(*)into n from public.communication_settings where singleton;
  perform set_config('role','none',true);perform pg_temp.source_read_check(n=1,'server role can read the existing settings singleton');
  foreach target in array array['anon','authenticated']loop
    denied:=false;perform set_config('request.jwt.claims',jsonb_build_object('role',target)::text,true);perform set_config('role',target,true);
    begin select count(*)into n from public.communication_settings where singleton;denied:=n=0;exception when insufficient_privilege then denied:=true;end;
    perform set_config('role','none',true);perform pg_temp.source_read_check(denied,target||': no settings access without an authorized staff identity');
  end loop;
  insert into public.customers(id,display_name,email)values(party,'Synthetic read customer','read-customer@example.invalid');
  insert into public.organizations(id,name,billing_email)values(org,'Synthetic read organization','read-organization@example.invalid');
  insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
  insert into public.quotes(id,customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents)
    values(quote_id,party,site,'SYNTHETIC-READ-QUOTE','sent',10000,10000);
  insert into public.invoices(id,customer_id,organization_id,invoice_number,status,subtotal_cents,total_cents,balance_due_cents)
    values(invoice_id,party,null,'SYNTHETIC-READ-INVOICE','sent',10000,10000,10000),
      (org_invoice,null,org,'SYNTHETIC-READ-ORG','sent',10000,10000,10000);
  insert into public.payments(id,invoice_id,customer_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,paid_at)
    values(payment_id,invoice_id,party,1000,1000,0,'usd','cash','manual','succeeded','2026-10-23T16:30:00Z');
  insert into public.quote_portal_tokens(quote_id,customer_id,token_hash,token_encrypted,expires_at)
    values(quote_id,party,encode(extensions.digest(repeat('q',43),'sha256'),'hex'),current_setting('ats_test.quote_cipher'),clock_timestamp()+interval '1 day');
  insert into public.invoice_portal_tokens(invoice_id,customer_id,organization_id,token_hash,token_encrypted,expires_at)
    values(invoice_id,party,null,encode(extensions.digest(repeat('i',43),'sha256'),'hex'),current_setting('ats_test.invoice_cipher'),clock_timestamp()+interval '1 day'),
      (org_invoice,null,org,encode(extensions.digest(repeat('o',43),'sha256'),'hex'),current_setting('ats_test.organization_cipher'),clock_timestamp()+interval '1 day');
  select jsonb_build_object('quote',(select jsonb_agg(to_jsonb(t)order by id)from public.quote_portal_tokens t where t.quote_id=fixture.quote_id),
    'invoice',(select jsonb_agg(to_jsonb(t)order by id)from public.invoice_portal_tokens t where t.invoice_id=any(array[fixture.invoice_id,org_invoice])))into token_rows;
  perform pg_temp.source_read_check(jsonb_array_length(token_rows->'quote')=1,'one synthetic proposal link is retained');
  perform pg_temp.source_read_check(jsonb_array_length(token_rows->'invoice')=2,'two synthetic invoice links are retained');
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  select (select count(*)from public.quote_portal_tokens t where t.quote_id=fixture.quote_id)+(select count(*)from public.invoice_portal_tokens t where t.invoice_id=any(array[fixture.invoice_id,org_invoice]))into n;
  perform set_config('role','none',true);perform pg_temp.source_read_check(n=3,'server role can read all three synthetic document links');
  foreach target in array array['anon','authenticated']loop
    foreach kind in array array['quote','invoice']loop
      denied:=false;perform set_config('request.jwt.claims',jsonb_build_object('role',target)::text,true);perform set_config('role',target,true);
      begin execute format('select count(*)from public.%I where %I=$1',kind||'_portal_tokens',kind||'_id')into n using case when kind='quote'then quote_id else invoice_id end;denied:=n=0;
      exception when insufficient_privilege then denied:=true;end;
      perform set_config('role','none',true);perform pg_temp.source_read_check(denied,target||': no unauthorized '||kind||' link access');
    end loop;
  end loop;
  select jsonb_build_object(
    'customers',(select jsonb_agg(to_jsonb(c))from public.customers c where id=party),
    'organizations',(select jsonb_agg(to_jsonb(o))from public.organizations o where id=org),
    'organization_contacts','[]'::jsonb,
    'quote_portal_tokens',token_rows->'quote',
    'invoice_portal_tokens',token_rows->'invoice',
    'quotes',(select jsonb_agg(to_jsonb(q)||jsonb_build_object('quote_line_items','[]'::jsonb))from public.quotes q where id=quote_id),
    'invoices',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('jobs',null))from public.invoices i where id=any(array[fixture.invoice_id,org_invoice])),
    'payments',(select jsonb_agg(to_jsonb(p)||jsonb_build_object('invoices',(select to_jsonb(i)from public.invoices i where i.id=p.invoice_id)))from public.payments p where id=payment_id),
    'email_events','[]'::jsonb)into sources;
  sources:=sources||jsonb_build_object('communication_settings',jsonb_build_array(settings));
  foreach target in array array['customers','organizations','quotes','invoices','payments']loop
    queue_id:=gen_random_uuid();is_org:=target='organizations';row_quote:=null;row_payment:=null;
    row_invoice:=case when is_org then org_invoice else invoice_id end;kind:='invoice_payment_reminder';
    if target='quotes'then kind:='quote_follow_up';row_quote:=quote_id;row_invoice:=null;end if;
    if target='invoices'then kind:='overdue_invoice_reminder';end if;
    if target='payments'then kind:='payment_confirmation';row_payment:=payment_id;end if;
    insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,organization_id,invoice_id,quote_id,payment_id,
      recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key)
      values(queue_id,kind,'synthetic_read_safety',case when is_org then null else party end,case when is_org then org end,row_invoice,row_quote,row_payment,
        case when is_org then 'organization'else 'customer'end,case when is_org then 'read-organization@example.invalid'else 'read-customer@example.invalid'end,
        clock_timestamp(),false,'synthetic-read-safety/'||queue_id);
    select to_jsonb(c)into original_row from public.customer_communications c where id=queue_id;
    principal:=null;
    if row_invoice is not null then
      perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
      principal:=public.get_invoice_payment_principal(row_invoice);perform set_config('role','none',true);
    end if;
    claim_at:=clock_timestamp();
    update public.customer_communications set status='processing',attempt_count=1,processing_started_at=claim_at where id=queue_id;
    update public.customer_communications set status='failed'where id=queue_id and status='processing'and attempt_count=1 and processing_started_at=claim_at-interval '1 second';
    get diagnostics n=row_count;
    perform pg_temp.source_read_check(n=0 and(select status='processing'from public.customer_communications where id=queue_id),target||': stale failure write cannot replace another claim');
    update public.customer_communications set status='failed',last_error='Delivery checks could not be completed safely. No email was sent.',processing_started_at=null
      where id=queue_id and status='processing'and attempt_count=1 and processing_started_at=claim_at;
    get diagnostics n=row_count;
    perform pg_temp.source_read_check(n=1 and(select cancelled_at is null and skip_reason is null and status='failed'from public.customer_communications where id=queue_id),target||': current failure is visible without cancellation or automatic retry');
    perform pg_temp.source_read_check(not exists(select 1 from app_private.outbound_deliveries where context->>'communication_id'=queue_id::text)
      and not exists(select 1 from public.email_events where related_communication_id=queue_id),target||': failed preparation creates no delivery or acceptance history');
    source_id:=case target when 'customers'then party when 'organizations'then org when 'quotes'then quote_id when 'invoices'then invoice_id else payment_id end;
    denied:=false;code:=null;
    perform set_config('request.jwt.claims','{"role":"anon"}',true);perform set_config('role','anon',true);
    begin
      execute format('select count(*)from public.%I where id=$1',target)into n using source_id;
      denied:=n=0;
    exception when insufficient_privilege then denied:=true;code:=sqlstate;end;
    perform set_config('role','none',true);
    perform pg_temp.source_read_check(denied,target||': anonymous callers cannot read the synthetic source');
    insert into source_read_fixtures values(target,original_row,sources,principal,code);
  end loop;
  perform pg_temp.source_read_check(token_rows=jsonb_build_object('quote',(select jsonb_agg(to_jsonb(t)order by id)from public.quote_portal_tokens t where t.quote_id=fixture.quote_id),'invoice',(select jsonb_agg(to_jsonb(t)order by id)from public.invoice_portal_tokens t where t.invoice_id=any(array[fixture.invoice_id,org_invoice]))),'synthetic link identities and bindings remain byte-identical');
  perform pg_temp.source_read_check(settings=(select to_jsonb(c)from public.communication_settings c where singleton),'all stored settings and OFF controls remain byte-identical');
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from source_read_assertions),
  'fixtures',(select jsonb_agg(to_jsonb(f)order by label)from source_read_fixtures f))verification;
rollback;
