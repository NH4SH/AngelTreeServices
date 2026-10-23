-- Candidate and synthetic command checks run in one rollback-only transaction.
begin;
set local lock_timeout='3s';set local statement_timeout='45s';
create temporary table followup_expiry_assertions(label text);
create temporary table followup_expiry_fixtures(label text,input jsonb);
create temporary table followup_expiry_before as select pg_get_functiondef(p.oid)definition,to_jsonb(p)-'prosrc'metadata
  from pg_proc p where p.oid='app_private.email_source_eligible(jsonb,jsonb)'::regprocedure;
create temporary table followup_claim_before as select to_jsonb(p)-'prosrc'metadata
  from pg_proc p where p.oid='public.claim_outbound_delivery(uuid)'::regprocedure;
create function pg_temp.followup_expiry_check(ok boolean,label text)returns void language plpgsql as $$begin
  if ok is distinct from true then raise exception 'Follow-up expiry assertion failed: %',label;end if;
  insert into followup_expiry_assertions values(label);
end $$;
create function pg_temp.followup_expiry_seed(deadline timestamptz)returns jsonb language plpgsql as $$
declare party uuid:=gen_random_uuid();site uuid:=gen_random_uuid();q uuid:=gen_random_uuid();t uuid:=gen_random_uuid();cm uuid:=gen_random_uuid();
  ctx jsonb;payload jsonb;prepared jsonb;source jsonb;communication jsonb;customer jsonb;
begin
  insert into public.customers(id,display_name,email)values(party,'Synthetic expiry customer','followup-'||party||'@example.invalid');
  insert into public.service_locations(id,customer_id,street,city,state)values(site,party,'123 Synthetic Lane','Fredericksburg','VA');
  insert into public.quotes(id,customer_id,service_location_id,quote_number,status,subtotal_cents,total_cents,expires_at,sent_at)
    values(q,party,site,'SYNTHETIC-FOLLOWUP-'||q,'sent',10000,10000,deadline,clock_timestamp());
  insert into public.quote_portal_tokens(id,quote_id,customer_id,token_hash,token_encrypted,expires_at)
    values(t,q,party,encode(sha256(convert_to(q::text,'UTF8')),'hex'),'synthetic-unusable-ciphertext',clock_timestamp()+interval '30 days');
  insert into public.customer_communications(id,communication_type,reminder_stage,customer_id,quote_id,recipient_source,recipient_email,scheduled_for,idempotency_key)
    values(cm,'quote_follow_up','first',party,q,'customer','followup-'||party||'@example.invalid',clock_timestamp(),'customer-communication/'||cm);
  select to_jsonb(c)into customer from public.customers c where id=party;
  select to_jsonb(x)||jsonb_build_object('quote_line_items','[]'::jsonb,'customers',customer,'organizations',null)into source from public.quotes x where id=q;
  select to_jsonb(x)into communication from public.customer_communications x where id=cm;
  ctx:=jsonb_build_object('kind','other','email_type','quote_follow_up','communication_id',cm,'quote_ids',jsonb_build_array(q),'customer_id',party,'portal_tokens',jsonb_build_array(jsonb_build_object('kind','quote','id',t)));
  payload:=jsonb_build_object('from','office@example.invalid','reply_to','office@example.invalid','to',jsonb_build_array(customer->>'email'),'cc','[]'::jsonb,'subject','Synthetic proposal follow-up','text','Synthetic verification only');
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  begin
    prepared:=public.prepare_outbound_delivery('customer-communication/'||cm,payload,ctx);
  exception when check_violation then prepared:=jsonb_build_object('blocked_code',sqlstate);end;
  perform set_config('role','none',true);
  return jsonb_build_object('quote',q,'token',t,'communication',communication,'context',ctx,'payload',payload,'delivery',prepared->>'id','blockedCode',prepared->>'blocked_code',
    'tables',jsonb_build_object('customers',jsonb_build_array(customer),'quotes',jsonb_build_array(source),'organization_contacts','[]'::jsonb));
