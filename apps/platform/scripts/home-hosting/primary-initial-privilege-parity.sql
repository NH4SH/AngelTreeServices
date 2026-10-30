-- Exact additional managed-catalog parity, read-only reviewed 2026-10-29.
-- Extra fresh-image view writes are revoked. Storage's owner-only grant option
-- is reproduced; no application/anonymous role receives a new privilege.
begin;
do $guard$ begin
 if current_setting('ats.hosting.primary_initial_install',true) is distinct from 'ats_crm_primary_20261029'
 or exists(select 1 from pg_roles where rolcanlogin and rolname not in('postgres','supabase_admin'))
 or (select local_node from hosting_guard.state where singleton) is distinct from 'ats-home-primary'
 then raise exception 'Closed initial primary required';end if;
end $guard$;
revoke insert,update,delete on public.admin_record_search,public.job_operations_index,public.job_operations_search_index,public.material_stock_balances from authenticated,service_role;
revoke select,insert,update,delete on public.material_stock_balances from anon;
set local role supabase_storage_admin;
grant all privileges on storage.buckets,storage.objects to supabase_storage_admin with grant option;
reset role;
commit;
