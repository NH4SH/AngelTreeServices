-- Angel Tree Services private job-photo storage foundation.
-- Create the `job-photos` bucket in the Supabase dashboard as a PRIVATE bucket.
-- Recommended bucket restrictions: 6 MB maximum file size and image MIME types only.
-- Storage objects are managed through the Storage API; this migration only adds
-- database constraints and RLS policies.

alter table public.job_photos
  drop constraint if exists job_photos_photo_type_check;

alter table public.job_photos
  add constraint job_photos_photo_type_check
  check (photo_type in ('before', 'after', 'customer_upload', 'estimate', 'job', 'issue', 'completion'));

-- New Supabase projects do not expose SQL-created tables to the Data API by
-- default. These grants make assigned-crew reads and photo inserts reachable;
-- RLS still decides which rows each authenticated user can access.
grant select on table public.roles, public.user_roles, public.customers, public.service_locations, public.jobs, public.notes, public.job_photos to authenticated;
grant insert on table public.job_photos to authenticated;

create policy "Users can read their own role assignments"
  on public.user_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read roles assigned to them"
  on public.roles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      where ur.role_id = roles.id
        and ur.user_id = (select auth.uid())
    )
  );

create policy "Crew can read assigned jobs"
  on public.jobs
  for select
  to authenticated
  using (assigned_crew_user_id = (select auth.uid()));

create policy "Crew can read customers for assigned jobs"
  on public.customers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.customer_id = customers.id
        and j.assigned_crew_user_id = (select auth.uid())
    )
  );

create policy "Crew can read locations for assigned jobs"
  on public.service_locations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.service_location_id = service_locations.id
        and j.assigned_crew_user_id = (select auth.uid())
    )
  );

create policy "Crew can read visible notes for assigned jobs"
  on public.notes
  for select
  to authenticated
  using (
    visibility = 'crew_visible'
    and exists (
      select 1
      from public.jobs j
      where j.id = notes.job_id
        and j.assigned_crew_user_id = (select auth.uid())
    )
  );

create policy "Crew can read photos for assigned jobs"
  on public.job_photos
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = job_photos.job_id
        and j.assigned_crew_user_id = (select auth.uid())
    )
  );

create policy "Crew can add photos to assigned jobs"
  on public.job_photos
  for insert
  to authenticated
  with check (
    uploaded_by_user_id = (select auth.uid())
    and exists (
      select 1
      from public.jobs j
      where j.id = job_photos.job_id
        and j.assigned_crew_user_id = (select auth.uid())
    )
  );

-- Keep the authorization helper outside exposed schemas. It validates that the
-- first object-path segment is a job UUID and scopes access to broad staff roles
-- or the crew member assigned to that job.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.can_access_job_photo_object(object_name text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then exists (
        select 1
        from public.jobs j
        where j.id = split_part(object_name, '/', 1)::uuid
          and (
            j.assigned_crew_user_id = (select auth.uid())
            or exists (
              select 1
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id
              where ur.user_id = (select auth.uid())
                and r.name in ('owner', 'admin', 'estimator')
            )
          )
      )
    else false
  end;
$$;

revoke all on function private.can_access_job_photo_object(text) from public;
grant execute on function private.can_access_job_photo_object(text) to authenticated;

create policy "Authorized users can read private job photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and private.can_access_job_photo_object(name)
  );

create policy "Authorized users can upload private job photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and (storage.foldername(name))[2] in ('before', 'after', 'issue', 'completion')
    and private.can_access_job_photo_object(name)
  );

-- There is no delete UI yet. This policy supports upload cleanup when metadata
-- insertion fails and leaves room for a deliberate staff-only delete action later.
create policy "Authorized users can remove owned private job photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'job-photos'
    and private.can_access_job_photo_object(name)
    and (
      owner_id = (select auth.uid()::text)
      or public.has_staff_role()
    )
  );
