-- Privileged operational monitoring state. Detailed checks are written only by
-- server-side service-role code; owner/admin accounts receive read-only access.

create table public.system_health_components (
  component_key text primary key
    check (component_key ~ '^[a-z0-9_]{2,80}$'),
  label text not null,
  category text not null
    check (category in ('website', 'customer_portal', 'crm', 'data', 'communications', 'payments')),
  critical boolean not null default false,
  status text not null default 'unknown'
    check (status in ('operational', 'degraded', 'outage', 'unknown', 'not_configured')),
  checked_at timestamptz,
  last_success_at timestamptz,
  last_observed_usage_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 120000),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  consecutive_successes integer not null default 0 check (consecutive_successes >= 0),
  failure_summary text,
  active_incident_started_at timestamptz,
  check_source text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.system_health_checks (
  id bigint generated always as identity primary key,
  component_key text not null references public.system_health_components(component_key) on delete cascade,
  status text not null
    check (status in ('operational', 'degraded', 'outage', 'unknown', 'not_configured')),
  checked_at timestamptz not null default now(),
  latency_ms integer check (latency_ms is null or latency_ms between 0 and 120000),
  summary text,
  check_source text not null,
  details jsonb not null default '{}'::jsonb
);

create table public.system_health_incidents (
  id uuid primary key default gen_random_uuid(),
  component_key text not null references public.system_health_components(component_key) on delete cascade,
  started_at timestamptz not null,
  resolved_at timestamptz,
  opening_status text not null check (opening_status in ('degraded', 'outage')),
  latest_status text not null check (latest_status in ('operational', 'degraded', 'outage')),
  failure_summary text,
  recovery_summary text,
  failure_count integer not null default 1 check (failure_count > 0),
  alert_attempted_at timestamptz,
  recovery_alert_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index system_health_one_active_incident_idx
  on public.system_health_incidents(component_key)
  where resolved_at is null;
create index system_health_checks_component_checked_idx
  on public.system_health_checks(component_key, checked_at desc);
create index system_health_checks_retention_idx
  on public.system_health_checks(checked_at);
create index system_health_incidents_started_idx
  on public.system_health_incidents(started_at desc);

alter table public.system_health_components enable row level security;
alter table public.system_health_checks enable row level security;
alter table public.system_health_incidents enable row level security;

revoke all on table public.system_health_components from public, anon, authenticated;
revoke all on table public.system_health_checks from public, anon, authenticated;
revoke all on table public.system_health_incidents from public, anon, authenticated;
grant select on table public.system_health_components to authenticated;
grant select on table public.system_health_checks to authenticated;
grant select on table public.system_health_incidents to authenticated;
grant all on table public.system_health_components to service_role;
grant all on table public.system_health_checks to service_role;
grant all on table public.system_health_incidents to service_role;
revoke all on sequence public.system_health_checks_id_seq from public, anon, authenticated;
grant usage, select on sequence public.system_health_checks_id_seq to service_role;

create policy "Owners and admins read system health components"
  on public.system_health_components for select to authenticated
  using (app_private.has_platform_admin_role());
create policy "Owners and admins read system health checks"
  on public.system_health_checks for select to authenticated
  using (app_private.has_platform_admin_role());
create policy "Owners and admins read system health incidents"
  on public.system_health_incidents for select to authenticated
  using (app_private.has_platform_admin_role());

create or replace function public.get_system_health_uptime()
returns table (
  component_key text,
  uptime_24h numeric,
  uptime_7d numeric,
  uptime_30d numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    checks.component_key,
    round(
      100.0 * count(*) filter (where checks.status = 'operational' and checks.checked_at >= now() - interval '24 hours')
      / nullif(count(*) filter (where checks.status in ('operational', 'degraded', 'outage') and checks.checked_at >= now() - interval '24 hours'), 0),
      2
    ),
    round(
      100.0 * count(*) filter (where checks.status = 'operational' and checks.checked_at >= now() - interval '7 days')
      / nullif(count(*) filter (where checks.status in ('operational', 'degraded', 'outage') and checks.checked_at >= now() - interval '7 days'), 0),
      2
    ),
    round(
      100.0 * count(*) filter (where checks.status = 'operational' and checks.checked_at >= now() - interval '30 days')
      / nullif(count(*) filter (where checks.status in ('operational', 'degraded', 'outage') and checks.checked_at >= now() - interval '30 days'), 0),
      2
    )
  from public.system_health_checks checks
  where checks.checked_at >= now() - interval '30 days'
  group by checks.component_key;
$$;

revoke all on function public.get_system_health_uptime() from public, anon;
grant execute on function public.get_system_health_uptime() to authenticated, service_role;

alter table public.email_events
  drop constraint if exists email_events_email_type_check;
alter table public.email_events
  add constraint email_events_email_type_check check (email_type in (
    'access_request_admin_notice', 'access_approved', 'access_rejected', 'lead_internal_notice',
    'quote', 'invoice', 'change_order', 'password_reset_admin_triggered',
    'estimate_confirmation', 'estimate_reminder', 'quote_follow_up',
    'work_confirmation', 'work_reminder', 'invoice_payment_reminder',
    'overdue_invoice_reminder', 'payment_confirmation', 'payment_preference_notice',
    'admin_customer_activity', 'system_health_alert'
  ));

comment on table public.system_health_components is
  'Current sanitized operational status for centrally registered platform components.';
comment on table public.system_health_checks is
  'Short-retention sanitized health samples used for uptime calculations.';
comment on table public.system_health_incidents is
  'Deduplicated component incidents and recovery state. No raw provider responses or secrets.';
