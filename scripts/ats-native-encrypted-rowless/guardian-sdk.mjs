// Owned rowless ARM fixture: actual locked journal + SQL COMMIT + atomic
// publication + ordinary SDK transaction. Host/storage custody is a fixture,
// so this does not authorize an original Mac installation or test a VM reboot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { openGuardianJournal } from './guardian-custody.mjs';
import { openActivePublisher } from './active-publication.mjs';
import { guardianTick, GuardianTickError } from './operation-guardian.mjs';
import { createNativeDatabase } from './current-website-candidate/scripts/firewood-checkout/release/database.mjs';
import { FIXED_RELEASE } from './current-website-native-candidate/runtime-admission/released-context-core.mjs';
import { NATIVE_CONTEXT_SQL, validateVerifierBinding, combineNativeAdmission } from './current-website-native-candidate/native-proof-core.mjs';
import { validateConstructorPreflight } from './current-website-native-candidate/native-preflight-core.mjs';

assert.equal(process.platform,'linux');assert.equal(process.arch,'arm64');
assert.equal(process.version,'v22.23.4');assert.equal(process.getuid(),1000);
const status=fs.readFileSync('/proc/self/status','utf8');
assert.match(status,/^CapEff:\s+0+$/mu);assert.match(status,/^NoNewPrivs:\s+1$/mu);
const input=JSON.parse(fs.readFileSync(process.argv[2]));
assert.equal(input.kind,'ats-owned-rowless-native-sdk-input-v1');
assert.match(input.guardianRoot,/^\/run\/ats-native-sdk-owned-[a-f0-9]{16}\/guardian-custody$/u);
assert.equal(input.publicRoot,input.guardianRoot+'/public');
assert.match(input.socketDirectory,/^\/run\/ats-native-sdk-socket-[a-f0-9]{16}$/u);
const sha=b=>createHash('sha256').update(b).digest('hex');
const bindingBytes=fs.readFileSync(input.publicRoot+'/binding.json');
const binding=JSON.parse(bindingBytes);
assert.equal(sha(bindingBytes),input.guardianBindingSha256);
const journal=openGuardianJournal({root:input.guardianRoot,uid:1000,expectedInstallationSha256:input.guardianInstallationSha256});
const publisher=openActivePublisher({root:input.publicRoot,uid:1000,journal});
const options={host:input.socketDirectory,port:55433,database:'postgres',max:1,
  connectionTimeoutMillis:1000,statement_timeout:1000,idle_in_transaction_session_timeout:2000};
const operator=new Pool({...options,user:'supabase_admin'}),pools=[],checks=[];
const clock=()=>({wallMs:Date.now(),bootMs:Number(fs.readFileSync('/proc/uptime','utf8').split(' ')[0])*1000,
  bootId:fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim()});
