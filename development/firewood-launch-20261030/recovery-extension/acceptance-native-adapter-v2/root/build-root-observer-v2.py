"""Render version2 of the review-only supervisor unit, preserving frozen v1. No database/host/provider execution."""
from pathlib import Path
import hashlib,json,re
ROOT=Path(__file__).resolve().parent
catalog=(ROOT/'continuous-catalog.select.sql').read_bytes()
assert hashlib.sha256(catalog).hexdigest()=='2bfb48790f2fd52f8e2457b07f6480f46d3ab06f296659a720a676a8c0759456'
base=json.loads((ROOT.parent/'shared/baseline-named-inventory.json').read_text())
protocol=(ROOT.parent/'shared/protocol.mjs').read_text()
new=json.loads(re.search(r'const ACCEPTANCE_NEW_TABLES=Object.freeze\((\[.*?\])\);',protocol).group(1))
protected=sorted(base['protectedTableNames']+new);capture=sorted(protected+['supabase_migrations.schema_migrations'])
q=lambda x:"'"+x.replace("'","''")+"'"
array=lambda xs:'ARRAY['+','.join(map(q,xs))+']::text[]'
text=r'''-- REVIEW ONLY. New supervisor unit; never part of the original eleven units.
-- Root must include it in its guarded actual-target transaction and review the
-- resulting complete schema digest. No registration/control row is inserted.
DO $preflight$ BEGIN
 IF SESSION_USER <> 'supabase_admin' OR (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='supabase_admin') <> 10
 OR pg_catalog.current_database() <> 'ats_firewood_acceptance_c6f62a2c0f61'
 OR (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) <> '7702496746553905162'
 OR (SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) <> 23849
 OR (SELECT pg_catalog.shobj_description(oid,'pg_database')FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()) <> 'ats-firewood-acceptance-v1:5b7af2eb-9889-4663-8992-8560982248fb:synthetic-only'
 OR pg_catalog.pg_is_in_recovery() THEN
  RAISE EXCEPTION 'Exact synthetic supervisor operator required.' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.to_regclass('hosting_guard.acceptance_registration') IS NOT NULL
 OR pg_catalog.to_regprocedure('app_private.fwofficeacceptance_root_observation()') IS NOT NULL THEN
  RAISE EXCEPTION 'Supervisor unit already exists; preserve and review its preimage.';
 END IF;
END $preflight$;
CREATE TABLE hosting_guard.acceptance_registration(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 namespace text NOT NULL CHECK(namespace ~ '^ats-firewood-acceptance-c6f62a2c0f61-[a-f0-9]{12}$'),
 generation bigint NOT NULL CHECK(generation>3),
 admission_binding_id uuid NOT NULL,
 web_role name NOT NULL,worker_role name NOT NULL,health_role name NOT NULL,
 CHECK(web_role<>worker_role AND web_role<>health_role AND worker_role<>health_role),
 CHECK(web_role::text ~ '^[a-z][a-z0-9_]*_c6f62a2c0f61$'),
 CHECK(worker_role::text ~ '^[a-z][a-z0-9_]*_c6f62a2c0f61$'),
 CHECK(health_role::text ~ '^[a-z][a-z0-9_]*_c6f62a2c0f61$')
);
ALTER TABLE hosting_guard.acceptance_registration OWNER TO supabase_admin;
ALTER TABLE hosting_guard.acceptance_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosting_guard.acceptance_registration FORCE ROW LEVEL SECURITY;
CREATE POLICY acceptance_registration_operator_only ON hosting_guard.acceptance_registration FOR ALL TO supabase_admin USING(SESSION_USER='supabase_admin')WITH CHECK(SESSION_USER='supabase_admin');
REVOKE ALL ON TABLE hosting_guard.acceptance_registration FROM PUBLIC;
CREATE FUNCTION app_private.fwofficeacceptance_root_observation() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $root_observer$
DECLARE
 meta hosting_guard.acceptance_registration%ROWTYPE;
 state hosting_guard.state%ROWTYPE;
 catalog jsonb;protected_names text[];capture_names text[];
 item text;row_digest text;row_count bigint;data_records jsonb:='[]'::jsonb;
 db_oid oid;db_name text;db_comment text;marker_id text;
 root_definition text;native_definition text;roles jsonb;
 role_count bigint;bad_roles bigint;health_login boolean;
 metadata_digest text;held boolean;
BEGIN
 IF SESSION_USER <> 'supabase_admin' OR CURRENT_USER <> 'supabase_admin' THEN
  RAISE EXCEPTION 'Root supervisor SESSION_USER required.' USING ERRCODE='42501';
 END IF;
 IF pg_catalog.current_setting('transaction_read_only') <> 'on'
 OR pg_catalog.current_setting('transaction_isolation') <> 'repeatable read'
 OR pg_catalog.current_setting('search_path') <> 'pg_catalog' THEN
  RAISE EXCEPTION 'Bound read-only repeatable-read observation required.';
 END IF;
 SELECT oid,datname,pg_catalog.shobj_description(oid,'pg_database') INTO STRICT db_oid,db_name,db_comment
 FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database();
 IF db_name <> 'ats_firewood_acceptance_c6f62a2c0f61'
 OR db_comment !~ '^ats-firewood-acceptance-v1:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:synthetic-only$' THEN
  RAISE EXCEPTION 'Actual synthetic database marker required.';
 END IF;
 marker_id:=pg_catalog.split_part(db_comment,':',2);
 IF (SELECT count(*) FROM hosting_guard.acceptance_registration)<>1 THEN
  RAISE EXCEPTION 'Separate immutable supervisor registration missing.';
 END IF;
 SELECT * INTO STRICT meta FROM hosting_guard.acceptance_registration WHERE singleton;
 IF (SELECT count(*) FROM hosting_guard.state)<>1 THEN RAISE EXCEPTION 'Native guard state differs.';END IF;
 SELECT * INTO STRICT state FROM hosting_guard.state WHERE singleton;
 SELECT pg_catalog.array_agg(schemaname||'.'||tablename ORDER BY(schemaname||'.'||tablename)COLLATE "C")
 INTO protected_names FROM pg_catalog.pg_tables WHERE schemaname IN('public','app_private','auth','storage');
 SELECT pg_catalog.array_agg(schemaname||'.'||tablename ORDER BY(schemaname||'.'||tablename)COLLATE "C")
 INTO capture_names FROM pg_catalog.pg_tables WHERE schemaname IN('public','app_private','auth','storage','supabase_migrations');
 IF protected_names IS DISTINCT FROM __PROTECTED__ OR capture_names IS DISTINCT FROM __CAPTURE__ THEN
  RAISE EXCEPTION 'Exact original175/176 plus25 acceptance inventory differs.';
 END IF;
 -- The exact reviewed catalog algorithm runs inside PostgreSQL. Routine bodies,
 -- role settings and ACLs are hashed server-side; no raw metadata is returned.
 SELECT observed INTO STRICT catalog FROM (
__CATALOG__
 ) AS opaque_catalog(observed);
 IF catalog#>>'{counts,protectedTables}'<>'200' OR catalog#>>'{counts,capturedTables}'<>'201'
 OR catalog#>>'{counts,guardTriggers}'<>'600' OR catalog#>>'{counts,bootstrapRolesAtOid10}'<>'1'
 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(catalog->'counts')v
 WHERE v.key IN('duplicateAclIdentities','invalidGuardTripletTables','ledgerGuardTriggers','duplicateSemanticIdentities','unsupportedInventoryNames','unsupportedAggregates','foreignServers','userMappings','subscriptions','securityLabels','nondefaultTablespaces')AND v.value<>'0')
 OR catalog->>'semanticSchemaSha256' IS NULL OR catalog->>'ownerAclSha256' IS NULL
 OR catalog->>'guardEnrollmentSha256' IS NULL THEN RAISE EXCEPTION 'Actual catalog or exact guard triplets differ.';END IF;
 -- Only these exact catalog-derived qualified names are used as identifiers.
 -- Complete rows are hashed before aggregation; duplicate rows remain repeated.
 FOREACH item IN ARRAY capture_names LOOP
  EXECUTE pg_catalog.format('SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(row_hash,'''' ORDER BY row_hash COLLATE "C"),''''),''UTF8'')),''hex'') FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,''UTF8'')),''hex'') AS row_hash FROM %s AS t) AS hashed',item)
  INTO STRICT row_count,row_digest;
  data_records:=data_records||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('table',item,'rows',row_count,'sha256',row_digest));
 END LOOP;
 SELECT count(*),count(*)FILTER(WHERE rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid))
 INTO role_count,bad_roles FROM pg_catalog.pg_roles r WHERE rolname IN(meta.web_role,meta.worker_role,meta.health_role);
 IF role_count<>3 OR bad_roles<>0 THEN RAISE EXCEPTION 'Actual scoped native-role privileges differ.';END IF;
 SELECT rolcanlogin INTO STRICT health_login FROM pg_catalog.pg_roles WHERE rolname=meta.health_role;
 roles:=pg_catalog.jsonb_build_object('web',meta.web_role,'worker',meta.worker_role,'health',meta.health_role);
 SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef('app_private.fwofficeacceptance_native_context()'::regprocedure),'UTF8')),'hex') INTO STRICT native_definition;
 SELECT encode(sha256(convert_to(pg_catalog.pg_get_functiondef('app_private.fwofficeacceptance_root_observation()'::regprocedure),'UTF8')),'hex') INTO STRICT root_definition;
 SELECT encode(sha256(convert_to(pg_catalog.to_jsonb(m)::text,'UTF8')),'hex') INTO STRICT metadata_digest
 FROM hosting_guard.acceptance_registration m WHERE singleton;
 held:=(SELECT count(*)=1 AND bool_and(paused) FROM app_private.fwofficeacceptance_control)
 AND NOT EXISTS(SELECT 1 FROM app_private.firewood_live_handoff_sources WHERE enabled OR collector_enabled OR surcharge_reporting_enabled OR sender_enabled)
 AND (SELECT count(*)=1 AND bool_and(id AND lease IS NULL AND lease_until=0 AND started_at IS NULL AND finished_at IS NULL AND last_code IS NULL) FROM app_private.fwofficeacceptance_heartbeat);
 RETURN pg_catalog.jsonb_build_object(
 'scope','ats-firewood-acceptance-synthetic-only-v1',
 'physical',pg_catalog.jsonb_build_object('targetId',pg_catalog.substring(db_name,'([a-f0-9]{12})$'),'database',db_name,'databaseOid',db_oid::bigint,'systemIdentifier',(SELECT system_identifier::text FROM pg_catalog.pg_control_system()),'markerId',marker_id,'purpose','synthetic-only','comment',db_comment),
 'databaseBoot',pg_catalog.pg_postmaster_start_time()::text,
 'namespace',meta.namespace,'generation',meta.generation,'admissionBindingId',meta.admission_binding_id,
 'nativeNodeIdentity',state.local_node,'topology',hosting_guard.catalog_fingerprint(),
 'catalog',catalog,'protectedTableNames',pg_catalog.to_jsonb(protected_names),'captureTableNames',pg_catalog.to_jsonb(capture_names),
 'nativeHelperDefinitionSha256',native_definition,'rootObserverDefinitionSha256',root_definition,
 'supervisorMetadataSha256',metadata_digest,
 'dataSha256',encode(sha256(convert_to(data_records::text,'UTF8')),'hex'),
 'ledgerMd5',(SELECT md5(string_agg(to_jsonb(m)::text,'|'ORDER BY version)) FROM supabase_migrations.schema_migrations m),
 'healthLogin',health_login,
 'nonOperatorLoginCount',(SELECT count(*)FROM pg_catalog.pg_roles WHERE rolcanlogin AND rolname NOT IN('supabase_admin','postgres','ats_qa_restore_operator')),
 'nonOperatorSessions',(SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname=db_name AND usename NOT IN('supabase_admin','postgres','ats_qa_restore_operator')),
 'roles',roles,'captureHeld',state.capture_in_progress,'leaseExpired',state.expires_at<pg_catalog.clock_timestamp(),
 'modesHeld',held,'inRecovery',pg_catalog.pg_is_in_recovery(),
 'replayPaused',CASE WHEN pg_catalog.pg_is_in_recovery()THEN pg_catalog.pg_is_wal_replay_paused()ELSE false END,
 'readOnly',pg_catalog.current_setting('transaction_read_only')='on','replayLsn',pg_catalog.pg_last_wal_replay_lsn()::text);
END $root_observer$;
ALTER FUNCTION app_private.fwofficeacceptance_root_observation() OWNER TO supabase_admin;
REVOKE ALL ON FUNCTION app_private.fwofficeacceptance_root_observation() FROM PUBLIC;
DO $revoke_all$ DECLARE r record;BEGIN
 FOR r IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname<>'supabase_admin' LOOP
  EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION app_private.fwofficeacceptance_root_observation() FROM %I',r.rolname);
  EXECUTE pg_catalog.format('REVOKE ALL ON TABLE hosting_guard.acceptance_registration FROM %I',r.rolname);
 END LOOP;
END $revoke_all$;
-- No source, registration, mode, receipt, LOGIN, lease or activation row is seeded.
'''
text=text.replace('__PROTECTED__',array(protected)).replace('__CAPTURE__',array(capture)).replace('__CATALOG__',catalog.decode().strip().removesuffix(';'))
out=ROOT/'supervisor-root-observer.v2.sql.review-only.txt';out.write_text(text)
proof={'kind':'local-rendered-root-only-acceptance-observer-unit-v2','state':'UNBOUND-review-only-NOT-executed','recipeVersion':2,'predecessorSqlSha256':'9e9bd3dbba6ce6de12bceef6bc5740678b0d72291018b6a4efc5a1bb3be7a93e','correctedQualifiedSpecialFormSpans':1,'remainingQualifiedSubstringSpecialForms':0,'rootObservationStepCount':4,'rootObservationStepMeaning':'unchanged planned helper calls per Root issuance: preflight source, core initial source, cold restore, final source; not executed here','rootObserverStepFunctionCount':1,'rootObserverMetadataTableCount':1,'rootObserverMetadataPolicyCount':1,'observerSqlSha256':hashlib.sha256(catalog).hexdigest(),'renderedSqlSha256':hashlib.sha256(out.read_bytes()).hexdigest(),'protectedTables':200,'capturedTables':201,'expectedGuardTriggers':600,'addedFunctions':['app_private.fwofficeacceptance_root_observation()'],'addedTables':['hosting_guard.acceptance_registration'],'registrationRowsSeeded':0,'owner':'supabase_admin','security':'INVOKER','allowedSessionUser':'supabase_admin','businessExecuteGranted':False,'noOriginalElevenUnitModified':True,'productionAuthority':False}
(ROOT/'ROOT_OBSERVER_V2_RENDER_PROOF.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'renderedSqlSha256':proof['renderedSqlSha256'],'protected':200,'capture':201}))
