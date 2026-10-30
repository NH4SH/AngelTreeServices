-- Catalog metadata only. No customer rows, bodies, credentials, SET ROLE, or mutations.
-- Include PUBLIC default ACLs: NULL is a default, not absence of privilege.
WITH namespaces AS (
  SELECT n.oid,n.nspname,n.nspowner,n.nspacl
  FROM pg_catalog.pg_namespace n
  WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
), public_schema AS (
  SELECT n.oid,n.nspname,array_agg(a.privilege_type ORDER BY a.privilege_type) privileges
  FROM namespaces n CROSS JOIN LATERAL pg_catalog.aclexplode(
    coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
  WHERE a.grantee=0 GROUP BY n.oid,n.nspname
), public_functions AS (
  SELECT n.nspname AS schema,p.proname AS name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,
    p.provolatile AS volatility,p.proconfig AS settings,p.prokind AS kind,
    EXISTS(SELECT 1 FROM public_schema s WHERE s.oid=n.oid AND 'USAGE'=ANY(s.privileges)) AS public_schema_usage
  FROM namespaces n JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid
  WHERE EXISTS(SELECT 1 FROM pg_catalog.aclexplode(
    coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
    WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
), public_relations AS (
  SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,
    c.relforcerowsecurity AS force_rls,c.reloptions AS options,
    (SELECT coalesce(jsonb_agg(a.privilege_type ORDER BY a.privilege_type),'[]')
      FROM pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE a.grantee=0) AS public_table_privileges,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('column',at.attname,'privilege',a.privilege_type) ORDER BY at.attnum,a.privilege_type),'[]')
      FROM pg_catalog.pg_attribute at CROSS JOIN LATERAL pg_catalog.aclexplode(at.attacl) a
      WHERE at.attrelid=c.oid AND at.attnum>0 AND NOT at.attisdropped AND a.grantee=0) AS public_column_privileges,
    EXISTS(SELECT 1 FROM public_schema s WHERE s.oid=n.oid AND 'USAGE'=ANY(s.privileges)) AS public_schema_usage
  FROM namespaces n JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid
  WHERE c.relkind IN ('r','p','v','m','S','f')
), proposed(name) AS (VALUES ('ats_firewood_request'),('ats_firewood_worker'),('ats_firewood_health')),
existing AS (SELECT r.* FROM pg_catalog.pg_roles r JOIN proposed p ON p.name=r.rolname),
effective AS (
  SELECT r.rolname,n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid) arguments,
    p.prosecdef AS security_definer,pg_catalog.pg_get_userbyid(p.proowner) AS owner
  FROM existing r CROSS JOIN namespaces n JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid
  WHERE pg_catalog.has_schema_privilege(r.oid,n.oid,'USAGE')
    AND pg_catalog.has_function_privilege(r.oid,p.oid,'EXECUTE')
)
SELECT jsonb_build_object(
  'scope','read-only catalog; PUBLIC is inherited by every role including NOINHERIT; RLS/function bodies still require separate review',
  'database',current_database(),'observed_at',clock_timestamp(),
  'proposed_roles',(SELECT jsonb_agg(jsonb_build_object('name',p.name,'exists',r.oid IS NOT NULL,
     'login',r.rolcanlogin,'super',r.rolsuper,'inherit',r.rolinherit,'create_role',r.rolcreaterole,
     'create_db',r.rolcreatedb,'replication',r.rolreplication,'bypass_rls',r.rolbypassrls,
     'memberships',coalesce((SELECT jsonb_agg(pg_catalog.pg_get_userbyid(m.roleid)) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid),'[]')) ORDER BY p.name)
     FROM proposed p LEFT JOIN existing r ON p.name=r.rolname),
  'database_public_privileges',(SELECT coalesce(jsonb_agg(a.privilege_type ORDER BY a.privilege_type),'[]')
     FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba))) a
     WHERE d.datname=current_database() AND a.grantee=0),
  'public_schema_privileges',(SELECT coalesce(jsonb_agg(to_jsonb(s)-'oid' ORDER BY s.nspname),'[]') FROM public_schema s),
  'public_executable_functions',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.schema,f.name,f.arguments),'[]') FROM public_functions f),
  'public_relation_privileges',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.schema,t.name),'[]') FROM public_relations t
     WHERE t.public_table_privileges<>'[]'::jsonb OR t.public_column_privileges<>'[]'::jsonb),
  'existing_native_effective_function_privileges',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.rolname,e.nspname,e.proname,e.arguments),'[]') FROM effective e),
  'existing_native_effective_relation_privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'schema',t.schema,'relation',t.name,'privilege',q.privilege) ORDER BY r.rolname,t.schema,t.name,q.privilege),'[]')
     FROM existing r CROSS JOIN public_relations t CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))q(privilege)
     WHERE pg_catalog.has_schema_privilege(r.oid,t.schema,'USAGE')
       AND pg_catalog.has_table_privilege(r.oid,format('%I.%I',t.schema,t.name),q.privilege))
) AS effective_access_inventory;
