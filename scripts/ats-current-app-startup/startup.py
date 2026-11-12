"""One bounded anonymous startup check; no SQL, credentials or business actions.

Runs in a fresh Linux network namespace containing only loopback. The current
Next application is unchanged. This establishes process/login startup, not
authenticated CRM, installed native admission or production readiness.
"""
from pathlib import Path
import ctypes,hashlib,http.client,json,os,signal,subprocess,sys,time

assert os.getuid()==0 and len(sys.argv)==3
source=Path(sys.argv[1]); env=json.loads(Path(sys.argv[2]).read_text())
assert source.is_absolute() and source.is_dir()
libc=ctypes.CDLL(None,use_errno=True)
assert libc.unshare(0x40000000)==0
subprocess.run(['/usr/sbin/ip','link','set','lo','up'],check=True,timeout=3,env={'PATH':'/usr/sbin:/usr/bin:/bin'})
assert subprocess.check_output(['/usr/sbin/ip','-json','route'],timeout=3).strip()==b'[]'
env.pop('NODE_OPTIONS',None);env.pop('ATS_NETWORK_ATTEMPTS',None)
env['NODE_OPTIONS']='--max-old-space-size=512'
env['NEXT_TELEMETRY_DISABLED']='1'
def drop():
    os.setgroups([]);os.setgid(1000);os.setuid(1000)
    assert libc.prctl(38,1,0,0,0)==0
log=source.parent/'startup.log';f=log.open('xb')
node='/usr/local/bin/node'
if not Path(node).exists():node='/usr/bin/node'
p=subprocess.Popen([node,str(source/'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3000'],cwd=source,env=env,
                   preexec_fn=drop,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
result={'kind':'ats-current-crm-anonymous-startup-v1','networkNamespace':'loopback-only-no-routes','currentAppSourceUnchanged':True,
        'productionCredentials':0,'businessActions':0,'authenticatedOperationsTested':False,'nativeInstalledAdmissionTested':False,'checks':[]}
def request(path):
    c=http.client.HTTPConnection('127.0.0.1',3000,timeout=5)
    try:
        c.request('GET',path,headers={'Host':'admin.angeltreeservices.org'})
        r=c.getresponse();b=r.read(2*1024**2+1);assert len(b)<=2*1024**2
        return r.status,dict(r.getheaders()),b
    finally:c.close()
try:
    deadline=time.monotonic()+45
    while True:
        assert p.poll() is None,'Current app exited before readiness'
        try:
            status,headers,body=request('/login')
            if status==200:break
        except OSError:pass
        assert time.monotonic()<deadline,'Current app did not become ready in 45 seconds'
        time.sleep(.25)
    assert b'<html' in body and b'password' in body.lower()
    result['checks'].append({'path':'/login','status':status,'bodyBytes':len(body),'bodySha256':hashlib.sha256(body).hexdigest()})
    for path in ['/admin','/crew','/employee','/files']:
        status,headers,body=request(path)
        assert status in [303,307,308] and '/login' in headers.get('location',''),(path,status)
        result['checks'].append({'path':path,'status':status,'anonymousDenied':True})
    assert p.poll() is None
    result['passed']=True
finally:
    os.killpg(p.pid,signal.SIGTERM)
    try:p.wait(timeout=8)
    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=3)
    f.close();assert log.stat().st_size<1024**2
    result['ownedProcessJoined']=p.poll() is not None
    result['startupLogSha256']=hashlib.sha256(log.read_bytes()).hexdigest()
    print(json.dumps(result),flush=True)
