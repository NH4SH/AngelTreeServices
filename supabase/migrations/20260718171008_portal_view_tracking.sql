-- Privacy-conscious customer portal engagement for quotes and invoices.
-- Public browsers call a server route; only service_role may execute the
-- atomic recording function or write event rows directly.

alter table public.quotes
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count integer not null default 0;

alter table public.quotes
  drop constraint if exists quotes_view_count_nonnegative;
alter table public.quotes
  add constraint quotes_view_count_nonnegative check (view_count >= 0);

alter table public.invoices
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists view_count integer not null default 0;

alter table public.invoices
  drop constraint if exists invoices_view_count_nonnegative;
alter table public.invoices
  add constraint invoices_view_count_nonnegative check (view_count >= 0);

create table public.portal_view_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  document_type text not null check (document_type in ('quote', 'invoice')),
  document_id uuid not null,
  visitor_session_id text not null check (
    char_length(visitor_session_id) between 16 and 120
    and visitor_session_id ~ '^[A-Za-z0-9_-]+$'
  ),
  viewed_at timestamptz not null default now(),
  user_agent_family text check (user_agent_family is null or char_length(user_agent_family) <= 80),
  referrer_domain text check (referrer_domain is null or char_length(referrer_domain) <= 255),
  created_at timestamptz not null default now(),
  constraint portal_view_events_one_contracting_party check (
    (customer_id is null) <> (organization_id is null)
  )
);

create index portal_view_events_document_viewed_idx
  on public.portal_view_events(document_type, document_id, viewed_at desc);
create index portal_view_events_session_dedupe_idx
  on public.portal_view_events(document_type, document_id, visitor_session_id, viewed_at desc);
create index portal_view_events_customer_idx
  on public.portal_view_events(customer_id, viewed_at desc)
  where customer_id is not null;
create index portal_view_events_organization_idx
  on public.portal_view_events(organization_id, viewed_at desc)
  where organization_id is not null;

alter table public.portal_view_events enable row level security;

revoke all on table public.portal_view_events from public, anon, authenticated;
grant select on table public.portal_view_events to authenticated;
grant select, insert, update, delete on table public.portal_view_events to service_role;

create policy "Staff can read portal view events"
  on public.portal_view_events
  for select
  to authenticated
  using (app_private.has_staff_role());

create or replace function public.record_portal_view(
  p_document_type text,
  p_token_hash text,
  p_visitor_session_id text,
  p_user_agent_family text default null,
  p_referrer_domain text default null
)
returns table (recorded boolean, first_view boolean, current_view_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_document_id uuid;
  target_customer_id uuid;
  target_organization_id uuid;
  target_document_number text;
  target_first_viewed_at timestamptz;
  target_view_count integer;
  duplicate_session boolean;
  event_time timestamptz := pg_catalog.now();
  normalized_user_agent text := nullif(pg_catalog.left(pg_catalog.btrim(p_user_agent_family), 80), '');
  normalized_referrer text := nullif(pg_catalog.left(pg_catalog.btrim(p_referrer_domain), 255), '');
begin
  if p_document_type not in ('quote', 'invoice') then
    raise exception 'Unsupported portal document type.' using errcode = '22023';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid portal token.' using errcode = '22023';
  end if;

  if p_visitor_session_id is null
    or char_length(p_visitor_session_id) not between 16 and 120
    or p_visitor_session_id !~ '^[A-Za-z0-9_-]+$'
  then
    raise exception 'Invalid portal session.' using errcode = '22023';
  end if;

  if p_document_type = 'quote' then
    select quote.id, quote.customer_id, quote.organization_id,
      quote.quote_number, quote.first_viewed_at, quote.view_count
    into target_document_id, target_customer_id, target_organization_id,
      target_document_number, target_first_viewed_at, target_view_count
    from public.quote_portal_tokens as token
    join public.quotes as quote on quote.id = token.quote_id
    where token.token_hash = p_token_hash
      and token.revoked_at is null
      and (token.expires_at is null or token.expires_at > event_time)
    for update of quote;
  else
    select invoice.id, invoice.customer_id, invoice.organization_id,
      invoice.invoice_number, invoice.first_viewed_at, invoice.view_count
    into target_document_id, target_customer_id, target_organization_id,
      target_document_number, target_first_viewed_at, target_view_count
    from public.invoice_portal_tokens as token
    join public.invoices as invoice on invoice.id = token.invoice_id
    where token.token_hash = p_token_hash
      and token.revoked_at is null
      and (token.expires_at is null or token.expires_at > event_time)
    for update of invoice;
  end if;

  if target_document_id is null then
    raise exception 'Portal link is unavailable.' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.portal_view_events as event
    where event.document_type = p_document_type
      and event.document_id = target_document_id
      and event.visitor_session_id = p_visitor_session_id
      and event.viewed_at > event_time - interval '30 minutes'
  ) into duplicate_session;

  if duplicate_session then
    return query select false, false, target_view_count;
    return;
  end if;

  insert into public.portal_view_events (
    customer_id,
    organization_id,
    document_type,
    document_id,
    visitor_session_id,
    viewed_at,
    user_agent_family,
    referrer_domain
  ) values (
    target_customer_id,
    target_organization_id,
    p_document_type,
    target_document_id,
    p_visitor_session_id,
    event_time,
    normalized_user_agent,
    normalized_referrer
  );

  if p_document_type = 'quote' then
    update public.quotes as quote
    set
      first_viewed_at = coalesce(quote.first_viewed_at, event_time),
      last_viewed_at = event_time,
      view_count = quote.view_count + 1
    where quote.id = target_document_id
    returning quote.view_count into target_view_count;
  else
    update public.invoices as invoice
    set
      first_viewed_at = coalesce(invoice.first_viewed_at, event_time),
      last_viewed_at = event_time,
      view_count = invoice.view_count + 1
    where invoice.id = target_document_id
    returning invoice.view_count into target_view_count;
  end if;

  insert into public.activity_log (
    actor_user_id,
    subject_type,
    subject_id,
    event_type,
    metadata_json
  ) values (
    null,
    p_document_type,
    target_document_id,
    case
      when target_first_viewed_at is null then 'customer_viewed_' || p_document_type
      else 'customer_returned_to_' || p_document_type
    end,
    pg_catalog.jsonb_build_object(
      'document_number', target_document_number,
      'view_count', target_view_count,
      'viewed_at', event_time
    )
  );

  return query select true, target_first_viewed_at is null, target_view_count;
end;
$$;

comment on table public.portal_view_events is
  'Approximate meaningful quote and invoice portal sessions; no IP addresses or raw tokens are stored.';
comment on column public.portal_view_events.visitor_session_id is
  'First-party session identifier used only for the 30-minute deduplication window.';
comment on column public.quotes.view_count is
  'Approximate meaningful portal viewing sessions, excluding refreshes within 30 minutes.';
comment on column public.invoices.view_count is
  'Approximate meaningful portal viewing sessions, excluding refreshes within 30 minutes.';

revoke all on function public.record_portal_view(text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_portal_view(text, text, text, text, text)
  to service_role;
