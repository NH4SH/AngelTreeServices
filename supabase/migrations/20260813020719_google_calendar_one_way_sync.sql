-- One-way Angel Tree schedule mirroring to user-owned Google calendars.
--
-- The CRM remains authoritative. Schedule writes only mark a durable outbox;
-- Google API work is performed later by a server-only worker or manual sync.

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid references public.employee_records(id) on delete set null,
  google_account_id text not null,
  google_account_email text not null,
  selected_calendar_id text not null default 'primary',
  selected_calendar_summary text not null default 'Primary',
  granted_scopes text[] not null default '{}'::text[],
  sync_estimates boolean not null default true,
  sync_jobs boolean not null default true,
  sync_company_all boolean not null default false,
  sync_enabled boolean not null default true,
  status text not null default 'active' check (
    status in ('active', 'error', 'revoked', 'cleanup_failed', 'disconnected')
  ),
  refresh_token_encrypted text,
  token_encryption_version smallint not null default 1 check (token_encryption_version > 0),
  last_sync_status text not null default 'never' check (
    last_sync_status in ('never', 'pending', 'success', 'error')
  ),
  last_sync_attempt_at timestamptz,
  last_sync_succeeded_at timestamptz,
  last_sync_error_code text,
  last_sync_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_connections_auth_user_unique unique (auth_user_id),
  constraint google_calendar_connections_account_id_not_blank check (pg_catalog.btrim(google_account_id) <> ''),
  constraint google_calendar_connections_email_not_blank check (pg_catalog.btrim(google_account_email) <> ''),
  constraint google_calendar_connections_calendar_id_not_blank check (pg_catalog.btrim(selected_calendar_id) <> ''),
  constraint google_calendar_connections_active_token check (
    not sync_enabled or refresh_token_encrypted is not null
  )
);

create table public.google_calendar_event_mappings (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.google_calendar_connections(id) on delete cascade,
  -- Intentionally not a foreign key: a hard-deleted CRM event must retain its
  -- mapping long enough for the worker to remove the managed Google event.
  schedule_event_id uuid not null,
  google_calendar_id text not null,
  google_event_id text not null,
  google_event_html_link text,
  source_starts_at timestamptz,
  sync_fingerprint text not null,
  sync_status text not null default 'synced' check (sync_status in ('pending', 'synced', 'error')),
  last_synced_at timestamptz,
  last_sync_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_event_mappings_connection_event_unique unique (connection_id, schedule_event_id),
  constraint google_calendar_event_mappings_google_event_unique unique (connection_id, google_calendar_id, google_event_id),
  constraint google_calendar_event_mappings_calendar_id_not_blank check (pg_catalog.btrim(google_calendar_id) <> ''),
  constraint google_calendar_event_mappings_event_id_not_blank check (pg_catalog.btrim(google_event_id) <> '')
);

create table public.google_calendar_sync_outbox (
  dedupe_key text primary key,
  task_type text not null check (task_type in ('schedule_event', 'connection')),
  connection_id uuid references public.google_calendar_connections(id) on delete cascade,
  schedule_event_id uuid,
  reason text not null default 'schedule_changed',
  revision bigint not null default 1 check (revision > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry', 'exhausted')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_calendar_sync_outbox_target_check check (
    (task_type = 'schedule_event' and schedule_event_id is not null and connection_id is null)
    or
    (task_type = 'connection' and connection_id is not null and schedule_event_id is null)
  )
);

create index google_calendar_connections_employee_idx
  on public.google_calendar_connections(employee_id)
  where employee_id is not null;

create index google_calendar_connections_active_idx
  on public.google_calendar_connections(sync_enabled, status)
  where sync_enabled = true;

create index google_calendar_event_mappings_schedule_event_idx
  on public.google_calendar_event_mappings(schedule_event_id);

create index google_calendar_event_mappings_connection_starts_idx
  on public.google_calendar_event_mappings(connection_id, source_starts_at);

create index google_calendar_sync_outbox_ready_idx
  on public.google_calendar_sync_outbox(status, available_at, created_at)
  where status in ('pending', 'retry', 'processing');

create trigger google_calendar_connections_set_updated_at
  before update on public.google_calendar_connections
  for each row execute function public.set_updated_at();

