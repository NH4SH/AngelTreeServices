"""Owned test child: waits for parent-written kernel ID maps, then chroots."""
import ctypes,errno,json,os,socket,sys
root,expected,node=sys.argv[1:]
assert root.startswith('/run/ats-rootless-owned-')and expected in ['valid','denied']
assert os.getuid()==0
libc=ctypes.CDLL(None,use_errno=True)
os.setgroups([])
# New user, mount and network namespaces. The privileged outer parent writes
# exactly the two/three reviewed ID ranges after receiving this readiness line.
assert libc.unshare(0x10000000|0x00020000|0x40000000)==0,ctypes.get_errno()
print(json.dumps({'readyPid':os.getpid()}),flush=True)
assert sys.stdin.buffer.read(1)==b'1'
os.setgid(0);os.setuid(0)
def mount(source,target,flags):
    assert libc.mount(source.encode()if source else None,target.encode(),None,flags,None)==0,ctypes.get_errno()
mount(None,'/',0x4000|0x40000) # MS_REC | MS_PRIVATE
mount('/proc',root+'/proc',0x1000|0x4000) # real procfs, not synthetic kernel files
for name in ['/admission','/release-admission']:
    mount(root+name,root+name,0x1000)
    mount(None,root+name,0x1000|0x20|1|2|4|8) # bind remount, ro/nosuid/nodev/noexec
probe=socket.socket();probe.settimeout(1)
assert probe.connect_ex(('1.1.1.1',443))==errno.ENETUNREACH;probe.close()
os.chroot(root);os.chdir('/')
os.setgid(1000);os.setuid(1000)
assert os.getgroups()==[]and libc.prctl(38,1,0,0,0)==0 # PR_SET_NO_NEW_PRIVS
os.execve(node,[node,'--max-old-space-size=96','/release-admission/filesystem-check.mjs',expected],{'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C'})
