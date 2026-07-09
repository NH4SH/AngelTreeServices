-- Secure, token-scoped customer invoice links.
-- Raw tokens are returned once to authenticated owner/admin users and are
-- never stored. Public invoice access is handled only by server-side code
-- using the service role; anonymous clients have no table privileges.

create table public.invoice_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  token_hint text,
  expires_at timestamptz,
  viewed_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger invoice_portal_tokens_set_updated_at
  before update on public.invoice_portal_tokens
  for each row execute function public.set_updated_at();

create index invoice_portal_tokens_invoice_id_idx
  on public.invoice_portal_tokens(invoice_id);

create index invoice_portal_tokens_customer_id_idx
  on public.invoice_portal_tokens(customer_id);

alter table public.invoice_portal_tokens enable row level security;

revoke all on table public.invoice_portal_tokens from anon;
grant select, insert, update, delete on table public.invoice_portal_tokens to authenticated;
grant select, insert, update, delete on table public.invoice_portal_tokens to service_role;

create policy "Owner and admin can manage invoice portal tokens"
  on public.invoice_portal_tokens
  for all
  to authenticated
  using (public.has_platform_admin_role())
  with check (public.has_platform_admin_role());
