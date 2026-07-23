drop policy if exists "Staff manage employee_records" on public.employee_records;
drop policy if exists "Staff manage employee_emergency_contacts" on public.employee_emergency_contacts;

create policy "Platform admins manage employee records"
  on public.employee_records for all to authenticated
  using (app_private.has_platform_admin_role())
  with check (app_private.has_platform_admin_role());

create policy "Employees read their own employee record"
  on public.employee_records for select to authenticated
  using (auth_user_id = auth.uid());

create policy "Platform admins manage employee emergency contacts"
  on public.employee_emergency_contacts for all to authenticated
  using (app_private.has_platform_admin_role())
  with check (app_private.has_platform_admin_role());

revoke all on table public.employee_records from public, anon, authenticated;
revoke all on table public.employee_emergency_contacts from public, anon, authenticated;
grant select, insert, update on table public.employee_records to authenticated;
grant select, insert, update on table public.employee_emergency_contacts to authenticated;
grant all on table public.employee_records to service_role;
grant all on table public.employee_emergency_contacts to service_role;

create or replace function public.get_employee_operational_directory()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when not app_private.has_staff_role() then
      jsonb_build_object('employees', '[]'::jsonb)
    else
      jsonb_build_object(
        'employees',
        coalesce(jsonb_agg(jsonb_build_object(
          'id', e.id,
          'auth_user_id', e.auth_user_id,
          'employee_number', e.employee_number,
          'legal_name', e.legal_name,
          'preferred_name', e.preferred_name,
          'employment_status', e.employment_status,
          'employment_type', e.employment_type,
          'job_title', e.job_title,
          'department', e.department,
          'crew_name', e.crew_name,
          'supervisor_employee_id', e.supervisor_employee_id,
          'is_supervisor', e.is_supervisor,
          'is_active', e.is_active,
          'hire_date', e.hire_date,
          'profile_photo_storage_path', e.profile_photo_storage_path,
          'archived_at', e.archived_at,
          'employee_onboarding_items', coalesce((
            select jsonb_agg(jsonb_build_object('completion_status', oi.completion_status))
            from public.employee_onboarding_items oi where oi.employee_id = e.id
          ), '[]'::jsonb),
          'employee_credentials', coalesce((
            select jsonb_agg(jsonb_build_object(
              'status', ec.status,
              'expiration_date', ec.expiration_date,
              'archived_at', ec.archived_at,
              'credential_type_id', ec.credential_type_id,
              'credential_types', jsonb_build_object('default_warning_days', ct.default_warning_days)
            ))
            from public.employee_credentials ec
            join public.credential_types ct on ct.id = ec.credential_type_id
            where ec.employee_id = e.id
          ), '[]'::jsonb),
          'training_attendees', coalesce((
            select jsonb_agg(jsonb_build_object('id', ta.id))
            from public.training_attendees ta where ta.employee_id = e.id
          ), '[]'::jsonb)
        ) order by coalesce(e.preferred_name, e.legal_name)), '[]'::jsonb)
      )
  end
  from public.employee_records e
  where e.archived_at is null;
$$;

revoke all on function public.get_employee_operational_directory() from public, anon;
grant execute on function public.get_employee_operational_directory() to authenticated, service_role;

comment on function public.get_employee_operational_directory() is
  'Operational staff projection. Excludes contact details, home address, emergency contacts, private notes, and separation details.';
