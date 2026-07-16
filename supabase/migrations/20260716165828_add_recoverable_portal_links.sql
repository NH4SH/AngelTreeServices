-- Recoverable, staff-only customer portal links.
--
-- The raw token remains unavailable to public clients and is never stored in
-- plaintext. The application encrypts it with a server-only environment key so
-- authenticated staff can copy the same active link after a page refresh.

alter table public.quote_portal_tokens
  add column if not exists token_encrypted text;

alter table public.invoice_portal_tokens
  add column if not exists token_encrypted text;

create or replace function public.create_or_get_quote_portal_token(
  p_quote_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  token_encrypted text,
  expires_at timestamptz,
  created boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_token record;
  record_customer_id uuid;
begin
  if not public.has_staff_role() then
    raise exception 'Only staff can manage quote portal links.';
  end if;

  select quotes.customer_id
  into record_customer_id
  from public.quotes
  where quotes.id = p_quote_id
  for update;

  if not found then
    raise exception 'Quote not found or no access.';
  end if;

  select quote_portal_tokens.id, quote_portal_tokens.token_encrypted, quote_portal_tokens.expires_at
  into existing_token
  from public.quote_portal_tokens
  where quote_portal_tokens.quote_id = p_quote_id
    and quote_portal_tokens.revoked_at is null
    and (quote_portal_tokens.expires_at is null or quote_portal_tokens.expires_at > now())
  order by quote_portal_tokens.created_at desc
  limit 1;

  if found then
    return query select existing_token.id, existing_token.token_encrypted, existing_token.expires_at, false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.quote_portal_tokens (
      quote_id,
      customer_id,
      token_hash,
      token_hint,
      token_encrypted,
      expires_at,
      created_by_user_id
    )
    values (
      p_quote_id,
      record_customer_id,
      p_token_hash,
      p_token_hint,
      p_token_encrypted,
      p_expires_at,
      auth.uid()
    )
    returning quote_portal_tokens.id, quote_portal_tokens.token_encrypted, quote_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true
  from inserted;
end;
$$;

revoke all on function public.create_or_get_quote_portal_token(uuid, text, text, text, timestamptz) from public;
grant execute on function public.create_or_get_quote_portal_token(uuid, text, text, text, timestamptz) to authenticated, service_role;

create or replace function public.create_or_get_invoice_portal_token(
  p_invoice_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_token_encrypted text,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  token_encrypted text,
  expires_at timestamptz,
  created boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_token record;
  record_customer_id uuid;
begin
  if not public.has_platform_admin_role() then
    raise exception 'Only owners and admins can manage invoice portal links.';
  end if;

  select invoices.customer_id
  into record_customer_id
  from public.invoices
  where invoices.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found or no access.';
  end if;

  select invoice_portal_tokens.id, invoice_portal_tokens.token_encrypted, invoice_portal_tokens.expires_at
  into existing_token
  from public.invoice_portal_tokens
  where invoice_portal_tokens.invoice_id = p_invoice_id
    and invoice_portal_tokens.revoked_at is null
    and (invoice_portal_tokens.expires_at is null or invoice_portal_tokens.expires_at > now())
  order by invoice_portal_tokens.created_at desc
  limit 1;

  if found then
    return query select existing_token.id, existing_token.token_encrypted, existing_token.expires_at, false;
    return;
  end if;

  return query
  with inserted as (
    insert into public.invoice_portal_tokens (
      invoice_id,
      customer_id,
      token_hash,
      token_hint,
      token_encrypted,
      expires_at,
      created_by_user_id
    )
    values (
      p_invoice_id,
      record_customer_id,
      p_token_hash,
      p_token_hint,
      p_token_encrypted,
      p_expires_at,
      auth.uid()
    )
    returning invoice_portal_tokens.id, invoice_portal_tokens.token_encrypted, invoice_portal_tokens.expires_at
  )
  select inserted.id, inserted.token_encrypted, inserted.expires_at, true
  from inserted;
end;
$$;

revoke all on function public.create_or_get_invoice_portal_token(uuid, text, text, text, timestamptz) from public;
grant execute on function public.create_or_get_invoice_portal_token(uuid, text, text, text, timestamptz) to authenticated, service_role;
