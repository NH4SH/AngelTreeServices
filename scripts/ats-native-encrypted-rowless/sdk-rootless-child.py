"""Owned child namespaces; actual parent-written ID maps, fixed chroot only."""
import ctypes,errno,json,os,re,socket,sys
root,controls,socket_path,expected=sys.argv[1:]
assert re.fullmatch('/run/ats-sdk-rootless-owned-[a-f0-9]{16}',root)
assert re.fullmatch('/run/ats-native-sdk-owned-[a-f0-9]{16}/guardian-custody/public',controls)
assert re.fullmatch('/run/ats-native-sdk-socket-[a-f0-9]{16}',socket_path)
assert expected in ['valid','denied'] and os.getuid()==0
libc=ctypes.CDLL(None,use_errno=True);os.setgroups([])
assert libc.unshare(0x10000000|0x00020000|0x40000000)==0,ctypes.get_errno()
print(json.dumps({'readyPid':os.getpid()}),flush=True)
assert sys.stdin.buffer.read(1)==b'1';os.setgid(0);os.setuid(0)
def mount(source,target,flags):
    assert libc.mount(source.encode()if source else None,target.encode(),None,flags,None)==0,ctypes.get_errno()
mount(None,'/',0x4000|0x40000)
mount('/proc',root+'/proc',0x1000|0x4000)
for source,target in [(controls,root+'/admission'),(root+'/release-admission',root+'/release-admission'),
                      (socket_path,root+'/sdk-socket')]:
    mount(source,target,0x1000)
    mount(None,target,0x1000|0x20|1|2|4|8)
probe=socket.socket();probe.settimeout(1)
assert probe.connect_ex(('1.1.1.1',443))==errno.ENETUNREACH;probe.close()
os.chroot(root);os.chdir('/app');os.setgid(1000);os.setuid(1000)
assert os.getgroups()==[] and libc.prctl(38,1,0,0,0)==0
os.execve('/usr/bin/node',['/usr/bin/node','--max-old-space-size=96','/app/rootless-sdk.mjs',expected],
          {'PATH':'/usr/bin:/bin','LANG':'C','LC_ALL':'C','HOME':'/nonexistent'})