create trigger google_calendar_event_mappings_set_updated_at
  before update on public.google_calendar_event_mappings
  for each row execute function public.set_updated_at();

create trigger google_calendar_sync_outbox_set_updated_at
  before update on public.google_calendar_sync_outbox
  for each row execute function public.set_updated_at();

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_event_mappings enable row level security;
alter table public.google_calendar_sync_outbox enable row level security;

revoke all on table public.google_calendar_connections from public, anon, authenticated;
revoke all on table public.google_calendar_event_mappings from public, anon, authenticated;
revoke all on table public.google_calendar_sync_outbox from public, anon, authenticated;

grant all on table public.google_calendar_connections to service_role;
grant all on table public.google_calendar_event_mappings to service_role;
grant all on table public.google_calendar_sync_outbox to service_role;

create or replace function app_private.queue_google_calendar_schedule_event(
  target_event_id uuid,
  queue_reason text default 'schedule_changed'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_event_id is null or not exists (
    select 1
    from public.google_calendar_connections as connection
    where connection.sync_enabled = true
      and connection.status in ('active', 'error')
  ) then
    return;
  end if;

  insert into public.google_calendar_sync_outbox (
    dedupe_key,
    task_type,
    schedule_event_id,
    reason
  ) values (
    'schedule-event:' || target_event_id::text,
    'schedule_event',
    target_event_id,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(queue_reason), ''), 'schedule_changed'), 120)
  )
  on conflict (dedupe_key) do update
  set
    reason = excluded.reason,
    revision = public.google_calendar_sync_outbox.revision + 1,
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    last_error_code = null,
    updated_at = now();
end;
$$;

revoke all on function app_private.queue_google_calendar_schedule_event(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function app_private.enqueue_google_calendar_schedule_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform app_private.queue_google_calendar_schedule_event(
      case when tg_op = 'DELETE' then old.id else new.id end,
      'schedule_event_' || pg_catalog.lower(tg_op)
    );
  exception when others then
    -- Google mirroring must never make an Angel Tree schedule write fail.
    raise warning 'Google Calendar outbox enqueue failed in %.', tg_name;
    null;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enqueue_google_calendar_schedule_row()
  from public, anon, authenticated, service_role;

create trigger schedule_events_enqueue_google_calendar
  after insert or update or delete on public.schedule_events
  for each row execute function app_private.enqueue_google_calendar_schedule_row();

create or replace function app_private.enqueue_google_calendar_assignment_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform app_private.queue_google_calendar_schedule_event(
      case when tg_op = 'DELETE' then old.event_id else new.event_id end,
      'assignment_' || pg_catalog.lower(tg_op)
    );
  exception when others then
    raise warning 'Google Calendar outbox enqueue failed in %.', tg_name;
    null;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enqueue_google_calendar_assignment_row()
  from public, anon, authenticated, service_role;

create trigger schedule_event_assignments_enqueue_google_calendar
  after insert or update or delete on public.schedule_event_assignments
  for each row execute function app_private.enqueue_google_calendar_assignment_row();

create or replace function app_private.enqueue_google_calendar_job_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
begin
  begin
    for target_event_id in
      select event.id
      from public.schedule_events as event
      where event.job_id = new.id
    loop
      perform app_private.queue_google_calendar_schedule_event(target_event_id, 'job_context_updated');
    end loop;
  exception when others then
    raise warning 'Google Calendar outbox enqueue failed in %.', tg_name;
    null;
  end;
  return new;
end;
$$;

revoke all on function app_private.enqueue_google_calendar_job_events()
  from public, anon, authenticated, service_role;

create trigger jobs_enqueue_google_calendar
  after update of customer_id, organization_id, service_location_id, service_type, requested_scope
  on public.jobs
  for each row execute function app_private.enqueue_google_calendar_job_events();

create or replace function app_private.enqueue_google_calendar_location_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
begin
  begin
    for target_event_id in
      select event.id
      from public.schedule_events as event
      where event.service_location_id = new.id
    loop
      perform app_private.queue_google_calendar_schedule_event(target_event_id, 'service_location_updated');
    end loop;
  exception when others then
    raise warning 'Google Calendar outbox enqueue failed in %.', tg_name;
    null;
  end;
  return new;
end;
$$;

revoke all on function app_private.enqueue_google_calendar_location_events()
  from public, anon, authenticated, service_role;

create trigger service_locations_enqueue_google_calendar
  after update on public.service_locations
  for each row execute function app_private.enqueue_google_calendar_location_events();

create or replace function app_private.enqueue_google_calendar_customer_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
begin
  begin
    for target_event_id in
      select event.id
      from public.schedule_events as event
      left join public.jobs as job on job.id = event.job_id
      where event.source_customer_id = new.id
        or job.customer_id = new.id
    loop
      perform app_private.queue_google_calendar_schedule_event(target_event_id, 'customer_updated');
    end loop;
  exception when others then
    raise warning 'Google Calendar outbox enqueue failed in %.', tg_name;
    null;
  end;
  return new;
end;
$$;

revoke all on function app_private.enqueue_google_calendar_customer_events()
  from public, anon, authenticated, service_role;

create trigger customers_enqueue_google_calendar
  after update of display_name on public.customers
  for each row execute function app_private.enqueue_google_calendar_customer_events();

create or replace function app_private.enqueue_google_calendar_organization_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
begin
  begin
    for target_event_id in
      select event.id
      from public.schedule_events as event
      left join public.jobs as job on job.id = event.job_id
      where event.source_organization_id = new.id
        or job.organization_id = new.id
    loop
      perform app_private.queue_google_calendar_schedule_event(target_event_id, 'organization_updated');
    end loop;
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function app_private.enqueue_google_calendar_organization_events()
  from public, anon, authenticated, service_role;

create trigger organizations_enqueue_google_calendar
  after update of name on public.organizations
  for each row execute function app_private.enqueue_google_calendar_organization_events();

create or replace function public.queue_google_calendar_connection_sync(
  target_connection_id uuid,
  queue_reason text default 'connection_reconcile'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_connection_id is null or not exists (
    select 1
    from public.google_calendar_connections as connection
    where connection.id = target_connection_id
  ) then
    return;
  end if;

  insert into public.google_calendar_sync_outbox (
    dedupe_key,
    task_type,
    connection_id,
    reason
  ) values (
    'connection:' || target_connection_id::text,
    'connection',
    target_connection_id,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(queue_reason), ''), 'connection_reconcile'), 120)
  )
  on conflict (dedupe_key) do update
  set
    reason = excluded.reason,
    revision = public.google_calendar_sync_outbox.revision + 1,
    status = 'pending',
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    last_error_code = null,
    updated_at = now();
