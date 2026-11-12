"""Build only the current public CRM candidate on an owned ARM runner.

Public browser anon input only. No application start, deployment, database,
provider credential, source activation, Mac/VM access or private runtime file.
"""
from pathlib import Path
import base64,ctypes,datetime,hashlib,json,os,platform,re,resource,secrets,shutil,signal,subprocess,time

def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    assert os.getuid()==0 and platform.system()=='Linux'and platform.machine()in ['aarch64','arm64']
    assert os.environ.get('GITHUB_ACTIONS')=='true'and os.environ.get('GITHUB_REPOSITORY')=='NH4SH/AngelTreeServices'
    assert os.environ.get('GITHUB_REF')=='refs/heads/codex/ats-isolated-app-startup-20261112'
    commit=os.environ['GITHUB_SHA'];os.environ.clear();os.umask(0o077)
    env={'PATH':'/usr/local/bin:/usr/bin:/bin','LANG':'C','LC_ALL':'C','HOME':'/nonexistent'}
    node=shutil.which('node',path=env['PATH']);npm=Path(shutil.which('npm',path=env['PATH'])).resolve()
    assert node and npm.is_file()
    assert subprocess.run([node,'--version'],capture_output=True,timeout=5,env=env).stdout.strip()==b'v22.23.4'
    stage_here=Path(__file__).resolve().parent;repo=stage_here.parent.parent;here=repo/'scripts/ats-current-app-build'
    assignment=json.loads((here/'assignment.json').read_bytes());manifest=assignment['files']
    assert assignment['kind']=='ats-current-public-crm-build-assignment-v1'and len(manifest)>703
    raw=(here/'public-input.json').read_bytes();assert sha(raw)==assignment['publicInputSha256']
    public=json.loads(raw);assert set(public)=={'version','purpose','appOrigin','backendUrl','anonKey'}
    assert public['version']==1 and public['purpose']=='ats-production-public-build-v1'
    assert public['appOrigin']=='https://admin.angeltreeservices.org'and public['backendUrl']=='https://admin.angeltreeservices.org/backend'
    assert sha(public['anonKey'].encode())=='a036ea4bf8108fe3d15667ed627062eac33752ceb5d706a7e7a7284119e8f3d5'
    claims=json.loads(base64.urlsafe_b64decode(public['anonKey'].split('.')[1]+'==='));assert claims['role']=='anon'
    root=Path('/run/ats-current-app-build-owned-'+secrets.token_hex(8));root.mkdir(mode=0o700);os.chown(root,1000,1000)
    identity=(root.stat().st_dev,root.stat().st_ino);source=root/'source';source.mkdir(mode=0o700);os.chown(source,1000,1000)
    cache=root/'npm-cache';cache.mkdir(mode=0o700);os.chown(cache,1000,1000)
    log=root/'build.log';log.touch(mode=0o600);os.chown(log,1000,1000)
    netlog=root/'network-attempts.log';netlog.touch(mode=0o600);os.chown(netlog,1000,1000)
    preload=root/'deny-network.cjs';preload.write_bytes((here/'deny-network.cjs').read_bytes());preload.chmod(0o444);os.chown(preload,1000,1000)
    result={'kind':'ats-current-crm-isolated-startup-proof-v1','atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':commit,'nodeVersion':'v22.23.4','sourceFiles':len(manifest),'browserAnonOnly':True,'privateInputs':0,'applicationStarted':True,'deploymentPerformed':False,'productionChanged':False,'phases':[]}
    owned=[];deadline=time.monotonic()+900
    def drop(network):
        def child():
            libc=ctypes.CDLL(None,use_errno=True)
            if network:assert libc.unshare(0x40000000)==0
            allowed=sorted(os.sched_getaffinity(0));os.sched_setaffinity(0,set(allowed[:2]))
            os.setgroups([]);os.setgid(1000);os.setuid(1000)
            assert libc.prctl(38,1,0,0,0)==0
            resource.setrlimit(resource.RLIMIT_CPU,(600,600));resource.setrlimit(resource.RLIMIT_FSIZE,(512*1024**2,512*1024**2))
        return child
    def run(name,args,child_env,network,timeout):
        assert time.monotonic()<deadline
        p=subprocess.Popen([node,*args],cwd=source,env=child_env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,preexec_fn=drop(network),start_new_session=True);owned.append(p)
        try:b=p.communicate(timeout=min(timeout,deadline-time.monotonic()))[0]
        except subprocess.TimeoutExpired:
            os.killpg(p.pid,signal.SIGKILL);b=p.communicate(timeout=5)[0];raise
        finally:
            if p.poll()is not None:owned.remove(p)
        assert len(b)<8*1024**2
        with log.open('ab')as f:f.write(('\nPHASE '+name+'\n').encode()+b)
        result['phases'].append({'name':name,'exitCode':p.returncode,'outboundIpDenied':network,'stdoutBytes':len(b),'stdoutSha256':sha(b)})
        assert p.returncode==0,'Current candidate phase failed: '+name
    try:
        for entry in manifest:
            name=entry['path'];assert re.fullmatch(r'[A-Za-z0-9_./\[\]()-]+',name)
            assert not name.startswith('/')and not any(x in ['.','..','']for x in name.split('/'))
            original=repo/'apps/platform'/name;st=original.lstat();assert original.is_file()and not original.is_symlink()
            body=original.read_bytes();assert len(body)==entry['bytes']and sha(body)==entry['sha256']
            path=source/name;path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
            with path.open('xb')as f:f.write(body)
            os.chown(path,1000,1000);path.chmod(0o600)
            for parent in [path.parent,*path.parent.parents]:
                if parent==root:break
                parent.chmod(0o700);os.chown(parent,1000,1000)
        result['sourceManifestVerified']=True
        result['sourceManifestSha256']=sha((here/'assignment.json').read_bytes())
        # npm requires distinct config paths even when both are deliberately empty.
        for name in ['user.npmrc','global.npmrc']:
            config=root/name;config.touch(mode=0o600);os.chown(config,1000,1000)
        install={**env,'npm_config_userconfig':str(root/'user.npmrc'),'npm_config_globalconfig':str(root/'global.npmrc'),'npm_config_registry':'https://registry.npmjs.org/','npm_config_cache':str(cache),'npm_config_audit':'false','npm_config_fund':'false'}
        run('locked-dependencies',[str(npm),'ci','--ignore-scripts','--include=dev','--no-audit','--no-fund'],install,False,240)
        build={**env,'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1','APP_ENV':'production','APP_BASE_URL':public['appOrigin'],'NEXT_PUBLIC_SUPABASE_URL':public['backendUrl'],'NEXT_PUBLIC_SUPABASE_ANON_KEY':public['anonKey'],'SUPABASE_INTERNAL_URL':'http://api-gw:8000','NODE_OPTIONS':'--max-old-space-size=2048 --require='+str(preload),'ATS_NETWORK_ATTEMPTS':str(netlog)}
        # The accepted source/type/SQL suites are not repeated. Rebuild only
        # because the accepted build intentionally removed its runnable files.
        available=int(next(x.split()[1] for x in Path('/proc/meminfo').read_text().splitlines() if x.startswith('MemAvailable:')))
        assert available>=3*1024**2,'Hosted runner resource admission failed'
        result['freshRunnerAvailableKiB']=available
        run('webpack-build-for-startup',['node_modules/next/dist/bin/next','build','--webpack'],build,True,360)
        assert not netlog.read_bytes(),'Unexpected outbound request during build'
        startup_env=root/'startup-env.json';startup_env.write_text(json.dumps(build));startup_env.chmod(0o600)
        p=subprocess.run(['/usr/bin/python3',str(stage_here/'startup.py'),str(source),str(startup_env)],env=env,capture_output=True,timeout=75)
        with log.open('ab')as f:f.write(b'\nPHASE current-app-startup\n'+p.stderr+p.stdout)
        assert p.returncode==0,'Isolated current application startup failed'
        proof=json.loads(p.stdout);assert proof['passed'] and proof['ownedProcessJoined']
        result['startup']=proof
        result['passed']=True;result['outboundBuildAttempts']=0
    except BaseException as e:result.update(passed=False,errorType=type(e).__name__,safeError=str(e)[:1024])
    finally:
        for p in owned:
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            p.communicate(timeout=5)
        out=Path.cwd()/'ci-results';out.mkdir(exist_ok=True);out.chmod(0o755)
        target=out/'app-build.log';target.write_bytes(log.read_bytes());target.chmod(0o644)
        assert(root.lstat().st_dev,root.lstat().st_ino)==identity and not root.is_symlink()
        shutil.rmtree(root);result['ownedBuildDirectoryRemoved']=not root.exists();result['ownedProcessesJoined']=all(p.poll()is not None for p in owned)
        target=out/'app-build-proof.json';target.write_text(json.dumps(result,indent=2)+'\n');target.chmod(0o644);print(json.dumps(result),flush=True)
    if not result['passed']:raise SystemExit(1)

if __name__=='__main__':main()
