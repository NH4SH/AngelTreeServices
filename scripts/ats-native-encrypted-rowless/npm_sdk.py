"""Fetch only the exact pg dependency closure from the authenticated lockfile.

No npm lifecycle, arbitrary registry, semver resolution or environment credential.
Every downloaded archive is SHA512-verified before bounded regular-file extraction.
"""
from pathlib import Path,PurePosixPath
import base64,hashlib,io,json,os,re,tarfile,urllib.request,urllib.parse

def install_pg(root,lock):
    assert root.is_dir()and root.resolve()==root and root.stat().st_uid==1000 and root.stat().st_mode&0o777==0o700
    packages=lock['packages'];assert lock['lockfileVersion']==3
    assert packages['node_modules/pg']['version']=='8.23.1'
    def dependency(name,current):
        assert re.fullmatch(r'(?:@[a-z0-9_.-]+/)?[a-z0-9_.-]+',name)
        while True:
            candidate=(current+'/'if current else'')+'node_modules/'+name
            if candidate in packages:return candidate
            if not current:return None
            current=current.rsplit('/node_modules/',1)[0]if'/node_modules/'in current else''
    selected=set();pending=['node_modules/pg']
    while pending:
        key=pending.pop()
        if key in selected:continue
        assert key.startswith('node_modules/')and len(key)<256
        assert all(p not in ['.','..','']for p in key.split('/'))
        meta=packages[key];assert not meta.get('link')and not meta.get('hasInstallScript')
        selected.add(key);assert len(selected)<=24
        optional=meta.get('optionalDependencies',{})
        for name in set(meta.get('dependencies',{}))|set(optional):
            found=dependency(name,key)
            assert found is not None or name in optional
            if found:pending.append(found)
    totals=0;proof=[]
    for key in sorted(selected):
        meta=packages[key];url=meta['resolved'];u=urllib.parse.urlsplit(url)
        assert u.scheme=='https'and u.hostname=='registry.npmjs.org'and not(u.username or u.password or u.query or u.fragment)
        assert len(url)<1024 and re.fullmatch(r'sha512-[A-Za-z0-9+/]{86}==',meta['integrity'])
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ATS owned pinned SDK rehearsal'}),timeout=10)as response:
            assert urllib.parse.urlsplit(response.url).hostname=='registry.npmjs.org'
            raw=response.read(2*1024**2+1)
        assert len(raw)<=2*1024**2
        assert 'sha512-'+base64.b64encode(hashlib.sha512(raw).digest()).decode()==meta['integrity']
        destination=root/key;destination.mkdir(parents=True,exist_ok=False)
        for parent in [destination,*destination.parents]:
            if parent==root:break
            assert not parent.is_symlink();parent.chmod(0o755);os.chown(parent,1000,1000)
        archive=tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz');count=0
        for entry in archive.getmembers():
            if entry.isdir()and entry.name.rstrip('/')=='package':continue
            assert entry.name.startswith('package/')
            relative=PurePosixPath(entry.name).parts[1:]
            assert relative and all(p not in ['.','..','']for p in relative)
            assert entry.isdir()or entry.isfile()
            assert entry.size<=1024**2
            p=destination.joinpath(*relative)
            p.parent.mkdir(parents=True,exist_ok=True)
            if entry.isdir():p.mkdir(exist_ok=True);p.chmod(0o755);os.chown(p,1000,1000)
            else:
                body=archive.extractfile(entry).read();assert len(body)==entry.size
                totals+=len(body);assert totals<=16*1024**2
                with p.open('xb')as f:f.write(body)
                p.chmod(0o444);os.chown(p,1000,1000);count+=1
            for parent in [p.parent,*p.parent.parents]:
                if parent==root:break
                assert not parent.is_symlink();parent.chmod(0o755);os.chown(parent,1000,1000)
        actual=json.loads((destination/'package.json').read_bytes());assert actual['version']==meta['version']
        proof.append({'path':key,'version':meta['version'],'archiveSha512':meta['integrity'],'files':count})
    return{'packageCount':len(proof),'extractedBytes':totals,'lifecycleScriptsExecuted':False,'packages':proof}
