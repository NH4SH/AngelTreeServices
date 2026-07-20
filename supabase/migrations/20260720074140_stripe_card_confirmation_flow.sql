-- Two-step card review and webhook audit support. Card details remain in Stripe;
-- this schema stores only provider identifiers and reconciliation metadata.

alter table public.invoice_checkout_sessions
  add column if not exists stripe_confirmation_token_id text,
  add column if not exists card_brand text,
  add column if not exists card_funding_type text,
  add column if not exists card_country text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists authorized_at timestamptz,
  add column if not exists failed_at timestamptz;

alter table public.invoice_checkout_sessions
  drop constraint if exists invoice_checkout_sessions_card_funding_type_check;
alter table public.invoice_checkout_sessions
  add constraint invoice_checkout_sessions_card_funding_type_check check (
    card_funding_type is null or card_funding_type in ('credit', 'debit', 'prepaid', 'unknown')
  );

create unique index if not exists invoice_checkout_sessions_confirmation_token_key
  on public.invoice_checkout_sessions(stripe_confirmation_token_id)
  where stripe_confirmation_token_id is not null;

alter table public.payments
  add column if not exists submitted_at timestamptz,
  add column if not exists authorized_at timestamptz,
  add column if not exists succeeded_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists dispute_status text,
  add column if not exists disputed_at timestamptz;

alter table public.payments
  drop constraint if exists payments_dispute_status_check;
alter table public.payments
  add constraint payments_dispute_status_check check (
    dispute_status is null or dispute_status in (
      'warning_needs_response', 'warning_under_review', 'warning_closed',
      'needs_response', 'under_review', 'won', 'lost'
    )
  );

update public.payments
set
  submitted_at = coalesce(submitted_at, created_at),
  succeeded_at = coalesce(succeeded_at, paid_at)
where provider = 'stripe';

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

comment on table public.stripe_webhook_events is
  'Server-only Stripe event receipt ledger used to make webhook side effects idempotent.';
comment on column public.invoice_checkout_sessions.stripe_confirmation_token_id is
  'Stripe ConfirmationToken identifier; no raw card data is stored.';
