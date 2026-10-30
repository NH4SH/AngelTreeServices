import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createReleaseTestDatabase} from './database.mjs';
import {installOfficeOrderStore,officeOrders} from './orders.mjs';
import {installConfirmationStore} from './confirmations.mjs';
import {createReleaseWorker} from './worker.mjs';
import {officeFixture} from '../office-v2/test-fixture.mjs';
import {fixtureInput} from '../live/test-fixture.mjs';
async function setup(t){const db=await createReleaseTestDatabase(),crm=officeFixture();t.after(()=>db.stop());await installOfficeOrderStore(db,crm.live,crm.office);await installConfirmationStore(db);await db.query('UPDATE fwofficev2_control SET paused=false');
 const orders=officeOrders({db,live:crm.live,office:crm.office,now:crm.now}),session=await orders.session(null,true);await orders.start(session.cookie,{...fixtureInput(),csrf:session.csrf});
 return{db,crm,orders,session,now:crm.now};}
test('worker prepares exactly one pair of paid confirmations and does not resend after a fresh wrapper starts',async t=>{
 const f=await setup(t),calls=[];f.crm.source.observe('paid');
 const mailer={async send(message,key){calls.push({message,key});return randomUUID();}},worker=createReleaseWorker({...f,admitted:async()=>true,mailer});
 const result=await worker.work();assert.equal(result.accepted,2);assert.equal(calls.length,2);assert.equal((await worker.status()).confirmation_accepted,2);
 const restarted=createReleaseWorker({...f,admitted:async()=>true,mailer});f.crm.advance(16000);await restarted.work();assert.equal(calls.length,2);
});
test('no admission or unavailable money/lifecycle status cannot produce an email',async t=>{
 const f=await setup(t),mailer={send(){assert.fail('No email permitted');}};f.crm.source.observe('paid');
 const held=createReleaseWorker({...f,admitted:async()=>false,mailer});assert.equal((await held.work()).held,true);
 assert.equal((await f.db.query('SELECT started_at FROM fwofficev2_heartbeat')).rows[0].started_at,null);
 f.crm.unavailable(true);const worker=createReleaseWorker({...f,admitted:async()=>true,mailer});await worker.work();assert.equal((await worker.status()).confirmation_accepted,0);
});
test('concurrent process attempts share a durable heartbeat lease and never duplicate the confirmation pair',async t=>{
 const f=await setup(t);f.crm.source.observe('paid');const calls=[];const mailer={async send(message,key){calls.push(key);return randomUUID();}};
 const one=createReleaseWorker({...f,admitted:async()=>true,mailer}),two=createReleaseWorker({...f,admitted:async()=>true,mailer});
 const results=await Promise.all([one.work(),two.work()]);assert.equal(results.filter(x=>x.busy).length,1);assert.equal(calls.length,2);assert.equal(new Set(calls).size,2);
});
