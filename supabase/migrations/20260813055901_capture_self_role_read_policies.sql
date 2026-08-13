-- Preserve the production-safe role reads required by authenticated users.
-- Platform-wide role inspection remains limited by the existing admin policies;
-- non-admin users can see only role names and their own memberships.

drop policy if exists "Authenticated users can read role names" on public.roles;
create policy "Authenticated users can read role names"
  on public.roles
  for select
  to authenticated
  using (true);

drop policy if exists "Users can read their own role memberships" on public.user_roles;
create policy "Users can read their own role memberships"
  on public.user_roles
  for select
  to authenticated
  using (user_id = auth.uid());
