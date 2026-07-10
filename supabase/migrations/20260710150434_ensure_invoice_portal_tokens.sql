-- Repair/ensure migration for customer invoice portal links.
--
-- Some deployed databases may have app code that references
-- public.invoice_portal_tokens before the original invoice-token migration has
-- been applied. Keep this migration idempotent so it safely repairs those
-- environments while leaving already-migrated databases unchanged.

create table if not exists public.invoice_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null,
  token_hint text,
  expires_at timestamptz,
  viewed_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoice_portal_tokens'::regclass
      and conname = 'invoice_portal_tokens_token_hash_key'
  ) then
    alter table public.invoice_portal_tokens
      add constraint invoice_portal_tokens_token_hash_key unique (token_hash);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.invoice_portal_tokens'::regclass
      and tgname = 'invoice_portal_tokens_set_updated_at'
  ) then
    create trigger invoice_portal_tokens_set_updated_at
      before update on public.invoice_portal_tokens
      for each row execute function public.set_updated_at();
  end if;
end $$;

create index if not exists invoice_portal_tokens_invoice_id_idx
  on public.invoice_portal_tokens(invoice_id);

create index if not exists invoice_portal_tokens_customer_id_idx
  on public.invoice_portal_tokens(customer_id);

alter table public.invoice_portal_tokens enable row level security;

revoke all on table public.invoice_portal_tokens from anon;
grant select, insert, update, delete on table public.invoice_portal_tokens to authenticated;
grant select, insert, update, delete on table public.invoice_portal_tokens to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'invoice_portal_tokens'
      and policyname = 'Owner and admin can manage invoice portal tokens'
  ) then
    create policy "Owner and admin can manage invoice portal tokens"
      on public.invoice_portal_tokens
      for all
      to authenticated
      using (public.has_platform_admin_role())
      with check (public.has_platform_admin_role());
  end if;
end $$;
