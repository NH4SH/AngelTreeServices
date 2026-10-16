import { readFileSync } from "node:fs";
export const invoiceId = "00000000-0000-4000-8000-000000000001";
export const invoice2 = "00000000-0000-4000-8000-000000000002";
export const actor = "00000000-0000-4000-8000-000000000010";
export const reservationId = "00000000-0000-4000-8000-000000000020";
export const migration = readFileSync(new URL("../../../../../supabase/migrations/20261016002812_guarded_invoice_void.sql", import.meta.url), "utf8");

export const fixtureSql = `
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema app_private;
      revoke all on schema app_private from public;
      grant usage on schema app_private, auth to authenticated, service_role;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      create function app_private.has_platform_admin_role() returns boolean language sql stable as
        $$select coalesce(current_setting('test.is_admin', true), 'false') = 'true'$$;
      create table public.invoices(id uuid primary key, status text not null,
        customer_id uuid, organization_id uuid, job_id uuid, quote_id uuid,
        total_cents integer default 1000, subtotal_cents integer default 1000, tax_cents integer default 0,
        balance_due_cents integer default 1000, sent_at timestamptz, due_at timestamptz, paid_at timestamptz);
      create table public.invoice_line_items(id uuid primary key default gen_random_uuid(), invoice_id uuid references public.invoices(id));
      create table public.invoice_checkout_sessions(
        id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id),
        status text not null, payment_channel text not null default 'ach',
        stripe_checkout_session_id text, stripe_payment_intent_id text, submitted_at timestamptz,
        total_charge_cents integer default 1000, invoice_principal_cents integer default 1000, currency text default 'usd',
        customer_id uuid, organization_id uuid, created_at timestamptz default now()
      );
      create unique index invoice_checkout_sessions_one_active_invoice_key on public.invoice_checkout_sessions(invoice_id)
        where status in ('creating', 'open', 'processing');
      create table public.payments(id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id), status text not null, refunded_principal_cents integer not null default 0, refunded_surcharge_cents integer not null default 0, dispute_status text, disputed_gross_cents integer not null default 0, amount_cents integer not null default 1000, disputed_principal_cents integer not null default 0);
      create table public.customer_communications(
        id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id), status text not null,
        cancelled_at timestamptz, last_error text, processing_started_at timestamptz, skip_reason text
      );
      create table public.activity_log(
        id uuid primary key default gen_random_uuid(), actor_user_id uuid, actor_type text default 'system', subject_type text, subject_id uuid,
        event_type text not null, metadata_json jsonb, idempotency_key text
      );
      create unique index activity_log_idempotency_key_unique on public.activity_log(idempotency_key) where idempotency_key is not null;
      grant select, update on public.invoices to authenticated;
      grant all on public.invoice_checkout_sessions, public.payments to service_role;
      select set_config('request.jwt.claim.sub', '${actor}', false);
      select set_config('test.is_admin', 'true', false);
    `;
