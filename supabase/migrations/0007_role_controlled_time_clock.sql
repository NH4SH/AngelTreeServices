-- Role-controlled time clock foundation.
--
-- This phase adds secure, reviewable time tracking for employees without
-- implementing payroll export, GPS enforcement, or public access.

insert into public.roles (name, description)
values ('payroll_admin', 'Can review, approve, and adjust employee time entries.')
on conflict (name) do update
set description = excluded.description,
    updated_at = now();

create table public.time_clock_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_enabled boolean not null default true,
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  entry_type text not null default 'job' check (
    entry_type in ('job', 'drive', 'shop', 'maintenance', 'admin', 'training', 'break', 'other')
  ),
  status text not null default 'active' check (
    status in ('active', 'completed', 'adjusted', 'void')
  ),
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes <= 600),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_clock_order check (clock_out_at is null or clock_out_at > clock_in_at)
);

create table public.time_entry_adjustments (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  adjusted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  original_clock_in_at timestamptz not null,
  original_clock_out_at timestamptz,
  original_break_minutes integer not null default 0,
  new_clock_in_at timestamptz not null,
  new_clock_out_at timestamptz,
  new_break_minutes integer not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  constraint time_entry_adjustments_clock_order check (
    new_clock_out_at is null or new_clock_out_at > new_clock_in_at
  )
);

create table public.time_entry_approvals (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  approved_by_user_id uuid not null references public.profiles(id) on delete restrict,
  approval_note text,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create trigger time_clock_permissions_set_updated_at
  before update on public.time_clock_permissions
  for each row execute function public.set_updated_at();

create trigger time_entries_set_updated_at
  before update on public.time_entries
  for each row execute function public.set_updated_at();

create index time_entries_user_id_idx on public.time_entries(user_id);
create index time_entries_job_id_idx on public.time_entries(job_id);
create index time_entries_schedule_event_id_idx on public.time_entries(schedule_event_id);
create index time_entries_clock_in_at_idx on public.time_entries(clock_in_at desc);
create index time_entries_status_idx on public.time_entries(status);
create unique index time_entries_one_active_per_user_idx
  on public.time_entries(user_id)
  where status = 'active' and clock_out_at is null;
create index time_entry_adjustments_time_entry_id_idx on public.time_entry_adjustments(time_entry_id);
create index time_entry_approvals_time_entry_id_idx on public.time_entry_approvals(time_entry_id);

alter table public.time_clock_permissions enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_adjustments enable row level security;
alter table public.time_entry_approvals enable row level security;

create or replace function public.has_time_clock_review_role()
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
      and r.name in ('owner', 'admin', 'payroll_admin')
  );
$$;

create or replace function public.has_time_clock_eligible_role()
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
      and r.name in ('owner', 'admin', 'payroll_admin', 'estimator', 'crew')
  );
$$;

create or replace function public.can_use_time_clock(_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() = _user_id
    and public.has_time_clock_eligible_role()
    and exists (
      select 1
      from public.time_clock_permissions tcp
      where tcp.user_id = _user_id
        and tcp.is_enabled = true
    );
$$;

revoke all on function public.has_time_clock_review_role() from public;
revoke all on function public.has_time_clock_eligible_role() from public;
revoke all on function public.can_use_time_clock(uuid) from public;

grant select, insert, update, delete on table public.time_clock_permissions to authenticated, service_role;
grant select, insert, update, delete on table public.time_entries to authenticated, service_role;
grant select, insert, update, delete on table public.time_entry_adjustments to authenticated, service_role;
grant select, insert, update, delete on table public.time_entry_approvals to authenticated, service_role;
grant execute on function public.has_time_clock_review_role() to authenticated, service_role;
grant execute on function public.has_time_clock_eligible_role() to authenticated, service_role;
grant execute on function public.can_use_time_clock(uuid) to authenticated, service_role;

create policy "Reviewers can manage time clock permissions"
  on public.time_clock_permissions
  for all
  to authenticated
  using (public.has_time_clock_review_role())
  with check (public.has_time_clock_review_role());

create policy "Users can read their own time clock permission"
  on public.time_clock_permissions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Reviewers can read all time entries"
  on public.time_entries
  for select
  to authenticated
  using (public.has_time_clock_review_role());

create policy "Users can read their own time entries"
  on public.time_entries
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Enabled users can create their own active time entries"
  on public.time_entries
  for insert
  to authenticated
  with check (
    public.can_use_time_clock(user_id)
    and status = 'active'
    and clock_out_at is null
  );

create policy "Users can update their own active time entries"
  on public.time_entries
  for update
  to authenticated
  using (
    auth.uid() = user_id
    and public.can_use_time_clock(user_id)
    and status = 'active'
    and clock_out_at is null
  )
  with check (
    auth.uid() = user_id
    and user_id = auth.uid()
    and status in ('active', 'completed')
  );

create policy "Reviewers can update all time entries"
  on public.time_entries
  for update
  to authenticated
  using (public.has_time_clock_review_role())
  with check (public.has_time_clock_review_role());

create policy "Reviewers can read time entry adjustments"
  on public.time_entry_adjustments
  for select
  to authenticated
  using (public.has_time_clock_review_role());

create policy "Users can read their own time entry adjustments"
  on public.time_entry_adjustments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.time_entries te
      where te.id = time_entry_id
        and te.user_id = auth.uid()
    )
  );

create policy "Reviewers can create time entry adjustments"
  on public.time_entry_adjustments
  for insert
  to authenticated
  with check (public.has_time_clock_review_role());

create policy "Reviewers can read time entry approvals"
  on public.time_entry_approvals
  for select
  to authenticated
  using (public.has_time_clock_review_role());

create policy "Users can read their own time entry approvals"
  on public.time_entry_approvals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.time_entries te
      where te.id = time_entry_id
        and te.user_id = auth.uid()
    )
  );

create policy "Reviewers can create time entry approvals"
  on public.time_entry_approvals
  for insert
  to authenticated
  with check (public.has_time_clock_review_role());

comment on table public.time_clock_permissions is
  'Explicit per-user time clock enablement. Timer access requires both an eligible role and an enabled permission row.';

comment on table public.time_entries is
  'Raw clock-in and clock-out history. Only one active timer is allowed per user.';

comment on table public.time_entry_adjustments is
  'Admin review history for time entry edits. Original values are preserved here before any approved adjustment.';

comment on table public.time_entry_approvals is
  'Approval trail for time entries pending payroll review.';
