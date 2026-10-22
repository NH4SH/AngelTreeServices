-- Recheck family uncertainty at dispatch, including requests prepared earlier.
-- Existing document kinds and legacy frozen change-order requests retain their rules.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $claim_guard$
declare f text:=pg_get_functiondef('public.claim_outbound_delivery(uuid)'::regprocedure);
 anchor text:='  if d.first_dispatched_at is not null and (not d.retry_authorized';
begin
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected delivery claim preimage';end if;
 execute replace(f,anchor,$body$  if d.context->>'kind'='change_order' and d.context->>'change_order_send_version'='1' and exists(
    select 1 from app_private.outbound_deliveries other_delivery where other_delivery.id<>d.id
      and other_delivery.context->>'kind'='change_order'
      and other_delivery.context->>'change_order_id'=d.context->>'change_order_id'
      and (other_delivery.state in ('dispatching','unknown') or other_delivery.state='accepted' and other_delivery.repair_state<>'complete')) then
    update app_private.outbound_deliveries set repair_state='needs_review',problem_code='matching_delivery',updated_at=clock_timestamp() where id=d.id;
    return null;
  end if;
  if d.first_dispatched_at is not null and (not d.retry_authorized$body$);
end $claim_guard$;
notify pgrst,'reload schema';
commit;
