"""Run only inside a new disposable Actions mount/PID/network namespace.

Synthetic metadata occupies two private tmpfs mounts. No production mount,
identity, key, SQL, endpoint or copied data is accepted. This tests actual UID,
kernel ownership and read-only mounts, not original-installation custody.
"""
from pathlib import Path
import datetime,errno,hashlib,json,os,platform,re,socket,stat,subprocess,sys,time

def main():
    assert sys.platform=='linux'and platform.machine()in ['aarch64','arm64']and os.getuid()==0
    assert os.environ.get('GITHUB_ACTIONS')=='true'and os.getpid()==1
    parent_ns=int(sys.argv[1]);node=Path(sys.argv[2]);assert node.is_absolute()and node.is_file()
    assert os.stat('/proc/self/ns/mnt').st_ino!=parent_ns
    assert sorted(name for _,name in socket.if_nameindex())==['lo']
    s=socket.socket();s.settimeout(1);assert s.connect_ex(('1.1.1.1',443))==errno.ENETUNREACH;s.close()
    roots=[Path('/admission'),Path('/release-admission')]
    assert all(not p.exists()and not p.is_symlink()for p in roots)
    created=[];mounted=[];checks=[];result={'kind':'ats-native-local-primary-filesystem-proof-v1','syntheticOnly':True,'fullGuardianAccepted':False,'originalHostCustodyAccepted':False,'restoredCloneAccepted':False,'fullSchemaAccepted':False}
    env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':'/nonexistent','LANG':'C','LC_ALL':'C'}
    case='setup';serial=0
    def run(args):
        nonlocal serial
        serial+=1
        p=subprocess.run(args,capture_output=True,timeout=5,env=env)
        if p.returncode:
            outcome=None
            try:outcome=json.loads(p.stdout)if len(p.stdout)<=8192 else None
            except ValueError:pass
            result['failedCommand']={'step':serial,'case':case,'command':Path(args[0]).name,'exitCode':p.returncode,'runtimeOutcome':outcome,'stderrBytes':len(p.stderr),'stderrSha256':hashlib.sha256(p.stderr).hexdigest(),'errorCodes':sorted(set(re.findall(r'\bE[A-Z_]{3,40}\b',p.stderr.decode('utf-8','replace'))))[:8]}
        assert p.returncode==0,'Owned filesystem fixture command failed'
        return p
    def remount(mode):
        for p in roots:run(['/usr/bin/mount','-o','remount,'+mode,str(p)])
    def prepare():
        remount('rw')
        for folder in roots:
            for p in folder.iterdir():p.unlink()
        now=time.time_ns()//1000000;mono=time.clock_gettime(time.CLOCK_BOOTTIME)*1000
        b={'version':2,'admissionProtocol':'local-primary-operation-v1','namespace':'ats-home-primary-112233445566','generation':20,'sourceId':'ats_crm_primary_20261029','sourceScope':'crm-v1','environment':'home-primary-local-v2','sourceMigrationCount':102,'systemIdentifier':'7000000000000000001','topology':'a'*32,'timeline':1,'primaryInstallationId':'b'*32,'installationOverlaySha256':'c'*64,'volumeName':'ats_crm_primary_20261029_pg-data-v3','sourceDbImage':'sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706'}
        raw=json.dumps(b,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest()
        d={'kind':'ats-firewood-local-primary-release-v2','bindingSha256':digest,'namespace':b['namespace'],'generation':20,'sourceId':b['sourceId'],'sourceScope':b['sourceScope'],'sourceEnvironment':b['environment'],'sourceMigrationCount':102,'admissionProtocol':b['admissionProtocol'],'systemIdentifier':b['systemIdentifier'],'topologyFingerprint':b['topology'],'timeline':1,'primaryInstallationId':b['primaryInstallationId'],'schemaSha256':'d'*64,'releaseComponentDigest':'e'*64,'installationOverlaySha256':b['installationOverlaySha256'],'signingKeyId':'synthetic_key_id','signingKeyFingerprint':'f'*64,'stripeKeyFingerprint':'1'*64,'modes':{'status':True,'office':True},'contract':'synthetic-local-primary-proof'}
        a={'kind':'ats-local-primary-operation-v1','bindingSha256':digest,'namespace':b['namespace'],'generation':20,'operationSequence':1,'sourceBoot':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'databaseBoot':datetime.datetime.fromtimestamp((now-60000)/1000,datetime.timezone.utc).isoformat(),'systemIdentifier':b['systemIdentifier'],'topologyFingerprint':b['topology'],'primaryInstallationId':b['primaryInstallationId'],'observedAtMs':now-100,'observedMonotonicMs':mono-100,'expiresAtMs':now+10000,'expiresAtBootMs':mono+10000}
        values={'/admission/binding.json':raw,'/admission/active.json':json.dumps(a).encode(),'/admission/workers-released.json':json.dumps({'namespace':b['namespace'],'generation':20,'providerReconciliationVerified':True}).encode(),'/release-admission/firewood-release.json':json.dumps(d).encode()}
        for name,data in values.items():p=Path(name);p.write_bytes(data);p.chmod(0o444);os.chown(p,0,0)
    def check(name,mutation=None,*,uid=1000,rw=False,valid=False):
        nonlocal case
        case=name
        prepare()
        if mutation:mutation()
        if not rw:remount('ro')
        p=run(['/usr/bin/setpriv','--reuid='+str(uid),'--regid='+str(uid),'--clear-groups','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all','--no-new-privs',str(node),'--max-old-space-size=96',str(Path(__file__).with_name('filesystem-check.mjs').resolve()),'valid'if valid else'denied'])
        outcome=json.loads(p.stdout);assert outcome['passed']and outcome['actualUid']==uid
        checks.append({'name':name,**outcome})
    try:
        for p in roots:
            p.mkdir(mode=0o755);p.chmod(0o755);st=p.lstat();assert st.st_uid==0 and stat.S_ISDIR(st.st_mode)
            created.append((p,st.st_dev,st.st_ino))
            run(['/usr/bin/mount','-t','tmpfs','-o','size=1m,mode=0755,nodev,nosuid,noexec','ats-synthetic-controls',str(p)]);mounted.append(p)
        check('Fresh local proof with cloud authority PEM absent',valid=True)
        check('Root runtime UID rejected',uid=0)
        check('Writable control-file mode rejected',lambda:Path('/admission/active.json').chmod(0o644))
        check('Runtime-owned control rejected',lambda:os.chown('/admission/active.json',1000,1000))
        def symlink():
            p=Path('/admission/active.json');p.rename('/admission/held.json');p.symlink_to('/admission/held.json')
        check('Symlink control rejected',symlink)
        check('Hardlinked control rejected',lambda:os.link('/admission/active.json','/admission/alias.json'))
        check('Writable mount rejected despite 0444 files',rw=True)
        check('Operator latch rejected',lambda:Path('/admission/fenced.latch').write_text('synthetic hold\n'))
        def legacy():
            p=Path('/release-admission/firewood-release.json');p.chmod(0o600);d=json.loads(p.read_bytes());d['kind']='ats-firewood-release-control-v1';p.write_text(json.dumps(d));p.chmod(0o444)
        check('Legacy descriptor still requires its absent authority PEM',legacy)
        result.update(passed=True,checksPassed=len(checks),checks=checks,privateMountNamespace=True,privatePidNamespace=True,actualOutboundDenied=True)
    except BaseException as e:
        result.update(passed=False,checksPassed=len(checks),checks=checks,errorType=type(e).__name__)
    finally:
        for p in reversed(mounted):run(['/usr/bin/umount',str(p)])
        for p,dev,ino in reversed(created):
            st=p.lstat();assert(st.st_dev,st.st_ino)==(dev,ino)and st.st_uid==0;p.rmdir()
        result['ownedMountsRemoved']=True;result['ownedDirectoriesRemoved']=True
    print(json.dumps(result),flush=True)
    if not result['passed']:raise SystemExit(1)

if __name__=='__main__':
    try:main()
    except BaseException as e:
        import traceback
        line=traceback.extract_tb(e.__traceback__)[-1].lineno
        print('ERROR: Synthetic filesystem fixture '+type(e).__name__+' at source line '+str(line),file=sys.stderr,flush=True)
        raise SystemExit(1)