const stateSql=`SELECT jsonb_build_object('admissionProtocol',availability_policy,'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'databaseBoot',database_started_at::text,'leaseEpoch',epoch::text,'nodeIdentity',local_node,'topologyFingerprint',topology_fingerprint,'operationObservedAtMs',floor(extract(epoch FROM local_operation_observed_at)*1000)::bigint,'leaseIssuedAtMs',floor(extract(epoch FROM issued_at)*1000)::bigint,'expiresAtMs',floor(extract(epoch FROM expires_at)*1000)::bigint) AS operation FROM hosting_guard.state WHERE singleton`;
let loseCommitAcknowledgement=false,holdAfterCommit=false,losePublicationReadback=false;
const ports={
  async assertNoOperatorHold(){
    assert(!fs.existsSync(input.publicRoot+'/fenced.latch'));
    const r=await operator.query('SELECT capture_in_progress AS held FROM hosting_guard.state WHERE singleton');
    assert.equal(r.rows.length,1);assert.equal(r.rows[0].held,false);
  },
  async verifySourceRelease(){
    assert(fs.readFileSync(input.publicRoot+'/binding.json').equals(bindingBytes));
    const r=await operator.query('SELECT hosting_guard.catalog_fingerprint() AS topology');
    assert.equal(r.rows[0].topology,binding.topology);
  },
  async observeOriginalInstallation(){
    const r=await operator.query("SELECT (SELECT system_identifier::text FROM pg_control_system()) AS sid,pg_postmaster_start_time()::text AS boot,pg_current_wal_lsn()::text AS wal");
    assert.equal(r.rows[0].sid,binding.systemIdentifier);
    const {kind,...installation}=journal.installation;
    return{...installation,nativeWalLsn:r.rows[0].wal,observedAtMs:Date.now(),databaseBoot:r.rows[0].boot,sourceBoot:clock().bootId};
  },
  observeClock:async()=>clock(),
  async renewCommitted(args){
    const c=await operator.connect();
    try{
      await c.query('BEGIN');
      await c.query("SET LOCAL lock_timeout='100ms'");
      await c.query('SELECT hosting_guard.renew_local_primary_operation($1,$2,$3::timestamptz,$4)',
        [args.epoch,args.holder,args.databaseBoot,args.topology]);
      const row=(await c.query(stateSql)).rows[0].operation;
      await c.query('COMMIT');
      if(holdAfterCommit)await c.query('UPDATE hosting_guard.state SET capture_in_progress=true WHERE singleton');
      if(loseCommitAcknowledgement)throw Error('Owned fixture deliberately withholds successful COMMIT acknowledgement');
      return{committed:true,row};
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  },
  publishActive:async bytes=>publisher.publish(bytes),
  readActive:async()=>{if(losePublicationReadback)throw Error('Owned fixture deliberately withholds publication readback');return publisher.read();},
};
const tick=()=>guardianTick({bindingBytes,journal,ports});
function verifierBinding(role){return{database:'postgres',schema:'app_private',profile:'production-live',role,
  systemIdentifier:binding.systemIdentifier,releaseSha256:input.releaseSha256,schemaSha256:input.schemaSha256,
  liveKeyId:'fixture_master_key',officeKeyId:'fixture_master_key',admissionProtocol:'local-primary-operation-v1',
  primaryBindingSha256:input.guardianBindingSha256,primaryInstallationId:input.primaryInstallationId};}
function descriptor(role){const{role:_,...b}=verifierBinding(role);return{version:2,bindingPolicy:'local-primary-operation-v1',
  profile:'production-live',sourceId:FIXED_RELEASE.source,environmentId:FIXED_RELEASE.environment,accountId:FIXED_RELEASE.account,
  mode:'live',origin:FIXED_RELEASE.websiteOrigin,roles:{web:'ats_firewood_request',worker:'ats_firewood_worker'},binding:b};}
function context(mode){
  const a=JSON.parse(publisher.read()),now=clock();
  assert.equal(a.sourceBoot,now.bootId);assert(now.wallMs<a.expiresAtMs&&now.bootMs<a.expiresAtBootMs);
  return{...FIXED_RELEASE,mode,namespace:a.namespace,generation:a.generation,sourceId:'ats_crm_primary_20261029',
    systemIdentifier:a.systemIdentifier,sourceBoot:a.sourceBoot,databaseBoot:a.databaseBoot,databaseStartedAtMs:Date.parse(a.databaseBoot),
    topologyFingerprint:a.topologyFingerprint,timeline:1,bindingSha256:a.bindingSha256,schemaSha256:input.schemaSha256,
    releaseSha256:input.releaseSha256,installationOverlaySha256:'e'.repeat(64),signingKeyId:'fixture_master_key',
    signingKeyFingerprint:'f'.repeat(64),stripeKeyFingerprint:'1'.repeat(64),
    modes:{status:true,preparation:true,office:true,collection:true,sending:true},admissionProtocol:'local-primary-operation-v1',
    primaryInstallationId:a.primaryInstallationId,operationSequence:a.operationSequence,operationObservedAtMs:a.observedAtMs,
    operationObservedBootMs:a.observedMonotonicMs,operationAgeMs:Math.ceil(Math.max(now.wallMs-a.observedAtMs,now.bootMs-a.observedMonotonicMs)),
    observedAtMs:now.wallMs,observedMonotonicMs:now.bootMs,
    expiresAtMs:Math.min(a.expiresAtMs,Math.floor(now.wallMs+a.expiresAtBootMs-now.bootMs))};
}
async function database(role){
  const pool=new Pool({...options,user:role});pools.push(pool);pool.on('error',()=>{});
  return createNativeDatabase({pool,binding:verifierBinding(role),prepareAdmission:required=>Object.fromEntries(required.map(mode=>{
    const d=descriptor(role),expected=validateVerifierBinding({descriptor:d,role:role==='ats_firewood_worker'?'worker':'web',mode,binding:verifierBinding(role)});
    validateConstructorPreflight(expected,d,context('status'),Date.now());
    return[mode,async tx=>{const before=context(mode),r=await tx.query(NATIVE_CONTEXT_SQL),after=context(mode);
      assert.equal(r.rows.length,1);return combineNativeAdmission({expected,before,native:r.rows[0].proof,after,nowMs:Date.now()});}];
  }))});
}
const proof={kind:'ats-owned-native-guardian-sql-sdk-proof-v1',productionChanged:false,realSqlAndCommit:true,
  actualDurableJournalAndAtomicPublisher:true,actualKernelLock:true,actualBootClock:true,
  hostStorageIdentityIsFixture:true,fixedRootlessReaderIntegrated:false,originalMacGuardianAccepted:false,
  trueVmRebootTested:false,providerCalls:0,checks};
try{
  const oldCapture=(await operator.query('SELECT capture_started_at::text AS captured FROM hosting_guard.state WHERE singleton')).rows[0].captured;
  assert(Date.now()-Date.parse(oldCapture)>24*60*60*1000);
  const first=await tick();assert.equal(first.operationSequence,1);assert.equal(journal.read().operationSequence,1);
  const a=JSON.parse(publisher.read()),operation=(await operator.query(stateSql)).rows[0].operation;
  assert.equal(a.observedAtMs,operation.operationObservedAtMs);assert.equal(a.expiresAtMs,operation.expiresAtMs);
  checks.push('Actual kernel-locked durable sequence, acknowledged native SQL COMMIT and atomic file publication share exact SQL time');
  const web=await database('ats_firewood_request'),worker=await database('ats_firewood_worker');
  assert.equal((await web.runInMode('office',()=>web.query('SELECT 42 AS answer'))).rows[0].answer,42);
  assert.equal((await worker.runInMode(['office','status'],()=>worker.query('SELECT 43 AS answer'))).rows[0].answer,43);
  checks.push('Real web and worker SDK transactions derive operation context from the actual published active bytes and match native SQL');
  const second=await tick();assert.equal(second.operationSequence,2);
  assert.equal((await web.query('SELECT 44 AS answer')).rows[0].answer,44);
  checks.push('A second committed guardian tick publishes a higher durable sequence and an existing SDK factory accepts the same installation');
  const previous=publisher.read(),sequence=journal.read().operationSequence;
  await operator.query('UPDATE hosting_guard.state SET capture_in_progress=true WHERE singleton');
  await assert.rejects(tick(),e=>e instanceof GuardianTickError&&e.stage==='operator-hold'&&e.sequenceReserved===null);
  assert.equal(journal.read().operationSequence,sequence);assert(publisher.read().equals(previous));
  await assert.rejects(web.query('SELECT 45 AS answer'),e=>e.code==='PT503');
  checks.push('Actual operator hold prevents reservation/publication and ordinary native SQL admission');
  await operator.query('UPDATE hosting_guard.state SET capture_in_progress=false WHERE singleton');
  loseCommitAcknowledgement=true;
  await assert.rejects(tick(),e=>e instanceof GuardianTickError&&e.stage==='native-sql-commit'&&e.sequenceReserved===sequence+1&&e.publicationOutcome==='not_attempted');
  loseCommitAcknowledgement=false;assert(publisher.read().equals(previous));
  assert.equal(journal.read().operationSequence,sequence+1);
  checks.push('A real successful COMMIT with deliberately withheld acknowledgement burns its sequence and publishes no new active bytes');
  const resumed=await tick();assert.equal(resumed.operationSequence,sequence+2);
  assert.equal((await web.query('SELECT 46 AS answer')).rows[0].answer,46);
  checks.push('The next acknowledged renewal uses a new durable sequence after an unknown COMMIT outcome');
  const beforeHold=publisher.read();holdAfterCommit=true;
  await assert.rejects(tick(),e=>e instanceof GuardianTickError&&e.publicationOutcome==='not_attempted'&&e.sequenceReserved===sequence+3);
  holdAfterCommit=false;assert(publisher.read().equals(beforeHold));
  await operator.query('UPDATE hosting_guard.state SET capture_in_progress=false WHERE singleton');
  checks.push('An actual SQL hold committed after lease COMMIT prevents publication during the post-commit custody check');
  losePublicationReadback=true;
  await assert.rejects(tick(),e=>e instanceof GuardianTickError&&e.stage==='independent-active-readback'&&e.publicationOutcome==='unknown');
  losePublicationReadback=false;
  assert.equal(JSON.parse(publisher.read()).operationSequence,journal.read().operationSequence);
  checks.push('Failed independent readback reports unknown publication after a real atomic write; it never reports absence');
  await tick();
  assert.equal((await worker.query('SELECT 47 AS answer')).rows[0].answer,47);
  assert.equal((await operator.query('SELECT capture_started_at::text AS captured FROM hosting_guard.state WHERE singleton')).rows[0].captured,oldCapture);
  checks.push('Web/worker admission recovers on a fresh committed operation while the historical two-day-old backup timestamp stays identical');
  proof.passed=true;
}catch(e){proof.passed=false;proof.errorType=e.name;proof.privateError=String(e.stack??e);}
finally{await Promise.allSettled(pools.map(p=>p.end()));await operator.end();proof.checksPassed=checks.length;console.log(JSON.stringify(proof));}
if(!proof.passed)process.exitCode=1;
