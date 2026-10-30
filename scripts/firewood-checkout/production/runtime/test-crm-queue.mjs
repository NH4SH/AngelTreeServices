import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrate} from './migrate.mjs';
import {policyHash} from './policy.mjs';
import {SANDBOX_ACCOUNT} from './config.mjs';
import {createCrmQueue,CrmCandidateError,crmQueueStatements} from './crm-queue.mjs';

async function fixture(t){
  let db,close;
  if(process.env.FIREWOOD_CANDIDATE_NATIVE_TEST_URL){
    const url=new URL(process.env.FIREWOOD_CANDIDATE_NATIVE_TEST_URL);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'56388');assert.equal(url.pathname,'/firewood_candidate_test');
    const {Pool}=await import('pg'),{postgresAdapter}=await import('../../hosted/runtime.mjs');
    const admin=new Pool({connectionString:url.href,max:1});
    const context=(await admin.query('SELECT current_database() AS db,inet_server_port() AS port,host(inet_server_addr()) AS host')).rows[0];
    assert.deepEqual(context,{db:'firewood_candidate_test',port:56388,host:'127.0.0.1'});
    const schema='crm_queue_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
    const pool=new Pool({connectionString:url.href,options:'-c search_path='+schema,max:6});db=postgresAdapter(pool);
    close=async()=>{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();};
  }else{const {NetlifyDB}=await import('@netlify/database-dev');db=new NetlifyDB({logger:()=>{}});await db.start();close=()=>db.stop();}
  t.after(close);
  await migrate(db,{account:SANDBOX_ACCOUNT,mode:'sandbox',origin:'https://firewood-candidate.invalid',policyHash});for(const sql of crmQueueStatements)await db.query(sql);
  let time=Date.now();const now=()=>time,records=new Map();let lost=false,outage=false,requests=0;
  const client={async send(request,previous,intent){requests++;if(outage)throw new CrmCandidateError('connection_unconfirmed',true);
    if(!records.has(request.order_id))records.set(request.order_id,{invoice_id:randomUUID(),payment_id:randomUUID(),review_required:false,refresh_required:false});
    const receipt=structuredClone(records.get(request.order_id));if(lost){lost=false;throw Error('lost_response');}return receipt;
  }};
  const queue=()=>createCrmQueue({db,client,now});
  async function order(paid=true){
    const id=randomUUID(),session=randomUUID(),payment='cs_test_'+id.replaceAll('-',''),intent='pi_'+id.replaceAll('-','');
    await db.query('INSERT INTO fw_sessions(id,csrf,expires) VALUES($1,$2,$3)',[session,randomUUID(),time+86400000]);
    await db.query('INSERT INTO fw_orders(id,session_id,number,quote,contact,terms,created_at,payment_id,payment_intent,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [id,session,'FW-'+id.slice(0,8).toUpperCase(),JSON.stringify({totalCents:99000}),JSON.stringify({email:'synthetic@example.invalid'}),JSON.stringify({hash:policyHash}),time,payment,paid?intent:null,paid?'paid':'pending']);
    return {id,intent,request:{order_id:id,session_id:payment,snapshot_hash:'a'.repeat(64),order:{total_cents:99000}}};
  }
  const enqueue=o=>db.transaction(tx=>queue().enqueue(tx,o.request,o.intent));
  const state=async id=>(await db.query('SELECT * FROM fw_crm_sync WHERE order_id=$1',[id])).rows[0];
  return {db,client,records,queue,order,enqueue,state,get requests(){return requests;},lost(){lost=true;},outage(v){outage=v;},advance(ms){time+=ms;}};
}
test('CRM enqueue refuses unpaid or mismatched payment facts and rolls back immutable request changes',async t=>{
  const f=await fixture(t),unpaid=await f.order(false);await assert.rejects(f.enqueue(unpaid),/paid_crm_identity_required/);
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fw_crm_sync')).rows[0].n,0);
  const paid=await f.order();await f.enqueue(paid);await assert.rejects(f.enqueue({...paid,request:{...paid.request,snapshot_hash:'b'.repeat(64)}}),/immutable_crm_request_conflict/);
  assert.equal((await f.state(paid.id)).request.snapshot_hash,'a'.repeat(64));
  await assert.rejects(f.db.query("UPDATE fw_crm_sync SET request='{}'::jsonb WHERE order_id=$1",[paid.id]),/immutable_firewood_crm_identity/);
});
test('lost CRM response and replacement processes recover one invoice/payment mapping without another payment',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);f.lost();await f.queue().work();assert.equal((await f.state(o.id)).status,'pending');assert.equal(f.records.size,1);
  f.advance(60000);await f.queue().work();const stored=await f.state(o.id);assert.equal(stored.status,'synced');assert.deepEqual(stored.receipt,f.records.get(o.id));assert.equal(f.requests,2);assert.equal(f.records.size,1);
  await assert.rejects(f.db.query('UPDATE fw_crm_sync SET receipt=NULL WHERE order_id=$1',[o.id]),/immutable_firewood_crm_identity/);
  await f.enqueue(o);await f.queue().work();assert.equal((await f.state(o.id)).receipt.invoice_id,stored.receipt.invoice_id);assert.equal(f.records.size,1);
});
test('CRM outages leave the immutable request pending with bounded delay and recover after replacement',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);f.outage(true);await f.queue().work();const before=await f.state(o.id);assert.equal(before.status,'pending');assert.equal(f.records.size,0);
  await f.queue().work();assert.equal(f.requests,1);f.outage(false);f.advance(60000);await f.queue().work();assert.equal((await f.state(o.id)).status,'synced');
});
test('parallel workers use one lease and a newer lifecycle generation remains pending until refreshed',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r),send=f.client.send;
  f.client.send=async(...args)=>{enter();await hold;return send(...args);};const first=f.queue().work({limit:1});await entered;
  await f.queue().work({limit:1});await f.enqueue(o);release();await first;let row=await f.state(o.id);assert.equal(row.status,'pending');assert.ok(row.generation>row.processed_generation);assert.equal(f.requests,1);
  f.client.send=send;await f.queue().work();row=await f.state(o.id);assert.equal(row.status,'synced');assert.equal(row.generation,row.processed_generation);assert.equal(f.records.size,1);
});
test('an expired worker cannot overwrite the receipt accepted under a replacement lease',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);let enter,release;const entered=new Promise(r=>enter=r),hold=new Promise(r=>release=r),send=f.client.send;let first=true;
  f.client.send=async(...args)=>{const receipt=await send(...args);if(first){first=false;enter();await hold;return {...receipt,review_required:true};}return receipt;};
  const old=f.queue().work({limit:1});await entered;f.advance(60001);await f.queue().work({limit:1});release();await old;
  assert.equal((await f.state(o.id)).status,'synced');assert.equal((await f.state(o.id)).receipt.review_required,false);assert.equal(f.records.size,1);
});
test('permanent identity/authentication errors and changed invoice mappings require review',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);await f.queue().work();const prior=(await f.state(o.id)).receipt;
  f.records.set(o.id,{...prior,invoice_id:randomUUID()});await f.enqueue(o);await f.queue().work();assert.equal((await f.state(o.id)).status,'review');assert.equal((await f.state(o.id)).receipt.invoice_id,prior.invoice_id);
  await f.enqueue(o);assert.equal((await f.state(o.id)).status,'review');
});
test('pending financial observations continue polling and a lifecycle event can refresh financial review',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);await f.queue().work();const receipt=f.records.get(o.id);
  f.records.set(o.id,{...receipt,review_required:true,refresh_required:true});await f.enqueue(o);await f.queue().work();let row=await f.state(o.id);assert.equal(row.status,'pending');assert.equal(row.last_code,'financial_review');
  f.advance(60001);f.records.set(o.id,{...receipt,review_required:true,refresh_required:false});await f.queue().work();assert.equal((await f.state(o.id)).status,'review');
  f.records.set(o.id,receipt);await f.enqueue(o);await f.queue().work();assert.equal((await f.state(o.id)).status,'synced');assert.equal(f.records.size,1);
});
test('repeated unconfirmed transport failures reach explicit review without clearing frozen state',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);f.outage(true);
  for(let n=0;n<12;n++){await f.queue().work({limit:1});f.advance(3600001);}
  const row=await f.state(o.id);assert.equal(row.status,'review');assert.equal(row.tries,12);assert.deepEqual(row.request,o.request);assert.equal(f.records.size,0);
});
test('an unavailable later provider observation preserves the last confirmed financial receipt until verified refresh',async t=>{
  const f=await fixture(t),o=await f.order();await f.enqueue(o);await f.queue().work();
  const initial=f.records.get(o.id);f.records.set(o.id,{...initial,refund_cents:99000,original_receipt:{paid:true,balance_due_cents:0},review_required:true});
  await f.enqueue(o);await f.queue().work();const known=(await f.state(o.id)).receipt;
  await f.enqueue(o);f.outage(true);await f.queue().work();let row=await f.state(o.id);
  assert.equal(row.status,'pending');assert.deepEqual(row.receipt,known);assert.equal(row.receipt.refund_cents,99000);
  f.outage(false);f.records.set(o.id,{...known,refund_cents:0,review_required:true});f.advance(60000);await f.queue().work();row=await f.state(o.id);
  assert.equal(row.status,'review');assert.equal(row.receipt.refund_cents,0);assert.equal(row.receipt.original_receipt.paid,true);
  assert.equal(row.receipt.invoice_id,known.invoice_id);assert.equal(f.records.size,1);
});
