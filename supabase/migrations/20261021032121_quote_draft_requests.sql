-- PR05/PR12 follow-through: web submissions can recover a lost acknowledgement
-- without replaying creation. Existing creation commands and their callers remain.
create table app_private.quote_draft_requests (
  request_id uuid primary key,
  actor_user_id uuid not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  quote_id uuid not null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);
alter table app_private.quote_draft_requests enable row level security;
create policy "No direct quote request access" on app_private.quote_draft_requests
  as restrictive for all to public using (false) with check (false);
revoke all on app_private.quote_draft_requests from public, anon, authenticated, service_role;

create function public.create_quote_draft_request(p_request_id uuid, p_header jsonb, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare
  actor uuid := auth.uid();
  fingerprint text;
  previous app_private.quote_draft_requests%rowtype;
  existing public.quotes%rowtype;
  result jsonb;
begin
  if actor is null or not app_private.has_staff_role() then
    raise exception 'Only active office staff may create quotes.' using errcode='42501';
  end if;
  if p_request_id is null or p_header is null or jsonb_typeof(p_header)<>'object'
    or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'Review the quote request and its details.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 43667));
  if not app_private.has_staff_role() then
    raise exception 'Only active office staff may create quotes.' using errcode='42501';
  end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('header',p_header,'lines',p_lines)::text,'UTF8')),'hex');
  select * into previous from app_private.quote_draft_requests r where r.request_id=p_request_id;
  if found then
    if previous.actor_user_id<>actor or previous.input_hash<>fingerprint then
      raise exception 'This request has already been used with different details. Review the saved quote before starting another draft.' using errcode='23514';
    end if;
    select * into existing from public.quotes q where q.id=previous.quote_id for share;
    if not found then
      raise exception 'The quote from this request is no longer available. Review its history before starting another draft.' using errcode='23514';
    end if;
    -- Preserve the original receipt, even when the quote has since been edited
    -- or closed. Callers must offer review, not acknowledge a new edit.
    return previous.result_json || jsonb_build_object('replayed',true,'quote_status',existing.status);
  end if;
  result := public.create_quote_draft(p_header,p_lines);
  select * into existing from public.quotes q where q.id=(result->>'id')::uuid;
  result := result || jsonb_build_object('request_id',p_request_id,'replayed',false,'quote_status',existing.status,
    'customer_id',existing.customer_id,'organization_id',existing.organization_id,
    'service_location_id',existing.service_location_id,'job_id',existing.job_id);
  insert into app_private.quote_draft_requests(request_id,actor_user_id,input_hash,quote_id,result_json)
    values(p_request_id,actor,fingerprint,existing.id,result);
  return result;
end;
$$;
revoke all on function public.create_quote_draft_request(uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_quote_draft_request(uuid,jsonb,jsonb) to authenticated;
