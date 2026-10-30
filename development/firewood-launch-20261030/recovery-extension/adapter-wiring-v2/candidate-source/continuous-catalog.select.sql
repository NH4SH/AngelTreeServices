-- REVIEW ONLY; not wired to any operative adapter.
-- Caller must use a READ ONLY transaction, search_path=pg_catalog, timezone=UTC.
-- Statement timeout5s, lock timeout1s; no role/environment/admission input.
-- This one statement returns opaque digests/counts only; no application rows.
WITH ns AS (
 SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
 WHERE nspname !~ '^pg_' AND nspname<>'information_schema'
), rel AS (
 SELECT c.*,n.nspname FROM pg_class c JOIN ns n ON n.oid=c.relnamespace
 WHERE c.relkind IN('r','p','v','m','S','f')
), proc AS (
 SELECT p.*,n.nspname FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace
), typ AS (
 SELECT t.*,n.nspname FROM pg_type t JOIN ns n ON n.oid=t.typnamespace
), acl_inputs AS (
 SELECT jsonb_build_array('database',d.datname)::text identity,d.datdba owner_oid,d.datacl acl,'d'::"char" default_kind
 FROM pg_database d WHERE d.datname=current_database()
 UNION ALL SELECT jsonb_build_array('schema',n.nspname)::text,n.nspowner,n.nspacl,'n'::"char" FROM ns n
 UNION ALL SELECT jsonb_build_array('relation',r.nspname,r.relname)::text,r.relowner,r.relacl,
 CASE WHEN r.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END FROM rel r
 UNION ALL SELECT jsonb_build_array('column',r.nspname,r.relname,a.attname)::text,r.relowner,a.attacl,NULL::"char"
 FROM rel r JOIN pg_attribute a ON a.attrelid=r.oid WHERE a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT jsonb_build_array('routine',p.nspname,p.proname,pg_get_function_identity_arguments(p.oid))::text,
 p.proowner,p.proacl,'f'::"char" FROM proc p
 UNION ALL SELECT jsonb_build_array('type',t.nspname,t.typname)::text,t.typowner,t.typacl,'T'::"char" FROM typ t
 UNION ALL SELECT jsonb_build_array('default-acl',pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'<global>'),d.defaclobjtype)::text,
 d.defaclrole,d.defaclacl,NULL::"char" FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
), acl AS MATERIALIZED (
 SELECT i.identity,jsonb_build_object('owner',pg_get_userbyid(i.owner_oid),'raw_is_null',i.acl IS NULL,
 'entries',(SELECT coalesce(jsonb_agg(jsonb_build_object(
 'grantor',pg_get_userbyid(a.grantor),'grantee_kind',CASE WHEN a.grantee=0 THEN 'public' ELSE 'role' END,
 'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)END,
 'privilege',a.privilege_type,'grantable',a.is_grantable)
 ORDER BY pg_get_userbyid(a.grantor) COLLATE "C",CASE WHEN a.grantee=0 THEN 'public' ELSE 'role' END COLLATE "C",
 (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)END) COLLATE "C",a.privilege_type COLLATE "C",a.is_grantable),'[]')
 FROM aclexplode(CASE WHEN cardinality(i.acl)>0 THEN i.acl
 WHEN i.acl IS NULL AND i.default_kind IS NOT NULL THEN acldefault(i.default_kind,i.owner_oid)
 ELSE NULL::aclitem[] END)a)) record
 FROM acl_inputs i
), acl_duplicate_count AS MATERIALIZED (
 SELECT count(*)::bigint n FROM(SELECT identity FROM acl GROUP BY identity HAVING count(*)>1)x
), acl_map AS MATERIALIZED (
 -- A duplicate identity produces no lookup map and NULL attestation digests.
 -- There is no last-value-wins authority or permission substitution.
 SELECT coalesce(jsonb_object_agg(identity,record),'{}'::jsonb)records
 FROM acl WHERE(SELECT n FROM acl_duplicate_count)=0
), role_records AS (
 SELECT jsonb_build_array('role',r.rolname)::text identity,jsonb_build_object('name',r.rolname,'superuser',r.rolsuper,
 'inherit',r.rolinherit,'create_role',r.rolcreaterole,'create_database',r.rolcreatedb,'replication',r.rolreplication,
 'bypass_rls',r.rolbypassrls,'connection_limit',r.rolconnlimit,
 'configuration_sha256',encode(sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8')),'hex'))record
 FROM pg_roles r
), bootstrap_records AS (
 SELECT jsonb_build_array('bootstrap-role')::text identity,
 jsonb_build_object('name',r.rolname)record FROM pg_roles r WHERE r.oid=10
), membership_records AS (
 SELECT jsonb_build_array('membership',pg_get_userbyid(m.roleid),pg_get_userbyid(m.member),pg_get_userbyid(m.grantor))::text identity,
 jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),'grantor',pg_get_userbyid(m.grantor),
 'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)record FROM pg_auth_members m
), policy_records AS (
 SELECT jsonb_build_array('policy',r.nspname,r.relname,p.polname)::text identity,
 jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
 'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',CASE WHEN x=0 THEN 'public' ELSE 'role'END,
 'name',CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x)END)
 ORDER BY CASE WHEN x=0 THEN 'public' ELSE 'role'END COLLATE "C",
 (CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x)END) COLLATE "C"),'[]')FROM unnest(p.polroles)x),
 'using_is_null',p.polqual IS NULL,
 'using_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(p.polqual,p.polrelid),'null'),'UTF8')),'hex'),
 'check_is_null',p.polwithcheck IS NULL,
 'check_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'null'),'UTF8')),'hex'))record
 FROM pg_policy p JOIN rel r ON r.oid=p.polrelid
), relation_access AS (
 SELECT jsonb_build_array('relation-access',r.nspname,r.relname)::text identity,
 jsonb_build_object('owner',pg_get_userbyid(r.relowner),'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
 'acl',a.records->jsonb_build_array('relation',r.nspname,r.relname)::text)record FROM rel r CROSS JOIN acl_map a
), relation_records AS (
 SELECT jsonb_build_array('relation',r.nspname,r.relname)::text identity,
 jsonb_build_object('schema',r.nspname,'name',r.relname,'kind',r.relkind,'persistence',r.relpersistence,
 'owner',pg_get_userbyid(r.relowner),'acl',a.records->jsonb_build_array('relation',r.nspname,r.relname)::text,'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,
 'options_sha256',encode(sha256(convert_to(coalesce(to_jsonb(r.reloptions),'null'::jsonb)::text,'UTF8')),'hex'),
 'replica_identity',r.relreplident,'is_partition',r.relispartition,
 'partition_key_sha256',CASE WHEN r.relkind='p' THEN encode(sha256(convert_to(pg_get_partkeydef(r.oid),'UTF8')),'hex')ELSE NULL END,
 'partition_bound_sha256',CASE WHEN r.relispartition THEN encode(sha256(convert_to(pg_get_expr(r.relpartbound,r.oid),'UTF8')),'hex')ELSE NULL END,
 'parents',(SELECT coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname)ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"),'[]')
 FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhparent JOIN pg_namespace n ON n.oid=c.relnamespace WHERE i.inhrelid=r.oid),
 'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',x.attname,'number',x.attnum,'type',format_type(x.atttypid,x.atttypmod),
 'not_null',x.attnotnull,'identity',x.attidentity,'generated',x.attgenerated,
 'collation',(SELECT jsonb_build_array(n.nspname,c.collname)FROM pg_collation c JOIN pg_namespace n ON n.oid=c.collnamespace WHERE c.oid=x.attcollation),
 'default_is_null',d.oid IS NULL,'default_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),'null'),'UTF8')),'hex'),
 'acl',a.records->jsonb_build_array('column',r.nspname,r.relname,x.attname)::text)
 ORDER BY x.attnum),'[]')FROM pg_attribute x LEFT JOIN pg_attrdef d ON d.adrelid=x.attrelid AND d.adnum=x.attnum
 WHERE x.attrelid=r.oid AND x.attnum>0 AND NOT x.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'kind',c.contype,'validated',c.convalidated,
 'deferrable',c.condeferrable,'deferred',c.condeferred,'definition_sha256',encode(sha256(convert_to(pg_get_constraintdef(c.oid,true),'UTF8')),'hex'))
 ORDER BY c.conname COLLATE "C"),'[]')FROM pg_constraint c WHERE c.conrelid=r.oid),
 'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'valid',i.indisvalid,'ready',i.indisready,
 'replica_identity',i.indisreplident,'definition_sha256',encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex'))
 ORDER BY c.relname COLLATE "C"),'[]')FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=r.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'deferrable',t.tgdeferrable,
 'deferred',t.tginitdeferred,'definition_sha256',encode(sha256(convert_to(pg_get_triggerdef(t.oid,true),'UTF8')),'hex'))
 ORDER BY t.tgname COLLATE "C"),'[]')FROM pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal),
 'view_sha256',CASE WHEN r.relkind IN('v','m')THEN encode(sha256(convert_to(pg_get_viewdef(r.oid,true),'UTF8')),'hex')ELSE NULL END,
 'sequence',(SELECT jsonb_build_object('type',format_type(s.seqtypid,NULL),'start',s.seqstart,'increment',s.seqincrement,
 'min',s.seqmin,'max',s.seqmax,'cache',s.seqcache,'cycle',s.seqcycle)FROM pg_sequence s WHERE s.seqrelid=r.oid))record
 FROM rel r CROSS JOIN acl_map a
), routine_records AS (
 SELECT jsonb_build_array('routine',p.nspname,p.proname,pg_get_function_identity_arguments(p.oid))::text identity,
 jsonb_build_object('schema',p.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'kind',p.prokind,
 'owner',pg_get_userbyid(p.proowner),'acl',a.records->jsonb_build_array('routine',p.nspname,p.proname,pg_get_function_identity_arguments(p.oid))::text,'security_definer',p.prosecdef,'leakproof',p.proleakproof,
 'volatility',p.provolatile,'parallel',p.proparallel,'strict',p.proisstrict,'returns_set',p.proretset,
 'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
 'definition_sha256',CASE WHEN p.prokind<>'a'THEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')ELSE NULL END,
 'configuration_sha256',encode(sha256(convert_to(coalesce(to_jsonb(p.proconfig),'null'::jsonb)::text,'UTF8')),'hex'))record
 FROM proc p CROSS JOIN acl_map a
), namespace_records AS (
 SELECT jsonb_build_array('schema',n.nspname)::text identity,a.records->jsonb_build_array('schema',n.nspname)::text record FROM ns n
 CROSS JOIN acl_map a
), type_records AS (
 SELECT jsonb_build_array('type',t.nspname,t.typname)::text identity,
 jsonb_build_object('name',t.typname,'schema',t.nspname,'kind',t.typtype,'category',t.typcategory,'not_null',t.typnotnull,
 'owner',pg_get_userbyid(t.typowner),'acl',a.records->jsonb_build_array('type',t.nspname,t.typname)::text,'defined',t.typisdefined,'length',t.typlen,'by_value',t.typbyval,
 'alignment',t.typalign,'storage',t.typstorage,'base_type',CASE WHEN t.typbasetype<>0 THEN format_type(t.typbasetype,t.typtypmod)ELSE NULL END,
 'default_is_null',t.typdefaultbin IS NULL,
 'default_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(t.typdefaultbin,0),'null'),'UTF8')),'hex'),
 'enum_labels',(SELECT coalesce(jsonb_agg(e.enumlabel ORDER BY e.enumsortorder),'[]')FROM pg_enum e WHERE e.enumtypid=t.oid),
 'domain_constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'validated',c.convalidated,
 'definition_sha256',encode(sha256(convert_to(pg_get_constraintdef(c.oid,true),'UTF8')),'hex'))ORDER BY c.conname COLLATE "C"),'[]')
 FROM pg_constraint c WHERE c.contypid=t.oid))record FROM typ t
 CROSS JOIN acl_map a
), event_records AS (
 SELECT jsonb_build_array('event-trigger',e.evtname)::text identity,jsonb_build_object('name',e.evtname,'event',e.evtevent,
 'owner',pg_get_userbyid(e.evtowner),'enabled',e.evtenabled,'tags',to_jsonb(e.evttags),
 'function',jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)))record
 FROM pg_event_trigger e JOIN pg_proc p ON p.oid=e.evtfoid JOIN pg_namespace n ON n.oid=p.pronamespace
), extension_records AS (
 SELECT jsonb_build_array('extension',e.extname)::text identity,jsonb_build_object('name',e.extname,'version',e.extversion,
 'owner',pg_get_userbyid(e.extowner),'schema',n.nspname,'relocatable',e.extrelocatable)record
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
), dependency_records AS (
 SELECT jsonb_build_array('sequence-owner',sn.nspname,s.relname,tn.nspname,t.relname,a.attname)::text identity,
 jsonb_build_object('sequence',jsonb_build_array(sn.nspname,s.relname),'table',jsonb_build_array(tn.nspname,t.relname),
 'column',a.attname,'kind',d.deptype)record FROM pg_depend d
 JOIN pg_class s ON s.oid=d.objid JOIN ns sn ON sn.oid=s.relnamespace
 JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace tn ON tn.oid=t.relnamespace
 JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
 WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND s.relkind='S'AND d.deptype IN('a','i')
), database_records AS (
 SELECT jsonb_build_array('database',d.datname)::text identity,jsonb_build_object('name',d.datname,'acl',a.records->jsonb_build_array('database',d.datname)::text,
 'owner',pg_get_userbyid(d.datdba),'encoding',pg_encoding_to_char(d.encoding),'collate',d.datcollate,'ctype',d.datctype,
 'locale_provider',d.datlocprovider,'locale',coalesce(to_jsonb(d)->>'datlocale',to_jsonb(d)->>'daticulocale'),
 'collation_version',d.datcollversion)record FROM pg_database d
 CROSS JOIN acl_map a WHERE d.datname=current_database()
), setting_records AS (
 SELECT jsonb_build_array('role-database-setting',coalesce(d.datname,'<all-databases>'),coalesce(r.rolname,'<all-roles>'))::text identity,
 jsonb_build_object('database',d.datname,'role',r.rolname,
 'configuration_sha256',encode(sha256(convert_to(coalesce(to_jsonb(s.setconfig),'null'::jsonb)::text,'UTF8')),'hex'))record
 FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase LEFT JOIN pg_roles r ON r.oid=s.setrole
 WHERE s.setdatabase=0 OR s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database())
), owner_acl_records AS (
 SELECT jsonb_build_array('acl-projection',identity)::text identity,record FROM acl UNION ALL SELECT identity,record FROM role_records
 UNION ALL SELECT identity,record FROM bootstrap_records
 UNION ALL SELECT identity,record FROM membership_records UNION ALL SELECT identity,record FROM policy_records
 UNION ALL SELECT identity,record FROM relation_access
), semantic_records AS (
 SELECT identity,record FROM relation_records UNION ALL SELECT identity,record FROM routine_records
 UNION ALL SELECT identity,record FROM namespace_records UNION ALL SELECT identity,record FROM type_records
 UNION ALL SELECT identity,record FROM event_records UNION ALL SELECT identity,record FROM extension_records
 UNION ALL SELECT identity,record FROM dependency_records UNION ALL SELECT identity,record FROM database_records
 UNION ALL SELECT identity,record FROM setting_records UNION ALL SELECT identity,record FROM owner_acl_records
), protected AS (
 SELECT r.oid,r.nspname,r.relname FROM rel r WHERE r.relkind IN('r','p')AND r.nspname IN('public','app_private','auth','storage')
), captured AS (
 SELECT r.oid,r.nspname,r.relname FROM rel r WHERE r.relkind IN('r','p')AND r.nspname IN('public','app_private','auth','storage','supabase_migrations')
), guard_triggers AS (
 SELECT r.oid relation_oid,t.tgname,t.tgtype,t.tgenabled,t.tgdeferrable,t.tginitdeferred,t.tgconstraint,t.tgnargs,t.tgqual,
 t.tgattr,t.tgargs,t.tgoldtable,t.tgnewtable,n.nspname function_schema,p.proname function_name,
 pg_get_function_identity_arguments(p.oid)function_arguments,
 jsonb_build_object('name',t.tgname,'type',t.tgtype,'enabled',t.tgenabled,'deferrable',t.tgdeferrable,
 'deferred',t.tginitdeferred,'constraint_present',t.tgconstraint<>0,'argument_count',t.tgnargs,
 'arguments_sha256',encode(sha256(t.tgargs),'hex'),'attributes',t.tgattr::text,
 'qualification_is_null',t.tgqual IS NULL,
 'qualification_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(t.tgqual,t.tgrelid),'null'),'UTF8')),'hex'),
 'old_transition_table',t.tgoldtable,'new_transition_table',t.tgnewtable,
 'function',jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),
 'definition_sha256',encode(sha256(convert_to(pg_get_triggerdef(t.oid,true),'UTF8')),'hex'))record
 FROM protected r JOIN pg_trigger t ON t.tgrelid=r.oid JOIN pg_proc p ON p.oid=t.tgfoid
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT t.tgisinternal
 AND(t.tgname LIKE 'ats_hosting_%'OR n.nspname='hosting_guard')
), guard_shape AS (
 SELECT t.*,(t.tgenabled='O'AND t.tgnargs=0 AND octet_length(t.tgargs)=0 AND t.tgqual IS NULL AND t.tgattr::text=''
 AND t.tgoldtable IS NULL AND t.tgnewtable IS NULL AND t.function_schema='hosting_guard'AND t.function_arguments=''
 AND((t.tgname='ats_hosting_admission'AND t.function_name='enforce_write'AND t.tgtype=31
 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgconstraint=0)
 OR(t.tgname='ats_hosting_commit'AND t.function_name='enforce_write'AND t.tgtype=29
 AND t.tgdeferrable AND t.tginitdeferred AND t.tgconstraint<>0)
 OR(t.tgname='ats_hosting_truncate'AND t.function_name='operator_truncate_only'AND t.tgtype=34
 AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgconstraint=0)))valid_shape FROM guard_triggers t
), guard_table_records AS (
 SELECT jsonb_build_array('guard-table',r.nspname,r.relname)::text identity,
 jsonb_build_object('table',jsonb_build_array(r.nspname,r.relname),
 'triggers',(SELECT coalesce(jsonb_agg(t.record ORDER BY t.tgname COLLATE "C"),'[]')FROM guard_shape t WHERE t.relation_oid=r.oid))record,
 ((SELECT count(*)FROM guard_shape t WHERE t.relation_oid=r.oid)=3
 AND(SELECT count(*)FROM guard_shape t WHERE t.relation_oid=r.oid AND t.valid_shape)=3)valid_triplet
 FROM protected r
), guard_records AS (
 SELECT identity,record FROM guard_table_records
 UNION ALL SELECT identity,record FROM routine_records WHERE record->>'schema'='hosting_guard'
 UNION ALL SELECT identity,record FROM namespace_records WHERE identity=jsonb_build_array('schema','hosting_guard')::text
 UNION ALL SELECT identity,record FROM event_records WHERE record->'function'->>0='hosting_guard'
), payloads AS (
 SELECT(SELECT coalesce(jsonb_agg(jsonb_build_object('identity',identity,'record',record)ORDER BY identity COLLATE "C"),'[]')FROM semantic_records)semantic,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',identity,'record',record)ORDER BY identity COLLATE "C"),'[]')FROM owner_acl_records)owner_acl,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('identity',identity,'record',record)ORDER BY identity COLLATE "C"),'[]')FROM guard_records)guard,
 (SELECT '['||coalesce(string_agg(to_json(nspname||'.'||relname)::text,','ORDER BY(nspname||'.'||relname)COLLATE "C"),'')||']'FROM protected)protected_names,
 (SELECT '['||coalesce(string_agg(to_json(nspname||'.'||relname)::text,','ORDER BY(nspname||'.'||relname)COLLATE "C"),'')||']'FROM captured)captured_names
)
SELECT jsonb_build_object(
 'semanticSchemaSha256',CASE WHEN(SELECT n FROM acl_duplicate_count)=0 THEN encode(sha256(convert_to(semantic::text,'UTF8')),'hex')ELSE NULL END,
 'ownerAclSha256',CASE WHEN(SELECT n FROM acl_duplicate_count)=0 THEN encode(sha256(convert_to(owner_acl::text,'UTF8')),'hex')ELSE NULL END,
 'guardEnrollmentSha256',CASE WHEN(SELECT n FROM acl_duplicate_count)=0 THEN encode(sha256(convert_to(guard::text,'UTF8')),'hex')ELSE NULL END,
 'protectedInventorySha256',encode(sha256(convert_to(protected_names,'UTF8')),'hex'),
 'captureInventorySha256',encode(sha256(convert_to(captured_names,'UTF8')),'hex'),
 'counts',jsonb_build_object('protectedTables',(SELECT count(*)FROM protected),'capturedTables',(SELECT count(*)FROM captured),
 'guardTriggers',(SELECT count(*)FROM guard_shape),'invalidGuardTripletTables',(SELECT count(*)FROM guard_table_records WHERE NOT valid_triplet),
 'ledgerGuardTriggers',(SELECT count(*)FROM captured r JOIN pg_trigger t ON t.tgrelid=r.oid JOIN pg_proc p ON p.oid=t.tgfoid
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE r.nspname='supabase_migrations'AND r.relname='schema_migrations'
 AND NOT t.tgisinternal AND(t.tgname LIKE 'ats_hosting_%'OR n.nspname='hosting_guard')),
 'roleRecords',(SELECT count(*)FROM role_records),'bootstrapRolesAtOid10',(SELECT count(*)FROM bootstrap_records),
 'membershipRecords',(SELECT count(*)FROM membership_records),
 'semanticRecords',(SELECT count(*)FROM semantic_records),'ownerAclRecords',(SELECT count(*)FROM owner_acl_records),
 'guardRecords',(SELECT count(*)FROM guard_records),
 'duplicateAclIdentities',(SELECT n FROM acl_duplicate_count),
 'duplicateSemanticIdentities',(SELECT count(*)FROM(SELECT identity FROM semantic_records GROUP BY identity HAVING count(*)>1)x),
 'unsupportedInventoryNames',(SELECT count(*)FROM captured WHERE(nspname||'.'||relname)!~'^(public|app_private|auth|storage|supabase_migrations)\.[A-Za-z_][A-Za-z0-9_$]*$'),
 'unsupportedAggregates',(SELECT count(*)FROM proc WHERE prokind='a'),
 'foreignServers',(SELECT count(*)FROM pg_foreign_server),'userMappings',(SELECT count(*)FROM pg_user_mapping),
 'subscriptions',(SELECT count(*)FROM pg_subscription),'securityLabels',(SELECT count(*)FROM pg_seclabel),
 'nondefaultTablespaces',(SELECT count(*)FROM pg_tablespace WHERE spcname NOT IN('pg_default','pg_global'))))
FROM payloads;
