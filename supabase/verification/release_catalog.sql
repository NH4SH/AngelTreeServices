-- Read-only application catalog. No business rows, secrets, function bodies or
-- migration statement text are returned. Hashes compare definitions, not intent.
-- Consumers run this inside BEGIN READ ONLY with a short statement timeout.
with relations as (
 select c.*,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','app_private','private') and c.relkind in ('r','p','v','m','S')
 and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')
), objects as (
 select 'relation' kind,nspname||'.'||relname key,
 jsonb_build_object('kind',relkind,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity,'forceRLS',relforcerowsecurity,
 'options',coalesce(to_jsonb(reloptions),'[]'::jsonb),
 'acl',(select jsonb_agg(x order by x::text) from (select jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) x from aclexplode(coalesce(relacl,acldefault(case when relkind='S' then 's'::"char" else 'r'::"char" end,relowner))) a) q)) value from relations
 union all
 select 'column',r.nspname||'.'||r.relname||'.'||a.attname,
 jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
 'default',pg_get_expr(d.adbin,d.adrelid),'acl',(select jsonb_agg(x order by x::text) from(select jsonb_build_object('grantee',case when p.grantee=0 then 'PUBLIC' else pg_get_userbyid(p.grantee) end,'grantor',pg_get_userbyid(p.grantor),'privilege',p.privilege_type,'grantable',p.is_grantable) x from aclexplode(a.attacl) p) q))
 from relations r join pg_attribute a on a.attrelid=r.oid left join pg_attrdef d on d.adrelid=r.oid and d.adnum=a.attnum where a.attnum>0 and not a.attisdropped
 union all
 select 'constraint',r.nspname||'.'||r.relname||'.'||c.conname,
 jsonb_build_object('definition',pg_get_constraintdef(c.oid),'validated',c.convalidated,'deferrable',c.condeferrable,'deferred',c.condeferred)
 from pg_constraint c join relations r on r.oid=c.conrelid
 union all
 select 'index',r.nspname||'.'||i.relname,jsonb_build_object('definition',pg_get_indexdef(i.oid),'valid',x.indisvalid,'ready',x.indisready)
 from pg_index x join pg_class i on i.oid=x.indexrelid join relations r on r.oid=x.indrelid
 union all
 select 'routine',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
 jsonb_build_object('owner',pg_get_userbyid(p.proowner),'language',l.lanname,'returns',pg_get_function_result(p.oid),'arguments',pg_get_function_arguments(p.oid),'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'leakproof',p.proleakproof,
 'config',coalesce(to_jsonb(p.proconfig),'[]'::jsonb),'bodyHash',md5(p.prosrc),'bodyWhitespaceHash',md5(regexp_replace(p.prosrc,'\s+',' ','g')),
 'acl',(select jsonb_agg(x order by x::text) from(select jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) x from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) q))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
 where n.nspname in ('public','app_private','private') and p.prokind in ('f','p')
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 union all
 select 'view',r.nspname||'.'||r.relname,jsonb_build_object('definition',pg_get_viewdef(r.oid),'options',coalesce(to_jsonb(r.reloptions),'[]'::jsonb)) from relations r where r.relkind in ('v','m')
 union all
 select 'policy',p.schemaname||'.'||p.tablename||'.'||p.policyname,to_jsonb(p)-'schemaname'-'tablename'-'policyname' from pg_policies p where p.schemaname in ('public','app_private','private','storage')
 union all
 select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 where not t.tgisinternal and (n.nspname in ('public','app_private','private') or (n.nspname='auth' and t.tgname='on_auth_user_created') or (n.nspname='storage' and t.tgname='capture_attachment_object'))
 union all
 select 'enum',n.nspname||'.'||t.typname,jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname in ('public','app_private','private') group by n.nspname,t.typname
 union all
 select 'bucket',b.id,jsonb_build_object('public',b.public,'fileSizeLimit',b.file_size_limit,'allowedMimeTypes',to_jsonb(b.allowed_mime_types)) from storage.buckets b
 union all
 select 'schema',n.nspname,jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',(select jsonb_agg(x order by x::text) from(select jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) x from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) q)) from pg_namespace n where n.nspname in ('public','app_private','private')
 union all
 select 'default_acl',coalesce(n.nspname,'*')||'.'||pg_get_userbyid(d.defaclrole)||'.'||d.defaclobjtype::text,
 jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'objectType',d.defaclobjtype,'acl',(select jsonb_agg(x order by x::text) from(select jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) x from aclexplode(d.defaclacl) a) q))
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
 where pg_get_userbyid(d.defaclrole) in ('postgres','supabase_admin') and (n.nspname in ('public','app_private','private') or d.defaclnamespace=0)
 union all
 select 'event_trigger',e.evtname,jsonb_build_object('event',e.evtevent,'enabled',e.evtenabled,'handler',e.evtfoid::regprocedure::text,'owner',pg_get_userbyid(e.evtowner),'tags',to_jsonb(e.evttags))
 from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='rls_auto_enable'
)
select kind,key,value from objects order by kind,key
