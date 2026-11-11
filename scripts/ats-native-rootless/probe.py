"""Real rootless UID maps and procfs overflow-owner tests; no CRM inputs."""
from pathlib import Path
import datetime,hashlib,json,os,platform,re,secrets,selectors,shutil,signal,subprocess,time

def main():
    assert os.getuid()==0 and platform.system()=='Linux'and platform.machine()in ['arm64','aarch64']
    assert os.environ.get('GITHUB_ACTIONS')=='true'and os.environ.get('GITHUB_REPOSITORY')=='NH4SH/AngelTreeServices'
    assert os.environ.get('GITHUB_REF')=='refs/heads/codex/ats-native-rootless-20261111'
    commit=os.environ['GITHUB_SHA'];os.environ.clear();os.umask(0o077)
    env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C'}
    node=shutil.which('node',path=env['PATH']);assert node
    assert subprocess.run([node,'--version'],capture_output=True,timeout=5,env=env).stdout.strip()==b'v22.23.4'
    root=Path('/run/ats-rootless-owned-'+secrets.token_hex(8));root.mkdir(mode=0o755);root.chmod(0o755);os.chown(root,1000,1000)
    identity=(root.stat().st_dev,root.stat().st_ino);owned=[];case='setup'
    result={'kind':'ats-native-rootless-proc-owner-proof-v1','commit':commit,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionChanged':False,'productionInputsReceived':False,'fullRootlessDockerOrRuntimeAccepted':False,'checks':[]}
    def target(path):
        assert path.startswith('/')and'..'not in path.split('/')
        p=root/path.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True)
        for parent in [p.parent,*p.parent.parents]:
            if parent==root.parent:break
            parent.chmod(0o755);os.chown(parent,1000,1000)
        return p
    def put(path,b,mode=0o444):
        p=target(path);p.write_bytes(b);p.chmod(mode);os.chown(p,1000,1000)
    def prepare_controls():
        now=time.time_ns()//1000000;mono=time.clock_gettime(time.CLOCK_BOOTTIME)*1000
        b={'version':2,'admissionProtocol':'local-primary-operation-v1','namespace':'ats-home-primary-112233445566','generation':20,'sourceId':'ats_crm_primary_20261029','sourceScope':'crm-v1','environment':'home-primary-local-v2','sourceMigrationCount':102,'systemIdentifier':'7000000000000000001','topology':'a'*32,'timeline':1,'primaryInstallationId':'b'*32,'installationOverlaySha256':'c'*64,'volumeName':'ats_crm_primary_20261029_pg-data-v3','sourceDbImage':'sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706'}
        raw=json.dumps(b,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest()
        d={'kind':'ats-firewood-local-primary-release-v2','bindingSha256':digest,'namespace':b['namespace'],'generation':20,'sourceId':b['sourceId'],'sourceScope':b['sourceScope'],'sourceEnvironment':b['environment'],'sourceMigrationCount':102,'admissionProtocol':b['admissionProtocol'],'systemIdentifier':b['systemIdentifier'],'topologyFingerprint':b['topology'],'timeline':1,'primaryInstallationId':b['primaryInstallationId'],'schemaSha256':'d'*64,'releaseComponentDigest':'e'*64,'installationOverlaySha256':b['installationOverlaySha256'],'signingKeyId':'synthetic_key_id','signingKeyFingerprint':'f'*64,'stripeKeyFingerprint':'1'*64,'modes':{'status':True,'office':True},'contract':'synthetic-local-primary-proof'}
        a={'kind':'ats-local-primary-operation-v1','bindingSha256':digest,'namespace':b['namespace'],'generation':20,'operationSequence':1,'sourceBoot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'databaseBoot':datetime.datetime.fromtimestamp((now-60000)/1000,datetime.timezone.utc).isoformat(),'systemIdentifier':b['systemIdentifier'],'topologyFingerprint':b['topology'],'primaryInstallationId':b['primaryInstallationId'],'observedAtMs':now-100,'observedMonotonicMs':mono-100,'expiresAtMs':now+10000,'expiresAtBootMs':mono+10000}
        for name,data in {'/admission/binding.json':raw,'/admission/active.json':json.dumps(a).encode(),'/admission/workers-released.json':json.dumps({'namespace':b['namespace'],'generation':20,'providerReconciliationVerified':True}).encode(),'/release-admission/firewood-release.json':json.dumps(d).encode()}.items():put(name,data)
    try:
        # Copy only the already installed public Node binary and its actual ELF
        # dependencies. No host filesystem bind, credential or account file.
        put('/usr/bin/node',Path(node).resolve().read_bytes(),0o555)
        p=subprocess.run(['/usr/bin/ldd',node],capture_output=True,timeout=5,env=env);assert p.returncode==0
        libs=set(re.findall(r'(?:=>\s+)?(/[^\s]+)\s+\(0x[0-9a-f]+\)',p.stdout.decode()))
        assert libs and len(libs)<24
        for lib in libs:
            assert lib.startswith(('/lib/','/usr/lib/'))
            put(lib,Path(lib).resolve().read_bytes(),0o555)
        for path in ['proc','admission','release-admission']:
            p=root/path;p.mkdir(exist_ok=True);p.chmod(0o755);os.chown(p,1000,1000)
        here=Path(__file__).resolve().parent
        for name in ['filesystem-check.mjs','release-filesystem.mjs','local-primary-context.mjs']:put('/release-admission/'+name,(here/name).read_bytes())
        for expected,bad in [('valid',False),('denied',True)]:
            case='unapproved-kernel-owner'if bad else'actual-overflow-owner'
            prepare_controls()
            child=subprocess.Popen(['/usr/bin/python3',str(here/'namespace-child.py'),str(root),expected,'/usr/bin/node'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,start_new_session=True);owned.append(child)
            select=selectors.DefaultSelector();select.register(child.stdout,selectors.EVENT_READ);assert select.select(5);select.close()
            line=child.stdout.readline();ready=json.loads(line);assert ready=={'readyPid':child.pid}
            uid_map='0 1000 1\n'+('2 0 1\n'if bad else'')+'1000 101000 1\n'
            Path('/proc/'+str(child.pid)+'/uid_map').write_text(uid_map)
            Path('/proc/'+str(child.pid)+'/setgroups').write_text('deny\n')
            gid_map='0 1000 1\n1000 101000 1\n'
            Path('/proc/'+str(child.pid)+'/gid_map').write_text(gid_map)
            stdout,stderr=child.communicate(input=b'1',timeout=15);owned.remove(child)
            result['lastProcess']={'case':case,'exitCode':child.returncode,'stdoutTail':stdout[-8192:].decode('utf8','replace'),'stderrTail':stderr[-4096:].decode('utf8','replace')}
            assert child.returncode==0 and not stderr
            proof=json.loads(stdout);assert proof['passed']and proof['actualUid']==proof['actualGid']==1000
            assert proof['kernelBootUid']==(2 if bad else 65534)and proof['kernelBootGid']==65534
            assert proof['actualFilesystemRootUid']==proof['actualFilesystemRootGid']==0
            assert proof['rejected']==bad
            result['checks'].append({'case':case,'uidMap':uid_map,'gidMap':gid_map,'actualOutboundDenied':True,**proof})
        result['passed']=True
    except BaseException as e:result.update(passed=False,errorType=type(e).__name__,safeError=str(e)[:4096],failedCase=case)
    finally:
        for p in owned:
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            p.communicate(timeout=3)
        result['ownedProcessesJoined']=all(p.poll()is not None for p in owned)
        assert(root.lstat().st_dev,root.lstat().st_ino)==identity and not root.is_symlink()
        shutil.rmtree(root);result['ownedRootRemoved']=not root.exists()
        if not(result['ownedProcessesJoined']and result['ownedRootRemoved']):result['passed']=False
        out=Path.cwd()/'ci-results';out.mkdir(exist_ok=True);out.chmod(0o755);p=out/'rootless-proof.json';p.write_text(json.dumps(result,indent=2)+'\n');p.chmod(0o644);print(json.dumps(result),flush=True)
    if not result['passed']:raise SystemExit(1)

if __name__=='__main__':main()
