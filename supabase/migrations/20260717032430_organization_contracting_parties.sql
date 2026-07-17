-- Allow commercial records to be owned directly by either one customer or one
-- organization. Ambiguous historical ownership is intentionally left untouched
-- for the follow-up integrity migration to place into manual review.

alter table public.quotes
  add column if not exists legacy_customer_id uuid references public.customers(id) on delete set null;
alter table public.jobs
  add column if not exists legacy_customer_id uuid references public.customers(id) on delete set null;
alter table public.invoices
  add column if not exists legacy_customer_id uuid references public.customers(id) on delete set null;

alter table public.quotes alter column customer_id drop not null;
alter table public.jobs alter column customer_id drop not null;
alter table public.invoices alter column customer_id drop not null;

alter table public.quotes
  add constraint quotes_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
alter table public.jobs
  add constraint jobs_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
alter table public.invoices
  add constraint invoices_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

create index if not exists jobs_organization_id_idx on public.jobs(organization_id);
create index if not exists invoices_organization_id_idx on public.invoices(organization_id);
create index if not exists quotes_legacy_customer_id_idx on public.quotes(legacy_customer_id);
create index if not exists jobs_legacy_customer_id_idx on public.jobs(legacy_customer_id);
create index if not exists invoices_legacy_customer_id_idx on public.invoices(legacy_customer_id);

-- Assigned crew already receive the same narrow access for customer-owned jobs.
-- Mirror that visibility for the organization and its explicitly linked contacts.
create policy "Crew can read organizations for assigned jobs"
  on public.organizations for select to authenticated
  using (
    exists (
      select 1 from public.jobs
      where jobs.organization_id = organizations.id
        and jobs.assigned_crew_user_id = (select auth.uid())
    )
  );

create policy "Crew can read organization contacts for assigned jobs"
  on public.organization_contacts for select to authenticated
  using (
    exists (
      select 1 from public.jobs
      where jobs.organization_id = organization_contacts.organization_id
        and jobs.assigned_crew_user_id = (select auth.uid())
        and organization_contacts.id in (
          jobs.onsite_contact_id,
          jobs.property_manager_contact_id
        )
    )
  );

alter table public.quote_portal_tokens
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.quote_portal_tokens alter column customer_id drop not null;
update public.quote_portal_tokens token
set customer_id = quote.customer_id, organization_id = quote.organization_id
from public.quotes quote
where quote.id = token.quote_id
  and ((quote.customer_id is null) <> (quote.organization_id is null));
alter table public.quote_portal_tokens
  add constraint quote_portal_tokens_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
create index if not exists quote_portal_tokens_organization_id_idx
  on public.quote_portal_tokens(organization_id);

alter table public.invoice_portal_tokens
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.invoice_portal_tokens alter column customer_id drop not null;
update public.invoice_portal_tokens token
set customer_id = invoice.customer_id, organization_id = invoice.organization_id
from public.invoices invoice
where invoice.id = token.invoice_id
  and ((invoice.customer_id is null) <> (invoice.organization_id is null));
alter table public.invoice_portal_tokens
  add constraint invoice_portal_tokens_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
create index if not exists invoice_portal_tokens_organization_id_idx
  on public.invoice_portal_tokens(organization_id);

alter table public.payments
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.payments alter column customer_id drop not null;
update public.payments payment
set customer_id = invoice.customer_id, organization_id = invoice.organization_id
from public.invoices invoice
where invoice.id = payment.invoice_id
  and ((invoice.customer_id is null) <> (invoice.organization_id is null));
alter table public.payments
  add constraint payments_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
create index if not exists payments_organization_id_idx on public.payments(organization_id);

alter table public.invoice_checkout_sessions
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.invoice_checkout_sessions alter column customer_id drop not null;
update public.invoice_checkout_sessions checkout
set customer_id = invoice.customer_id, organization_id = invoice.organization_id
from public.invoices invoice
where invoice.id = checkout.invoice_id
  and ((invoice.customer_id is null) <> (invoice.organization_id is null));
alter table public.invoice_checkout_sessions
  add constraint invoice_checkout_sessions_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;
create index if not exists invoice_checkout_sessions_organization_id_idx
  on public.invoice_checkout_sessions(organization_id);

