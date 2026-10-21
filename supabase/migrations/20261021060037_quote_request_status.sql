-- Read-only recovery for request-aware draft/copy creation (migration 99).
-- No receipt, quote, audit, notification, or provider writes occur here.
create function public.resolve_quote_draft_request(p_request_id uuid, p_header jsonb, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '2s' as $$
declare
  actor uuid := auth.uid();
  previous app_private.quote_draft_requests%rowtype;
  current_status text;
  fingerprint text;
begin
  if actor is null or not app_private.has_staff_role() then
    raise exception 'This saved request cannot be checked with your current access.' using errcode='42501';
  end if;
  -- A repeatable snapshot could predate a creator that commits while we wait.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Check this saved request again.' using errcode='55000';
  end if;
  if p_request_id is null or p_header is null or jsonb_typeof(p_header)<>'object'
    or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'The saved request details could not be checked.' using errcode='22023';
  end if;
  -- Readers can share this lock, but wait for the existing creator's exclusive
  -- transaction lock. Never infer failure while that creator is committing.
  perform pg_advisory_xact_lock_shared(hashtextextended(p_request_id::text, 43667));
  if not app_private.has_staff_role() then
    raise exception 'This saved request cannot be checked with your current access.' using errcode='42501';
  end if;
  select * into previous from app_private.quote_draft_requests r where r.request_id=p_request_id;
  if not found then
    -- Point-in-time only: a new sender may arrive after this read. The caller
    -- must retain the same identity/body and must not automatically resend.
    return jsonb_build_object('request_id',p_request_id,'state','not_recorded','receipt',null,'quote_status',null);
  end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('header',p_header,'lines',p_lines)::text,'UTF8')),'hex');
  if previous.actor_user_id<>actor or previous.input_hash<>fingerprint then
    -- Do not reveal another actor's quote or whether the payload differs.
    raise exception 'The saved request details could not be checked.' using errcode='42501';
  end if;
  select q.status into current_status from public.quotes q where q.id=previous.quote_id;
  return jsonb_build_object('request_id',p_request_id,'state',case when found then 'recorded' else 'unavailable' end,
    'receipt',previous.result_json,'quote_status',current_status);
end;
$$;
revoke all on function public.resolve_quote_draft_request(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.resolve_quote_draft_request(uuid,jsonb,jsonb) to authenticated;
