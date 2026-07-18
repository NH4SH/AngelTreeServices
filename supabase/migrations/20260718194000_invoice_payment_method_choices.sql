-- Distinguish card and ACH Checkout reservations without allowing simultaneous active sessions.

alter table public.invoice_checkout_sessions
  add column if not exists payment_method text not null default 'card';

alter table public.invoice_checkout_sessions
  drop constraint if exists invoice_checkout_sessions_payment_method_check;

alter table public.invoice_checkout_sessions
  add constraint invoice_checkout_sessions_payment_method_check
  check (payment_method in ('card', 'ach'));

alter table public.invoice_checkout_sessions
  drop constraint if exists invoice_checkout_sessions_status_check;

alter table public.invoice_checkout_sessions
  add constraint invoice_checkout_sessions_status_check
  check (status in ('creating', 'open', 'processing', 'completed', 'expired', 'failed', 'cancelled'));

create index if not exists invoice_checkout_sessions_payment_method_idx
  on public.invoice_checkout_sessions(invoice_id, payment_method, created_at desc);
