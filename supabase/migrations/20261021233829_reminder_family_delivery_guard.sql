-- Preserve the existing transactional admission, authorization, payload and source locks.
-- Only broaden matching reminder families and include legacy accepted delivery evidence.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $guard$ begin
 if (select md5(prosrc) from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure) <> '55d6544971386a2090116edfc5d4c39d' then
  raise exception 'Unexpected delivery guard preimage';
 end if;
end $guard$;
create function app_private.customer_email_family(p_type text) returns text
language sql immutable security invoker set search_path='' as $$
 select case when p_type in ('invoice','invoice_payment_reminder','overdue_invoice_reminder') then 'invoice_reminder'
   when p_type in ('quote','quote_follow_up') then 'quote_follow_up' else p_type end;
$$;
alter function app_private.customer_email_family(text) owner to postgres;
revoke all on function app_private.customer_email_family(text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.claim_outbound_delivery(p_delivery_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d app_private.outbound_deliveries%rowtype; a uuid; interval_hours integer;
begin
  perform app_private.email_server_only();
  select * into d from app_private.outbound_deliveries where id=p_delivery_id;
  if not found then return null;end if;
  perform app_private.lock_email_sources(d.context);
  select * into d from app_private.outbound_deliveries where id=p_delivery_id for update;
  if not (d.state='prepared' or (d.state='rejected' and d.retry_authorized)) or d.attempt_count>=3 then return null;end if;
  if d.first_dispatched_at is not null and (not d.retry_authorized or d.first_dispatched_at<=clock_timestamp()-interval '23 hours') then
    update app_private.outbound_deliveries set repair_state='needs_review',problem_code='provider_key_expired' where id=d.id;return null;
  end if;
  if d.source_snapshot<>app_private.email_source_snapshot(d.context) or not app_private.email_source_eligible(d.context||jsonb_build_object('actor_id',coalesce(d.authorized_actor_id,d.actor_id)),d.payload) then
    update app_private.outbound_deliveries set state='cancelled',repair_state='source_changed',problem_code='source_changed' where id=d.id;return null;
  end if;
  if d.context->>'communication_id' is not null then
    select minimum_send_interval_hours into interval_hours from public.communication_settings where singleton;
    -- Serialize matching delivery admission across distinct queue rows too.
    perform pg_advisory_xact_lock(143,hashtext((d.payload#>>'{to,0}')||'/'||app_private.customer_email_family(d.context->>'email_type')));
    if exists(select 1 from app_private.outbound_deliveries o where o.id<>d.id and o.payload#>>'{to,0}'=d.payload#>>'{to,0}'
      and app_private.customer_email_family(o.context->>'email_type')=app_private.customer_email_family(d.context->>'email_type')
      and coalesce(o.context->>'invoice_id',o.context->>'quote_ids',o.context->>'schedule_event_id',o.context->>'appointment_id',o.context->>'job_id','')=
        coalesce(d.context->>'invoice_id',d.context->>'quote_ids',d.context->>'schedule_event_id',d.context->>'appointment_id',d.context->>'job_id','')
      and ((o.state='accepted' and o.accepted_at>now()-make_interval(hours=>coalesce(interval_hours,24))) or o.state in ('dispatching','unknown'))) or exists(
      select 1 from public.email_events e where e.status='sent'
      and app_private.customer_email_family(e.email_type)=app_private.customer_email_family(d.context->>'email_type')
      and coalesce(e.sent_at,e.created_at)>now()-make_interval(hours=>coalesce(interval_hours,24))
      and (case when d.context->>'email_type'='payment_confirmation' then e.related_payment_id=nullif(d.context->>'payment_id','')::uuid
        when d.context->>'invoice_id' is not null then e.related_invoice_id=nullif(d.context->>'invoice_id','')::uuid
        when d.context->'quote_ids' is not null then (d.context->'quote_ids') ? e.related_quote_id::text
        when d.context->>'schedule_event_id' is not null then e.related_schedule_event_id=nullif(d.context->>'schedule_event_id','')::uuid
        when d.context->>'appointment_id' is not null then e.related_appointment_id=nullif(d.context->>'appointment_id','')::uuid
        else e.related_job_id=nullif(d.context->>'job_id','')::uuid end)
    ) then
      update app_private.outbound_deliveries set state='cancelled',repair_state='needs_review',problem_code='matching_delivery' where id=d.id;return null;
    end if;
  end if;
  a:=gen_random_uuid();
  update app_private.outbound_deliveries set state='dispatching',active_communication_claim=(select jsonb_build_object('attempt_count',cm.attempt_count,'processing_started_at',cm.processing_started_at,'status',cm.status) from public.customer_communications cm where cm.id=nullif(d.context->>'communication_id','')::uuid),attempt_id=a,attempt_count=attempt_count+1,retry_authorized=false,
    first_dispatched_at=coalesce(first_dispatched_at,clock_timestamp()),last_dispatched_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp(),problem_code=null where id=d.id;
  insert into app_private.outbound_delivery_attempts(id,delivery_id,actor_id) values(a,d.id,coalesce(d.authorized_actor_id,d.actor_id));
  return jsonb_build_object('id',d.id,'attempt_id',a,'payload',d.payload,'context',d.context,'idempotency_key',d.provider_key);
end $function$
;
notify pgrst,'reload schema';
commit;
