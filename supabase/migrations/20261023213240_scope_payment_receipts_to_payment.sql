-- A receipt belongs to a payment, not to every payment on its invoice.
-- Keep source/family locks, same-payment/uncertain holds and all existing rights.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $migration$
declare definition text;
  anchor text:=$anchor$and coalesce(o.context->>'invoice_id',o.context->>'quote_ids',o.context->>'schedule_event_id',o.context->>'appointment_id',o.context->>'job_id','')=
        coalesce(d.context->>'invoice_id',d.context->>'quote_ids',d.context->>'schedule_event_id',d.context->>'appointment_id',d.context->>'job_id','')$anchor$;
  replacement text:=$replacement$and (case when d.context->>'email_type'='payment_confirmation' then
        o.context->>'payment_id'=d.context->>'payment_id'
        or (nullif(o.context->>'payment_id','') is null and o.context->>'invoice_id'=d.context->>'invoice_id')
      else coalesce(o.context->>'invoice_id',o.context->>'quote_ids',o.context->>'schedule_event_id',o.context->>'appointment_id',o.context->>'job_id','')=
        coalesce(d.context->>'invoice_id',d.context->>'quote_ids',d.context->>'schedule_event_id',d.context->>'appointment_id',d.context->>'job_id','') end)$replacement$;
begin
  definition:=pg_get_functiondef('public.claim_outbound_delivery(uuid)'::regprocedure);
  if position(replacement in definition)>0 then return;end if;
  if (select md5(prosrc) from pg_proc where oid='public.claim_outbound_delivery(uuid)'::regprocedure)<>'bb7b11ffb22e05ad6e9a825673fb2076'
    or (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Email claim definition changed; review payment receipt matching before applying.';
  end if;
  execute replace(definition,anchor,replacement);
end $migration$;
notify pgrst,'reload schema';
commit;
