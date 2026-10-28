// Catalog and row-digest manifest for an isolated, already quiesced source.
export const captureManifestSql = `
set search_path=pg_catalog;
-- Keep intermediate rows in this connection's memory. CREATE TEMP TABLE allocates
-- pg_temp namespaces, shifting pg_dump's IDs even when business data is unchanged.
do $body$ declare t record;rows jsonb:='[]';item jsonb; begin
 for t in select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth','storage','supabase_migrations') order by schemaname,tablename loop
  execute format('select jsonb_build_object(''name'',%L,''n'',count(*),''digest'',md5(coalesce(string_agg(md5(to_jsonb(x)::text),'''' order by md5(to_jsonb(x)::text)),''''))) from %I.%I x',t.schemaname||'.'||t.tablename,t.schemaname,t.tablename) into item;
  rows:=rows||jsonb_build_array(item);
 end loop;
 perform set_config('ats_recovery.rows',rows::text,false);
end $body$;
select jsonb_build_object(
 'tables',current_setting('ats_recovery.rows')::jsonb,
 'policies',(select md5(coalesce(string_agg(row(schemaname,tablename,policyname,permissive,array(select unnest(roles) order by 1),cmd,qual,with_check)::text,'' order by schemaname,tablename,policyname),'')) from pg_policies where schemaname in ('public','app_private','auth','storage')),
 'permissions',(select md5(string_agg(row(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner),(select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor),a.grantee=0,pg_get_userbyid(a.grantee),a.privilege_type,a.is_grantable) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a))::text,'' order by n.nspname,c.relname)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth','storage') and c.relkind in ('r','p','v','S')),
 'functions',(select md5(string_agg(n.nspname||'.'||p.proname||pg_get_function_identity_arguments(p.oid)||pg_get_userbyid(p.proowner)||coalesce(p.proacl::text,'')||pg_get_functiondef(p.oid),'' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prokind='f')
);`;
