-- A correction must also wait for an original booking/reminder already in flight.
-- Keep the source lock and durable review boundary; never retry the old delivery.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $ordering$
declare f text:=pg_get_functiondef('app_private.current_appointment_notice(uuid)'::regprocedure);
 anchor text:=$old$if exists(select 1 from app_private.outbound_deliveries d join app_private.appointment_notice_events prior on d.context->>'communication_id'=prior.id::text
  where prior.source_kind=e.source_kind and prior.source_id=e.source_id and prior.event_order<e.event_order and d.state in ('dispatching','unknown')) then$old$;
 replacement text:=$new$if exists(select 1 from app_private.outbound_deliveries d
  where d.state in ('dispatching','unknown') and coalesce(d.context->>'communication_id','')<>e.id::text
   and d.context->>'email_type' in ('estimate_confirmation','estimate_reminder','work_confirmation','work_reminder','appointment_changed','appointment_cancelled')
   and ((e.source_kind='schedule_event' and d.context->>'schedule_event_id'=e.source_id::text)
    or (e.source_kind='appointment' and d.context->>'appointment_id'=e.source_id::text)
    or (e.source_kind='schedule_event' and exists(select 1 from public.schedule_events v where v.id=e.source_id and v.source_appointment_id::text=d.context->>'appointment_id'))
    or (d.context->>'schedule_event_id' is null and d.context->>'appointment_id' is null and d.context->>'job_id'=e.job_id::text))) then$new$;
begin
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected visit ordering preimage';end if;
 execute replace(f,anchor,replacement);
end $ordering$;
commit;
