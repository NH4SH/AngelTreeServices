-- A proposal deadline is independent of the customer-link lifetime.
-- Narrow only new quote-follow-up admission; preserve accepted/uncertain replay,
-- source locks, snapshots, ordinary document sends and every existing privilege.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $migration$
declare
  definition text;
  anchor text:=$anchor$if not found or q.status<>'sent' or q.archived_at is not null or (cm.is_automatic and not q.automatic_follow_ups_enabled) then return false;end if;$anchor$;
  replacement text:=$anchor$if not found or q.status<>'sent' or q.archived_at is not null or (q.expires_at is not null and q.expires_at<=clock_timestamp()) or (cm.is_automatic and not q.automatic_follow_ups_enabled) then return false;end if;$anchor$;
  claim_definition text;
  claim_anchor text:=$anchor$  a:=gen_random_uuid();$anchor$;
  final_guard text:=$guard$  -- The recipient/family advisory lock above can wait beyond the deadline.
  -- Reuse live eligibility after that wait and before saving a provider attempt.
  if d.context->>'email_type'='quote_follow_up' and not app_private.email_source_eligible(d.context||jsonb_build_object('actor_id',coalesce(d.authorized_actor_id,d.actor_id)),d.payload) then
    update app_private.outbound_deliveries set state='cancelled',repair_state='source_changed',problem_code='source_changed' where id=d.id;return null;
  end if;
$guard$;
begin
  definition:=pg_get_functiondef('app_private.email_source_eligible(jsonb,jsonb)'::regprocedure);
  claim_definition:=pg_get_functiondef('public.claim_outbound_delivery(uuid)'::regprocedure);
  if position(replacement in definition)>0 and position(final_guard in claim_definition)>0 then return;end if;
  if position(replacement in definition)=0 and ((length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1
    or position('if cm.communication_type=''quote_follow_up'' then' in definition)=0) then
    raise exception 'Email eligibility definition changed; review the proposal follow-up expiry patch before applying.';
  end if;
  if (length(claim_definition)-length(replace(claim_definition,claim_anchor,'')))/length(claim_anchor)<>1
    or position('pg_advisory_xact_lock(143,' in claim_definition)=0 then
    raise exception 'Email claim definition changed; review the final proposal expiry checkpoint before applying.';
  end if;
  if position(replacement in definition)=0 then execute replace(definition,anchor,replacement);end if;
  if position(final_guard in claim_definition)=0 then execute replace(claim_definition,claim_anchor,final_guard||claim_anchor);end if;
end $migration$;
notify pgrst,'reload schema';
commit;
