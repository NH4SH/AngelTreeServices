-- Safe, staff-visible scheduling for operational customer email.
--
-- Delivery remains in the existing server-only Resend helper. This migration
-- stores only queue metadata, eligibility state, and delivery audit links.

alter table public.quotes
  add column if not exists automatic_follow_ups_enabled boolean not null default true;

alter table public.invoices
  add column if not exists automatic_reminders_enabled boolean not null default true;

create table public.communication_settings (
  singleton boolean primary key default true check (singleton),
  automated_sending_enabled boolean not null default false,
  business_timezone text not null default 'America/New_York',
  minimum_send_interval_hours integer not null default 24 check (minimum_send_interval_hours between 1 and 168),
  estimate_confirmation_enabled boolean not null default true,
  estimate_reminder_enabled boolean not null default true,
  estimate_reminder_hours_before integer not null default 24 check (estimate_reminder_hours_before between 1 and 336),
  work_confirmation_enabled boolean not null default true,
  work_reminder_enabled boolean not null default true,
  work_reminder_hours_before integer not null default 24 check (work_reminder_hours_before between 1 and 336),
  quote_follow_up_enabled boolean not null default true,
  quote_first_follow_up_days integer not null default 3 check (quote_first_follow_up_days between 1 and 90),
  quote_second_follow_up_days integer not null default 7 check (quote_second_follow_up_days between 1 and 180),
  invoice_reminder_enabled boolean not null default true,
  invoice_first_reminder_days integer not null default 3 check (invoice_first_reminder_days between 0 and 90),
  invoice_second_reminder_days integer not null default 10 check (invoice_second_reminder_days between 1 and 180),
  payment_confirmation_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.communication_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create trigger communication_settings_set_updated_at
  before update on public.communication_settings
  for each row execute function public.set_updated_at();

create table public.customer_communications (
  id uuid primary key default gen_random_uuid(),
  communication_type text not null check (
    communication_type in (
      'estimate_confirmation',
      'estimate_reminder',
      'quote_follow_up',
      'work_confirmation',
      'work_reminder',
      'invoice_payment_reminder',
      'overdue_invoice_reminder',
      'payment_confirmation'
    )
  ),
  reminder_stage text not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  schedule_event_id uuid references public.schedule_events(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  recipient_source text not null default 'customer' check (recipient_source in ('customer', 'organization')),
  recipient_email text not null,
  scheduled_for timestamptz not null,
  source_version timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  processing_started_at timestamptz,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')
  ),
  is_automatic boolean not null default false,
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  skip_reason text,
  idempotency_key text not null unique,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_communications_has_subject check (
    quote_id is not null
    or invoice_id is not null
    or job_id is not null
    or schedule_event_id is not null
    or appointment_id is not null
    or payment_id is not null
  )
);

create trigger customer_communications_set_updated_at
  before update on public.customer_communications
  for each row execute function public.set_updated_at();

create index customer_communications_due_idx
  on public.customer_communications(status, scheduled_for)
  where status in ('pending', 'processing');

create index customer_communications_customer_idx
  on public.customer_communications(customer_id, created_at desc);

create index customer_communications_organization_idx
  on public.customer_communications(organization_id, created_at desc);

create index customer_communications_quote_idx
  on public.customer_communications(quote_id, created_at desc);

create index customer_communications_invoice_idx
  on public.customer_communications(invoice_id, created_at desc);

create index customer_communications_job_idx
  on public.customer_communications(job_id, created_at desc);

create index customer_communications_schedule_event_idx
  on public.customer_communications(schedule_event_id, created_at desc);

create index customer_communications_appointment_idx
  on public.customer_communications(appointment_id, created_at desc);

create index customer_communications_payment_idx
  on public.customer_communications(payment_id, created_at desc);

alter table public.email_events
  add column if not exists related_organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists related_schedule_event_id uuid references public.schedule_events(id) on delete set null,
  add column if not exists related_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists related_payment_id uuid references public.payments(id) on delete set null,
  add column if not exists related_communication_id uuid references public.customer_communications(id) on delete set null;

alter table public.email_events
  drop constraint if exists email_events_email_type_check;

alter table public.email_events
  add constraint email_events_email_type_check check (
    email_type in (
      'access_request_admin_notice',
      'access_approved',
      'access_rejected',
      'lead_internal_notice',
      'quote',
      'invoice',
      'password_reset_admin_triggered',
      'estimate_confirmation',
      'estimate_reminder',
      'quote_follow_up',
      'work_confirmation',
      'work_reminder',
      'invoice_payment_reminder',
      'overdue_invoice_reminder',
      'payment_confirmation'
    )
  );

create index email_events_related_organization_id_idx
  on public.email_events(related_organization_id);

create index email_events_related_schedule_event_id_idx
  on public.email_events(related_schedule_event_id);

create index email_events_related_appointment_id_idx
  on public.email_events(related_appointment_id);

create index email_events_related_payment_id_idx
  on public.email_events(related_payment_id);

create unique index email_events_one_success_per_communication_idx
  on public.email_events(related_communication_id)
  where related_communication_id is not null and status = 'sent';

alter table public.communication_settings enable row level security;
alter table public.customer_communications enable row level security;

revoke all on table public.communication_settings from public, anon;
revoke all on table public.customer_communications from public, anon;

grant select on table public.communication_settings to authenticated;
grant select, insert, update on table public.customer_communications to authenticated;
grant select, insert, update, delete on table public.communication_settings to service_role;
grant select, insert, update, delete on table public.customer_communications to service_role;

create policy "Staff can read communication settings"
  on public.communication_settings
  for select
  to authenticated
  using (app_private.has_staff_role());

create policy "Owners and admins can update communication settings"
  on public.communication_settings
  for update
  to authenticated
  using (app_private.has_platform_admin_role())
  with check (app_private.has_platform_admin_role());

create policy "Staff can read customer communications"
  on public.customer_communications
  for select
  to authenticated
  using (app_private.has_staff_role());

create policy "Staff can schedule customer communications"
  on public.customer_communications
  for insert
  to authenticated
  with check (
    app_private.has_staff_role()
    and status = 'pending'
    and created_by_user_id = (select auth.uid())
  );

create policy "Staff can cancel pending customer communications"
  on public.customer_communications
  for update
  to authenticated
  using (app_private.has_staff_role() and status = 'pending')
  with check (
    app_private.has_staff_role()
    and status in ('pending', 'cancelled')
  );

create or replace function public.claim_due_customer_communications(p_limit integer default 20)
returns setof public.customer_communications
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select communication.id
    from public.customer_communications communication
    where (
      communication.status = 'pending'
      and communication.scheduled_for <= now()
    ) or (
      communication.status = 'processing'
      and communication.processing_started_at < now() - interval '15 minutes'
    )
    order by communication.scheduled_for, communication.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  ), claimed as (
    update public.customer_communications communication
    set
      status = 'processing',
      processing_started_at = now(),
      attempt_count = communication.attempt_count + 1,
      last_error = null,
      skip_reason = null
    from candidates
    where communication.id = candidates.id
    returning communication.*
  )
  select * from claimed;
$$;

revoke all on function public.claim_due_customer_communications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_customer_communications(integer)
  to service_role;

comment on table public.customer_communications is
  'Internal operational email queue. Public users receive no access; delivery uses server-only credentials.';

comment on function public.claim_due_customer_communications(integer) is
  'Atomically claims due queue rows for the server-side scheduled worker using row locks.';
