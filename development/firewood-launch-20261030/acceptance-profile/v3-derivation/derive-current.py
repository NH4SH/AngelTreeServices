"""Finite-span offline CRM/eleven-unit derivation. No DB, environment, key or provider access."""
from pathlib import Path
import base64, hashlib, json, re, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CRM = ROOT / 'crm-runtime/source'
WEB = Path('/Users/noelsierra/Documents/Codex/2026-10-16/files-pasted-by-the-user-you/outputs/firewood-checkout/launch-20261030/acceptance-offline-v1')
def digest(data, algo='sha256'): return hashlib.new(algo, data).hexdigest()
def read(path, expected=None):
    assert path.is_file() and not path.is_symlink(), str(path)
    data = path.read_bytes()
    if expected: assert digest(data) == expected, str(path)
    return data
def load(path, expected=None): return json.loads(read(path, expected))
def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as out: out.write(data)
def dump(path, value): write(path, (json.dumps(value, indent=2)+'\n').encode())

PINS = {
 'crm': 'cf6f065c4d42ef1fd299733be959e150135b9ff9d0c24334b23d252b0fa9d765',
 'oldLock': 'b278318e9ee804fd3ef63c3ed82e9ff96064a698c2fe1dd37c6d55a79d00b04e',
 'inventory': 'ab5e35caef37e40a9a16788e9a5fe0f8d65a04a82f807713666584d450c0a113',
 'target': 'a81e4e250c9d937c821492c7782047537d8216bf3eaac0d69a6ad37eef2987cb',
 'websiteChecklist': '6ba2ddfcae8f9c6e9cae26d9df8eacc2a4b000f96c2c20f3d965938ddda1d976',
 'capture': '1538ab0708299b169bdca1eb2dc323960e74f752bd1cb0fbd3dac3c146f9f2f9',
 'owners': '178e47b43683cd4005de3e53a31adfe8af8ea5b826e35ef87f106ce5abe01943',
}
target = load(ROOT/'acceptance-target/ACTUAL_TARGET_BASELINE.json', PINS['target'])
facts=target['facts']
assert target['actualPhysicalTarget'] and target['passed'] and not target['sourceSqlInstalled']
assert target['nativeProofAssigned'] is False and target['productionAdmission'] is False and target['containerStopped']
assert facts['databaseName'] == 'ats_firewood_acceptance_c6f62a2c0f61' and facts['databaseOid']=='23849'
assert facts['systemIdentifier']=='7702496746553905162' and facts['customerRows']==facts['invoiceRows']==facts['guardRows']==0
assert facts['databaseOwner']=='postgres' and facts['originalProtectedTables']==175 and facts['originalGuardTriggers']==525
assert facts['projectedLedgerMd5']=='08f17da6104684ddd835735c7256ab16'
load(WEB/'BOUND_INTERFACE_CHECKLIST.json', PINS['websiteChecklist'])
crm_manifest=load(ROOT/'crm-runtime/build/SNAPSHOT_SOURCE_MANIFEST.v3.json', PINS['crm'])
old=load(ROOT/'acceptance-profile/SOURCE_LOCK.json', PINS['oldLock'])
units=load(ROOT/'installation-plan/FINAL_ELEVEN_UNIT_INVENTORY_UNBOUND.json',PINS['inventory'])['units']
assert len(crm_manifest['files'])==701 and len(units)==11
db=facts['databaseName']; suffix=target['targetId']
roles={kind:'ats_firewood_acceptance_'+kind+'_'+suffix for kind in ['request','worker','health']}
portal='https://crm-firewood-acceptance.angeltreeservices.org'
website='https://firewood-acceptance.angeltreeservices.org'
rules=[
 ('contract','firewood-invoice-handoff-live-v1','firewood-invoice-handoff-acceptance-v1'),
 ('office-contract','firewood-office-live-v2','firewood-office-acceptance-v2'),
 ('source','website_firewood_invoice_live_v1','website_firewood_invoice_acceptance_v1'),
 ('environment','ats_firewood_live_v1','ats_firewood_acceptance_v1'),
 ('account','acct_1Tv92EI7tY6VHUvU','acct_1UU9U8RAZXGe6tX0'),
 ('financial-api','/api/integrations/firewood/live/v1','/api/integrations/firewood/acceptance/v1'),
 ('office-api','/api/integrations/firewood/live/v2/office','/api/integrations/firewood/acceptance/v2/office'),
 ('financial-hmac','ATS-FIREWOOD-LIVE-V1','ATS-FIREWOOD-ACCEPTANCE-V1'),
 ('office-hmac','ATS-FIREWOOD-OFFICE-LIVE-V2','ATS-FIREWOOD-OFFICE-ACCEPTANCE-V2'),
 ('sql-rpc-namespace','firewood_live_','firewood_acceptance_'),
 ('website-storage','fwofficev2_','fwofficeacceptance_'),
 ('request-role','ats_firewood_request',roles['request']),
 ('worker-role','ats_firewood_worker',roles['worker']),
 ('health-role','ats_firewood_health',roles['health']),
 ('order-lock','firewood-live-v1-order:','firewood-acceptance-v1-order:'),
 ('office-lock','firewood-office-request:','firewood-office-acceptance-request:'),
 ('credit-row','firewood-credit:','firewood-acceptance-credit:'),
 ('portal-proposal','https://admin.angeltreeservices.org',portal),
 ('website-proposal','https://checkout.angeltreeservices.org',website),
 ('financial-review-sentinel','ats.firewood_live_review','ats.firewood_acceptance_review'),
 ('document-review-sentinel','ats.firewood_doc_review','ats.firewood_acceptance_doc_review'),
 ('receipt-review-sentinel','ats.firewood_receipt_review','ats.firewood_acceptance_receipt_review'),
]
mode_rules=[('mode',"'live'","'test'"),('mode-type','"live"','"test"'),
 ('livemode-json',"'livemode',true","'livemode',false"),
 ('livemode-check','.livemode === true','.livemode === false'),
 ('livemode-check','.livemode===true','.livemode===false'),
 ('livemode-check','.livemode !== true','.livemode !== false'),
 ('livemode-check','.livemode!==true','.livemode!==false'),
 ('livemode-parameter','livemode!==true','livemode!==false')]

