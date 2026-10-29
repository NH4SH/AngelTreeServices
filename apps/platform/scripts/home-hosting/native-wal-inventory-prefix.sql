-- Staging-only recovery inventory. Locale ordering must not decide whether a
-- provider object belongs to a UUID-scoped encrypted component.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('ats_recovery_lab.native_inventory(text,uuid)'::regprocedure))<>'ec618d5e1608e860286697c743e2ff7f' then
  raise exception 'Reviewed native staging inventory required';
 end if;
end $guard$;
create or replace function ats_recovery_lab.native_inventory(bucket_name text,job_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,ats_recovery_lab as $body$
 select coalesce(jsonb_agg(jsonb_build_object('name',substring(name from 38),'id',id,'version',version,'size',(metadata->>'size')::bigint) order by name collate "C"),'[]')
 from(select * from storage.objects where bucket_id=bucket_name and starts_with(name,job_id::text||'/') order by name collate "C" limit 65)o
$body$;
revoke all on function ats_recovery_lab.native_inventory(text,uuid) from public,anon,authenticated,service_role;
commit;
