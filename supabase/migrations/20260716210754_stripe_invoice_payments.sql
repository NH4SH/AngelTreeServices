-- Stripe Checkout payment tracking for invoice portal payments.
-- Payment confirmation remains webhook-driven; no card details are stored here.

alter table public.payments
  add column if not exists currency text not null default 'usd',
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_charge_id text,
  add column if not exists reference text,
  add column if not exists notes text;

create unique index if not exists payments_stripe_checkout_session_id_key
  on public.payments(provider_checkout_session_id)
  where provider = 'stripe' and provider_checkout_session_id is not null;

create unique index if not exists payments_stripe_payment_intent_id_key
  on public.payments(provider_payment_id)
  where provider = 'stripe' and provider_payment_id is not null;

create table if not exists public.invoice_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  checkout_url text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'creating' check (status in ('creating', 'open', 'completed', 'expired', 'failed', 'cancelled')),
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoice_checkout_sessions_one_active_invoice_key
  on public.invoice_checkout_sessions(invoice_id)
  where status in ('creating', 'open');

create index if not exists invoice_checkout_sessions_invoice_id_idx
  on public.invoice_checkout_sessions(invoice_id);

create index if not exists invoice_checkout_sessions_payment_intent_id_idx
  on public.invoice_checkout_sessions(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create trigger invoice_checkout_sessions_set_updated_at
  before update on public.invoice_checkout_sessions
  for each row execute function public.set_updated_at();

alter table public.invoice_checkout_sessions enable row level security;

grant all on table public.invoice_checkout_sessions to service_role;

-- Checkout state is only read and written by server-side code using the service role.
-- Internal staff continue to see reconciled payment records through the existing payments policy.
