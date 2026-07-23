-- PostgREST CRUD does not require ownership-like table privileges. Remove the
-- legacy migration defaults that granted browser roles TRUNCATE, REFERENCES,
-- and TRIGGER across the exposed public schema while preserving mapped CRUD.
do $$
declare
  target record;
begin
  for target in
    select format('%I.%I', n.nspname, c.relname) as qualified_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format(
      'revoke truncate, references, trigger on table %s from public, anon, authenticated',
      target.qualified_name
    );
  end loop;
end;
$$;

revoke create on schema public from public, anon, authenticated;

-- Security-sensitive tables are narrower than the general legacy CRUD map.
revoke all on table public.roles, public.user_roles, public.payments,
  public.role_assignment_events, public.security_rate_limits
  from public, anon, authenticated;
grant select on table public.roles, public.user_roles, public.role_assignment_events to authenticated;
grant select on table public.payments to authenticated;
