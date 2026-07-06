-- Make platform tables reachable to the intended PostgREST roles.
--
-- RLS remains enabled on every CRM table. These grants only expose table
-- privileges to the API roles; row visibility is still controlled by table
-- policies. This is required on Supabase projects where new tables are not
-- automatically exposed to Data API roles.
--
-- The DO block intentionally skips tables that are not present yet. That keeps
-- this migration safe for partially applied development projects while fresh
-- databases still receive grants after the earlier migrations create all tables.

grant usage on schema public to authenticated, service_role;

do $$
declare
  table_name text;
  platform_tables text[] := array[
    'public.profiles',
    'public.roles',
    'public.user_roles',
    'public.organizations',
    'public.organization_contacts',
    'public.lead_sources',
    'public.customers',
    'public.service_locations',
    'public.jobs',
    'public.job_photos',
    'public.notes',
    'public.quotes',
    'public.quote_line_items',
    'public.invoices',
    'public.invoice_line_items',
    'public.payments',
    'public.appointments',
    'public.activity_log',
    'public.quote_portal_tokens'
  ];
begin
  foreach table_name in array platform_tables loop
    if to_regclass(table_name) is not null then
      execute format(
        'grant select, insert, update, delete on table %s to service_role',
        table_name
      );
      execute format(
        'grant select, insert, update, delete on table %s to authenticated',
        table_name
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.has_staff_role()') is not null then
    grant execute on function public.has_staff_role() to authenticated, service_role;
  end if;
end $$;
