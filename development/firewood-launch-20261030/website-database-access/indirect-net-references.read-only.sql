-- Read-only metadata. Reports names/references, never function bodies or queue rows.
WITH functions AS (
  SELECT p.oid,n.nspname,p.proname,p.prosecdef,
    pg_catalog.pg_get_function_identity_arguments(p.oid) arguments,
    EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner)))a
      WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
    EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(n.nspacl,pg_catalog.acldefault('n',n.nspowner)))a
      WHERE a.grantee=0 AND a.privilege_type='USAGE') AS public_schema_usage,
    p.prosrc ~* '(^|[^a-z0-9_])net[[:space:]]*\.' AS textual_net_reference,
    p.proconfig
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','net')
), dependencies AS (
  SELECT d.objid AS function_oid,'function' AS target_kind,n.nspname||'.'||p.proname AS target
  FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_proc p ON p.oid=d.refobjid
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.refclassid='pg_catalog.pg_proc'::regclass AND n.nspname='net'
  UNION ALL
  SELECT d.objid,'relation',n.nspname||'.'||c.relname
  FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_class c ON c.oid=d.refobjid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE d.classid='pg_catalog.pg_proc'::regclass AND d.refclassid='pg_catalog.pg_class'::regclass AND n.nspname='net'
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'schema',f.nspname,'name',f.proname,'arguments',f.arguments,
  'security_definer',f.prosecdef,'public_execute',f.public_execute,
  'public_schema_usage',f.public_schema_usage,'textual_net_reference',f.textual_net_reference,
  'settings',f.proconfig,'dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',d.target_kind,'target',d.target)) FROM dependencies d WHERE d.function_oid=f.oid),'[]')
) ORDER BY f.nspname,f.proname,f.arguments),'[]') AS indirect_net_references
FROM functions f
WHERE f.textual_net_reference OR EXISTS(SELECT 1 FROM dependencies d WHERE d.function_oid=f.oid);
