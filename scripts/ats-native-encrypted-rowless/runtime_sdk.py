"""Owned real-SDK fixture, with only its empty Unix-socket directory mounted.

The ordinary Node client has no outbound IP network, production credential,
GitHub token or decryption key. Host admission contexts remain synthetic; this
cannot establish original-host authority or full application acceptance.
"""
from pathlib import Path,PurePosixPath
import base64,ctypes,hashlib,json,os,re,resource,secrets,shutil,signal,subprocess,time
from npm_sdk import install_pg

class NativeSdkFixture:
    def __init__(self,here,inputs,nonce,env,node,source_sid,deadline):
        self.here=here;self.inputs=inputs;self.env=env;self.node=node;self.source_sid=source_sid;self.deadline=deadline
        self.root=Path('/run/ats-native-sdk-owned-'+nonce)
        self.socket=Path('/run/ats-native-sdk-socket-'+nonce)
        self.identities=[];self.children=[];self.private={}
    def prepare(self):
        raw=(self.inputs/'website-runtime-sdk-bundle.json').read_bytes();assert len(raw)<1024**2
        bundle=json.loads(raw);assert bundle['kind']=='ats-private-website-runtime-sdk-bundle-v1'
        assert not bundle['businessDatabaseRowsIncluded']and not bundle['productionCredentialsIncluded']
        assert len(bundle['files'])==69 and len({r['name']for r in bundle['files']})==69
        for p,mode in [(self.root,0o700),(self.socket,0o2770)]:
            p.mkdir(mode=mode);p.chmod(mode);os.chown(p,1000,1000)
            s=p.lstat();self.identities.append((p,s.st_dev,s.st_ino))
        self.bundle_sha=hashlib.sha256(raw).hexdigest()
        for record in bundle['files']:
            name=record['name'];assert re.fullmatch('[A-Za-z0-9_./-]+',name)
            assert not name.startswith('/')and all(x not in ['.','..','']for x in name.split('/'))
            assert name=='real-sdk.mjs'or name.startswith(('current-website-candidate/','current-website-native-candidate/','website-protocol-tests/'))
            body=base64.b64decode(record['base64'],validate=True)
            assert len(body)==record['bytes']and len(body)<=1024**2 and hashlib.sha256(body).hexdigest()==record['sha256']
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True)
            for parent in [p.parent,*p.parent.parents]:
                if parent==self.root:break
                parent.chmod(0o755);os.chown(parent,1000,1000)
            with p.open('xb')as f:f.write(body)
            p.chmod(0o444);os.chown(p,1000,1000)
        lock=json.loads((self.root/'current-website-candidate/scripts/firewood-checkout/package-lock.json').read_bytes())
        self.npm=install_pg(self.root,lock)
        for name in ['guardian-sdk.mjs','guardian-custody.mjs','operation-publication.mjs','operation-guardian.mjs','active-publication.mjs']:
            p=self.root/name;p.write_bytes((self.here/name).read_bytes());p.chmod(0o444);os.chown(p,1000,1000)
        assert self.root.stat().st_mode&0o777==0o700
    def docker_args(self):
        return['--group-add','1000','--mount','type=bind,source='+str(self.socket)+',target=/sdk-socket']
    def verify_mounts(self,info):
        self.owned_cid=info['Id'];assert re.fullmatch('[a-f0-9]{64}',self.owned_cid)
        assert info['HostConfig']['GroupAdd']==['1000']
        # Docker reports legacy --tmpfs entries in HostConfig.Tmpfs, rather
        # than the Mounts list containing the typed Unix-socket bind.
        mounts=info['Mounts'];assert len(mounts)==1
        bound=[m for m in mounts if m['Type']=='bind'];assert len(bound)==1
        assert bound[0]['Source']==str(self.socket)and bound[0]['Destination']=='/sdk-socket'and bound[0]['RW']is True
        temporary=info['HostConfig']['Tmpfs'];assert set(temporary)=={'/fixture','/tmp'}
        assert re.fullmatch(r'rw,nodev,nosuid,noexec,size=256m,mode=0700,uid=[0-9]+,gid=[0-9]+',temporary['/fixture'])
        assert temporary['/tmp']=='rw,nodev,nosuid,noexec,size=32m,mode=1777'
        assert self.socket.resolve()==self.socket and not list(self.socket.iterdir())
    def _drop(self):
        libc=ctypes.CDLL(None,use_errno=True)
        assert libc.unshare(0x40000000)==0
        os.setgroups([]);os.setgid(1000);os.setuid(1000)
        assert libc.prctl(38,1,0,0,0)==0
        resource.setrlimit(resource.RLIMIT_CPU,(20,20));resource.setrlimit(resource.RLIMIT_FSIZE,(1024**2,1024**2))
    def _node(self,args,timeout,lock=None):
        remaining=self.deadline-time.monotonic();assert remaining>0
        cmd=[self.node,'--max-old-space-size=128',*args]
        if lock is not None:
            assert lock==self.root/'guardian-custody/guardian.lock'
            cmd=['/usr/bin/flock','--exclusive','--nonblock','--conflict-exit-code','75','--close',str(lock),*cmd]
        p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=self.root,env=self.env,preexec_fn=self._drop,start_new_session=True)
        self.children.append(p)
        try:out,err=p.communicate(timeout=min(timeout,remaining))
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL);p.communicate(timeout=3);raise
        finally:
            if p.poll()is not None:self.children.remove(p)
        assert len(out)<131072 and len(err)<65536
        return subprocess.CompletedProcess(args,p.returncode,out,err)
    def run_cases(self,sql,catalog_query):
        phase='source-unit-cases'
        p=self._node(['--experimental-vm-modules','--test','--test-concurrency=1',str(self.root/'website-protocol-tests/protocol.test.mjs')],10)
        self.private['sourceUnitProcess']={'exitCode':p.returncode,'stdout':p.stdout.decode('utf8','replace'),'stderr':p.stderr.decode('utf8','replace')}
        assert p.returncode==0 and b'# pass 27'in p.stdout and b'# fail 0'in p.stdout,'Native source-unit cases failed; owner diagnostics retained'
        schema=json.loads(sql("BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='5s';SET LOCAL lock_timeout='1s';"+catalog_query+'ROLLBACK;',timeout=8))
        anchor=time.clock_gettime(time.CLOCK_BOOTTIME)*1000
        query="""BEGIN;
ALTER ROLE ats_firewood_request LOGIN;ALTER ROLE ats_firewood_worker LOGIN;
INSERT INTO hosting_guard.state(singleton,epoch,holder,database_started_at,capture_started_at,topology_verified,topology_fingerprint,capture_in_progress,availability_policy)
VALUES(true,20,'ats-home-primary',pg_postmaster_start_time(),clock_timestamp()-interval '2 days',true,hosting_guard.catalog_fingerprint(),false,'local-primary-operation-v1');
SELECT hosting_guard.renew_local_primary_operation(20,'ats-home-primary',pg_postmaster_start_time(),hosting_guard.catalog_fingerprint());
SELECT jsonb_build_object('admissionProtocol',availability_policy,'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'databaseBoot',database_started_at::text,'leaseEpoch',epoch::text,'nodeIdentity',local_node,'topologyFingerprint',topology_fingerprint,'operationObservedAtMs',floor(extract(epoch FROM local_operation_observed_at)*1000)::bigint,'leaseIssuedAtMs',floor(extract(epoch FROM issued_at)*1000)::bigint,'expiresAtMs',floor(extract(epoch FROM expires_at)*1000)::bigint)FROM hosting_guard.state WHERE singleton;
COMMIT;"""
        try:
            operation=json.loads(sql(query,timeout=15));assert operation['systemIdentifier']!=self.source_sid
            data={'kind':'ats-owned-rowless-native-sdk-input-v1','socketDirectory':str(self.socket),'sourceSystemIdentifier':self.source_sid,'operation':operation,'anchorBootMs':anchor,'releaseSha256':self.bundle_sha,'schemaSha256':schema['semanticSchemaSha256'],'primaryInstallationId':secrets.token_hex(16)}
            data['bindingSha256']=hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            path=self.root/'operation-input.private.json';path.write_text(json.dumps(data));path.chmod(0o600);os.chown(path,1000,1000)
            p=self._node([str(self.root/'real-sdk.mjs'),str(path)],20)
            self.private['realSdkProcess']={'exitCode':p.returncode,'stdout':p.stdout.decode('utf8','replace'),'stderr':p.stderr.decode('utf8','replace')}
            assert p.returncode==0,'Actual SDK cases failed; owner diagnostics retained'
            proof=json.loads(p.stdout);assert proof['passed']and proof['checksPassed']==8
            guardian=self.root/'guardian-custody';guardian.mkdir(mode=0o700);os.chown(guardian,1000,1000)
            public=guardian/'public';public.mkdir(mode=0o755);public.chmod(0o755);os.chown(public,1000,1000)
            binding={'version':2,'admissionProtocol':'local-primary-operation-v1',
                     'namespace':'ats-home-primary-'+data['primaryInstallationId'][:12],
                     'generation':int(operation['leaseEpoch']),'primaryInstallationId':data['primaryInstallationId'],
                     'systemIdentifier':operation['systemIdentifier'],'topology':operation['topologyFingerprint']}
            binding_bytes=(json.dumps(binding)+'\n').encode();binding_sha=hashlib.sha256(binding_bytes).hexdigest()
            installation={'kind':'ats-original-installation-custody-v1','primaryInstallationId':data['primaryInstallationId'],
                          'bindingSha256':binding_sha,'systemIdentifier':operation['systemIdentifier'],
                          'originalHostIdentitySha256':'c'*64,
                          'databaseStorageIdentitySha256':hashlib.sha256(self.owned_cid.encode()).hexdigest()}
            installation_bytes=(json.dumps(installation)+'\n').encode()
            initial={'kind':'ats-original-installation-journal-v1','primaryInstallationId':data['primaryInstallationId'],
                     'bindingSha256':binding_sha,'operationSequence':0,'nativeWalLsn':'0/0','reservedAtMs':0,
                     'databaseBoot':None,'sourceBoot':None}
            for target,body,mode in [(public/'binding.json',binding_bytes,0o444),
                    (guardian/'installation.json',installation_bytes,0o600),
                    (guardian/'journal.json',(json.dumps(initial)+'\n').encode(),0o600),
                    (guardian/'guardian.lock',b'owned\n',0o600)]:
                with target.open('xb')as f:f.write(body)
                target.chmod(mode);os.chown(target,1000,1000)
            data.update(guardianRoot=str(guardian),publicRoot=str(public),guardianBindingSha256=binding_sha,
                        guardianInstallationSha256=hashlib.sha256(installation_bytes).hexdigest())
            path.write_text(json.dumps(data))
            p=self._node([str(self.root/'guardian-sdk.mjs'),str(path)],25,lock=guardian/'guardian.lock')
            self.private['guardianSdkProcess']={'exitCode':p.returncode,'stdout':p.stdout.decode('utf8','replace'),'stderr':p.stderr.decode('utf8','replace')}
            assert p.returncode==0,'Actual journal/SQL/publisher SDK integration failed; owner diagnostics retained'
            guardian_proof=json.loads(p.stdout);assert guardian_proof['passed']and guardian_proof['checksPassed']==9
            return{'passed':True,'sourceUnitCasesPassed':27,'actualSdkCasesPassed':8,'actualGuardianSqlSdkCasesPassed':9,
                   'guardianSqlSdk':guardian_proof,'pgVersion':'8.23.1','nativePgVersion':'17.11','realConnectionsAndSql':True,
                   'hostContextsSynthetic':True,'directOrdinaryRoles':['ats_firewood_request','ats_firewood_worker'],
                   'historicalBackupTimestampUnchanged':True,'originalHostGuardianAccepted':False,
                   'fullApplicationOrWorkerAccepted':False,'packages':self.npm}
        finally:
            sql('BEGIN;ALTER ROLE ats_firewood_request NOLOGIN;ALTER ROLE ats_firewood_worker NOLOGIN;DELETE FROM hosting_guard.state;COMMIT;',timeout=10)
            assert sql("SELECT count(*)FROM pg_roles WHERE rolcanlogin AND rolname<>'supabase_admin';")=='0'
            assert sql('SELECT count(*)FROM hosting_guard.state;')=='0'
    def stop_children(self):
        for p in self.children:
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            p.communicate(timeout=3)
        self.children=[]
    def cleanup(self):
        self.stop_children()
        for path,dev,ino in reversed(self.identities):
            s=path.lstat();assert s.st_dev==dev and s.st_ino==ino and not path.is_symlink()
            shutil.rmtree(path);assert not path.exists()
        return{'ownedSdkProcessesJoined':True,'ownedSdkDirectoriesRemoved':True}
