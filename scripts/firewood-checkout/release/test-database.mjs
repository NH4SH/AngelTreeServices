import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNativeDatabase,assertRuntimeDatabase} from './database.mjs';
const binding={profile:'production-live',database:'postgres',schema:'app_private',role:'ats_firewood_request',systemIdentifier:'7702329566697176992',releaseSha256:'a'.repeat(64),schemaSha256:'b'.repeat(64),recoveryBindingSha256:'c'.repeat(64),authorityPublicKeyFingerprint:'d'.repeat(64),liveKeyId:'website-live-20261030',officeKeyId:'website-office-20261030'};
const now=()=>1793336400000;
const proof=()=>({...binding,admitted:true,backupAgeMs:1000,expiresAtMs:now()+14000});
function fakePool(identity={database:binding.database,role:binding.role,schema:binding.schema}){const calls=[];return{calls,async connect(){return{async query(sql){calls.push(sql);return{rows:sql.startsWith('SELECT current_database')?[identity]:[]};},release(){calls.push('RELEASE');}};}};}
test('native adapter verifies actual connection identity and admission at both transaction boundaries',async()=>{
  const pool=fakePool(),db=await createNativeDatabase({pool,binding,verifyAdmission:async()=>proof(),now});
  assert.equal(assertRuntimeDatabase(db).kind,'native');assert.throws(()=>assertRuntimeDatabase({...db}),/bound_runtime_database_required/);
  pool.calls.length=0;await db.query('UPDATE fwofficev2_control SET paused=true');
  assert.equal(pool.calls[0],'BEGIN ISOLATION LEVEL READ COMMITTED');assert.equal(pool.calls.filter(x=>x.startsWith('SELECT current_database')).length,2);assert.ok(pool.calls.includes('COMMIT'));
});
test('wrong schema/role/database, physical identity, code/schema seal and stale recovery cannot admit a native adapter',async()=>{
  for(const change of [{schema:'public'},{role:'service_role'},{database:'other'}])await assert.rejects(createNativeDatabase({pool:fakePool({...binding,...change}),binding,verifyAdmission:async()=>proof(),now}),/native_database_identity_mismatch/);
  for(const change of [{systemIdentifier:'0000000000000000'},{releaseSha256:'c'.repeat(64)},{schemaSha256:'c'.repeat(64)},{recoveryBindingSha256:'e'.repeat(64)},{authorityPublicKeyFingerprint:'e'.repeat(64)},{admitted:false},{backupAgeMs:280000},{backupAgeMs:280001},{expiresAtMs:now()-1},{expiresAtMs:now()+14001}])
    await assert.rejects(createNativeDatabase({pool:fakePool(),binding,verifyAdmission:async()=>({...proof(),...change}),now}),/native_admission_pending/);
});
test('admission revoked after a write but before commit rolls back the complete transaction',async()=>{
  const pool=fakePool();let checks=0;const db=await createNativeDatabase({pool,binding,verifyAdmission:async()=>{checks++;return proof();},now});
  checks=0;let valid=true;const db2=await createNativeDatabase({pool,binding,verifyAdmission:async()=>({...proof(),admitted:valid}),now});
  pool.calls.length=0;await assert.rejects(db2.transaction(async tx=>{await tx.query('UPDATE fwofficev2_control SET paused=true');valid=false;}),/native_admission_pending/);
  assert.ok(pool.calls.includes('ROLLBACK'));assert.ok(!pool.calls.includes('COMMIT'));
});
test('operation-specific modes are checked again before commit and cannot inherit status-only authority',async()=>{
  const pool=fakePool(),observed=[];let sending=true;
  const db=await createNativeDatabase({pool,binding,now,verifyAdmission:async(tx,mode)=>{observed.push(mode);return{...proof(),admitted:mode!=='sending'||sending};}});
  observed.length=0;pool.calls.length=0;
  await assert.rejects(db.runInMode(['sending','office'],()=>db.transaction(async tx=>{await tx.query('UPDATE fwofficev2_outbox SET tries=tries+1');sending=false;})),/native_admission_pending/);
  assert.deepEqual(observed,['sending','office','sending']);assert.ok(pool.calls.includes('ROLLBACK'));assert.ok(!pool.calls.includes('COMMIT'));
  assert.throws(()=>db.runInMode('unrecognized',()=>{}),/fixed_admission_mode_required/);
});
