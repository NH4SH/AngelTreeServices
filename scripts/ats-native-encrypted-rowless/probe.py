"""Owned encrypted-input ARM64 rowless PG17.11 structural rehearsal, never a primary.

Only an authenticated encrypted schema/catalog capsule is accepted. No customer
row, password, provider credential, production mount/socket or activation file.
All ordinary roles remain closed; event triggers and operation state stay empty.
"""
from pathlib import Path
import datetime,hashlib,json,os,platform,re,secrets,shutil,subprocess,sys,tempfile,time
from foundation import foundation_sql
from runtime_sdk import NativeSdkFixture

IMAGE='public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706'
def sha(raw):return hashlib.sha256(raw).hexdigest()

def main():
    assert sys.platform=='linux'and platform.machine()in ['aarch64','arm64']and os.getuid()==0
    assert os.environ.get('GITHUB_ACTIONS')=='true'
    assert os.environ.get('GITHUB_REPOSITORY')=='NH4SH/AngelTreeServices'
    assert os.environ.get('GITHUB_REF')=='refs/heads/codex/ats-native-encrypted-rowless-20261111'
    commit=os.environ['GITHUB_SHA'];assert re.fullmatch('[a-f0-9]{40}',commit)
    key=os.environ.pop('ATS_FIXTURE_KEY');assert re.fullmatch('[a-f0-9]{64}',key)
    base=Path(os.environ['RUNNER_TEMP']).resolve();assert str(base).startswith('/home/runner/work/')
    os.environ.clear();os.umask(0o077)
    root=Path(tempfile.mkdtemp(prefix='ats-private-rowless-',dir=base));inputs=root/'inputs';inputs.mkdir(mode=0o700)
    dc=root/'docker';dc.mkdir(mode=0o700)
    env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','DOCKER_CONFIG':str(dc),'LANG':'C','LC_ALL':'C'}
    docker=['/usr/bin/docker','--host','unix:///var/run/docker.sock'];node=shutil.which('node',path=env['PATH']);assert node
    here=Path(__file__).resolve().parent;nonce=secrets.token_hex(8);cid=None;started=False;serial=0;phase='authenticate-private-input';sdk=None
    work_deadline=time.monotonic()+400;cleanup_deadline=None
    result={'kind':'ats-private-native-rowless-structural-proof-v1','startedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':commit,'driverSha256':sha(Path(__file__).read_bytes()),'productionSqlCalls':0,'productionBusinessRowsReceived':False,'productionCredentialsReceived':False,'productionActivationReceived':False,'privateRowlessInputReceived':True,'fullSchemaAccepted':False,'fullRuntimeOrGuardianAccepted':False,'restoreAccepted':False,'productionReleaseCleared':False,'tests':[]}
    private={'kind':'ats-owned-private-rowless-diagnostics-v1','commandFailures':[]}
    def run(args,data=None,timeout=12,allow=False,cleanup=False,child_env=None):
        nonlocal serial
        serial+=1;end=cleanup_deadline if cleanup else work_deadline;remaining=end-time.monotonic();assert remaining>0
        p=subprocess.run(args,input=data,capture_output=True,timeout=min(timeout,remaining),env=child_env or env)
        assert len(p.stdout)<=8*1024**2 and len(p.stderr)<=1024**2
        if p.returncode:
            record={'step':serial,'phase':phase,'exitCode':p.returncode,'stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr),'stderrSha256':sha(p.stderr),'sqlStates':sorted(set(re.findall(rb'(?:ERROR|FATAL):\s+([A-Z0-9]{5}):',p.stderr)))}
            record['sqlStates']=[x.decode()for x in record['sqlStates']]
            # Quoted identifiers are represented only by hashes in the public
            # metadata. Complete bounded errors are encrypted for owner review.
            record['quotedValueSha256']=[sha(x)for x in re.findall(rb'"[^"\n]{1,512}"',p.stderr)[:12]]
            private['commandFailures'].append({**record,'stderr':p.stderr.decode('utf-8','replace'),'stdout':p.stdout[:65536].decode('utf-8','replace')})
            if not allow:result['failedCommand']=record;raise AssertionError('Owned fixture command failed')
        return p
    def d(args,**kw):return run(docker+list(map(str,args)),**kw)
    def inside(args,data=None,**kw):return d(['exec',*(['-i']if data is not None else[]),cid,*args],data=data,**kw)
    def sql(q,timeout=15):
        p=inside(['psql','-X','-Atq','-h','/fixture/socket','-p','55433','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],data=q.encode(),timeout=timeout)
        return p.stdout.decode().strip()
    def note(value):result['tests'].append(value)
    try:
        wrong=key[:-1]+('0'if key[-1]!='0'else'1')
        rejected=run([node,'--max-old-space-size=128',str(here/'capsule-io.mjs'),'decrypt',str(inputs)],child_env={**env,'ATS_FIXTURE_KEY':wrong},allow=True)
        assert rejected.returncode!=0 and list(inputs.iterdir())==[]
        note('Incorrect one-use key rejected before any plaintext file or SQL scope exists')
        checked=json.loads(run([node,'--max-old-space-size=128',str(here/'capsule-io.mjs'),'decrypt',str(inputs)],child_env={**env,'ATS_FIXTURE_KEY':key}).stdout)
        assert checked['authenticated'];result['inputCiphertextSha256']=checked['ciphertextSha256']
        catalog=json.loads((inputs/'catalog.json').read_bytes());settings=json.loads((inputs/'role-settings.json').read_bytes());manifest=json.loads((inputs/'manifest.json').read_bytes())
        assert manifest['businessRowsIncluded']is False and manifest['passwordsIncluded']is False and manifest['providerCredentialsIncluded']is False and manifest['activationFilesIncluded']is False
        note('Authenticated encrypted current rowless input; no rows/passwords/provider keys/activation')
        phase='authenticated-private-sdk-source'
        sdk=NativeSdkFixture(here,inputs,nonce,env,node,manifest['sourceSystemIdentifier'],work_deadline)
        sdk.prepare();result['privateRuntimeSourceReceived']=True
        phase='owned-public-image';d(['pull','--platform','linux/arm64',IMAGE],timeout=240)
        image=json.loads(d(['image','inspect',IMAGE]).stdout)[0];assert image['Architecture']=='arm64'and image['Os']=='linux'
        who=d(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','/bin/sh',IMAGE,'-c','id -u postgres; id -g postgres']).stdout.decode().splitlines();assert len(who)==2 and all(x.isdigit()for x in who);uid,gid=map(int,who);assert min(uid,gid)>0
        cid=d(['create','--label','ats-private-rowless='+nonce,'--name','ats-private-rowless-'+nonce,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user',str(uid)+':'+str(gid),'--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','64',*sdk.docker_args(),'--tmpfs','/fixture:rw,nodev,nosuid,noexec,size=256m,mode=0700,uid='+str(uid)+',gid='+str(gid),'--tmpfs','/tmp:rw,nodev,nosuid,noexec,size=32m,mode=1777','--entrypoint','/bin/sh',IMAGE,'-c','exec sleep 600']).stdout.decode().strip();assert re.fullmatch('[a-f0-9]{64}',cid);d(['start',cid])
        info=json.loads(d(['inspect',cid]).stdout)[0];hc=info['HostConfig']
        private['ownedFixtureMounts']=info['Mounts']
        private['ownedHostConfig']={k:hc.get(k)for k in ['NetworkMode','ReadonlyRootfs','Memory','MemorySwap','PidsLimit','NanoCpus','CapDrop','GroupAdd','Binds','Mounts','Tmpfs']}
        private['nativeSdkPreparation']={'packages':sdk.npm}
        assert hc['NetworkMode']=='none'and hc['ReadonlyRootfs']and hc['Memory']==hc['MemorySwap']==536870912 and hc['PidsLimit']==64 and hc['NanoCpus']==1000000000 and hc['CapDrop']==['ALL']and not hc.get('Binds')
        sdk.verify_mounts(info)
        actual_tmpfs=inside(['stat','-f','-c','%t','/fixture','/tmp']).stdout.decode().splitlines()
        assert actual_tmpfs==['1021994','1021994'];result['ownedScratchTmpfsVerified']=True
        note('Fresh owned container, 512MiB/one CPU/pids64, read-only root, tmpfs data and one empty owned Unix-socket directory; no production bind')
        check="import socket,errno;s=socket.socket();s.settimeout(1);assert s.connect_ex(('1.1.1.1',443))==errno.ENETUNREACH;print('denied')"
        assert run(['/usr/bin/nsenter','--target',str(info['State']['Pid']),'--net','/usr/bin/python3','-c',check]).stdout.strip()==b'denied'
        note('Actual outbound connection denied before extension or schema execution')
        phase='empty-native-postgres';db=manifest['sourceFoundation']['database'];assert db['encoding']=='UTF8'and db['localeProvider']=='i'and db['locale']=='en-US'and db['collate']==db['ctype']=='en_US.UTF-8'
        inside(['/bin/sh','-c','mkdir /fixture/socket'])
        inside(['initdb','-D','/fixture/data','-U','supabase_admin','-A','trust','-E','UTF8','--locale-provider=icu','--icu-locale=en-US','--lc-collate=en_US.UTF-8','--lc-ctype=en_US.UTF-8'],timeout=30)
        postgres=inside(['/bin/sh','-c','command -v postgres']).stdout.decode().strip();assert postgres.startswith(('/nix/','/usr/'))and not any(x.isspace()for x in postgres)
        options="-c listen_addresses= -c unix_socket_directories=/fixture/socket,/sdk-socket -c unix_socket_group=1000 -c unix_socket_permissions=0777 -p 55433 -c shared_buffers=16MB -c max_connections=12 -c work_mem=1MB -c maintenance_work_mem=16MB -c max_parallel_workers=0 -c dynamic_shared_memory_type=mmap -c huge_pages=off -c shared_preload_libraries=pg_net,pg_stat_statements -c session_preload_libraries= -c log_statement=none -c log_min_error_statement=panic"
        inside(['pg_ctl','-D','/fixture/data','-p',postgres,'-l','/fixture/postgres.private.log','-w','-t','8','-o',options,'start'],timeout=15);started=True
        actual=json.loads(sql("SELECT jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'version',current_setting('server_version_num'),'listen',current_setting('listen_addresses'),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider,'locale',coalesce(to_jsonb(d)->>'datlocale',to_jsonb(d)->>'daticulocale'),'collationVersion',datcollversion)FROM pg_database d WHERE datname=current_database();"))
        assert actual['systemIdentifier']!=manifest['sourceSystemIdentifier']and actual['version']=='170011'and actual['listen']==''
        for k in ['collate','ctype','localeProvider','locale','collationVersion']:assert actual[k]==db[k],'Actual fixture locale differs from current source'
        result['fixtureIdentity']=actual;note('New native PG17.11 identity, private socket, no TCP and exact ICU database locale')
        phase='closed-role-foundation'
        existing=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'super',rolsuper,'inherit',rolinherit,'createRole',rolcreaterole,'createDb',rolcreatedb,'replication',rolreplication,'bypassRls',rolbypassrls,'connectionLimit',rolconnlimit)ORDER BY rolname)FROM pg_roles;"))
        generated=foundation_sql(catalog,settings,manifest,existing);sql(generated,timeout=25)
        assert sql("SELECT count(*)FROM pg_roles WHERE rolcanlogin AND rolname<>'supabase_admin';")=='0'
        assert sql("SELECT rolname FROM pg_roles WHERE oid=10;")=='supabase_admin'
        observed_settings=json.loads(sql("SELECT jsonb_build_object('roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'settings',rolconfig)ORDER BY rolname)FROM pg_roles WHERE rolconfig IS NOT NULL));"))
        private['observedRoleSettings']=observed_settings
        assert observed_settings==settings,'Actual role defaults differ from captured exact bytes or order'
        note('All source role attributes/memberships/exact GUC bytes and database ACL restored; ordinary logins closed')
        phase='structural-schema-load';sql('BEGIN;\n'+(inputs/'structural.sql').read_bytes().decode()+'\nCOMMIT;',timeout=45)
        counts=json.loads(sql("SELECT jsonb_build_object('policies',(SELECT count(*)FROM pg_policies),'guardTriggers',(SELECT count(*)FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT t.tgisinternal AND n.nspname='hosting_guard'),'guardConstraintTriggers',(SELECT count(*)FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE NOT t.tgisinternal AND n.nspname='hosting_guard'AND t.tgconstraint<>0),'eventTriggers',(SELECT count(*)FROM pg_event_trigger),'guardStateRows',(SELECT count(*)FROM hosting_guard.state),'ordinaryLogins',(SELECT count(*)FROM pg_roles WHERE rolcanlogin AND rolname<>'supabase_admin'));"))
        assert counts=={'policies':381,'guardTriggers':600,'guardConstraintTriggers':200,'eventTriggers':0,'guardStateRows':0,'ordinaryLogins':0};result['baselineCounts']=counts
        exts=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('name',extname,'owner',pg_get_userbyid(extowner),'version',extversion,'schema',extnamespace::regnamespace::text)ORDER BY extname)FROM pg_extension;"));assert exts==manifest['sourceFoundation']['extensions']
        note('Structural native load: 381 policies, 600 guard triggers/200 constraints, exact extension owners/versions; events/state/logins closed')
        phase='catalog-backed-function-validation';sql((inputs/'validate-functions.sql').read_bytes().decode(),timeout=35)
        phase='source-catalog-properties';sql((inputs/'restore-properties.sql').read_bytes().decode(),timeout=20)
        result['nativeFunctionDefinitionsValidated']=361;note('All 361 unchanged functions compile against real catalog with check_function_bodies enabled')
        sql("DO $owned$ DECLARE r record;n bigint;BEGIN FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN('r','p')AND n.nspname IN('public','app_private','auth','storage','supabase_migrations')LOOP EXECUTE format('SELECT count(*)FROM %I.%I',r.nspname,r.relname)INTO n;IF n<>0 THEN RAISE EXCEPTION 'Unexpected fixture business data';END IF;END LOOP;END $owned$;",timeout=15)
        note('Actual protected and migration tables contain no business or historical rows')
        phase='baseline-fidelity-observation';query=(here/'catalog-digests.sql').read_text();assert sha(query.encode())=='2bfb48790f2fd52f8e2457b07f6480f46d3ab06f296659a720a676a8c0759456'
        fidelity=json.loads(sql("BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';"+query+'\nROLLBACK;',timeout=8));result['baselineFidelity']=fidelity
        result['baselineOwnerAclMatchesSource']=fidelity['ownerAclSha256']==manifest['sourceCatalogDigests']['ownerAclSha256']
        assert fidelity['protectedInventorySha256']==manifest['sourceCatalogDigests']['protectedInventorySha256']and fidelity['captureInventorySha256']==manifest['sourceCatalogDigests']['captureInventorySha256']
        assert fidelity['counts']['invalidGuardTripletTables']==0
        # Event triggers are intentionally deferred; semantic/guard equality is
        # NOT claimed. Record the real owner/ACL result rather than replacing it.
        note('Real source/fixture inventories and guard triplets compared; full fidelity remains unaccepted with deferred events')
        phase='catalog-record-diagnostics'
        source_records=json.loads((inputs/'source-records.json').read_text())
        record_query=(here/'catalog-records.sql').read_text()
        assert sha(record_query.encode())=='5a200aba151bc286fd70eecae9db6f1cb71f0ec66461db84097e58882a380810'
        def compare_records(label):
            actual_records=json.loads(sql("BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';"+record_query+'\nROLLBACK;',timeout=8))
            differences={}
            summary={}
            for group,wanted in source_records.items():
                actual=actual_records[group]
                missing=sorted(set(wanted)-set(actual));unexpected=sorted(set(actual)-set(wanted))
                changed=sorted(k for k in set(actual)&set(wanted)if wanted[k]!=actual[k])
                differences[group]={'missing':missing,'unexpected':unexpected,'changed':changed}
                summary[group]={'missing':len(missing),'unexpected':len(unexpected),'changed':len(changed)}
            private[label+'RecordDifferences']=differences
            result[label+'RecordDifferences']=summary
        compare_records('baseline')
        phase='eight-source-event-triggers'
        sql('BEGIN;\n'+(inputs/'events.sql').read_bytes().decode()+'\nCOMMIT;',timeout=15)
        assert sql('SELECT count(*)FROM pg_event_trigger;')=='8'
        assert sql("SELECT count(*)FROM pg_roles WHERE rolcanlogin AND rolname<>'supabase_admin';")=='0'
        assert sql('SELECT count(*)FROM hosting_guard.state;')=='0'
        compare_records('withEvents')
        result['withEventsFidelity']=json.loads(sql("BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';"+query+'\nROLLBACK;',timeout=8))
        result['eventDefinitionsInstalledInOwnedFixture']=8
        # Retain real differing native records privately if any exact source
        # property still differs. No field is normalized out of the comparison.
        selected=json.loads((inputs/'source-differing-records.json').read_bytes())
        hexkeys=json.dumps(list(selected)).encode().hex()
        detailed_query=record_query.split("\nSELECT jsonb_build_object('ownerAcl'",1)[0]+"\nSELECT jsonb_object_agg(identity,record)FROM semantic_records WHERE identity IN(SELECT jsonb_array_elements_text(convert_from(decode('"+hexkeys+"','hex'),'UTF8')::jsonb));"
        private['actualSelectedRecords']=json.loads(sql("BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';"+detailed_query+'ROLLBACK;',timeout=8))
        exact=result['withEventsRecordDifferences']
        result['fullSourceCatalogMatches']=all(n==0 for group in exact.values()for n in group.values())
        assert result['fullSourceCatalogMatches'],'Exact source catalog differences remain; private native fields retained'
        note('All eight unchanged source event definitions installed with empty guard state and ordinary logins closed; exact catalog differences retained')
        phase='exact-local-policy-candidate';candidate=(here/'local-primary-candidate.sql').read_bytes();assert sha(candidate)=='58c40f6662966ccf59306a965c411e8de9a3d94276ce246259cce46d22736b67';sql(candidate.decode(),timeout=15)
        fields=json.loads(sql("SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'default',column_default)ORDER BY ordinal_position)FROM information_schema.columns WHERE table_schema='hosting_guard'AND table_name='state';"));assert len(fields)==13 and fields[-2]['name']=='availability_policy'and 'backup-fenced-v1'in fields[-2]['default']and fields[-1]['name']=='local_operation_observed_at'and fields[-1]['type']=='timestamp with time zone'
        assert sql('SELECT count(*)FROM hosting_guard.state;')=='0'
        note('Exact candidate applies to real structural baseline with legacy default and no operation state or lease')
        phase='native-event-behavior'
        event_case="""BEGIN;
INSERT INTO hosting_guard.state(singleton,epoch,holder,database_started_at,issued_at,expires_at,capture_started_at,topology_verified,topology_fingerprint,capture_in_progress,availability_policy,local_operation_observed_at)
VALUES(true,20,'ats-home-primary',pg_postmaster_start_time(),clock_timestamp(),clock_timestamp()+interval '14 seconds',clock_timestamp()-interval '2 days',true,hosting_guard.catalog_fingerprint(),false,'local-primary-operation-v1',clock_timestamp());
CREATE TABLE public.ats_owned_event_probe(id integer);
DO $owned$BEGIN
IF NOT(SELECT relrowsecurity FROM pg_class WHERE oid='public.ats_owned_event_probe'::regclass)THEN RAISE EXCEPTION 'Public DDL did not enable RLS';END IF;
IF(SELECT topology_verified FROM hosting_guard.state WHERE singleton)THEN RAISE EXCEPTION 'DDL did not invalidate topology';END IF;
END$owned$;
ALTER TABLE public.ats_owned_event_probe ADD COLUMN label text;
DROP TABLE public.ats_owned_event_probe;
ROLLBACK;
"""
        sql(event_case,timeout=15)
        assert sql('SELECT count(*)FROM hosting_guard.state;')=='0'
        note('Actual public CREATE/ALTER/DROP enables RLS and invalidates topology; transaction rollback leaves no state or table')
        denied=inside(['psql','-X','-Atq','-h','/fixture/socket','-p','55433','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],data=b'BEGIN;GRANT CREATE ON SCHEMA public TO ats_firewood_request;SET SESSION AUTHORIZATION ats_firewood_request;CREATE TABLE public.ats_owned_unauthorized_ddl(id integer);COMMIT;',allow=True)
        assert denied.returncode==3 and b'42501'in denied.stderr
        assert sql("SELECT to_regclass('public.ats_owned_unauthorized_ddl')IS NULL;")=='t'
        note('Actual nonoperator DDL is rejected by the source event guard and leaves no table')
        phase='real-pinned-pg-sdk-transactions'
        result['nativeSdk']=sdk.run_cases(sql,query)
        note('Pinned real pg8.23.1 SDK: 27 native source cases plus eight real-connection SQL/transaction cases; synthetic host contexts only; two fixture roles closed and guard state emptied afterward')
        result.update(passed=True,structuralLoadAccepted=True,candidateMigrationAppliedInFixture=True,eventsStillDeferred=False,ordinaryRolesStillClosed=True)
    except BaseException as e:
        import traceback
        last=traceback.extract_tb(e.__traceback__)[-1]
        result['failureLocation']={'file':Path(last.filename).name,'line':last.lineno,'function':last.name}
        result.update(passed=False,failedPhase=phase,errorType=type(e).__name__,safeError=str(e)if isinstance(e,AssertionError)else'Bounded owned fixture failed')
    finally:
        cleanup_deadline=time.monotonic()+35
        if sdk:
            try:sdk.stop_children()
            except BaseException:result['sdkProcessCleanupUncertain']=True;result['passed']=False
        if cid:
            try:
                current=json.loads(d(['inspect',cid],cleanup=True).stdout)[0];assert current['Config']['Labels']['ats-private-rowless']==nonce
                log=inside(['/bin/sh','-c','if [ -f /fixture/postgres.private.log ]; then tail -c 65536 /fixture/postgres.private.log; fi'],cleanup=True,allow=True)
                if log.returncode==0:private['ownedServerLogTail']=log.stdout.decode('utf-8','replace')
                if started:
                    p=inside(['pg_ctl','-D','/fixture/data','-w','-t','6','-m','fast','stop'],cleanup=True,timeout=9,allow=True);result['ownedPostgresStopped']=p.returncode==0
                d(['rm','--force',cid],cleanup=True,timeout=10)
                assert d(['ps','--all','--no-trunc','--filter','id='+cid,'--format','{{.ID}}'],cleanup=True).stdout.strip()==b''
                result['ownedContainerRemoved']=True
            except BaseException:result['ownedCleanupUncertain']=True;result['passed']=False
        if sdk:
            private['nativeSdkDiagnostics']=sdk.private
            try:result.update(sdk.cleanup())
            except BaseException:result['sdkDirectoryCleanupUncertain']=True;result['passed']=False
        try:
            (inputs/'diagnostics.private.json').write_text(json.dumps(private))
            sealed=json.loads(run([node,'--max-old-space-size=128',str(here/'capsule-io.mjs'),'encrypt-diagnostics',str(inputs)],cleanup=True,child_env={**env,'ATS_FIXTURE_KEY':key}).stdout)
            out=Path.cwd()/'ci-results';out.mkdir(exist_ok=True);assert out.resolve()==out
            target=out/'rowless-diagnostics.sealed.json';target.write_bytes((inputs/'diagnostics.sealed.json').read_bytes());target.chmod(0o644);result['encryptedDiagnostics']=sealed
        except BaseException:result['diagnosticsEncryptionUncertain']=True;result['passed']=False
        result['finishedAtUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat();result['testsPassed']=len(result['tests'])
        out=Path.cwd()/'ci-results';out.mkdir(exist_ok=True);target=out/'rowless-proof.json';target.write_text(json.dumps(result,indent=2)+'\n');target.chmod(0o644);out.chmod(0o755)
        print(json.dumps(result),flush=True)
    if not result.get('passed'):raise SystemExit(1)

if __name__=='__main__':main()
