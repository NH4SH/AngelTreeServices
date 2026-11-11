"""Owned native ARM64 process/lock/filesystem tests; no DB, keys or VM access."""
from pathlib import Path
import ctypes,datetime,hashlib,json,os,platform,re,resource,secrets,shutil,signal,subprocess,time

def main():
    assert os.getuid()==0 and platform.system()=='Linux'and platform.machine()in ['aarch64','arm64']
    assert os.environ.get('GITHUB_ACTIONS')=='true'and os.environ.get('GITHUB_REPOSITORY')=='NH4SH/AngelTreeServices'
    assert os.environ.get('GITHUB_REF')=='refs/heads/codex/ats-native-guardian-20261111'
    commit=os.environ['GITHUB_SHA'];assert re.fullmatch('[a-f0-9]{40}',commit)
    os.environ.clear();os.umask(0o077)
    env={'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C','LC_ALL':'C'}
    node=shutil.which('node',path=env['PATH']);assert node
    assert subprocess.run([node,'--version'],capture_output=True,env=env,timeout=5).stdout.strip()==b'v22.23.4'
    nonce=secrets.token_hex(8);root=Path('/run/ats-guardian-owned-'+nonce)
    source=Path('/run/ats-guardian-source-'+nonce);roots=[];owned=[];deadline=time.monotonic()+90
    result={'kind':'ats-owned-native-guardian-custody-proof-v1','commit':commit,'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'nodeVersion':'v22.23.4','tests':[],'productionChanged':False,'productionInputsReceived':False,'databaseSqlCalls':0,'realVmRebootTested':False,'productionIdentityAdapterAccepted':False,'fullGuardianOrRuntimeAccepted':False}
    def note(x):result['tests'].append(x)
    def create_scope(path):
        path.mkdir(mode=0o700);os.chown(path,1000,1000);roots.append((path,path.stat().st_dev,path.stat().st_ino))
    def write(path,b):
        path.write_bytes(b);path.chmod(0o600);os.chown(path,1000,1000)
    def drop():
        libc=ctypes.CDLL(None,use_errno=True);assert libc.unshare(0x40000000)==0
        os.setgroups([]);os.setgid(1000);os.setuid(1000)
        resource.setrlimit(resource.RLIMIT_CPU,(15,15));resource.setrlimit(resource.RLIMIT_FSIZE,(1024**2,1024**2))
    def args(action,path=root,locked=True,other=False):
        cmd=[node,'--max-old-space-size=128',str(source/'journal-case.mjs'),str(path),digest,action]
        return(['/usr/bin/flock','--exclusive','--nonblock','--conflict-exit-code','75','--close',str(path/('other.lock'if other else'guardian.lock'))]+cmd)if locked else cmd
    def bounded_owned(cmd,timeout=8):
        assert time.monotonic()<deadline
        p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,preexec_fn=drop,start_new_session=True);owned.append(p)
        try:stdout,stderr=p.communicate(timeout=min(timeout,deadline-time.monotonic()))
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL);p.communicate(timeout=3);raise
        finally:
            if p.poll()is not None:owned.remove(p)
        assert len(stdout)<65536 and len(stderr)<65536
        return subprocess.CompletedProcess(cmd,p.returncode,stdout,stderr)
    def call(action,path=root,locked=True,other=False,expected=0):
        p=bounded_owned(args(action,path,locked,other))
        assert p.returncode==expected,{'action':action,'exitCode':p.returncode,'stderr':p.stderr.decode()[:2048]}
        return json.loads(p.stdout)if p.stdout.strip()else None
    try:
        source.mkdir(mode=0o755);roots.append((source,source.stat().st_dev,source.stat().st_ino))
        here=Path(__file__).resolve().parent
        for name in ['guardian-custody.mjs','operation-publication.mjs','operation-guardian.mjs','operation-guardian.test.mjs','journal-case.mjs']:
            shutil.copyfile(here/name,source/name);(source/name).chmod(0o444)
        source.chmod(0o555)
        create_scope(root)
        installation={'kind':'ats-original-installation-custody-v1','primaryInstallationId':'a'*32,'bindingSha256':'b'*64,'systemIdentifier':'7000000000000000001','originalHostIdentitySha256':'c'*64,'databaseStorageIdentitySha256':'d'*64}
        b=(json.dumps(installation)+'\n').encode();digest=hashlib.sha256(b).hexdigest();write(root/'installation.json',b)
        initial={'kind':'ats-original-installation-journal-v1','primaryInstallationId':installation['primaryInstallationId'],'bindingSha256':installation['bindingSha256'],'operationSequence':0,'nativeWalLsn':'0/100','reservedAtMs':0,'databaseBoot':None,'sourceBoot':None}
        write(root/'journal.json',(json.dumps(initial)+'\n').encode());write(root/'guardian.lock',b'owned\n');write(root/'other.lock',b'owned-other\n')
        call('reject-open',locked=False);note('No kernel-lock parent cannot reserve original-installation sequence')
        call('reject-open',other=True);note('A real flock on a different inode cannot impersonate the guardian lock')
        assert call('reserve')['sequence']==1;note('Actual UID1000 process under exact Linux FLOCK writes/fsyncs/readbacks sequence1')
        assert call('reserve-new-boot-metadata')['sequence']==2;note('A new process retains durable sequence while boot metadata changes; not a real VM reboot')
        call('crash-after-reserve',expected=137)
        assert call('reserve')['sequence']==4;note('SIGKILL after durable reservation does not reuse the committed sequence on process relaunch')
        for action in ['reject-host','reject-storage','reject-wal']:
            assert call(action)['sequenceUnchanged'];note(action+' denied before any state change')
        orphan=root/('.journal-'+secrets.token_hex(16)+'.tmp');write(orphan,b'{partial')
        assert call('reserve')['sequence']==5 and not orphan.exists();note('Incomplete pre-rename orphan safely removed without rolling back durable sequence')
        empty=Path(str(root)+'-db-copy');create_scope(empty);write(empty/'guardian.lock',b'owned\n')
        call('reject-open',path=empty);note('Database-copy scope without original outside-database installation files receives no automatic bootstrap')
        saved=(root/'journal.json').read_bytes()
        (root/'journal.json').chmod(0o644);call('reject-open');(root/'journal.json').chmod(0o600);note('Readable-by-others custody journal rejected')
        os.link(root/'journal.json',root/'extra-link');call('reject-open');(root/'extra-link').unlink();note('Hardlinked custody journal rejected')
        (root/'journal.json').rename(root/'saved-journal');(root/'journal.json').symlink_to(root/'saved-journal');call('reject-open');(root/'journal.json').unlink();(root/'saved-journal').rename(root/'journal.json');note('Symlinked custody journal rejected')
        write(root/'journal.json',b'{corrupt');call('reject-open');write(root/'journal.json',saved);note('Corrupt committed journal requires recovery rather than reconstructing authority from database')
        over=json.loads(saved);over['operationSequence']=9007199254740991;write(root/'journal.json',json.dumps(over).encode());call('reject-overflow');write(root/'journal.json',saved);note('Sequence overflow cannot reserve or wrap')
        child=subprocess.Popen(args('hold'),stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,preexec_fn=drop,start_new_session=True);owned.append(child)
        import selectors
        selector=selectors.DefaultSelector();selector.register(child.stdout,selectors.EVENT_READ);assert selector.select(4);selector.close()
        assert child.stdout.readline()==b'owned-lock-held\n'
        call('reserve',expected=75);note('Concurrent contender is rejected by the actual kernel lock before Node starts')
        os.killpg(child.pid,signal.SIGTERM);child.communicate(timeout=3);owned.remove(child)
        p=bounded_owned([node,'--max-old-space-size=128','--test','--test-concurrency=1',str(source/'operation-guardian.test.mjs')],timeout=10)
        result['nativeEngineProcess']={'exitCode':p.returncode,'stdoutSha256':hashlib.sha256(p.stdout).hexdigest(),'stderrSha256':hashlib.sha256(p.stderr).hexdigest(),'stdoutTail':p.stdout[-4096:].decode('utf-8','replace'),'stderrTail':p.stderr[-4096:].decode('utf-8','replace')}
        assert p.returncode==0 and b'# pass 12'in p.stdout and b'# fail 0'in p.stdout
        result['nativeEngineCasesPassed']=12;note('Twelve native engine cases require commit acknowledgement, both source/custody observations, operator holds, exact SQL time and independent publication readback')
        result['passed']=True
    except BaseException as e:
        result['passed']=False;result['errorType']=type(e).__name__;result['safeError']=str(e)[:4096]
    finally:
        for p in owned:
            try:os.killpg(p.pid,signal.SIGKILL);p.communicate(timeout=3)
            except ProcessLookupError:p.communicate(timeout=3)
        result['ownedProcessesJoined']=all(p.poll()is not None for p in owned)
        cleaned=True
        for path,dev,ino in reversed(roots):
            try:
                st=path.lstat();assert not path.is_symlink()and st.st_dev==dev and st.st_ino==ino
                path.chmod(0o700);shutil.rmtree(path);assert not path.exists()
            except BaseException:cleaned=False
        result['ownedDirectoriesRemoved']=cleaned;result['testsPassed']=len(result['tests'])
        if not(cleaned and result['ownedProcessesJoined']):result['passed']=False
        out=Path.cwd()/'ci-results';out.mkdir(exist_ok=True);out.chmod(0o755);f=out/'guardian-proof.json';f.write_text(json.dumps(result,indent=2)+'\n');f.chmod(0o644)
        print(json.dumps(result),flush=True)
    if not result['passed']:raise SystemExit(1)

if __name__=='__main__':main()
