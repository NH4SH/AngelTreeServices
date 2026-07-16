-- Read-only verification for:
--   20260716212545_harden_security_definer_functions.sql
--
-- Run after the migration in the Supabase SQL editor or with psql. Every
-- statement is SELECT-only and does not impersonate application roles.

-- 1. Function location, owner, SECURITY DEFINER status, fixed search_path, and
-- effective EXECUTE privileges. Internal helpers should be in app_private;
-- anon should be false for every row. Public trigger helpers should also be
-- false for authenticated and service_role.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_catalog.pg_get_userbyid(p.proowner) as owner_name,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where (
    n.nspname = 'app_private'
    and p.proname in (
      'handle_new_user',
      'rls_auto_enable',
      'has_staff_role',
      'has_platform_admin_role',
      'has_schedule_admin_role',
      'has_schedule_estimator_role',
      'has_schedule_crew_role',
      'can_manage_schedule_event_type',
      'is_schedule_event_assignee',
      'can_manage_schedule_assignment',
      'has_time_clock_review_role',
      'has_time_clock_eligible_role',
      'can_use_time_clock'
    )
  )
  or (
    n.nspname = 'public'
    and p.proname in (
      'set_updated_at',
      'create_or_get_quote_portal_token',
      'create_or_get_invoice_portal_token'
    )
  )
  or (n.nspname = 'private' and p.proname = 'can_access_job_photo_object')
order by function_schema, function_name, identity_arguments;

-- 2. Former public SECURITY DEFINER RPC helpers should return zero rows.
select
  p.oid::regprocedure::text as unexpected_public_helper
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'handle_new_user',
    'rls_auto_enable',
    'has_staff_role',
    'has_platform_admin_role',
    'has_schedule_admin_role',
    'has_schedule_estimator_role',
    'has_schedule_crew_role',
    'can_manage_schedule_event_type',
    'is_schedule_event_assignee',
    'can_manage_schedule_assignment',
    'has_time_clock_review_role',
    'has_time_clock_eligible_role',
    'can_use_time_clock'
  );

-- 3. No policy should retain a reference to a former public helper. The first
-- two JSON columns should show app_private references; the final flag should be
-- false for every row.
select
  schemaname,
  tablename,
  policyname,
  qual,
  with_check,
  (
    coalesce(qual, '') ~
      'public\\.(has_|can_manage_schedule_|is_schedule_event_assignee|can_use_time_clock)'
    or coalesce(with_check, '') ~
      'public\\.(has_|can_manage_schedule_|is_schedule_event_assignee|can_use_time_clock)'
  ) as references_old_public_helper
from pg_catalog.pg_policies
where coalesce(qual, '') ~
    '(app_private\\.|has_staff_role|has_platform_admin_role|has_schedule_|can_manage_schedule_|is_schedule_event_assignee|can_use_time_clock|has_time_clock_)'
  or coalesce(with_check, '') ~
    '(app_private\\.|has_staff_role|has_platform_admin_role|has_schedule_|can_manage_schedule_|is_schedule_event_assignee|can_use_time_clock|has_time_clock_)'
order by schemaname, tablename, policyname;

-- 4. Signup and automatic-RLS triggers should still reference the same function
-- objects, now under app_private. rls_auto_enable is production-only, so a fresh
-- local database can legitimately return no event-trigger row.
select
  n.nspname as table_schema,
  c.relname as table_name,
  t.tgname as trigger_name,
  pn.nspname as function_schema,
  p.proname as function_name
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_proc p on p.oid = t.tgfoid
join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal
  and p.proname in ('handle_new_user', 'set_updated_at')
order by function_name, table_schema, table_name;

select
  e.evtname as event_trigger_name,
  e.evtevent as event_name,
  e.evtenabled::text as enabled,
  pn.nspname as function_schema,
  p.proname as function_name,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_catalog.pg_event_trigger e
join pg_catalog.pg_proc p on p.oid = e.evtfoid
join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
where p.proname = 'rls_auto_enable';

-- 5. Confirm no exposed-schema SECURITY DEFINER function is effectively
-- executable by anon or authenticated. Intentional public portal RPCs are
-- SECURITY INVOKER and therefore do not appear here.
select
  n.nspname as function_schema,
  p.oid::regprocedure::text as exposed_security_definer,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
order by exposed_security_definer;
