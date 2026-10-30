-- Catalog-only readback. No passwords, role settings, function bodies, queue rows,
-- customer rows, SET ROLE or mutations. Root executes on the intended live target.
WITH schemas AS (
  SELECT oid,nspname,nspowner,nspacl FROM pg_catalog.pg_namespace
  WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'
), role_matrix AS (
  SELECT r.oid,r.rolname AS name,r.rolsuper AS super,r.rolcanlogin AS login,
    r.rolinherit AS inherit,r.rolcreatedb AS create_database,r.rolcreaterole AS create_role,
    r.rolreplication AS replication,r.rolbypassrls AS bypass_rls,
    pg_catalog.has_database_privilege(r.oid,current_database(),'CONNECT') AS database_connect,
    pg_catalog.has_database_privilege(r.oid,current_database(),'TEMPORARY') AS database_temp,
    pg_catalog.has_database_privilege(r.oid,current_database(),'CREATE') AS database_create,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('schema',s.nspname,
      'usage',pg_catalog.has_schema_privilege(r.oid,s.oid,'USAGE'),
      'create',pg_catalog.has_schema_privilege(r.oid,s.oid,'CREATE')) ORDER BY s.nspname),'[]') FROM schemas s) AS schema_privileges,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('role',pg_catalog.pg_get_userbyid(m.roleid),
      'member',pg_catalog.pg_get_userbyid(m.member),'grantor',pg_catalog.pg_get_userbyid(m.grantor),
      'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
      ORDER BY m.roleid,m.member,m.grantor),'[]') FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS memberships
  FROM pg_catalog.pg_roles r
), defaults AS (
  SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS creator,
    CASE WHEN d.defaclnamespace=0 THEN '<global>' ELSE n.nspname END AS schema,
    d.defaclobjtype AS object_type,
    d.defaclrole IN (SELECT oid FROM pg_catalog.pg_roles WHERE rolname IN('postgres','supabase_admin')) AS relevant_website_creator,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.grantee,a.privilege_type,a.grantor),'[]') FROM pg_catalog.aclexplode(d.defaclacl)a) AS acl
  FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
)
SELECT jsonb_build_object(
  'scope','Read-only native role/default-ACL inventory; no credentials, role settings, bodies or application rows',
  'database',current_database(),'observed_at',clock_timestamp(),
  'default_acl_note','Global and schema defaults combine. Absence of an entry retains PostgreSQL defaults, including PUBLIC EXECUTE on new functions. Role defaults apply to actual creator, not inherited role membership.',
  'all_roles',(SELECT coalesce(jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.name),'[]') FROM role_matrix r),
  'all_default_acls',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.creator,d.schema,d.object_type),'[]') FROM defaults d),
  'schema_acls',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',s.nspname,'owner',pg_catalog.pg_get_userbyid(s.nspowner),
    'acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_catalog.pg_get_userbyid(a.grantor),
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      'privilege',a.privilege_type,'grantable',a.is_grantable)ORDER BY a.grantee,a.privilege_type),'[]')
      FROM pg_catalog.aclexplode(coalesce(s.nspacl,pg_catalog.acldefault('n',s.nspowner)))a))ORDER BY s.nspname),'[]') FROM schemas s),
  'database_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantor',pg_catalog.pg_get_userbyid(a.grantor),
    'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
    'privilege',a.privilege_type,'grantable',a.is_grantable)ORDER BY a.grantee,a.privilege_type),'[]')
    FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(d.datacl,pg_catalog.acldefault('d',d.datdba)))a
    WHERE d.datname=current_database())
) AS role_default_acl_inventory;
