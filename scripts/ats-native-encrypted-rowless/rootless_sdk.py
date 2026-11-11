"""Only owned copied files and bind mounts, isolated from the host primary."""
from pathlib import Path
import hashlib,json,os,re,selectors,shutil,signal,subprocess,time

class RootlessSdkFixture:
    def __init__(self,here,sdk_root,socket_path,node,nonce,env,deadline):
        self.here,self.sdk,self.socket,self.node,self.env,self.deadline=here,sdk_root,socket_path,node,env,deadline
        self.root=Path('/run/ats-sdk-rootless-owned-'+nonce);self.child=None;self.identity=None
    def put(self,path,body,mode=0o444):
        target=self.root/path.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True)
        for parent in [target.parent,*target.parent.parents]:
            if parent==self.root.parent:break
            parent.chmod(0o755);os.chown(parent,1000,1000)
        with target.open('xb')as f:f.write(body)
        target.chmod(mode);os.chown(target,1000,1000)
    def prepare(self):
        self.root.mkdir(mode=0o755);self.root.chmod(0o755);os.chown(self.root,1000,1000)
        s=self.root.lstat();self.identity=(s.st_dev,s.st_ino)
        self.put('/usr/bin/node',Path(self.node).resolve().read_bytes(),0o555)
        p=subprocess.run(['/usr/bin/ldd',self.node],capture_output=True,timeout=5,env=self.env);assert p.returncode==0
        libs=set(re.findall(r'(?:=>\s+)?(/[^\s]+)\s+\(0x[0-9a-f]+\)',p.stdout.decode()))
        assert libs and len(libs)<24
        for lib in libs:
            assert lib.startswith(('/lib/','/usr/lib/'));self.put(lib,Path(lib).resolve().read_bytes(),0o555)
        for directory in ['current-website-candidate','node_modules']:
            for p in (self.sdk/directory).rglob('*'):
                assert not p.is_symlink()
                if p.is_file():self.put('/app/'+directory+'/'+p.relative_to(self.sdk/directory).as_posix(),p.read_bytes())
        for p in (self.sdk/'current-website-native-candidate').rglob('*'):
            assert not p.is_symlink()
            if p.is_file():self.put('/release-admission/'+p.relative_to(self.sdk/'current-website-native-candidate').as_posix(),p.read_bytes())
        self.put('/app/rootless-sdk.mjs',(self.here/'rootless-sdk.mjs').read_bytes())
        for name in ['proc','admission','sdk-socket']:
            p=self.root/name;p.mkdir(mode=0o755);p.chmod(0o755);os.chown(p,1000,1000)
        manifest={p.relative_to(self.sdk/'current-website-candidate').as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in (self.sdk/'current-website-candidate').rglob('*')if p.is_file()}
        assert len(manifest)==52
        raw=(json.dumps(manifest,sort_keys=True)+'\n').encode()
        self.put('/release-admission/website-source-manifest.json',raw)
        return hashlib.sha256(raw).hexdigest()
    def run(self,controls):
        proofs=[]
        for expected,bad in [('valid',False),('denied',True)]:
            assert time.monotonic()<self.deadline
            p=subprocess.Popen(['/usr/bin/python3',str(self.here/'sdk-rootless-child.py'),str(self.root),str(controls),str(self.socket),expected],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=self.env,start_new_session=True)
            self.child=p
            selector=selectors.DefaultSelector();selector.register(p.stdout,selectors.EVENT_READ)
            assert selector.select(5);selector.close();assert json.loads(p.stdout.readline())=={'readyPid':p.pid}
            uid_map='0 1000 1\n'+('2 0 1\n'if bad else'')+'1000 101000 1\n'
            Path('/proc/'+str(p.pid)+'/uid_map').write_text(uid_map)
            Path('/proc/'+str(p.pid)+'/setgroups').write_text('deny\n')
            Path('/proc/'+str(p.pid)+'/gid_map').write_text('0 1000 1\n1000 101000 1\n')
            out,err=p.communicate(input=b'1',timeout=min(10,self.deadline-time.monotonic()));self.child=None
            assert len(out)<131072 and len(err)<65536
            proofs.append({'expected':expected,'exitCode':p.returncode,'stdout':out.decode('utf8','replace'),'stderr':err.decode('utf8','replace')})
            if p.returncode or err:return False,proofs
            proof=json.loads(out)
            if not proof['passed']:return False,proofs
        return True,proofs
    def cleanup(self):
        if self.child is not None:
            try:os.killpg(self.child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            self.child.communicate(timeout=3);self.child=None
        if self.identity is not None:
            s=self.root.lstat();assert(s.st_dev,s.st_ino)==self.identity and not self.root.is_symlink()
            shutil.rmtree(self.root);assert not self.root.exists()
        return {'ownedRootlessProcessesJoined':True,'ownedRootlessRootRemoved':True}
