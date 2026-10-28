-- Read-only. Explicitly accounts for the two staging-only lab ledger entries.
select jsonb_build_object(
 'projectRef','gbyhdsuiqeslgjdnbqng',
 'applicationCount',count(*),
 'applicationVersionsMd5',md5(string_agg(version,',' order by version)),
 'applicationLedgerMd5',md5(jsonb_agg(jsonb_build_object('version',version,'name',name,'statements',statements) order by version)::text),
 'latestApplicationVersion',max(version),
 'maintenance',(select jsonb_agg(jsonb_build_object('version',version,'name',name,'statementsMd5',md5(statements::text)) order by version) from supabase_migrations.schema_migrations where name like 'recovery_verifier_lab%'),
 'controlDefinitionMd5',md5(pg_get_functiondef('public.ats_recovery_lab_control(jsonb)'::regprocedure)),
 'authGuardMd5',md5(pg_get_functiondef('ats_staging_auth.reject_email(jsonb)'::regprocedure)),
 'businessPolicyCount',(select count(*) from pg_policies where schemaname in('public','app_private')),
 'authUsers',(select count(*) from auth.users),
 'labPermissionsClosed',(select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=pg_catalog, ats_recovery_lab']
   and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')
   and has_function_privilege('service_role',p.oid,'execute') from pg_proc p where p.oid='public.ats_recovery_lab_control(jsonb)'::regprocedure),
 'incrementalDefinitionMd5',md5(pg_get_functiondef('public.ats_recovery_incremental_control(jsonb)'::regprocedure)),
 'chargeDefinitionMd5',md5(pg_get_functiondef('ats_recovery_lab.charge_bytes(text,bigint)'::regprocedure)),
 'incrementalPermissionsClosed',(select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig=array['search_path=pg_catalog, ats_recovery_lab']
   and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') and has_function_privilege('service_role',p.oid,'execute')
   and not has_function_privilege('anon','ats_recovery_lab.charge_bytes(text,bigint)','execute') and not has_function_privilege('authenticated','ats_recovery_lab.charge_bytes(text,bigint)','execute')
   and not has_function_privilege('service_role','ats_recovery_lab.charge_bytes(text,bigint)','execute') from pg_proc p where p.oid='public.ats_recovery_incremental_control(jsonb)'::regprocedure),
 'labTablesClosed',(select count(*)=4 and bool_and(c.relrowsecurity and not has_schema_privilege('anon',n.oid,'usage') and not has_schema_privilege('authenticated',n.oid,'usage')
   and not has_table_privilege('anon',c.oid,'select') and not has_table_privilege('authenticated',c.oid,'select') and not has_table_privilege('service_role',c.oid,'select'))
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ats_recovery_lab' and c.relkind='r')
) evidence from supabase_migrations.schema_migrations where name not like 'recovery_verifier_lab%';