end $$;

-- APPLY_FOLLOWUP_EXPIRY_CANDIDATE_HERE

do $test$
declare f jsonb;claim jsonb;saved jsonb;replay jsonb;before_source jsonb;history jsonb;label text;role_name text;denied boolean;
  anchor text:=$a$if not found or q.status<>'sent' or q.archived_at is not null or (cm.is_automatic and not q.automatic_follow_ups_enabled) then return false;end if;$a$;
  replacement text:=$a$if not found or q.status<>'sent' or q.archived_at is not null or (q.expires_at is not null and q.expires_at<=clock_timestamp()) or (cm.is_automatic and not q.automatic_follow_ups_enabled) then return false;end if;$a$;
begin
  perform pg_temp.followup_expiry_check((select not automated_sending_enabled and not appointment_change_notices_enabled from public.communication_settings where singleton),'sending and appointment notices remain OFF');
  perform pg_temp.followup_expiry_check((select to_jsonb(p)-'prosrc'=b.metadata and pg_get_functiondef(p.oid)=replace(b.definition,anchor,replacement)
    from pg_proc p cross join followup_expiry_before b where p.oid='app_private.email_source_eligible(jsonb,jsonb)'::regprocedure),'only the follow-up predicate changed; function metadata and privileges are preserved');
  perform pg_temp.followup_expiry_check((select to_jsonb(p)-'prosrc'=b.metadata from pg_proc p cross join followup_claim_before b where p.oid='public.claim_outbound_delivery(uuid)'::regprocedure),'final claim checkpoint preserves the existing service-only privileges and metadata');
  foreach label in array array['expired','at-deadline','future','undated']loop
    f:=pg_temp.followup_expiry_seed(case label when 'undated'then null when 'future'then clock_timestamp()+interval '1 day'when 'at-deadline'then statement_timestamp()else clock_timestamp()-interval '1 day'end);
    insert into followup_expiry_fixtures values(label,f);
    select to_jsonb(q)into before_source from public.quotes q where id=(f->>'quote')::uuid;
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
    claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
    perform set_config('role','none',true);
    perform pg_temp.followup_expiry_check((claim is not null)=(label in('future','undated')),label||': native admission respects proposal deadline independently of a usable token');
    perform pg_temp.followup_expiry_check((select to_jsonb(q)=before_source from public.quotes q where id=(f->>'quote')::uuid),label||': admission does not mutate the proposal or financial facts');
    perform pg_temp.followup_expiry_check(not exists(select 1 from public.email_events where related_quote_id=(f->>'quote')::uuid),label||': admission creates no acceptance history or customer email');
    if label in('expired','at-deadline')then
      perform pg_temp.followup_expiry_check(f->>'blockedCode'='23514'and not exists(select 1 from app_private.outbound_deliveries where context->>'communication_id'=f#>>'{communication,id}'),label||': stopped before saving or claiming a provider request');
    elsif label='future'then
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
      saved:=public.finish_outbound_delivery((f->>'delivery')::uuid,(claim->>'attempt_id')::uuid,'accepted',gen_random_uuid()::text);
      perform set_config('role','none',true);
      perform pg_temp.followup_expiry_check(saved->>'state'='accepted','synthetic acceptance is durably retained');
      update public.quotes set expires_at=clock_timestamp()-interval '1 day'where id=(f->>'quote')::uuid;
      select to_jsonb(d)into saved from app_private.outbound_deliveries d where id=(f->>'delivery')::uuid;
      select jsonb_agg(to_jsonb(e)order by id)into history from public.email_events e where outbound_delivery_id=(f->>'delivery')::uuid;
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
      replay:=public.prepare_outbound_delivery('customer-communication/'||(f#>>'{communication,id}'),f->'payload',f->'context');
      claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
      perform set_config('role','none',true);
      perform pg_temp.followup_expiry_check(replay->>'state'='accepted'and claim is null,'accepted same-key replay survives expiry without another claim');
      perform pg_temp.followup_expiry_check((select to_jsonb(d)=saved from app_private.outbound_deliveries d where id=(f->>'delivery')::uuid)
        and(select jsonb_agg(to_jsonb(e)order by id)=history from public.email_events e where outbound_delivery_id=(f->>'delivery')::uuid),'accepted delivery and history are unchanged after expiry');
    end if;
  end loop;
  f:=pg_temp.followup_expiry_seed(clock_timestamp()+interval '250 milliseconds');
  perform pg_sleep(0.35);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
  perform set_config('role','none',true);
  perform pg_temp.followup_expiry_check(claim is null,'wall-clock expiry after preparation rejects the frozen request within the same transaction');
  f:=pg_temp.followup_expiry_seed(clock_timestamp()+interval '1 day');
  update public.quote_portal_tokens set revoked_at=clock_timestamp()where id=(f->>'token')::uuid;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
  perform set_config('role','none',true);
  perform pg_temp.followup_expiry_check(claim is null,'existing revoked-token fence is preserved');
  f:=pg_temp.followup_expiry_seed(clock_timestamp()+interval '1 day');
  update public.customer_communications set is_automatic=true where id=(f#>>'{communication,id}')::uuid;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
  perform set_config('role','none',true);
  perform pg_temp.followup_expiry_check(claim is null,'automatic sending OFF remains a separate admission fence');
  f:=pg_temp.followup_expiry_seed(clock_timestamp()+interval '1 day');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
  saved:=public.finish_outbound_delivery((f->>'delivery')::uuid,(claim->>'attempt_id')::uuid,'unknown',null);
  perform set_config('role','none',true);
  update public.quotes set expires_at=clock_timestamp()-interval '1 day'where id=(f->>'quote')::uuid;
  select to_jsonb(d)into saved from app_private.outbound_deliveries d where id=(f->>'delivery')::uuid;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  replay:=public.prepare_outbound_delivery('customer-communication/'||(f#>>'{communication,id}'),f->'payload',f->'context');
  claim:=public.claim_outbound_delivery((f->>'delivery')::uuid);
  perform set_config('role','none',true);
  perform pg_temp.followup_expiry_check(replay->>'state'='unknown'and claim is null and(select to_jsonb(d)=saved from app_private.outbound_deliveries d where id=(f->>'delivery')::uuid),'uncertain delivery remains quarantined and unchanged after expiry');
  f:=pg_temp.followup_expiry_seed(clock_timestamp()-interval '1 day');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);perform set_config('role','service_role',true);
  replay:=public.prepare_outbound_delivery('synthetic-document/'||(f->>'quote'),f->'payload',(f->'context')||jsonb_build_object('kind','quote','email_type','quote','communication_id',null));
  claim:=public.claim_outbound_delivery((replay->>'id')::uuid);
  perform set_config('role','none',true);
  perform pg_temp.followup_expiry_check(claim is not null,'ordinary deliberate document sending keeps its existing separate rules');
  foreach role_name in array array['anon','authenticated']loop
    denied:=false;perform set_config('request.jwt.claims',jsonb_build_object('role',role_name)::text,true);perform set_config('role',role_name,true);
    begin perform public.claim_outbound_delivery((f->>'delivery')::uuid);exception when insufficient_privilege then denied:=true;end;
    perform set_config('role','none',true);
    perform pg_temp.followup_expiry_check(denied,role_name||': service-only delivery admission remains denied');
  end loop;
end $test$;
select jsonb_build_object('syntheticOnly',true,'rolledBack',true,'assertions',(select jsonb_agg(label order by label)from followup_expiry_assertions),
  'fixtures',(select jsonb_agg(to_jsonb(f)order by label)from followup_expiry_fixtures f))verification;
rollback;
