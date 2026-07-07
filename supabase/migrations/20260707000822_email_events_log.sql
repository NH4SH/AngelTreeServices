-- Transactional email audit log.
--
-- Email provider calls stay server-side. This table records what the platform
-- attempted to send and whether the provider accepted it. Logs are internal
-- only and are never exposed to public routes.

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  related_customer_id uuid references public.customers(id) on delete set null,
  related_job_id uuid references public.jobs(id) on delete set null,
  related_quote_id uuid references public.quotes(id) on delete set null,
  related_invoice_id uuid references public.invoices(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  email_type text not null check (
    email_type in (
      'access_request_admin_notice',
      'access_approved',
      'access_rejected',
      'lead_internal_notice',
      'quote',
      'invoice',
      'password_reset_admin_triggered'
    )
  ),
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_events_related_customer_id_idx
  on public.email_events(related_customer_id);

create index if not exists email_events_related_job_id_idx
  on public.email_events(related_job_id);

create index if not exists email_events_related_quote_id_idx
  on public.email_events(related_quote_id);

create index if not exists email_events_related_invoice_id_idx
  on public.email_events(related_invoice_id);

create index if not exists email_events_email_type_idx
  on public.email_events(email_type);

create index if not exists email_events_created_at_idx
  on public.email_events(created_at desc);

alter table public.email_events enable row level security;

grant select, insert on table public.email_events to authenticated, service_role;
grant update on table public.email_events to service_role;

drop policy if exists "Staff can read email events" on public.email_events;
create policy "Staff can read email events"
  on public.email_events
  for select
  to authenticated
  using (public.has_staff_role());

drop policy if exists "Staff can create email events" on public.email_events;
create policy "Staff can create email events"
  on public.email_events
  for insert
  to authenticated
  with check (public.has_staff_role());
