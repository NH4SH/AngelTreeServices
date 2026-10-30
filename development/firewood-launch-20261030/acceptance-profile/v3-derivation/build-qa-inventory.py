"""Offline inventory for Root's new QA renderer fork. Never emits executable SQL."""
from pathlib import Path
import hashlib,json,base64

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
ARTIFACT=HERE/'artifact-v1'
def sha(data):return hashlib.sha256(data).hexdigest()
def read(path,pin):
    assert path.is_file() and not path.is_symlink()
    data=path.read_bytes();assert sha(data)==pin,str(path);return data
def load(path,pin):return json.loads(read(path,pin))
def dump(path,value):
    with path.open('x') as out:json.dump(value,out,indent=2);out.write('\n')
manifest_pin='5f4bba9b28c483c15cb1e35736718b766de8f6ef1145c69f04517d4b2a3ae373'
canonical_pin='ab5e35caef37e40a9a16788e9a5fe0f8d65a04a82f807713666584d450c0a113'
manifest=load(ARTIFACT/'DERIVATION_MANIFEST.json',manifest_pin)
canonical=load(ROOT/'installation-plan/FINAL_ELEVEN_UNIT_INVENTORY_UNBOUND.json',canonical_pin)
entries={f['unit']:f for f in manifest['files'] if f['kind']=='sql-review-only'}
assert len(entries)==11
def inverse(data,spans):
    parts=[];at=0
    for span in spans:
        assert span['outputStart']>=at
        assert data[span['outputStart']:span['outputEnd']]==span['to'].encode()
        parts.extend([data[at:span['outputStart']],span['from'].encode()]);at=span['outputEnd']
    return b''.join(parts+[data[at:]])
def output_boundary(position,spans):
    delta=0
    for span in spans:
        if position<span['sourceStart']:return position+delta
        if position==span['sourceStart']:return span['outputStart']
        assert not span['sourceStart']<position<span['sourceEnd'],'Boundary inside identity replacement'
        if position==span['sourceEnd']:return span['outputEnd']
        delta=span['outputEnd']-span['sourceEnd']
    return position+delta
units=[];proofs=[]
for original in canonical['units']:
    entry=entries[original['unit']]
    derived_path=ARTIFACT/entry['output']
    derived=read(derived_path,entry['outputSha256'])
    source=read(Path(original['path']),original['sha256'])
    assert inverse(derived,entry['spans'])==source
    adaptations=[];preserved=[]
    for span in original['adaptationSpans']:
        assert source[span['sourceStart']:span['sourceEnd']]==span['old'].encode()
        start=output_boundary(span['sourceStart'],entry['spans'])
        end=output_boundary(span['sourceEnd'],entry['spans'])
        translated={'sourceStart':start,'sourceEnd':end,'old':derived[start:end].decode(),
          'canonicalSourceStart':span['sourceStart'],'canonicalSourceEnd':span['sourceEnd']}
        if span.get('kind')=='outer-transaction-control-only' or (original['unit'] in ['public-boundary-rehome','website-native-access'] and span['old'].startswith('DO $review_only$')):
            translated['kind']='outer-transaction-control-only' if span.get('kind')=='outer-transaction-control-only' else 'replace-only-with-reviewed-exact-target-predicate'
            assert translated['old']==span['old']
            adaptations.append(translated)
        else:
            translated['kind']='preserve-derived-review-predicate-no-renderer-adaptation'
            preserved.append(translated)
    adaptations.sort(key=lambda s:s['sourceStart'])
    # Exercise variable-length adaptation/inversion only in memory. The two
    # inert comment replacements below are NOT admission predicates or SQL output.
    parts=[];probe_spans=[];cursor=0;output_cursor=0
    for span in adaptations:
        assert span['sourceStart']>=cursor
        prefix=derived[cursor:span['sourceStart']];parts.append(prefix);output_cursor+=len(prefix)
        replacement=b'' if span['kind']=='outer-transaction-control-only' else ('/* OFFLINE INVERSION PROBE: '+original['unit']+'; NO EXECUTION AUTHORITY */\n').encode()
        proof={'sourceStart':span['sourceStart'],'sourceEnd':span['sourceEnd'],'outputStart':output_cursor,
          'outputEnd':output_cursor+len(replacement),'from':span['old'],'to':replacement.decode()}
        probe_spans.append(proof);parts.append(replacement);output_cursor+=len(replacement);cursor=span['sourceEnd']
    probe=b''.join(parts+[derived[cursor:]])
    restored=inverse(probe,probe_spans)
    assert restored==derived and inverse(restored,entry['spans'])==source
    units.append({'unit':original['unit'],'path':str(derived_path),'bytes':len(derived),'sha256':sha(derived),
      'origin':'actual-v3-offline-acceptance-identity-derivation', 'canonicalPath':original['path'],
      'canonicalSha256':original['sha256'],'derivationManifestSha256':manifest_pin,
      'adaptationSpans':adaptations,'preservedReviewPredicates':preserved})
    proofs.append({'unit':original['unit'],'canonicalSha256':sha(source),'derivedSha256':sha(derived),
      'inMemoryAdaptationProbeSha256':sha(probe),'adaptationInverseSha256':sha(restored),
      'canonicalInverseSha256':sha(inverse(restored,entry['spans'])),
      'adaptationProbeSpans':probe_spans,'derivationSpans':entry['spans'],
      'adaptationInverseExact':True,'derivationInverseExact':True,
      'probeIsNotRenderedSql':True,'targetPredicateAssigned':False,'sqlExecuted':False})
