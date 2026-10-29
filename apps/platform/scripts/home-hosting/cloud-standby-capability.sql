-- Staging-only capability test. The REVOKEs are always rolled back inside a
-- subtransaction. Existing connections and the published CRM remain untouched.
begin;
do $guard$ begin
 if md5(pg_get_functiondef('ats_staging_auth.reject_email(jsonb)'::regprocedure))
   <> 'c601aeb6c6c0ad4da79265034f84c1a6' then
  raise exception 'Reviewed CRM Staging target required';
 end if;
end $guard$;
create function ats_recovery_lab.check_standby_connection_fence() returns jsonb
language plpgsql security invoker set search_path=pg_catalog as $function$
declare before_acl text; result jsonb; role_name text;
begin
 if session_user <> 'postgres' or current_user <> 'postgres' then
  raise exception 'Owner-only staging capability check' using errcode='42501';
 end if;
 select md5(coalesce(datacl::text,'')) into before_acl from pg_database where datname=current_database();
 begin
  execute format('revoke connect on database %I from public,authenticator,supabase_auth_admin,supabase_storage_admin', current_database());
  foreach role_name in array array['authenticator','supabase_auth_admin','supabase_storage_admin'] loop
   if has_database_privilege(role_name,current_database(),'CONNECT') then
    raise exception 'API role retains CONNECT: %', role_name;
   end if;
  end loop;
  if not has_database_privilege('postgres',current_database(),'CONNECT') then
   raise exception 'Recovery operator lost CONNECT';
  end if;
  result := jsonb_build_object('databaseOwnerCanFence',true,
   'apiRolesBlocked',jsonb_build_array('authenticator','supabase_auth_admin','supabase_storage_admin'),
   'operatorRetainsAccess',true,'existingConnectionsDrained',false,
   'settingsChanged',false,'productionReady',false);
  -- An explicit exception rolls back every grant modification above. A normal
  -- success path must not leave the staging API disconnected.
  raise exception using errcode='AT001',message='Rollback successful capability test';
 exception when sqlstate 'AT001' then null;
 end;
 if before_acl is distinct from (select md5(coalesce(datacl::text,'')) from pg_database where datname=current_database()) then
  raise exception 'Database privileges were not restored';
 end if;
 return result;
end $function$;
revoke all on function ats_recovery_lab.check_standby_connection_fence() from public,anon,authenticated,service_role;
commit;
