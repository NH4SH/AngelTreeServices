-- Employee scheduling calendar foundation.
--
-- This phase adds a richer calendar model without removing or rewriting the
-- legacy appointments table yet. The application bridges both models so
-- existing appointment scheduling continues to render while new schedule
-- events can represent PTO, internal events, emergencies, and multi-person
-- assignments.

create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  service_location_id uuid references public.service_locations(id) on delete set null,
  title text not null,
  description text,
  event_type text not null default 'job' check (
    event_type in (
      'estimate',
      'job',
      'follow_up',
      'maintenance',
      'pto',
      'unavailable',
      'internal',
      'emergency',
      'other'
    )
  ),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')
  ),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location_label text,
  calendar_notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_events_time_order check (ends_at is null or ends_at > starts_at)
);

create table public.schedule_event_assignments (
  event_id uuid not null references public.schedule_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assignment_role text not null default 'assigned',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create trigger schedule_events_set_updated_at
  before update on public.schedule_events
  for each row execute function public.set_updated_at();

create index schedule_events_job_id_idx on public.schedule_events(job_id);
create index schedule_events_service_location_id_idx on public.schedule_events(service_location_id);
create index schedule_events_starts_at_idx on public.schedule_events(starts_at);
create index schedule_events_event_type_idx on public.schedule_events(event_type);
create index schedule_events_status_idx on public.schedule_events(status);
create index schedule_event_assignments_user_id_idx on public.schedule_event_assignments(user_id);

alter table public.schedule_events enable row level security;
alter table public.schedule_event_assignments enable row level security;

create or replace function public.has_schedule_admin_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin')
  );
$$;

create or replace function public.has_schedule_estimator_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'estimator')
  );
$$;

create or replace function public.has_schedule_crew_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('owner', 'admin', 'estimator', 'crew')
  );
$$;

create or replace function public.can_manage_schedule_event_type(_event_type text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.has_schedule_admin_role()
    or (
      public.has_schedule_estimator_role()
      and _event_type in ('estimate', 'follow_up', 'maintenance')
    );
$$;

create or replace function public.is_schedule_event_assignee(_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.schedule_event_assignments sea
    where sea.event_id = _event_id
      and sea.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_schedule_assignment(_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.schedule_events se
    where se.id = _event_id
      and public.can_manage_schedule_event_type(se.event_type)
  );
$$;

grant select, insert, update, delete on table public.schedule_events to authenticated, service_role;
grant select, insert, update, delete on table public.schedule_event_assignments to authenticated, service_role;
grant execute on function public.has_schedule_admin_role() to authenticated, service_role;
grant execute on function public.has_schedule_estimator_role() to authenticated, service_role;
grant execute on function public.has_schedule_crew_role() to authenticated, service_role;
grant execute on function public.can_manage_schedule_event_type(text) to authenticated, service_role;
grant execute on function public.is_schedule_event_assignee(uuid) to authenticated, service_role;
grant execute on function public.can_manage_schedule_assignment(uuid) to authenticated, service_role;

create policy "Schedule staff can read events"
  on public.schedule_events
  for select
  to authenticated
  using (
    public.has_schedule_estimator_role()
    or (
      public.has_schedule_crew_role()
      and public.is_schedule_event_assignee(id)
    )
  );

create policy "Schedule managers can insert events"
  on public.schedule_events
  for insert
  to authenticated
  with check (public.can_manage_schedule_event_type(event_type));

create policy "Schedule managers can update events"
  on public.schedule_events
  for update
  to authenticated
  using (public.can_manage_schedule_event_type(event_type))
  with check (public.can_manage_schedule_event_type(event_type));

create policy "Schedule managers can delete events"
  on public.schedule_events
  for delete
  to authenticated
  using (public.can_manage_schedule_event_type(event_type));

create policy "Schedule staff can read assignments"
  on public.schedule_event_assignments
  for select
  to authenticated
  using (
    public.has_schedule_estimator_role()
    or (
      public.has_schedule_crew_role()
      and user_id = auth.uid()
    )
  );

create policy "Schedule managers can insert assignments"
  on public.schedule_event_assignments
  for insert
  to authenticated
  with check (public.can_manage_schedule_assignment(event_id));

create policy "Schedule managers can update assignments"
  on public.schedule_event_assignments
  for update
  to authenticated
  using (public.can_manage_schedule_assignment(event_id))
  with check (public.can_manage_schedule_assignment(event_id));

create policy "Schedule managers can delete assignments"
  on public.schedule_event_assignments
  for delete
  to authenticated
  using (public.can_manage_schedule_assignment(event_id));

comment on table public.schedule_events is
  'Employee scheduling calendar events. This table coexists with legacy appointments until the app fully migrates.';

comment on table public.schedule_event_assignments is
  'Assignments for multi-person schedule events. Crew visibility should stay scoped to assigned events only.';
