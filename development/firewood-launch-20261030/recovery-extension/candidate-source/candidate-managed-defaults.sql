-- Reviewed managed default, installed only in the isolated self-hosted candidate.
-- Source: production catalog read-only, 2026-10-27. No business data involved.
begin;
do $$ begin if current_setting('ats.hosting.candidate_only',true) is distinct from 'yes' then raise exception 'Isolated candidate flag required'; end if; end $$;
CREATE OR REPLACE FUNCTION app_private.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
-- This self-hosted Postgres build requires a superuser-owned event trigger to
-- call a superuser-owned function. Keep this maintenance helper with the local
-- platform operator; ordinary business functions retain their postgres owner.
alter function app_private.rls_auto_enable() owner to supabase_admin;
revoke all on function app_private.rls_auto_enable() from public,anon,authenticated,service_role;
create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') execute function app_private.rls_auto_enable();
commit;
