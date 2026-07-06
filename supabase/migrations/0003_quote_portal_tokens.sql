-- Angel Tree Services secure customer quote portal links.
-- Raw portal tokens are never stored. Public quote access is orchestrated by a
-- narrow server-side helper; anonymous users receive no direct table privileges.

create table public.quote_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  token_hint text,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger quote_portal_tokens_set_updated_at
  before update on public.quote_portal_tokens
  for each row execute function public.set_updated_at();

create index quote_portal_tokens_quote_id_idx on public.quote_portal_tokens(quote_id);
create index quote_portal_tokens_customer_id_idx on public.quote_portal_tokens(customer_id);

alter table public.quote_portal_tokens enable row level security;

-- New Supabase projects no longer expose SQL-created tables to the Data API by
-- default. Staff access is granted explicitly and remains constrained by RLS.
revoke all on table public.quote_portal_tokens from anon;
grant select, insert, update, delete on table public.quote_portal_tokens to authenticated;

create policy "Staff can manage quote portal tokens"
  on public.quote_portal_tokens
  for all
  to authenticated
  using (public.has_staff_role())
  with check (public.has_staff_role());

