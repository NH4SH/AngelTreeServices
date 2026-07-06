-- Payroll review and pay-period foundation.
--
-- This phase adds internal payroll review periods and richer reviewer decisions
-- without introducing payroll provider exports, taxes, or compliance logic.

create table public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (
    status in ('open', 'review', 'approved', 'exported', 'locked')
  ),
  notes text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pay_periods_date_range check (ends_at > starts_at)
);

alter table public.time_entry_approvals
  add column approval_status text not null default 'approved' check (
    approval_status in ('approved', 'needs_correction', 'rejected')
  );

create trigger pay_periods_set_updated_at
  before update on public.pay_periods
  for each row execute function public.set_updated_at();

create index pay_periods_starts_at_idx on public.pay_periods(starts_at desc);
create unique index pay_periods_range_unique_idx on public.pay_periods(starts_at, ends_at);
create index time_entry_approvals_status_idx on public.time_entry_approvals(approval_status);

alter table public.pay_periods enable row level security;

grant select, insert, update, delete on table public.pay_periods to authenticated, service_role;

create policy "Reviewers can manage pay periods"
  on public.pay_periods
  for all
  to authenticated
  using (public.has_time_clock_review_role())
  with check (public.has_time_clock_review_role());

comment on table public.pay_periods is
  'Internal payroll review windows used to group time entries before export.';

comment on column public.time_entry_approvals.approval_status is
  'Reviewer decision for a time entry: approved, needs_correction, or rejected.';
