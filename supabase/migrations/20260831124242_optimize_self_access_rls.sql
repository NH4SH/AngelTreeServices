-- Evaluate request identity once per statement instead of once per candidate row.
-- The authorization predicates are otherwise unchanged.

alter policy "Users can read their own profile"
  on public.profiles
  using (id = (select auth.uid()));

alter policy "Users can read their own time clock permission"
  on public.time_clock_permissions
  using ((select auth.uid()) = user_id);

alter policy "Users can read their own time entries"
  on public.time_entries
  using ((select auth.uid()) = user_id);

alter policy "Users can read their own time entry adjustments"
  on public.time_entry_adjustments
  using (
    exists (
      select 1
      from public.time_entries as entry
      where entry.id = time_entry_adjustments.time_entry_id
        and entry.user_id = (select auth.uid())
    )
  );

alter policy "Users can read their own time entry approvals"
  on public.time_entry_approvals
  using (
    exists (
      select 1
      from public.time_entries as entry
      where entry.id = time_entry_approvals.time_entry_id
        and entry.user_id = (select auth.uid())
    )
  );

alter policy "Requesters can read their own employee access requests"
  on public.employee_access_requests
  using (
    auth_user_id = (select auth.uid())
    or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );

alter policy "Employees read their own employee record"
  on public.employee_records
  using (auth_user_id = (select auth.uid()));

alter policy "Users can read their own role memberships"
  on public.user_roles
  using (user_id = (select auth.uid()));