def transform(data, choices):
    # Long complete identities take precedence over nested prefix candidates.
    # Every selected byte range is serialized. No replacement is performed by regex.
    candidates=[]
    for kind,old_value,new_value in choices:
        old_bytes=old_value.encode(); start=0
        while (at:=data.find(old_bytes,start))!=-1:
            candidates.append({'kind':kind,'sourceStart':at,'sourceEnd':at+len(old_bytes),'from':old_value,'to':new_value})
            start=at+len(old_bytes)
    selected=[]
    for span in sorted(candidates,key=lambda s:(-(s['sourceEnd']-s['sourceStart']),s['sourceStart'])):
        overlap=[s for s in selected if s['sourceStart']<span['sourceEnd'] and span['sourceStart']<s['sourceEnd']]
        if overlap:
            assert len(overlap)==1 and overlap[0]['sourceStart']<=span['sourceStart'] and span['sourceEnd']<=overlap[0]['sourceEnd'],span
            continue
        selected.append(span)
    selected.sort(key=lambda s:s['sourceStart'])
    out=[]; cursor=0; output_cursor=0
    for span in selected:
        prefix=data[cursor:span['sourceStart']]; out.append(prefix);output_cursor+=len(prefix)
        span['outputStart']=output_cursor;out.append(span['to'].encode());output_cursor+=len(span['to'].encode());span['outputEnd']=output_cursor
        cursor=span['sourceEnd']
    out.append(data[cursor:]); result=b''.join(out)
    assert inverse(result,selected)==data
    return result,selected
def inverse(data, spans):
    parts=[];cursor=0
    for span in spans:
        assert data[span['outputStart']:span['outputEnd']]==span['to'].encode()
        parts.extend([data[cursor:span['outputStart']],span['from'].encode()]);cursor=span['outputEnd']
    return b''.join(parts+[data[cursor:]])
def function_bodies(data):
    text=data.decode()
    pattern=r'\bcreate\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\((.*?)\)(.*?)\bas\s+(\$\w*\$)(.*?)\4'
    return [{'name':m[1].replace('"',''), 'argumentsSource':m[2], 'body':m[5], 'bodyMd5':digest(m[5].encode(),'md5'),
             'bodySha256':digest(m[5].encode())} for m in re.finditer(pattern,text,re.I|re.S)]
