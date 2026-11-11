// Real rootless mapping + installed closure/fixed reader + ordinary pg SDK.
// Uses only an empty owned database, fixture release and no provider secrets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Pool } from 'pg';
import { readReleasedContext } from '/release-admission/runtime-admission/released-context.mjs';
import { readReleaseDescriptor, readNativeProofAdapter, verifyInstalledSources,
  readMasterSigningIdentity } from './current-website-candidate/scripts/firewood-checkout/release/integrity.mjs';
import { createNativeDatabase } from './current-website-candidate/scripts/firewood-checkout/release/database.mjs';
assert.equal(process.platform,'linux');assert.equal(process.arch,'arm64');assert.equal(process.getuid(),1000);assert.equal(process.getgid(),1000);
const expected=process.argv[2];assert(['valid','denied'].includes(expected));
const st=fs.readFileSync('/proc/self/status','utf8');
assert.match(st,/^CapEff:\s+0+$/mu);assert.match(st,/^NoNewPrivs:\s+1$/mu);
assert.equal(fs.lstatSync('/').uid,0);assert.equal(fs.lstatSync('/').gid,0);
const boot=fs.lstatSync('/proc/sys/kernel/random/boot_id');assert.equal(boot.uid,expected==='valid'?65534:2);assert.equal(boot.gid,65534);
assert(!fs.existsSync('/admission/authority-public.pem'));assert(!fs.existsSync('/run/secrets'));
const descriptor=await readReleaseDescriptor();
await verifyInstalledSources('/app/current-website-candidate',descriptor);
const adapter=await readNativeProofAdapter(descriptor),context=readReleasedContext('status');
const pools=[],checks=['Actual installed52-file website source and13-file native source lock match through root-owned metadata'];
const result={kind:'ats-owned-guardian-rootless-reader-sdk-proof-v1',expected,productionChanged:false,
  actualRootlessMaps:true,actualReadonlyControlMounts:true,actualKernelProcfs:true,
  actualPublishedActiveFile:true,actualPinnedIntegrityLoader:true,realPgSql:true,
  productionCredentialsReceived:false,providerCalls:0,originalMacAuthorityAccepted:false,
  trueVmRebootTested:false,fullRootlessDockerDaemonTested:false,checks};
let poolConstructions=0;
function roleBinding(role){return{...descriptor.binding,role};}
function prepare(role){return required=>Object.fromEntries(required.map(mode=>[mode,adapter.createAdmissionVerifier({
  descriptor,role:role==='ats_firewood_worker'?'worker':'web',mode,binding:roleBinding(role),
})]));}
async function database(role){
  // Actual status and constructor gates must precede even Pool construction.
  const admission=prepare(role);admission(['status']);
  poolConstructions++;const pool=new Pool({host:'/sdk-socket',port:55433,database:'postgres',user:role,max:1,
    connectionTimeoutMillis:1000,statement_timeout:1000,idle_in_transaction_session_timeout:2000});
  pools.push(pool);pool.on('error',()=>{});
  return createNativeDatabase({pool,binding:roleBinding(role),prepareAdmission:admission});
}
try{
  if(expected==='denied'){
    assert.equal(context,null);
    await assert.rejects(database('ats_firewood_request'),/native_public_preflight_pending/);
    assert.equal(poolConstructions,0);
    checks.push('Actual unapproved kernel UID2 denies the installed public constructor before any Pool construction');
  }else{
    assert(context&&context.admissionProtocol==='local-primary-operation-v1');
    const active=JSON.parse(fs.readFileSync('/admission/active.json'));
    assert.equal(context.operationSequence,active.operationSequence);
    assert.equal(context.operationObservedAtMs,active.observedAtMs);
    assert.equal(context.primaryInstallationId,descriptor.binding.primaryInstallationId);
    const master=await readMasterSigningIdentity(descriptor);assert.equal(master.keyId,context.signingKeyId);
    checks.push('Actual rootless UID1000 reads genuine procfs overflow owners and the guardian-published file through read-only fixed paths');
    const web=await database('ats_firewood_request'),worker=await database('ats_firewood_worker');
    assert.equal((await web.runInMode('office',()=>web.query('SELECT 51 AS answer'))).rows[0].answer,51);
    assert.equal((await worker.runInMode(['office','status'],()=>worker.query('SELECT 52 AS answer'))).rows[0].answer,52);
    checks.push('Actual installed createAdmissionVerifier and ordinary web/worker SDK transactions match committed SQL against fixed filesystem contexts');
    await assert.rejects(web.transaction(tx=>tx.query('SET LOCAL ROLE supabase_admin')),e=>e.code==='42501');
    checks.push('Real rootless runtime retains ordinary SQL-role restrictions');
  }
  result.passed=true;
}catch(e){result.passed=false;result.errorType=e.name;result.privateError=String(e.stack??e);}
finally{await Promise.allSettled(pools.map(p=>p.end()));result.poolConstructions=poolConstructions;result.checksPassed=checks.length;console.log(JSON.stringify(result));}
if(!result.passed)process.exitCode=1;
