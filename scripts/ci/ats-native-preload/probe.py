"""Public-image-only PG17.11 preload proof on an ephemeral ARM64 Actions VM.

No production input, role setting, key, data, mount, registry or transport is
accepted. SQL runs in a fresh, networkless, read-only-root container. This is a
dependency proof, not full-schema, application, restore or release acceptance.
"""
from pathlib import Path
import datetime,errno,hashlib,io,json,os,platform,re,secrets,shutil,socket,stat,subprocess,sys,tarfile,tempfile,time
from local_sql import local_sql_checks

def sha(raw):return hashlib.sha256(raw).hexdigest()

def docker_exec_args(cid,args,*,input_supplied=False,extra=()):
    assert re.fullmatch('[a-f0-9]{64}',cid)
    return ['exec',*(['-i']if input_supplied else[]),*extra,cid,*map(str,args)]

def diagnostic_summary(raw):
    lines=[s for s in raw.decode('utf-8','replace').splitlines()if re.search(r'\b(?:FATAL|ERROR|DETAIL|HINT):',s)][:4]
    def hide(m):return '[value-sha256:'+sha(m[0].encode())[:16]+']'
    text='\n'.join(lines)
    text=re.sub(r'"[^"\n]*"|\x27[^\x27\n]*\x27',hide,text)
    text=re.sub(r'/(?:[^\s:]+/)*[^\s:]*',hide,text)
    return text[:2048]

def public_preload(raw,expected,source_sha):
    assert sha(raw)==source_sha,'Pinned public migration changed'
    text=raw.decode('utf-8','strict')
    # The pinned vendor file uses an unquoted GUC list. Also accept ordinary
    # quoted SQL strings for the isolated parser tests. We never execute this
    # migration: file + exact value hashes bind data for our own fixed statement.
    pattern=r'\bALTER\s+ROLE\s+(?:authenticator|"authenticator")\s+SET\s+(?:session_preload_libraries|"session_preload_libraries")\s*(?:=|TO)\s*([^;]+);'
    matches=re.findall(pattern,text,re.I);assert len(matches)==1,'Expected one fixed public authenticator setting'
    value=matches[0].strip()
    if value.startswith("'"):
        assert value.endswith("'");value=value[1:-1].replace("''", "'")
    assert sha(value.encode())==expected and len(value.encode())<=1024,'Exact reviewed public value required'
    return value

