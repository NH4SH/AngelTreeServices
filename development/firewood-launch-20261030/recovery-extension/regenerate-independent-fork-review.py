"""Local source/proof inventory only. No target, provider, key or runtime action."""
from pathlib import Path
import base64
import difflib
import hashlib
import json
import shutil

root=Path(__file__).resolve().parent
source=root/'candidate-source'
base_manifest=json.loads((root/'BASE_HELPER_CLOSURE.json').read_bytes())
base=Path(base_manifest['sourceRoot'])
sha=lambda data:hashlib.sha256(data).hexdigest()
serialize=lambda data:(json.dumps(data,indent=2)+'\n').encode()

history=root/'history-before-independent-fixes'
history.mkdir(exist_ok=True)
for name in ['SOURCE_FORK_SPAN_MANIFEST.json','CANDIDATE_INTEGRATION_RESULTS.tap','CANDIDATE_TEST_RESULTS.tap','CANDIDATE_SYNTHETIC_CONFIG_PROOF.json']:
    if (root/name).is_file() and not (history/name).exists():
        shutil.copyfile(root/name,history/name)

changes=[]
for row in base_manifest['files']:
    before=(base/row['name']).read_bytes()
    after=(source/row['name']).read_bytes()
    assert sha(before)==row['sha256']
    if before==after:
        continue
    spans=[]
    for action,i,j,k,l in difflib.SequenceMatcher(None,before,after,autojunk=False).get_opcodes():
        if action=='equal':
            continue
        spans.append({'sourceStart':i,'sourceEnd':j,'candidateStart':k,'candidateEnd':l,
                      'beforeBase64':base64.b64encode(before[i:j]).decode(),
                      'afterBase64':base64.b64encode(after[k:l]).decode()})
    at=0
    restored=[]
    for span in spans:
        assert after[span['candidateStart']:span['candidateEnd']]==base64.b64decode(span['afterBase64'],validate=True)
        restored += [after[at:span['candidateStart']],base64.b64decode(span['beforeBase64'],validate=True)]
        at=span['candidateEnd']
    restored.append(after[at:])
    assert b''.join(restored)==before
    changes.append({'name':row['name'],'baseSha256':sha(before),'candidateSha256':sha(after),
                    'spans':spans,'inverseByteExact':True})

original_names={row['name']for row in base_manifest['files']}
files=[]
for file in sorted(source.iterdir()):
    if file.name=='node_modules':
        assert file.is_dir()  # Local dependency cache is never a source input.
        continue
    assert file.is_file() and not file.is_symlink()
    data=file.read_bytes()
    files.append({'name':file.name,'bytes':len(data),'sha256':sha(data)})
span_manifest={'kind':'offline-recovery-source-fork-v2-byte-spans','baseFiles':len(original_names),
               'candidateFiles':len(files),'changedFiles':len(changes),'changes':changes,
               'newFiles':[row for row in files if row['name']not in original_names],
               'baseAll54StillExact':True,'actualInstallation':False,'runtimeAuthority':False}
(root/'SOURCE_FORK_SPAN_MANIFEST.json').write_bytes(serialize(span_manifest))
closure={'kind':'independent-recovery-candidate-public-source-closure-v1','files':files,
         'fileCount':len(files),'sourceOnly':True,'privateMaterialIncluded':False,
         'dependencyCacheExcluded':True,
         'state':'UNBOUND-not-installable','productionChanged':False}
(root/'SOURCE_FORK_CLOSURE.json').write_bytes(serialize(closure))
print(json.dumps({'changedFiles':len(changes),'candidateFiles':len(files),
                  'spanManifestSha256':sha(serialize(span_manifest)),
                  'closureSha256':sha(serialize(closure)),
                  'baseFilesPreserved':len(original_names),'targetOperations':0}))
