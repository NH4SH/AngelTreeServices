import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here=dirname(fileURLToPath(import.meta.url)), root=resolve(here,'../..'), artifact=join(here,'artifact-v1');
const sha=value=>createHash('sha256').update(value).digest('hex');
const md5=value=>createHash('md5').update(value).digest('hex');
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const manifest=await json(join(artifact,'DERIVATION_MANIFEST.json'));
const expectedManifest='5f4bba9b28c483c15cb1e35736718b766de8f6ef1145c69f04517d4b2a3ae373';
function inverse(bytes,spans){const parts=[];let cursor=0;for(const span of spans){
 assert.ok(Number.isSafeInteger(span.outputStart)&&span.outputStart>=cursor&&span.outputEnd>=span.outputStart);
 assert.equal(bytes.subarray(span.outputStart,span.outputEnd).toString(),span.to);
 parts.push(bytes.subarray(cursor,span.outputStart),Buffer.from(span.from));cursor=span.outputEnd;
}return Buffer.concat([...parts,bytes.subarray(cursor)]);}
test('trusted manifest and all701CRM/elevenSQL source/output hashes and exact inverse hold',async()=>{
 assert.equal(sha(await readFile(join(artifact,'DERIVATION_MANIFEST.json'))),expectedManifest);
 assert.equal(manifest.crmSourceFiles,701);assert.equal(manifest.sqlUnitCount,11);
 assert.equal(manifest.files.filter(f=>f.coverage==='prior14').length,14);
 assert.equal(manifest.files.filter(f=>f.coverage==='new9').length,9);
 for(const f of manifest.files){
  const original=await readFile(f.source),output=await readFile(join(artifact,f.output));
  assert.equal(sha(original),f.sourceSha256,f.source);assert.equal(sha(output),f.outputSha256,f.output);
  assert.deepEqual(inverse(output,f.spans),original,f.output);assert.equal(f.inverseSha256,f.sourceSha256);
  let end=0;for(const span of f.spans){assert.ok(span.sourceStart>=end);end=span.sourceEnd;assert.equal(original.subarray(span.sourceStart,end).toString(),span.from);}
 }
});
test('all seven narrowly scoped DB literals bind the actual target; owner/operator names stay exact',async()=>{
 const units=manifest.files.filter(f=>f.kind==='sql-review-only');
 const spans=units.flatMap(f=>f.spans.filter(s=>s.kind.startsWith('exact-')));
 assert.equal(spans.length,7);assert.ok(spans.every(s=>s.to.includes('ats_firewood_acceptance_c6f62a2c0f61')));
 const native=await readFile(join(artifact,'sql/website-native-access.sql.review-only.txt'),'utf8');
 assert.match(native,/OWNER TO supabase_admin/u);assert.match(native,/SESSION_USER NOT IN \('ats_firewood_acceptance_request_c6f62a2c0f61','ats_firewood_acceptance_worker_c6f62a2c0f61','ats_firewood_acceptance_health_c6f62a2c0f61'\)/u);
 assert.doesNotMatch(native,/CREATE ROLE ats_firewood_(?:request|worker|health)\b/u);
 const receipt=await readFile(join(artifact,'sql/receipt-admission.sql.review-only.txt'),'utf8');
 assert.match(receipt,/pg_get_userbyid\(before_owner\)<>'postgres'/u);
 assert.match(receipt,/'postgres=X\/postgres','service_role=X\/postgres'/u);
});
test('dependent getter and twice-inserted claim MD5 guards bind derived bodies',async()=>{
 const p=await json(join(artifact,'SQL_FUNCTION_HASHES.json'));
 const doc=await readFile(join(artifact,'sql/document-accounting.sql.review-only.txt'),'utf8');
 assert.ok(doc.includes("from'"+p.derivedOfficeCollectorMd5+"'"));
 const body=doc.match(/as (\$\$)(.*?)\1;/su)?.[2];assert.ok(body);assert.equal(md5(body),p.derivedDocumentCollectorMd5);
 const receipt=await readFile(join(artifact,'sql/receipt-admission.sql.review-only.txt'),'utf8');
 assert.ok(receipt.includes("<> '"+p.derivedFinalClaimMd5+"'"));
 assert.ok(receipt.includes("<> '300389d99e9409f36610eaa971caee04'"));
 assert.equal(p.raw102ClaimMd5,'1900fbc1f487cd9847db7fdb32729e5a');
 assert.equal(p.unchangedFinishMd5,'aef215ac8c91811aefba30a8c1798583');
 assert.equal(p.claimGuardInsertionCount,2);assert.equal(p.computedOfflineNotNativeReadback,true);
});
test('business policy bytes and cross-profile signatures retain strict identities',async()=>{
 const old=await import(new URL('../../crm-runtime/source/src/lib/firewood/handoff/live-contract.mjs',import.meta.url));
 const derived=await import(new URL('./artifact-v1/crm-source/src/lib/firewood/handoff/live-contract.mjs',import.meta.url));
 assert.equal(derived.LIVE_TERMS_HASH,old.LIVE_TERMS_HASH);assert.equal(derived.LIVE_PAYMENT_POLICY_HASH,old.LIVE_PAYMENT_POLICY_HASH);
 assert.deepEqual(derived.LIVE_CATALOG,old.LIVE_CATALOG);assert.deepEqual(derived.LIVE_ACCEPTED_TERMS,old.LIVE_ACCEPTED_TERMS);
 const raw='{}',timestamp='1793376000',secret='synthetic_fixture_signing_secret_0123456789';
 const acceptance=derived.signLiveHandoff(raw,timestamp,secret,derived.LIVE_PREPARE_PATH);
 const production=old.signLiveHandoff(raw,timestamp,secret,old.LIVE_PREPARE_PATH);
 assert.notEqual(acceptance,production);
 assert.equal(derived.verifyLiveHandoffSignature({raw,timestamp,secret,path:derived.LIVE_PREPARE_PATH,signature:production,nowMs:Number(timestamp)*1000}),false);
 assert.equal(old.verifyLiveHandoffSignature({raw,timestamp,secret,path:old.LIVE_PREPARE_PATH,signature:acceptance,nowMs:Number(timestamp)*1000}),false);
 assert.throws(()=>derived.signLiveHandoff(raw,timestamp,secret,old.LIVE_PREPARE_PATH));
});
test('five runtime modes remain null and production signed core/upstream bytes remain exact',async()=>{
 const context=await import(new URL('./artifact-v1/crm-source/src/lib/firewood/runtime-admission/released-context.mjs',import.meta.url));
 for(const mode of ['status','preparation','office','collection','sending'])assert.equal(context.readReleasedContext(mode),null);
 const files=manifest.files.filter(f=>f.output.includes('/runtime-admission/')&&!f.output.endsWith('/released-context.mjs'));
 assert.ok(files.length>=7);assert.ok(files.every(f=>f.spans.length===0&&f.outputSha256===f.sourceSha256));
 const target=await json(join(artifact,'PHYSICAL_TARGET_ONLY.json'));
 assert.equal(target.databaseName,'ats_firewood_acceptance_c6f62a2c0f61');assert.equal(target.databaseOid,'23849');
 for(const key of ['nativeRoleOids','schemaFingerprint','releaseDigest','admissionBindingId','origins','signedTestAuthority','nativeProof'])assert.equal(target[key],null);
 for(const key of ['actualAdmission','runtimeLoadable','providerReady','activationAuthority'])assert.equal(target[key],false);
});
test('six API routes use acceptance locations and both native SQL review stops remain closed',async()=>{
 const routes=manifest.files.filter(f=>f.output.startsWith('crm-source/src/app/api/integrations/firewood/acceptance/')&&f.output.endsWith('/route.ts'));
 assert.equal(routes.length,6);assert.ok(routes.every(f=>f.spans.length===0));
 for(const name of ['public-boundary-rehome','website-native-access']){
  const text=await readFile(join(artifact,'sql/'+name+'.sql.review-only.txt'),'utf8');
  assert.match(text,/RAISE EXCEPTION 'Review artifact only; target-bound installer required\.'/u);
  assert.match(text,/ROLLBACK;/u);
 }
});
test('all changed JavaScript and TypeScript modules parse without executing a runtime',()=>{
 const files=manifest.files.filter(f=>f.spans.length&&/\.(?:mjs|ts)$/u.test(f.output)&&!f.output.endsWith('.d.mts'));
 for(const file of files){const args=['--experimental-strip-types','--check',join(artifact,file.output)];
  const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,file.output+'\n'+result.stderr);
 }
});
test('artifact has no untracked files or links',async()=>{
 const expected=new Set([...manifest.files.map(f=>f.output),'DERIVATION_MANIFEST.json','SQL_FUNCTION_HASHES.json','PHYSICAL_TARGET_ONLY.json']);
 async function walk(folder,prefix=''){for(const entry of await readdir(folder,{withFileTypes:true})){
  const name=prefix+entry.name;assert.equal(entry.isSymbolicLink(),false,name);
  if(entry.isDirectory())await walk(join(folder,entry.name),name+'/');else{assert.ok(entry.isFile());assert.ok(expected.delete(name),name);}
 }}await walk(artifact);assert.equal(expected.size,0);
});
test('new QA inventory permits only13 outer/stop adaptations and proves both inverse stages',async()=>{
 const inventoryPath=join(here,'QA_ELEVEN_UNIT_INVENTORY.v1.json');
 assert.equal(sha(await readFile(inventoryPath)),'c6128617c66f3f3a935ec6193aaec91beda43d30a6a950e97545de8f1713275b');
 const inventory=await json(inventoryPath),proof=await json(join(here,'QA_INVENTORY_ADAPTATION_PROOF.v1.json'));
 assert.equal(inventory.units.length,11);assert.equal(proof.adaptationSpanCount,13);assert.equal(proof.reviewStopSpanCount,2);
 assert.equal(inventory.protectedPostimageTableNames.length,200);assert.equal(inventory.capturePostimageTableNames.length,201);
 assert.equal(inventory.protectedPostimageTableNames.filter(n=>n.startsWith('app_private.fwofficeacceptance_')).length,15);
 for(const unit of inventory.units){
  const derived=await readFile(unit.path);assert.equal(sha(derived),unit.sha256);
  const p=proof.units.find(p=>p.unit===unit.unit);const parts=[];let cursor=0;
  for(const s of p.adaptationProbeSpans){parts.push(derived.subarray(cursor,s.sourceStart),Buffer.from(s.to));cursor=s.sourceEnd;}
  const probe=Buffer.concat([...parts,derived.subarray(cursor)]);assert.equal(sha(probe),p.inMemoryAdaptationProbeSha256);
  const restored=inverse(probe,p.adaptationProbeSpans);assert.deepEqual(restored,derived);
  assert.equal(sha(inverse(restored,p.derivationSpans)),p.canonicalSha256);
  for(const s of unit.adaptationSpans)assert.ok(s.kind==='outer-transaction-control-only'||s.old.startsWith('DO $review_only$'));
 }
});