end;
$$;

revoke all on function public.queue_google_calendar_connection_sync(uuid, text)
  from public, anon, authenticated;
grant execute on function public.queue_google_calendar_connection_sync(uuid, text)
  to service_role;

create or replace function public.claim_google_calendar_sync_tasks(p_limit integer default 20)
returns setof public.google_calendar_sync_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as materialized (
    select queued.dedupe_key
    from public.google_calendar_sync_outbox as queued
    where (
        queued.status in ('pending', 'retry')
        and queued.available_at <= now()
      ) or (
        queued.status = 'processing'
        and queued.locked_at < now() - interval '15 minutes'
      )
    order by queued.available_at, queued.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.google_calendar_sync_outbox as queued
  set
    status = 'processing',
    locked_at = now(),
    updated_at = now()
  from candidates
  where queued.dedupe_key = candidates.dedupe_key
  returning queued.*;
end;
$$;

revoke all on function public.claim_google_calendar_sync_tasks(integer)
  from public, anon, authenticated;
grant execute on function public.claim_google_calendar_sync_tasks(integer)
  to service_role;

comment on table public.google_calendar_connections is
  'Server-only per-user Google Calendar OAuth connections. Refresh credentials are encrypted before storage.';

comment on table public.google_calendar_event_mappings is
  'Durable one-to-many mapping from Angel Tree schedule events to managed Google events.';

comment on table public.google_calendar_sync_outbox is
  'Best-effort durable reconciliation work. Schedule writes never call Google directly.';

comment on function public.claim_google_calendar_sync_tasks(integer) is
  'Atomically claims bounded Google Calendar reconciliation work for the server-only worker.';

comment on function public.queue_google_calendar_connection_sync(uuid, text) is
  'Queues one idempotent full-connection reconciliation for server-side processing.';