def main():
    assert sys.platform=='linux'and platform.machine()in ['aarch64','arm64']and os.getuid()==0
    assert os.environ.get('GITHUB_ACTIONS')=='true'
    base=Path(os.environ['RUNNER_TEMP']).resolve();assert str(base).startswith('/home/runner/work/')
    os.umask(0o077);root=Path(tempfile.mkdtemp(prefix='ats-public-pg17-',dir=base));home=root/'home';home.mkdir(mode=0o700);dc=root/'docker';dc.mkdir(mode=0o700)
    config=json.loads(Path(__file__).with_name('public-input.json').read_bytes());assert config['kind']=='public-postgres-preload-probe-v1'
    image=config['image'];assert re.fullmatch(r'public\.ecr\.aws/supabase/postgres@sha256:[a-f0-9]{64}',image)
    env={'HOME':str(home),'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','DOCKER_CONFIG':str(dc),'LANG':'C','LC_ALL':'C'}
    docker=['/usr/bin/docker','--host','unix:///var/run/docker.sock'];nonce=secrets.token_hex(8);cid=None;phase='public-image';serial=0;auth=None;started=False
    result={'kind':'ats-public-image-native-preload-proof-v1','startedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':sha(Path(__file__).read_bytes()),'publicInputSha256':sha(Path(__file__).with_name('public-input.json').read_bytes()),'tests':[],'productionInputsReceived':False,'productionSqlOrRegistryCalls':0,'productionCredentialsReceived':False,'fullBootstrapAccepted':False,'applicationOrRestoreAccepted':False,'productionReleaseCleared':False}
    deadline=time.monotonic()+420
    def run(args,data=None,timeout=15,allow=False):
        nonlocal serial
        serial+=1;remaining=deadline-time.monotonic();assert remaining>0
        p=subprocess.run(args,input=data,capture_output=True,timeout=min(timeout,remaining),env=env)
        for suffix,raw in [('stdout',p.stdout),('stderr',p.stderr)]:
            assert len(raw)<=4*1024**2
            (root/('step-%03d.%s.private'%(serial,suffix))).write_bytes(raw)
        if not allow and p.returncode:
            result['failedCommand']={'step':serial,'exitCode':p.returncode,'stdoutBytes':len(p.stdout),'stderrBytes':len(p.stderr),'stderrSha256':sha(p.stderr),'diagnostic':diagnostic_summary(p.stderr)}
            raise AssertionError('Fixture command failed at recorded step '+str(serial))
        return p
    def d(args,**kw):return run(docker+list(map(str,args)),**kw)
    def inside(args,data=None,timeout=15,allow=False,extra=()):return d(docker_exec_args(cid,args,input_supplied=data is not None,extra=extra),data=data,timeout=timeout,allow=allow)
    def shell(code):return inside(['/bin/sh','-c',code]).stdout.decode().strip()
    def sql(q,role='fixture_admin'):
        p=inside(['psql','-X','-Atq','-h','/fixture/socket','-p','55433','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1'],data=("SET statement_timeout='3s';SET lock_timeout='1s';"+q).encode())
        return p.stdout.decode().strip()
    def file_in_container(path):
        p=d(['cp',cid+':'+path,'-'])
        with tarfile.open(fileobj=io.BytesIO(p.stdout),mode='r:*')as z:
            ms=z.getmembers();assert len(ms)==1 and ms[0].isfile()and ms[0].size<=65536
            return z.extractfile(ms[0]).read()
    def note(s):result['tests'].append(s)
    try:
        d(['pull','--platform','linux/arm64',image],timeout=240)
        info=json.loads(d(['image','inspect',image]).stdout)[0];assert info['Architecture']=='arm64'and info['Os']=='linux'
        raw=d(['manifest','inspect','public.ecr.aws/supabase/postgres@'+config['arm64ManifestDigest']],timeout=30).stdout;manifest=json.loads(raw);assert manifest['config']['digest']=='sha256:65a95a9ed7eb5022f5093e525693d7e0bb4fef3bc017889a6c1b2e13849ef015'
        note('Pinned public ARM64 manifest and configuration')
        who=d(['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','/bin/sh',image,'-c','id -u postgres; id -g postgres']).stdout.decode().splitlines();assert len(who)==2 and all(s.isdigit()for s in who);uid,gid=map(int,who);assert uid>0 and gid>0
        cid=d(['create','--label','ats-public-native-fixture='+nonce,'--name','ats-public-pg17-'+nonce,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user',str(uid)+':'+str(gid),'--memory','512m','--memory-swap','512m','--cpus','1','--pids-limit','64','--tmpfs','/fixture:rw,nodev,nosuid,noexec,size=256m,mode=0700,uid='+str(uid)+',gid='+str(gid),'--tmpfs','/tmp:rw,nodev,nosuid,noexec,size=32m,mode=1777','--entrypoint','/bin/sh',image,'-c','exec sleep 480']).stdout.decode().strip();assert re.fullmatch('[a-f0-9]{64}',cid);d(['start',cid])
        state=json.loads(d(['inspect',cid]).stdout)[0];hc=state['HostConfig'];assert hc['NetworkMode']=='none'and hc['ReadonlyRootfs']and hc['Memory']==hc['MemorySwap']==536870912 and hc['PidsLimit']==64 and hc['NanoCpus']==1000000000 and hc['CapDrop']==['ALL']and not hc.get('Binds')
        assert all(m['Type']=='tmpfs'and m['Destination']in ['/fixture','/tmp']for m in state['Mounts']),'Only separately checked tmpfs paths are expected'
        note('New fixture: read-only root, no bind mounts, no capabilities, 512MiB and one CPU')
        phase='outbound-denial';init_pid=state['State']['Pid'];assert init_pid>1
        check="import errno,socket; s=socket.socket(); s.settimeout(1); r=s.connect_ex(('1.1.1.1',443)); assert r==errno.ENETUNREACH,r; print('outbound-denied')"
        assert run(['/usr/bin/nsenter','--target',str(init_pid),'--net','/usr/bin/python3','-c',check]).stdout.strip()==b'outbound-denied'
        assert shell('ls /sys/class/net')=='lo';note('Actual outbound connection denied inside the fixture network namespace')
        phase='public-preload-source';migration=file_in_container(config['publicMigrationPath']);preload=public_preload(migration,config['preloadValueSha256'],config['publicMigrationSha256']);note('Only public migration bytes supply the exact preload list')
        phase='new-empty-postgres';shell('mkdir /fixture/socket');inside(['initdb','-D','/fixture/data','-U','fixture_admin','-A','trust','--no-locale','-E','UTF8'],timeout=30)
        postgres=shell('command -v postgres');assert postgres.startswith(('/nix/','/usr/'))and not any(c.isspace()for c in postgres)
        options="-c listen_addresses= -c unix_socket_directories=/fixture/socket -c unix_socket_permissions=0700 -p 55433 -c shared_buffers=16MB -c max_connections=8 -c work_mem=1MB -c maintenance_work_mem=16MB -c max_parallel_workers=0 -c dynamic_shared_memory_type=mmap -c huge_pages=off -c shared_preload_libraries= -c session_preload_libraries= -c log_statement=none -c log_min_error_statement=panic"
        inside(['pg_ctl','-D','/fixture/data','-p',postgres,'-l','/fixture/postgres.private.log','-w','-t','8','-o',options,'start'],timeout=15);started=True
        ident=json.loads(sql("SELECT jsonb_build_object('systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'versionNum',current_setting('server_version_num'),'listen',current_setting('listen_addresses'),'socket',current_setting('unix_socket_directories'));"));assert ident['versionNum']==config['serverVersionNum']and ident['listen']==''and ident['socket']=='/fixture/socket'
        assert re.fullmatch('[0-9]{16,20}',ident['systemIdentifier']);result['identity']=ident;note('Native PG17.11 initialized empty with private Unix socket and no TCP')
        phase='authenticator-session';hexvalue=preload.encode().hex();sql("CREATE ROLE authenticator LOGIN;BEGIN;SELECT set_config('session_preload_libraries',convert_from(decode('"+hexvalue+"','hex'),'UTF8'),true);ALTER ROLE authenticator SET session_preload_libraries FROM CURRENT;COMMIT;")
        # Reading this superuser-only GUC as authenticator is intentionally
        # denied. Verify persisted bytes as fixture_admin, keep authenticator
        # unprivileged, then prove actual module mappings in its new backend.
        got=sql("SELECT encode(sha256(convert_to(substr(setting,length('session_preload_libraries=')+1),'UTF8')),'hex') FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole CROSS JOIN LATERAL unnest(s.setconfig) setting WHERE r.rolname='authenticator' AND s.setdatabase=0 AND setting LIKE 'session_preload_libraries=%';")
        assert got==config['preloadValueSha256']
        assert sql("SELECT session_user||':'||current_user;",'authenticator')=='authenticator:authenticator'
        assert sql("SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR pg_has_role(oid,'pg_read_all_settings','USAGE') FROM pg_roles WHERE rolname='authenticator';")=='f'
        note('Exact public role default persisted; new authenticator session connects without elevated privileges')
        phase='actual-native-module-mappings';app='ats-preload-'+nonce
        auth=subprocess.Popen(docker+['exec','-i','--env','PGAPPNAME='+app,cid,'psql','-X','-Atq','-h','/fixture/socket','-p','55433','-U','authenticator','-d','postgres','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
        auth.stdin.write(b'SELECT pg_sleep(10);\n');auth.stdin.close();backend=None
        for _ in range(15):
            value=sql("SELECT pid FROM pg_stat_activity WHERE usename='authenticator'AND application_name='"+app+"'AND state='active';")
            if value:backend=int(value);break
            time.sleep(.1)
        assert backend is not None
        top=d(['top',cid,'-eo','pid']).stdout.decode().splitlines()[1:];candidates=[int(s.strip())for s in top if s.strip().isdigit()];host_backend=None
        expected_ns=os.stat('/proc/'+str(init_pid)+'/ns/pid').st_ino
        for pid in candidates:
            status=Path('/proc',str(pid),'status').read_text();m=re.search(r'^NSpid:\s+(.+)$',status,re.M)
            if m and int(m[1].split()[-1])==backend and os.stat('/proc/'+str(pid)+'/ns/pid').st_ino==expected_ns:host_backend=pid;break
        assert host_backend is not None;maps=Path('/proc',str(host_backend),'maps').read_text();mapped=[]
        for wanted in config['mappedArtifacts']:
            matches=[]
            for line in maps.splitlines():
                f=line.split(maxsplit=5)
                if len(f)!=6 or not f[5].startswith('/nix/store/')or sha(f[5].encode())!=wanted['pathSha256']:continue
                p=Path('/proc',str(host_backend),'root')/f[5].lstrip('/');s=p.stat();dev=f[3].split(':')
                assert stat.S_ISREG(s.st_mode)and s.st_size==wanted['bytes']and s.st_ino==int(f[4])and os.major(s.st_dev)==int(dev[0],16)and os.minor(s.st_dev)==int(dev[1],16)
                assert sha(p.read_bytes())==wanted['sha256'];matches.append(True)
            assert matches,'Expected exact module not mapped in owned backend';mapped.append({'pathSha256':wanted['pathSha256'],'sha256':wanted['sha256'],'deviceAndInodeMatched':True,'bytes':wanted['bytes']})
        result['mappedArtifacts']=mapped;note('Both exact ARM64 ELF module hashes/device/inodes mapped in the real owned backend')
        auth.wait(timeout=15);assert auth.returncode==0
        phase='local-primary-native-sql'
        def execute(q,role):
            return inside(['psql','-X','-Atq','-h','/fixture/socket','-p','55433','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],data=("SET statement_timeout='3s';SET lock_timeout='1s';"+q).encode(),allow=True)
        def restart():
            inside(['pg_ctl','-D','/fixture/data','-w','-t','6','-m','fast','stop'],timeout=10)
            inside(['pg_ctl','-D','/fixture/data','-p',postgres,'-l','/fixture/postgres.private.log','-w','-t','8','-o',options,'start'],timeout=15)
        node=shutil.which('node',path=env['PATH']);assert node
        version=run([node,'--version']).stdout.decode().strip();assert re.fullmatch(r'v(?:22|24)\.[0-9]+\.[0-9]+',version)
        result['nodeVersion']=version
        def publication(action,query):
            if action=='concurrent-hold':
                writer=subprocess.Popen(docker+['exec','-i',cid,'psql','-X','-Atq','-h','/fixture/socket','-p','55433','-U','qa_api','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env)
                try:
                    writer.stdin.write(b"SET application_name='ats-owned-commit-race';SET statement_timeout='4s';BEGIN;INSERT INTO public.qa_records VALUES(9,session_user,'race');SELECT pg_sleep(1);COMMIT;\n");writer.stdin.close()
                    for _ in range(40):
                        if query("SELECT count(*) FROM pg_stat_activity WHERE application_name='ats-owned-commit-race' AND wait_event='PgSleep';")=='1':break
                        time.sleep(.025)
                    else:raise AssertionError('Owned writer did not reach controlled commit wait')
                    query('UPDATE hosting_guard.state SET capture_in_progress=true;')
                    writer.wait(timeout=6);assert writer.returncode!=0 and b'PT503'in writer.stderr.read()
                finally:
                    if writer.poll()is None:writer.terminate();writer.wait(timeout=3)
                return
            assert action=='committed-operation'
            def clocks():return {'wallMs':time.time_ns()//1000000,'bootMs':time.clock_gettime(time.CLOCK_BOOTTIME)*1000,'bootId':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}
            before=clocks()
            row=json.loads(query("BEGIN;SELECT hosting_guard.renew_local_primary_operation(20,'ats-home-primary',pg_postmaster_start_time(),hosting_guard.catalog_fingerprint());SELECT jsonb_build_object('admissionProtocol',availability_policy,'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'databaseBoot',database_started_at::text,'leaseEpoch',epoch::text,'nodeIdentity',holder,'topologyFingerprint',topology_fingerprint,'operationObservedAtMs',floor(extract(epoch FROM local_operation_observed_at)*1000)::bigint,'leaseIssuedAtMs',floor(extract(epoch FROM issued_at)*1000)::bigint,'expiresAtMs',floor(extract(epoch FROM expires_at)*1000)::bigint) FROM hosting_guard.state WHERE singleton;COMMIT;"))
            after=clocks()
            binding={'version':2,'admissionProtocol':'local-primary-operation-v1','namespace':'ats-home-primary-112233445566','generation':20,'systemIdentifier':row['systemIdentifier'],'topology':row['topologyFingerprint'],'primaryInstallationId':'b'*32}
            payload={'binding':binding,'primaryInstallationId':binding['primaryInstallationId'],'operationSequence':1,'sql':row,'before':before,'after':after}
            active=json.loads(run([node,str(Path(__file__).with_name('publication-check.mjs').resolve())],data=json.dumps(payload).encode()).stdout)
            assert active['observedAtMs']==row['operationObservedAtMs']and active['observedMonotonicMs']==before['bootMs']
            assert active['expiresAtBootMs']<=before['bootMs']+14000
            result['operationPublication']={'exactCommittedSqlTimestampMatched':True,'conservativeBootDeadline':True,'renewalElapsedMs':after['bootMs']-before['bootMs'],'guardianCustodyAccepted':False}
        result['localSqlNative']=local_sql_checks(execute,restart,publication,note)
        result.update(passed=True,testsPassed=len(result['tests']),rawRoleSettingsPublished=False,rawModuleNamesPublished=False)
    except BaseException as e:
        result.update(passed=False,failedPhase=phase,errorType=type(e).__name__,safeError=str(e)if isinstance(e,AssertionError)else'Bounded command failed')
    finally:
        if auth is not None and auth.poll()is None:
            auth.terminate()
            try:auth.wait(timeout=3)
            except subprocess.TimeoutExpired:auth.kill();auth.wait(timeout=3)
        if cid:
            try:
                current=json.loads(d(['inspect',cid]).stdout)[0];assert current['Config']['Labels']['ats-public-native-fixture']==nonce
                if started:
                    p=inside(['pg_ctl','-D','/fixture/data','-w','-t','6','-m','fast','stop'],timeout=10,allow=True);result['ownedPostgresStopped']=p.returncode==0
                d(['rm','--force',cid],timeout=12);result['ownedContainerRemoved']=True
            except BaseException:result['ownedCleanupUncertain']=True;result['passed']=False
        result['finishedAtUTC']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        out=Path.cwd()/'ci-results';out.mkdir(exist_ok=True);assert out.resolve()==out
        target=out/'ats-native-preload.json';target.write_text(json.dumps(result,indent=2)+'\n');target.chmod(0o644);out.chmod(0o755)
        print(json.dumps(result),flush=True)
    if not result.get('passed'):raise SystemExit(1)

if __name__=='__main__':main()