alter table public.customer_communications alter column customer_id drop not null;
update public.customer_communications communication
set customer_id = quote.customer_id, organization_id = quote.organization_id
from public.quotes quote
where quote.id = communication.quote_id
  and ((quote.customer_id is null) <> (quote.organization_id is null));
update public.customer_communications communication
set customer_id = invoice.customer_id, organization_id = invoice.organization_id
from public.invoices invoice
where invoice.id = communication.invoice_id
  and ((invoice.customer_id is null) <> (invoice.organization_id is null));
update public.customer_communications communication
set customer_id = job.customer_id, organization_id = job.organization_id
from public.jobs job
where job.id = communication.job_id
  and ((job.customer_id is null) <> (job.organization_id is null));
update public.customer_communications communication
set customer_id = payment.customer_id, organization_id = payment.organization_id
from public.payments payment
where payment.id = communication.payment_id
  and ((payment.customer_id is null) <> (payment.organization_id is null));
alter table public.customer_communications
  add constraint customer_communications_one_contracting_party
  check ((customer_id is null) <> (organization_id is null)) not valid;

create or replace function public.create_or_get_quote_portal_token(
  p_quote_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (id uuid, token_encrypted text, expires_at timestamptz, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_token record;
  record_customer_id uuid;
  record_organization_id uuid;
begin
  if not app_private.has_staff_role() then
    raise exception 'Only staff can manage quote portal links.';
  end if;
  select quotes.customer_id, quotes.organization_id
  into record_customer_id, record_organization_id
  from public.quotes where quotes.id = p_quote_id for update;
  if not found then raise exception 'Quote not found or no access.'; end if;

  select token.id, token.token_encrypted, token.expires_at into existing_token
  from public.quote_portal_tokens token
  where token.quote_id = p_quote_id and token.revoked_at is null
    and (token.expires_at is null or token.expires_at > pg_catalog.now())
  order by token.created_at desc limit 1;
  if found then
    return query select existing_token.id, existing_token.token_encrypted, existing_token.expires_at, false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.quote_portal_tokens (
      quote_id, customer_id, organization_id, token_hash, token_hint,
      token_encrypted, expires_at, created_by_user_id
    ) values (
      p_quote_id, record_customer_id, record_organization_id, p_token_hash,
      p_token_hint, p_token_encrypted, p_expires_at, auth.uid()
    )
    returning quote_portal_tokens.id, quote_portal_tokens.token_encrypted,
      quote_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true from inserted;
end;
$$;

create or replace function public.create_or_get_invoice_portal_token(
  p_invoice_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (id uuid, token_encrypted text, expires_at timestamptz, created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_token record;
  record_customer_id uuid;
  record_organization_id uuid;
begin
  if not app_private.has_platform_admin_role() then
    raise exception 'Only owners and admins can manage invoice portal links.';
  end if;
  select invoices.customer_id, invoices.organization_id
  into record_customer_id, record_organization_id
  from public.invoices where invoices.id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found or no access.'; end if;

  select token.id, token.token_encrypted, token.expires_at into existing_token
  from public.invoice_portal_tokens token
  where token.invoice_id = p_invoice_id and token.revoked_at is null
    and (token.expires_at is null or token.expires_at > pg_catalog.now())
  order by token.created_at desc limit 1;
  if found then
    return query select existing_token.id, existing_token.token_encrypted, existing_token.expires_at, false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.invoice_portal_tokens (
      invoice_id, customer_id, organization_id, token_hash, token_hint,
      token_encrypted, expires_at, created_by_user_id
    ) values (
      p_invoice_id, record_customer_id, record_organization_id, p_token_hash,
      p_token_hint, p_token_encrypted, p_expires_at, auth.uid()
    )
    returning invoice_portal_tokens.id, invoice_portal_tokens.token_encrypted,
      invoice_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true from inserted;
end;
$$;

revoke all on function public.create_or_get_quote_portal_token(uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_or_get_quote_portal_token(uuid, text, text, text, timestamptz)
  to authenticated, service_role;
revoke all on function public.create_or_get_invoice_portal_token(uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_or_get_invoice_portal_token(uuid, text, text, text, timestamptz)
  to authenticated, service_role;
