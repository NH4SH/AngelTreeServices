-- PR18A: measured organization-address searches repeatedly scanned locations.
-- Preserve the invoker view, search expression and every existing policy/index.
-- Fail promptly rather than waiting on busy production tables. Any production
-- application requires the normal reconciliation and approved maintenance step.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '5s';
create index service_locations_organization_id_idx on public.service_locations(organization_id);
commit;