def unique_body(data,name):
    found=[f for f in function_bodies(data) if f['name']==name]
    assert len(found)==1,(name,len(found));return found[0]['body'].encode()

# Derive all SQL identities first; dependent function-hash guards are then
# computed from the exact new function bodies and inserted at separate spans.
raw_units={u['unit']:read(Path(u['path']),u['sha256']) for u in units}
sql_rules=rules+mode_rules+[
 ('exact-native-database',"pg_catalog.current_database() <> 'postgres'","pg_catalog.current_database() <> '"+db+"'"),
 ('exact-temp-database',"'postgres','TEMPORARY'","'"+db+"','TEMPORARY'"),
 ('exact-temp-grant','GRANT TEMPORARY ON DATABASE postgres TO %I','GRANT TEMPORARY ON DATABASE '+db+' TO %I'),
 ('exact-temp-revoke','REVOKE TEMPORARY ON DATABASE postgres FROM PUBLIC','REVOKE TEMPORARY ON DATABASE '+db+' FROM PUBLIC')]
stage1={name:transform(data,sql_rules)[0] for name,data in raw_units.items()}
office_old=unique_body(raw_units['office-workflows'],'public.get_firewood_live_collector_context')
office_new=unique_body(stage1['office-workflows'],'public.get_firewood_acceptance_collector_context')
assert digest(office_old,'md5')=='a47596d29b0150d2d1d56a02295a0c95'
getter_pre_md5=digest(office_new,'md5')
capture=load(ROOT/'native-full-baseline/ACTUAL_SCHEMA_CAPTURE_V3.1793368511595519000.private.json',PINS['capture'])
schema=base64.b64decode(capture['schemaBase64'])
assert digest(schema)==capture['schemaSha256']
raw_claim=unique_body(schema,'public.claim_outbound_delivery')
finish=unique_body(schema,'public.finish_outbound_delivery')
assert digest(raw_claim,'md5')=='1900fbc1f487cd9847db7fdb32729e5a'
assert digest(finish,'md5')=='aef215ac8c91811aefba30a8c1798583'
prereq=raw_units['payment-receipt-102'].decode()
anchor=re.search(r'anchor text:=\$anchor\$(.*?)\$anchor\$',prereq,re.S)[1].encode()
replacement=re.search(r'replacement text:=\$replacement\$(.*?)\$replacement\$',prereq,re.S)[1].encode()
assert raw_claim.count(anchor)==1
current=raw_claim.replace(anchor,replacement,1)
assert digest(current,'md5')=='300389d99e9409f36610eaa971caee04'
receipt=stage1['receipt-admission'].decode()
early=re.search(r'early text:=\$early\$(.*?)\$early\$',receipt,re.S)[1].encode()
late=re.search(r'late text:=\$late\$(.*?)\$late\$',receipt,re.S)[1].encode()
guard=re.search(r'guard text:=\$guard\$(.*?)\$guard\$',receipt,re.S)[1].encode()
assert current.count(early)==current.count(late)==1
claim_post=current.replace(early,early+guard,1).replace(late,guard+late,1)
assert claim_post.count(guard)==2 and claim_post.replace(guard,b'')==current
claim_post_md5=digest(claim_post,'md5')
extra_rules={
 'document-accounting':[('derived-getter-preimage-md5','a47596d29b0150d2d1d56a02295a0c95',getter_pre_md5)],
 'receipt-admission':[('derived-claim-postimage-md5','409f0e55cdc9a0075b1e4d42307a567d',claim_post_md5)]}

