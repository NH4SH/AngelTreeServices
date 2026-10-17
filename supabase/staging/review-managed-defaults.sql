-- Read-only evidence, not a migration or repair. Metadata only; no credentials,
-- business rows, function bodies or hosted probe objects are returned/created.
begin read only;
set local statement_timeout='15s';
with owners as (
 select 'relation' as kind, pg_get_userbyid(c.relowner) as owner, count(*) as objects
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')
 and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
 group by c.relowner
 union all
 select 'routine',pg_get_userbyid(p.proowner),count(*)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prokind in ('f','p')
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 group by p.proowner
), defaults as (
 select pg_get_userbyid(d.defaclrole) as owner,d.defaclobjtype as kind,
 coalesce(n.nspname,'*') as schema,
 case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
 a.privilege_type as privilege,a.is_grantable as grantable
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 cross join lateral aclexplode(d.defaclacl) a
 where d.defaclrole in ('postgres'::regrole,'supabase_admin'::regrole)
 and (n.nspname='public' or d.defaclnamespace=0)
)
select jsonb_build_object(
 'currentUser',current_user,
 'superuser',(select rolsuper from pg_roles where rolname=current_user),
 'memberOfManagedAdmin',pg_has_role(current_user,'supabase_admin','MEMBER'),
 'publicApplicationOwners',(select jsonb_agg(to_jsonb(o) order by kind,owner) from owners o),
 'publicApplicationObjectsNotOwnedByPostgres',(select coalesce(sum(objects),0) from owners where owner<>'postgres'),
 'defaultAclEntries',(select count(*) from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' and d.defaclrole='supabase_admin'::regrole),
 'defaults',(select jsonb_agg(to_jsonb(d) order by owner,kind,schema,grantee,privilege) from defaults d),
 'browserSchemaCreate',has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE'),
 'anonymousApplicationDefiners',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')
   and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'))
) as review;
commit;
