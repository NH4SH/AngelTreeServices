import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createReleaseTestDatabase} from './database.mjs';
import {installOfficeOrderStore,officeOrders} from './orders.mjs';
import {installConfirmationStore} from './confirmations.mjs';
import {officeFixture} from '../office-v2/test-fixture.mjs';
import {fixtureInput} from '../live/test-fixture.mjs';
import {createReleaseCustomerService} from './service.mjs';
import {releaseServer} from './server.mjs';
async function setup(t,gates={orders:true,collection:false},activeGates=null){
  const db=await createReleaseTestDatabase(),crm=officeFixture();await installOfficeOrderStore(db,crm.live,crm.office);await installConfirmationStore(db);
  await db.query('UPDATE fwofficev2_control SET paused=false');const service=createReleaseCustomerService({db,live:crm.live,office:crm.office,now:crm.now});
  const server=await releaseServer({service,origin:'https://checkout.angeltreeservices.org',gatewaySecret:'a'.repeat(64),gates,activeGates,health:async()=>true});const port=await server.listen();
  t.after(async()=>{await server.close();await db.stop();});let cookie;
  const call=(path,input,headers={})=>new Promise((resolve,reject)=>{
    const body=input?JSON.stringify(input):null,req=httpRequest('http://127.0.0.1:'+port+path,{method:body?'POST':'GET',headers:{Host:'checkout.angeltreeservices.org','X-ATS-Checkout-Gateway':'a'.repeat(64),...(cookie?{Cookie:cookie}:{}),...(body?{Origin:'https://checkout.angeltreeservices.org','Content-Type':'application/json'}:{}),...headers}},res=>{
      if(res.headers['set-cookie'])cookie=res.headers['set-cookie'][0].split(';')[0];const parts=[];res.on('data',x=>parts.push(x));res.on('end',()=>{const text=Buffer.concat(parts).toString();let value;try{value=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,value,text});});});req.on('error',reject);req.end(body);
  });
  const state=await call('/firewood/checkout/api/state');return{db,crm,call,state,input:{...fixtureInput(),csrf:state.value.csrf},orders:officeOrders({db,live:crm.live,office:crm.office,now:crm.now})};
}
test('release HTTP flow keeps exact one-invoice acceptance, secure host-only session and closed collection',async t=>{
  const f=await setup(t);assert.equal(f.state.status,200);assert.match(f.state.headers['set-cookie'][0],/^__Host-ats_firewood_v2=.*Path=\/; Secure; HttpOnly; SameSite=Strict/);
  const input={...f.input,quantity:'two',stacking:true,notes:'Exact delivery instructions.\nKeep both lines.'};
  assert.equal((await f.call('/firewood/checkout/api/start',input)).status,200);assert.equal((await f.call('/firewood/checkout/api/start',input)).status,200);
  const state=(await f.call('/firewood/checkout/api/state')).value;assert.equal(state.order.quote.totalCents,99000);assert.equal(state.order.contact.notes,input.notes);
  assert.equal(state.canCheckPayment,false);assert.deepEqual((await f.call('/firewood/checkout/api/resume',{csrf:f.input.csrf})).value,{held:true,next:null});
  assert.equal(f.crm.source.mappings.size,1);assert.equal((await f.call('/health')).status,200);
});
test('private gateway proof, exact host/origin and CSRF are required for every mutation',async t=>{
  const f=await setup(t);
  for(const headers of [{'X-ATS-Checkout-Gateway':'b'.repeat(64)},{Host:'foreign.invalid'},{Origin:'https://foreign.invalid'}])assert.equal((await f.call('/firewood/checkout/api/start',f.input,headers)).status,403);
  assert.equal((await f.call('/firewood/checkout/api/start',{...f.input,csrf:'wrong'})).status,403);assert.equal(f.crm.source.mappings.size,0);
  assert.equal((await f.call('/firewood/checkout/api/fixture',{})).status,404);
  const page=await f.call('/firewood/checkout/');assert.equal(page.status,200);assert.equal(page.headers['cache-control'],'no-store');assert.equal(page.headers['x-robots-tag'],'noindex, nofollow');
  assert.ok(!/Isolated checkout review|simulate-|test-tools/u.test(page.text));assert.ok(!page.text.includes('stripe-test-webhook'));
});
test('closed runtime gates cannot be opened by changing the constructor input after startup',async t=>{
  const gates={orders:false,collection:false},f=await setup(t,gates);gates.orders=true;gates.collection=true;
  assert.equal((await f.call('/firewood/checkout/api/state')).value.paused,true);
  assert.equal((await f.call('/firewood/checkout/api/start',f.input)).status,503);assert.equal(f.crm.source.mappings.size,0);
});
test('native worker polling moves fairly past earlier orders and preserves confirmed observations',async t=>{
  const f=await setup(t);for(let i=0;i<3;i++){const s=await f.orders.session(null,true);await f.orders.start(s.cookie,{...fixtureInput(),csrf:s.csrf});}
  await f.orders.work({limit:1});await f.orders.work({limit:1});await f.orders.work({limit:1});
  assert.equal((await f.db.query('SELECT count(*)::int n FROM fwofficev2_observations')).rows[0].n,3);
});
test('a dynamic master pause overrides startup true flags before another order or payment action',async t=>{
  let current={orders:true,collection:true};const f=await setup(t,{orders:true,collection:true},async()=>current);
  current={orders:false,collection:false};const state=(await f.call('/firewood/checkout/api/state')).value;
  assert.equal(state.paused,true);assert.equal(state.canCheckPayment,false);
  assert.equal((await f.call('/firewood/checkout/api/start',f.input)).status,503);assert.equal(f.crm.source.mappings.size,0);
});
test('native customer wrapper never returns an old portal capability after refund, credit and cancellation',async t=>{
  const f=await setup(t,{orders:true,collection:true});await f.call('/firewood/checkout/api/start',f.input);f.crm.source.ready(true);
  const ready=(await f.call('/firewood/checkout/api/resume',{csrf:f.input.csrf})).value;assert.equal(ready.held,false);assert.ok(ready.next);
  f.crm.source.observe('paid',{fee:1350,channel:'card'});await f.call('/firewood/checkout/api/state');
  f.crm.hold('cancellation_requested');f.crm.source.observe('refunded',{fee:1350,channel:'card'});await f.call('/firewood/checkout/api/state');
  f.crm.credit();f.crm.hold('cancelled');const state=(await f.call('/firewood/checkout/api/state')).value;
  assert.equal(state.payment.accounting.balanceDueCents,0);assert.equal(state.payment.state,'refunded');assert.equal(state.canCheckPayment,false);
  assert.deepEqual((await f.call('/firewood/checkout/api/resume',{csrf:f.input.csrf})).value,{held:true,next:null});assert.equal(f.crm.source.mappings.size,1);
});
