begin;

alter table public.admin_notification_preferences
  add column daily_summary_email_enabled boolean not null default false,
  add column handoff_email_enabled boolean not null default false,
  add column daily_summary_hour smallint not null default 7 check (daily_summary_hour between 7 and 11);

alter table public.admin_notifications
  add column manager_email_kind text check (manager_email_kind in ('handoff', 'digest')),
  add column manager_email_key text unique,
  add column handoff_task_id uuid references public.follow_up_tasks(id) on delete set null,
  add column digest_date date,
  add column manager_email_attempts integer not null default 0 check (manager_email_attempts >= 0),
  add column manager_email_next_attempt_at timestamptz default now(),
  add column manager_email_claimed_at timestamptz,
  add column manager_email_first_attempt_at timestamptz,
  add column manager_email_payload jsonb,
  add column manager_email_problem text;

create index admin_notifications_manager_queue_idx
  on public.admin_notifications(manager_email_next_attempt_at)
  where manager_email_kind is not null and email_status in ('pending', 'failed');

create index admin_notifications_handoff_task_idx
  on public.admin_notifications(handoff_task_id) where handoff_task_id is not null;

-- Only the server may alter a queued message or its delivery state. Existing
-- authenticated inbox actions update read_at; existing recipient RLS stays intact.
revoke update on public.admin_notifications from authenticated;
grant update (read_at) on public.admin_notifications to authenticated;

-- Transactional enqueue: a saved assignment cannot lose its notification if
-- the application response is interrupted. No HTTP/email runs in the trigger.
create function app_private.queue_manager_handoff_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  activity_uuid uuid;
  destination text;
begin
  if tg_op = 'UPDATE' then
    if new.assigned_to_user_id is not distinct from old.assigned_to_user_id then return new; end if;
    update public.admin_notifications set email_status = 'skipped', manager_email_next_attempt_at = null,
      manager_email_problem = 'assignment_changed'
      where handoff_task_id = new.id and manager_email_kind = 'handoff' and email_status in ('pending', 'failed');
  end if;
  if new.assigned_to_user_id is null or new.status in ('completed', 'cancelled') then return new; end if;
  if not exists (
    select 1 from public.admin_notification_preferences pref
    join public.profiles profile on profile.id = pref.user_id and profile.status = 'active'
    where pref.user_id = new.assigned_to_user_id and pref.handoff_email_enabled
      and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
        where ur.user_id = pref.user_id and r.name in ('owner', 'admin'))
  ) then return new; end if;
  destination := case
    when new.quote_id is not null then '/admin/quotes/' || new.quote_id::text
    when new.invoice_id is not null then '/admin/invoices/' || new.invoice_id::text
    when new.job_id is not null then '/admin/jobs/' || new.job_id::text
    when new.organization_id is not null then '/admin/organizations/' || new.organization_id::text
    when new.customer_id is not null then '/admin/customers/' || new.customer_id::text
    else '/admin/follow-ups?assigned=me' end;
  insert into public.activity_log (subject_type, subject_id, event_type, actor_type, action_category, summary, destination_path)
    values ('follow_up_task', new.id, 'manager_handoff_queued', 'system', 'other', 'Assigned next action queued for manager notification.', destination)
    returning id into activity_uuid;
  insert into public.admin_notifications (activity_id, recipient_user_id, category, title, body, destination_path,
      manager_email_kind, manager_email_key, handoff_task_id)
    values (activity_uuid, new.assigned_to_user_id, 'other', 'A next action is assigned to you',
      pg_catalog.left(new.title, 180) || E'\nDue: ' || pg_catalog.to_char(new.due_at at time zone 'America/New_York', 'Mon DD, YYYY HH12:MI AM') || ' Eastern time',
      destination, 'handoff', 'handoff:' || activity_uuid::text, new.id);
  return new;
end;
$$;
revoke all on function app_private.queue_manager_handoff_email() from public, anon, authenticated, service_role;
create trigger follow_up_tasks_manager_assignment
  after insert or update of assigned_to_user_id on public.follow_up_tasks
  for each row execute function app_private.queue_manager_handoff_email();

alter table public.email_events drop constraint email_events_email_type_check;
alter table public.email_events add constraint email_events_email_type_check check (email_type in (
  'access_request_admin_notice', 'access_approved', 'access_rejected', 'lead_internal_notice',
  'quote', 'invoice', 'change_order', 'password_reset_admin_triggered', 'estimate_confirmation',
  'estimate_reminder', 'quote_follow_up', 'work_confirmation', 'work_reminder', 'invoice_payment_reminder',
  'overdue_invoice_reminder', 'payment_confirmation', 'payment_preference_notice',
  'admin_customer_activity', 'system_health_alert', 'manager_handoff', 'manager_daily_summary'
));

comment on column public.admin_notifications.manager_email_payload is
  'Server-frozen recipient and message for bounded idempotent retries; never editable by inbox clients.';
commit;