assert sum(len(u['adaptationSpans']) for u in units)==13
assert sum(s['kind']=='replace-only-with-reviewed-exact-target-predicate' for u in units for s in u['adaptationSpans'])==2
owners_bytes=(ARTIFACT/'OWNER_POSTIMAGE_MATRIX.review-only.json').read_bytes()
owners=json.loads(owners_bytes)
assert len(owners['newTables'])==25 and len(owners['newRoutines'])==52
names=load(ROOT/'native-full-baseline/V3_APPROVED_NAMED_SOURCE_INVENTORY.json','6a3eb5fe2b19d793f62de4069af2d0c55e5556a621f34279fb8dd3ba91e2415a')
post_protected=sorted(names['protectedTableNames']+[t['name'] for t in owners['newTables']])
post_capture=sorted(names['captureTableNames']+[t['name'] for t in owners['newTables']])
assert len(post_protected)==len(set(post_protected))==200
assert len(post_capture)==len(set(post_capture))==201
inventory={'kind':'acceptance-v3-eleven-unit-qa-source-inventory-v1','state':'ACTUAL_PHYSICAL_TARGET_ONLY_NOT_ADMISSION',
 'purpose':'Root-owned-new-QA-renderer-fork-only; source inventory is not an installer',
 'unitCount':11,'units':units,'canonicalInventorySha256':canonical_pin,'derivationManifestSha256':manifest_pin,
 'actualPhysicalTargetEvidenceSha256':manifest['sourcePins']['target'],
 'actualPhysicalTarget':{'database':'ats_firewood_acceptance_c6f62a2c0f61','databaseOid':'23849',
  'systemIdentifier':'7702496746553905162','markerId':'5b7af2eb-9889-4663-8992-8560982248fb',
  'purpose':'ats-firewood-acceptance-v1','comment':'ats-firewood-acceptance-v1:5b7af2eb-9889-4663-8992-8560982248fb:synthetic-only'},
 'baseline':{'protectedTables':175,'businessFunctions':265,'originalGuards':525,'roles':31,
   'genericClaimMd5':'1900fbc1f487cd9847db7fdb32729e5a','finishMd5':'aef215ac8c91811aefba30a8c1798583',
   'sourceMigrationCount':102,'projectedLedgerMd5':'08f17da6104684ddd835735c7256ab16'},
 'protectedBaselineTables':175,'protectedNewTables':25,'protectedPostimageTables':200,
 'captureBaselineTables':176,'capturePostimageTables':201,'newGuardTriplets':25,'newGuardTriggers':75,
 'protectedPostimageTableNames':post_protected,'capturePostimageTableNames':post_capture,
 'baselineNamedInventorySha256':'6a3eb5fe2b19d793f62de4069af2d0c55e5556a621f34279fb8dd3ba91e2415a',
 'newBusinessOwners':'postgres-after-explicit-owner-transfer','nativeHelperOwnerExceptions':canonical['nativeHelperOwnerExceptions'],
 'derivedOwnerMatrix':{'path':str(ARTIFACT/'OWNER_POSTIMAGE_MATRIX.review-only.json'),'sha256':sha(owners_bytes)},
 'nativeRoles':{k:'ats_firewood_acceptance_'+k+'_c6f62a2c0f61' for k in ['request','worker','health']},
 'reviewGucs':['ats.firewood_acceptance_review','ats.firewood_acceptance_doc_review','ats.firewood_acceptance_receipt_review'],
 'registeredNativeProof':None,'admissionBinding':None,'signedTestAuthority':None,'qaTargetBinding':None,
 'productionTargetBinding':None,'admissionAssigned':False,'sqlRendered':False,'sqlExecuted':False,
 'runtimeLoadable':False,'providerReady':False,'productionChanged':False}
for exception in inventory['nativeHelperOwnerExceptions']:
    exception['signature']=exception['signature'].replace('fwofficev2_','fwofficeacceptance_')
dump(HERE/'QA_ELEVEN_UNIT_INVENTORY.v1.json',inventory)
proof={'kind':'derived-qa-inventory-two-stage-inverse-proof','derivationManifestSha256':manifest_pin,
 'qaInventorySha256':sha((HERE/'QA_ELEVEN_UNIT_INVENTORY.v1.json').read_bytes()),
 'adaptationUnits':11,'adaptationSpanCount':13,'outerControlSpanCount':11,'reviewStopSpanCount':2,
 'sourceReviewGucsPreserved':True,'targetPredicateAssigned':False,'sqlRendered':False,'sqlExecuted':False,'units':proofs}
dump(HERE/'QA_INVENTORY_ADAPTATION_PROOF.v1.json',proof)
print(json.dumps({'inventorySha256':proof['qaInventorySha256'],'adaptationProofSha256':sha((HERE/'QA_INVENTORY_ADAPTATION_PROOF.v1.json').read_bytes()),
 'units':11,'adaptationSpans':13,'outerControls':11,'reviewStops':2,'twoStageInverse':True,'sqlExecuted':False}))