def main(output):
    output=output.resolve();assert output.parent==HERE and not output.exists()
    output.mkdir(mode=0o700)
    sources=[];sql_proof=[]
    old_paths={e['source'].removeprefix('crm/apps/platform/') for e in old['sources'] if e['type']=='module'}
    new_paths={
      'src/lib/firewood/handoff/protected-runtime.mjs','src/lib/firewood/handoff/collector-admission.mjs',
      'src/lib/firewood/handoff/receipt-source-gate.mjs','src/lib/firewood/handoff/collector-policy.ts',
      'src/lib/documents/firewood-invoice-accounting.mjs','src/lib/documents/firewood-invoice-accounting-server.ts',
      'src/lib/email/firewood-receipt-admission.ts','src/lib/firewood/office-command.ts','src/lib/firewood/office-workspace.ts'}
    assert len(old_paths)==14 and len(new_paths)==9
    selected=old_paths|new_paths
    type_paths={str(Path(p).with_suffix('.d.mts')) for p in selected if p.endswith('.mjs')}
    for entry in crm_manifest['files']:
        name=entry['path'];data=read(CRM/name,entry['sha256']);assert len(data)==entry['bytes']
        choices=[]
        if name in selected or name in type_paths:
            choices+=rules
            if name.endswith(('live-contract.mjs','live-profile.mjs','live-handler.mjs','live-collector.mjs','office-contract.mjs',
              'office-handler.mjs','protected-runtime.mjs','collector-admission.mjs','receipt-source-gate.mjs','firewood-invoice-accounting.mjs','.d.mts')):
                choices+=mode_rules
            if name.endswith(('live-profile.mjs','live-profile.d.mts')):
                choices += [('review-profile','firewood-live-v1-review','firewood-acceptance-v1-review-unbound'),('test-key-classifier','^rk_live_','^rk_test_')]
            if name.endswith(('live-collector.mjs','collector-admission.mjs','live-collector.d.mts','collector-admission.d.mts')):
                choices += [('collector-profile','firewood-live-v1','firewood-acceptance-v1')]
            if name.endswith('collector-admission.mjs'):
                choices += [('restricted-test-key','^rk_live_','^rk_test_')]
            if name.endswith('protected-runtime.mjs'):
                choices += [('private-metadata-namespace','/run/secrets/firewood_handoff.json','/run/acceptance-secrets/firewood_handoff.json')]
        if name=='src/lib/stripe/invoice-checkout.ts':
            choices += [('ach-identifier','ats_firewood_live_v1_ach_','ats_firewood_acceptance_v1_ach_')]
        # Explicit closed barriers are source adaptations, not identity changes.
        # Production signed-gate code and upstream validators are copied exact.
        if name=='src/lib/firewood/runtime-admission/released-context.mjs':
            choices += [('unbound-acceptance-barrier',"export function readReleasedContext(mode = 'status') {", "export function readReleasedContext(mode = 'status') {\n  return null; // Actual signed synthetic acceptance authority is not registered.\n")]
        if name=='src/lib/firewood/office-runtime.ts':
            choices += [('unbound-acceptance-barrier',"export function getFirewoodOfficeRuntime() { return readReleasedContext('office'); }", "export function getFirewoodOfficeRuntime() { return null; } // Actual acceptance authority absent.")]
        if name=='src/lib/firewood/handoff/protected-runtime.mjs':
            for signature in ['export function getProtectedLiveDependencies(mode, operation) {','export function getProtectedOfficeDependencies(operation) {']:
                choices += [('unbound-acceptance-barrier',signature,signature+'\n  return null; // Actual signed synthetic acceptance authority is not registered.\n')]
        result,spans=transform(data,choices)
        output_name=name
        if name.startswith('src/app/api/integrations/firewood/live/v1/') and name.split('/')[-2] in ['prepare','status','renew']:
            output_name=name.replace('/firewood/live/v1/','/firewood/acceptance/v1/',1)
        elif name.startswith('src/app/api/integrations/firewood/live/v2/office/'):
            output_name=name.replace('/firewood/live/v2/','/firewood/acceptance/v2/',1)
        write(output/'crm-source'/output_name,result)
        sources.append({'kind':'crm-source','source':str(CRM/name),'output':'crm-source/'+output_name,
          'sourceSha256':entry['sha256'],'outputSha256':digest(result),'bytes':len(data),'spans':spans,
          'inverseSha256':digest(inverse(result,spans)),'coverage':'prior14' if name in old_paths else 'new9' if name in new_paths else 'support-closure'})
    for u in units:
        name=u['unit'];data=raw_units[name];result,spans=transform(data,sql_rules+extra_rules.get(name,[]))
        out_name='sql/'+name+'.sql.review-only.txt';write(output/out_name,result)
        source_functions=function_bodies(data);derived_functions=function_bodies(result)
        assert len(source_functions)==len(derived_functions)
        functions=[{'sourceName':a['name'],'derivedName':b['name'],'argumentsSource':b['argumentsSource'],
          'sourceBodyMd5':a['bodyMd5'],'derivedBodyMd5':b['bodyMd5'],
          'sourceBodySha256':a['bodySha256'],'derivedBodySha256':b['bodySha256']} for a,b in zip(source_functions,derived_functions)]
        sources.append({'kind':'sql-review-only','unit':name,'source':u['path'],'output':out_name,
          'sourceSha256':u['sha256'],'outputSha256':digest(result),'bytes':len(data),'spans':spans,'inverseSha256':digest(inverse(result,spans))})
        sql_proof.append({'unit':name,'sourceSha256':u['sha256'],'derivedSha256':digest(result),'functions':functions,
          'reviewStopsPreserved':True,'executableAuthority':False})
    owners_path=ROOT/'installation-plan/OWNER_POSTIMAGE_MATRIX_UNBOUND.json'
    owners=read(owners_path,PINS['owners']);derived_owners,owner_spans=transform(owners,rules)
    write(output/'OWNER_POSTIMAGE_MATRIX.review-only.json',derived_owners)
    sources.append({'kind':'owner-inventory-review-only','source':str(owners_path),'output':'OWNER_POSTIMAGE_MATRIX.review-only.json',
      'sourceSha256':PINS['owners'],'outputSha256':digest(derived_owners),'bytes':len(owners),'spans':owner_spans,'inverseSha256':digest(inverse(derived_owners,owner_spans))})
    getter_post_md5=digest(unique_body((output/'sql/document-accounting.sql.review-only.txt').read_bytes(),'public.get_firewood_acceptance_collector_context'),'md5')
    hashes={'raw102ClaimMd5':digest(raw_claim,'md5'),'postReceipt102ClaimMd5':digest(current,'md5'),
      'unchangedFinishMd5':digest(finish,'md5'),'sourceOfficeCollectorMd5':digest(office_old,'md5'),
      'derivedOfficeCollectorMd5':getter_pre_md5,'derivedDocumentCollectorMd5':getter_post_md5,
      'sourceFinalClaimMd5':'409f0e55cdc9a0075b1e4d42307a567d','derivedFinalClaimMd5':claim_post_md5,
      'claimGuardInsertionCount':2,'removingDerivedClaimGuardRestoresPostReceipt102':True,
      'computedOfflineNotNativeReadback':True,'units':sql_proof}
    dump(output/'SQL_FUNCTION_HASHES.json',hashes)
    dump(output/'PHYSICAL_TARGET_ONLY.json',{'kind':'actual-physical-target-identity-only','sourceEvidenceSha256':PINS['target'],
      'databaseName':db,'databaseOid':facts['databaseOid'],'systemIdentifier':facts['systemIdentifier'],
      'markerId':'5b7af2eb-9889-4663-8992-8560982248fb','comment':facts['databaseComment'],'databaseOwner':'postgres',
      'nativeRoleNamesProposedNotCreated':roles,'nativeRoleOids':None,'schemaFingerprint':None,'releaseDigest':None,
      'admissionBindingId':None,'origins':None,'signedTestAuthority':None,'nativeProof':None,'actualAdmission':False,
      'runtimeLoadable':False,'providerReady':False,'activationAuthority':False})
    manifest={'kind':'actual-v3-offline-identity-derivation','version':1,'sourcePins':PINS,'crmSourceFiles':701,
      'oldModuleCoverage':14,'newModuleCoverage':9,'sqlUnitCount':11,'files':sources,
      'sourcePreserved':True,'inverseExact':True,'originsAreUnverifiedSourceProposals':True,
      'signedProductionGateCoreAndUpstreamPreserved':True,'explicitAcceptanceBarriersClosed':True,
      'sqlFilesAreReviewOnlyAndOriginalStopsRemain':True,'actualAdmission':False,'databaseExecuted':False,
      'credentialsRead':False,'providerCalls':False,'runtimeLoadable':False,'providerReady':False,'activationAuthority':False}
    dump(output/'DERIVATION_MANIFEST.json',manifest)
    print(json.dumps({'output':str(output),'manifestSha256':digest((output/'DERIVATION_MANIFEST.json').read_bytes()),
      'crm':701,'sql':11,'changedFiles':sum(bool(s['spans']) for s in sources),'identityAndBarrierSpans':sum(len(s['spans']) for s in sources),
      'hashes':{k:v for k,v in hashes.items() if k!='units'},'actualAdmission':False}))

if __name__=='__main__':
    assert len(sys.argv)==2,'Usage: derive-current.py <fresh-child-output>'
    main(Path(sys.argv[1]))
