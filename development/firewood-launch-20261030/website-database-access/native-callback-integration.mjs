// TEST ONLY. Invoked exclusively inside the owned Unix-only permission fixture.
// Synthetic in-memory signing authority; no real receipt, fixed-path mount or provider.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)), root=path.dirname(here);
const {nativeProofIntegrationFixture}=await import(pathToFileURL(path.join(root,'runtime-admission/native-proof-integration-fixture.mjs')));
const {validateVerifierBinding,combineNativeAdmission,NATIVE_CONTEXT_SQL}=await import(pathToFileURL(path.join(root,'native-proof-core.mjs')));
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');

export async function runNativeCallbackIntegration({admin,config,driver,website,marker}){
  assert.ok(config.host.startsWith('/var/folders/')||config.host.startsWith('/tmp/'));
  assert.equal((await admin.query("SELECT shobj_description(oid,'pg_database') marker FROM pg_database WHERE datname=current_database()")).rows[0].marker,marker);
  const {Pool}=(await import(pathToFileURL(driver))).default;
  const {createNativeDatabase}=await import(pathToFileURL(path.join(website,'database.mjs')));
  const cases=[],artifacts=['native-proof-core.mjs','native-proof.mjs','runtime-admission/native-proof-integration-fixture.mjs','runtime-admission/released-context-core.mjs','runtime-admission/upstream/native-wal-checkpoint.mjs'];
  const result={scope:'Actual native helper + original Ed25519 signed-test-context validators + actual Website transaction adapter; synthetic in-memory authority, no actual fixed-path release reader or backup certification',providerCalls:0,productionMutations:0,cases,
    sourceHashes:Object.fromEntries(artifacts.map(n=>[n,sha(fs.readFileSync(path.join(root,n)))])),websiteDatabaseSha256:sha(fs.readFileSync(path.join(website,'database.mjs')))};
  let pool;
  async function setup(){
    await pool?.end();pool=new Pool({...config,user:'ats_firewood_request',max:2});
    await admin.query(`WITH n AS(SELECT clock_timestamp()t)UPDATE hosting_guard.state s SET local_node='ats-home-primary',holder='ats-home-primary',epoch=4,database_started_at=pg_postmaster_start_time(),issued_at=n.t,expires_at=n.t+interval '14 seconds',capture_started_at=n.t-interval '1 second',capture_in_progress=false,topology_verified=true,topology_fingerprint=hosting_guard.catalog_fingerprint()FROM n WHERE singleton`);
    const native=(await pool.query(NATIVE_CONTEXT_SQL)).rows[0].proof;
    const fixture=nativeProofIntegrationFixture(native,{nowMs:Date.now()});assert.equal(fixture.syntheticAuthorityOnly,true);
    const expected=validateVerifierBinding(fixture.input);let hook=null,reads=0;
    const verify=async(tx,mode)=>{try{
      const before=fixture.observe(Date.now());assert.equal(before.mode,mode);
      const sql=await tx.query(NATIVE_CONTEXT_SQL);reads++;
      const h=hook;hook=null;if(h)await h(fixture);
      const after=fixture.observe(Date.now());
      return combineNativeAdmission({expected,before,native:sql.rows[0].proof,after,nowMs:Date.now()});
    }catch{throw Error('native_admission_pending');}};
    const binding={...fixture.input.binding,liveKeyId:'synthetic_live_key_0001',officeKeyId:'synthetic_office_key_0001'};
    const db=await createNativeDatabase({pool,binding,verifyAdmission:verify});
    return {db,fixture,setHook:h=>{hook=h;},reads:()=>reads};
  }
  const pause=(f,mode='status')=>{const d=JSON.parse(f.snapshot.descriptor);d.modes[mode]=false;f.snapshot.descriptor=Buffer.from(JSON.stringify(d));};
  const missing=async id=>assert.equal((await admin.query('SELECT count(*)::int n FROM app_private.fwofficev2_rate WHERE id=$1',[id])).rows[0].n,0);
  async function test(name,fn){await fn();cases.push({name,passed:true});}
  try{
    await test('Genuine native SESSION_USER and actual Website adapter commit with fresh matching signed-test context',async()=>{
      const f=await setup(),id='callback-stable-'+crypto.randomUUID();
      await f.db.transaction(async tx=>{assert.equal((await tx.query('SELECT session_user')).rows[0].session_user,'ats_firewood_request');await tx.query('INSERT INTO fwofficev2_rate VALUES($1,0,1)',[id]);});
      assert.equal((await admin.query('SELECT count(*)::int n FROM app_private.fwofficev2_rate WHERE id=$1',[id])).rows[0].n,1);assert.ok(f.reads()>=3);
    });
    await test('Pause after native SQL but before second signed context read rejects transaction before business work',async()=>{
      const f=await setup();let ran=false;f.setHook(x=>pause(x));
      await assert.rejects(f.db.transaction(async()=>{ran=true;}),/native_admission_pending/);assert.equal(ran,false);
    });
    await test('Pause after business write is freshly observed before COMMIT and rolls back the write',async()=>{
      const f=await setup(),id='callback-pause-'+crypto.randomUUID();
      await assert.rejects(f.db.transaction(async tx=>{await tx.query('INSERT INTO fwofficev2_rate VALUES($1,0,1)',[id]);pause(f.fixture);}),/native_admission_pending/);await missing(id);
    });
    await test('Coherent mode change between callback reads requires retry even while status remains enabled',async()=>{
      const f=await setup();let ran=false;f.setHook(x=>pause(x,'collection'));
      await assert.rejects(f.db.transaction(async()=>{ran=true;}),/native_admission_pending/);assert.equal(ran,false);
    });
    await test('Native capture hold between business write and COMMIT rejects with unchanged valid signed-test receipt',async()=>{
      const f=await setup(),id='callback-hold-'+crypto.randomUUID();
      await assert.rejects(f.db.transaction(async tx=>{await tx.query('INSERT INTO fwofficev2_rate VALUES($1,0,1)',[id]);await admin.query('UPDATE hosting_guard.state SET capture_in_progress=true WHERE singleton');}),/native_admission_pending/);await missing(id);
    });
    await test('Native lease closure between business write and COMMIT rejects with unchanged valid signed-test receipt',async()=>{
      const f=await setup(),id='callback-lease-'+crypto.randomUUID();
      await assert.rejects(f.db.transaction(async tx=>{await tx.query('INSERT INTO fwofficev2_rate VALUES($1,0,1)',[id]);await admin.query("UPDATE hosting_guard.state SET expires_at=clock_timestamp()-interval '1 second'WHERE singleton");}),/native_admission_pending/);await missing(id);
    });
    result.passed=true;return result;
  }finally{await pool?.end();}
}
