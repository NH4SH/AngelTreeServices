-- Customer activity notifications and a richer, append-only administrative log.
-- Existing activity rows remain valid; the added columns are nullable where a
-- historical event cannot be enriched safely.

alter table public.activity_log
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists actor_type text not null default 'system',
  add column if not exists actor_label text,
  add column if not exists action_category text,
  add column if not exists record_label text,
  add column if not exists summary text,
  add column if not exists changes_json jsonb not null default '{}'::jsonb,
  add column if not exists destination_path text,
  add column if not exists idempotency_key text;

alter table public.activity_log
  drop constraint if exists activity_log_actor_type_check;
alter table public.activity_log
  add constraint activity_log_actor_type_check check (
    actor_type in ('owner', 'admin', 'staff', 'crew', 'customer', 'portal', 'system')
  );

create unique index if not exists activity_log_idempotency_key_unique
  on public.activity_log(idempotency_key)
  where idempotency_key is not null;
create index if not exists activity_log_created_at_idx
  on public.activity_log(created_at desc);
create index if not exists activity_log_category_created_at_idx
  on public.activity_log(action_category, created_at desc);
create index if not exists activity_log_actor_created_at_idx
  on public.activity_log(actor_user_id, created_at desc);
create index if not exists activity_log_organization_created_at_idx
  on public.activity_log(organization_id, created_at desc)
  where organization_id is not null;

comment on column public.activity_log.organization_id is
  'Related customer organization when the affected record belongs to one; this is not a platform tenant identifier.';
comment on column public.activity_log.changes_json is
  'Small redacted field-level changes only. Credentials, tokens, payment details, and file contents are prohibited.';

create table public.admin_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  quote_email_enabled boolean not null default true,
  change_order_email_enabled boolean not null default true,
  message_email_enabled boolean not null default true,
  file_email_enabled boolean not null default true,
  customer_update_email_enabled boolean not null default true,
  payment_email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_log(id) on delete restrict,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  category text not null check (
    category in ('quotes', 'change_orders', 'messages', 'files', 'customer_updates', 'payments', 'other')
  ),
  title text not null,
  body text,
  destination_path text,
  read_at timestamptz,
  email_status text not null default 'pending' check (
    email_status in ('pending', 'sent', 'failed', 'skipped')
  ),
  email_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, recipient_user_id)
);

create index admin_notifications_recipient_created_at_idx
  on public.admin_notifications(recipient_user_id, created_at desc);
create index admin_notifications_recipient_unread_idx
  on public.admin_notifications(recipient_user_id, created_at desc)
  where read_at is null;
create index admin_notifications_organization_created_at_idx
  on public.admin_notifications(organization_id, created_at desc)
  where organization_id is not null;

create trigger admin_notification_preferences_set_updated_at
  before update on public.admin_notification_preferences
  for each row execute function public.set_updated_at();
create trigger admin_notifications_set_updated_at
  before update on public.admin_notifications
  for each row execute function public.set_updated_at();

alter table public.admin_notification_preferences enable row level security;
alter table public.admin_notifications enable row level security;

revoke all on table public.admin_notification_preferences from anon, authenticated;
revoke all on table public.admin_notifications from anon, authenticated;
grant select, insert, update on table public.admin_notification_preferences to authenticated;
grant select, update on table public.admin_notifications to authenticated;
grant select, insert, update on table public.admin_notification_preferences to service_role;
grant select, insert, update on table public.admin_notifications to service_role;

drop policy if exists "Administrators manage own notification preferences"
  on public.admin_notification_preferences;
create policy "Administrators manage own notification preferences"
  on public.admin_notification_preferences
  for all
  to authenticated
  using (
    user_id = (select auth.uid())
    and app_private.has_platform_admin_role()
  )
  with check (
    user_id = (select auth.uid())
    and app_private.has_platform_admin_role()
  );

drop policy if exists "Administrators read own notifications"
  on public.admin_notifications;
create policy "Administrators read own notifications"
  on public.admin_notifications
  for select
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and app_private.has_platform_admin_role()
  );

drop policy if exists "Administrators update own notification state"
  on public.admin_notifications;
create policy "Administrators update own notification state"
  on public.admin_notifications
  for update
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and app_private.has_platform_admin_role()
  )
  with check (
    recipient_user_id = (select auth.uid())
    and app_private.has_platform_admin_role()
  );

-- Event creation is server-side only. Existing SECURITY DEFINER database
-- workflows continue to write as their owning role.
drop policy if exists "Staff can create activity log entries" on public.activity_log;
revoke insert, update, delete on table public.activity_log from anon, authenticated;
grant select on table public.activity_log to authenticated;
grant select, insert on table public.activity_log to service_role;

alter table public.email_events
  drop constraint if exists email_events_email_type_check;
alter table public.email_events
  add constraint email_events_email_type_check check (email_type in (
    'access_request_admin_notice', 'access_approved', 'access_rejected', 'lead_internal_notice',
    'quote', 'invoice', 'change_order', 'password_reset_admin_triggered',
    'estimate_confirmation', 'estimate_reminder', 'quote_follow_up',
    'work_confirmation', 'work_reminder', 'invoice_payment_reminder',
    'overdue_invoice_reminder', 'payment_confirmation', 'payment_preference_notice',
    'admin_customer_activity'
  ));

comment on table public.admin_notifications is
  'Per-recipient administrative notifications. Customer actions create independent rows for every active owner/admin.';
comment on table public.admin_notification_preferences is
  'Personal owner/admin email preferences. In-platform notifications are not disabled here.';
