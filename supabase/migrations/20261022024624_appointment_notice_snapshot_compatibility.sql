-- Preserve the exact automation snapshot shape of pre-notice saved emails.
-- New notices already bind their switch through current_appointment_notice().
-- Toggling visit notices must not invalidate unrelated invoice/payment deliveries.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $compatibility$
declare f text:=pg_get_functiondef('app_private.email_source_snapshot(jsonb)'::regprocedure);
 anchor text:='to_jsonb(s)-array[''updated_at'',''created_at''] from public.communication_settings';
begin
 if (length(f)-length(replace(f,anchor,'')))/length(anchor)<>1 then raise exception 'Unexpected automation snapshot preimage';end if;
 execute replace(f,anchor,'to_jsonb(s)-array[''updated_at'',''created_at'',''appointment_change_notices_enabled''] from public.communication_settings');
end $compatibility$;
notify pgrst,'reload schema';
commit;
