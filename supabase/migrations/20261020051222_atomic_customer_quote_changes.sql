-- Durable acknowledgements contain no raw capability or message text. They are
-- private transaction state, not a new customer-facing data surface. Existing
-- authorized deletion of a quote/link can still remove its retry metadata;
-- the required activity event and internal note keep their existing lifecycles.
create table app_private.quote_change_requests (
  request_id uuid primary key,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  token_id uuid not null references public.quote_portal_tokens(id) on delete cascade,
  expected_revision integer not null check (expected_revision > 0),
  message_sha256 text not null check (message_sha256 ~ '^[0-9a-f]{64}$'),
  note_id uuid not null,
  resulting_revision integer not null check (resulting_revision > expected_revision),
  requested_at timestamptz not null
);
create index quote_change_requests_quote_idx on app_private.quote_change_requests(quote_id);
create index quote_change_requests_token_idx on app_private.quote_change_requests(token_id);
alter table app_private.quote_change_requests enable row level security;
revoke all on app_private.quote_change_requests from public,anon,authenticated,service_role;

create function app_private.request_quote_changes_locked(p_request_id uuid,p_token_hash text,p_expected_revision integer,p_message text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare
  q public.quotes%rowtype;t public.quote_portal_tokens%rowtype;r app_private.quote_change_requests%rowtype;
  quote_id uuid;initial_job uuid;resolved_job uuid;note_id uuid;requested_at timestamptz;
  message text:=btrim(p_message);message_hash text;revision integer;replayed boolean:=false;
begin
  if current_setting('role',true)<>'service_role' or auth.uid() is not null then
    raise exception 'Customer changes require the trusted quote-link endpoint.' using errcode='42501';end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<1
    or message is null or char_length(message)<3 or char_length(message)>1000 then
    raise exception 'Review the proposal and enter a request between 3 and 1,000 characters.' using errcode='22023';end if;
  if p_token_hash is null or p_token_hash!~'^[0-9a-f]{64}$' then
    raise exception 'This quote link is unavailable or expired.' using errcode='42501';end if;
  message_hash:=encode(sha256(convert_to(message,'UTF8')),'hex');
  -- Serialize even a reused request ID aimed at a different quote. There is no
  -- path that acquires this advisory lock after a business row lock.
  perform pg_advisory_xact_lock(hashtextextended('portal-change/'||p_request_id::text,0));
  select x.quote_id into quote_id from public.quote_portal_tokens x where x.token_hash=p_token_hash;
  if quote_id is null then raise exception 'This quote link is unavailable or expired.' using errcode='42501';end if;
  -- Same job -> quote -> token order as editing and approval. Recheck all
  -- capability and revision predicates after any lock wait, using wall time.
  select coalesce(x.job_id,(select id from public.jobs where source_quote_id=quote_id)) into initial_job
    from public.quotes x where x.id=quote_id;
  if initial_job is not null then
    perform 1 from public.jobs where id=initial_job for update;
    if not found then raise exception 'The linked work changed. Refresh the proposal.' using errcode='40001';end if;
  end if;
  select * into q from public.quotes where id=quote_id for update;
  if not found then raise exception 'This quote link is unavailable or expired.' using errcode='42501';end if;
  select * into t from public.quote_portal_tokens where token_hash=p_token_hash and quote_portal_tokens.quote_id=q.id for update;
  if not found or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=clock_timestamp()) or q.archived_at is not null then
    raise exception 'This quote link is unavailable or expired.' using errcode='42501';end if;
  select coalesce(q.job_id,(select id from public.jobs where source_quote_id=q.id)) into resolved_job;
  if resolved_job is distinct from initial_job then
    raise exception 'The linked work changed. Refresh the proposal.' using errcode='40001';end if;
  select * into r from app_private.quote_change_requests where request_id=p_request_id;
  if found then
    if r.quote_id<>q.id or r.token_id<>t.id or r.expected_revision<>p_expected_revision or r.message_sha256<>message_hash then
      raise exception 'This request was already used for different details. Refresh the proposal.' using errcode='22023';end if;
    -- A lost acknowledgement remains recoverable after a later edit/approval.
    -- This is read-only; it never reopens an accepted proposal.
    note_id:=r.note_id;revision:=r.resulting_revision;requested_at:=r.requested_at;replayed:=true;
  else
    if q.edit_revision<>p_expected_revision then
      raise exception 'This proposal changed. Refresh and review it before requesting changes.' using errcode='40001';end if;
    if q.status not in('draft','sent','change_requested') then
      raise exception 'This proposal is no longer open for changes. Contact the office.' using errcode='23514';end if;
    requested_at:=clock_timestamp();
    insert into public.notes(customer_id,service_location_id,job_id,visibility,body)
      values(q.customer_id,q.service_location_id,q.job_id,'internal','Customer portal change request: '||message) returning id into note_id;
    -- Explicit revision also invalidates approval/editing after a second note
    -- while status is already change_requested. Existing revision trigger owns
    -- the increment and last_edited_at; it does not double-increment.
    update public.quotes set status='change_requested',approved_at=null,edit_revision=edit_revision+1
      where id=q.id returning edit_revision into revision;
    update public.customer_communications set status='cancelled',cancelled_at=requested_at,last_error=null,
      processing_started_at=null,skip_reason='Customer requested changes to the quote.' where customer_communications.quote_id=q.id and status='pending';
    update public.quote_portal_tokens set used_at=requested_at where id=t.id;
    insert into public.activity_log(actor_user_id,actor_type,subject_type,subject_id,event_type,metadata_json)
      values(null,'portal','quote',q.id,'quote_change_request_recorded',
        jsonb_build_object('request_id',p_request_id,'note_id',note_id,'from_revision',p_expected_revision,'edit_revision',revision));
    insert into app_private.quote_change_requests values(p_request_id,q.id,t.id,p_expected_revision,message_hash,note_id,revision,requested_at);
  end if;
  return jsonb_build_object('request_id',p_request_id,'quote_id',q.id,'note_id',note_id,'edit_revision',revision,
    'requested_at',requested_at,'replayed',replayed,'customer_id',q.customer_id,'organization_id',q.organization_id,
    'quote_number',q.quote_number,'party_name',coalesce((select name from public.organizations where id=q.organization_id),
      (select display_name from public.customers where id=q.customer_id),'Customer'));
end; $$;
revoke all on function app_private.request_quote_changes_locked(uuid,text,integer,text) from public,anon,authenticated,service_role;

create function public.request_quote_changes_by_portal(p_request_id uuid,p_token_hash text,p_expected_revision integer,p_message text)
returns jsonb language sql security definer set search_path='' set lock_timeout='5s' as $$
  select app_private.request_quote_changes_locked(p_request_id,p_token_hash,p_expected_revision,p_message);
$$;
revoke all on function public.request_quote_changes_by_portal(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.request_quote_changes_by_portal(uuid,text,integer,text) to service_role;
notify pgrst,'reload schema';
