import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{randomUUID}from'node:crypto';
import{accountingReadyDb,admin,service,q,request,prepare,inspect,owner}from'./fixtures/firewood-accounting-db.mjs';
import{load}from'./pr10-test-helpers.mjs';import*as accounting from'../src/lib/firewood/handoff/office-accounting.mjs';
import{withClosedInvoiceCheckouts}from'../src/lib/payments/invoice-void.ts';
const{runFirewoodOfficeCommand}=load('../src/lib/firewood/office-command.ts',{'server-only':{},'../business-time.ts':{},'./handoff/office-accounting.mjs':accounting});
function staffClient(db){return{rpc(name,args){assert.match(name,/^[a-z_]+$/);const keys=Object.keys(args);keys.forEach(k=>assert.match(k,/^p_[a-z_]+$/));let promise;const run=()=>promise??=(async()=>{try{return{data:(await admin(db,'select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)).join(',')+') result',Object.values(args)))[0].result,error:null};}catch(error){return{data:null,error};}})();const pending={abortSignal(){return pending;},then(a,b){return run().then(a,b);}};return pending;}};}
function ledgerClient(db){return{from(table){assert.equal(table,'invoice_checkout_sessions');let change=null,filters=[],single=false,sort='';const check=k=>{assert.match(k,/^[a-z_]+$/);return k;};let promise;const build={select(){return build;},eq(k,v){filters.push({k:check(k),v});return build;},is(k,v){assert.equal(v,null);filters.push({k:check(k),v:null});return build;},order(k){sort=' order by '+check(k);return build;},update(v){change=v;Object.keys(v).forEach(check);return build;},maybeSingle(){single=true;return build;},then(a,b){return run().then(a,b);}};const run=()=>promise??=(async()=>{try{let args=[],head;if(change){const sets=Object.entries(change).map(([k,v])=>{args.push(v);return k+'=$'+args.length;});head='update public.invoice_checkout_sessions set '+sets.join(',');}else head='select * from public.invoice_checkout_sessions';const where=filters.map(({k,v})=>{if(v===null)return k+' is null';args.push(v);return k+'=$'+args.length;}).join(' and ');const rows=await service(db,head+(where?' where '+where:'')+(change?' returning *':sort),args);return{data:single?rows[0]??null:rows,error:null};}catch(error){return{data:null,error};}})();return build;}};}
async function fixture(history=true){const db=await accountingReadyDb();await db.exec(readFileSync(new URL('./fixtures/firewood-checkout-review-original.sql',import.meta.url),'utf8'));await db.exec("alter table public.invoice_checkout_sessions add column created_at timestamptz not null default clock_timestamp(); grant select,update on public.invoice_checkout_sessions to service_role;");const value=request(),receipt=await prepare(db,value),client=staffClient(db);let providerReads=0,providerWrites=0;
 let attempt=null;if(history)attempt=(await q(db,"insert into public.invoice_checkout_sessions(invoice_id,customer_id,organization_id,invoice_principal_cents,total_charge_cents,status,stripe_checkout_session_id)select id,customer_id,organization_id,total_cents,total_cents,'expired','cs_synthetic_cancellation_fixture'from public.invoices where id=$1 returning id",[receipt.invoice_id]))[0].id;
 const stripe={checkout:{sessions:{async retrieve(id){providerReads++;assert.equal(id,'cs_synthetic_cancellation_fixture');return{id,mode:'payment',livemode:false,status:'expired',payment_status:'unpaid',amount_total:60000,currency:'usd',client_reference_id:receipt.invoice_id,metadata:{invoice_id:receipt.invoice_id,checkout_reservation_id:attempt,payment_channel:'ach'},payment_intent:null};},async expire(){providerWrites++;throw Error('Expired fixture must not request another expiry');}}}};
 const deps={client,userId:owner,roles:['owner'],admitted:true,reviewCheckouts:(invoiceId,finish)=>withClosedInvoiceCheckouts({invoiceId,staffSupabase:client,correlationId:randomUUID(),getPaymentContext:()=>({supabase:ledgerClient(db),stripe,livemode:false})},finish)};
 const record=await inspect(db,value),form=new FormData();for(const[k,v]of Object.entries({intent:'cancel_order',order_id:value.order_id,invoice_id:receipt.invoice_id,request_id:randomUUID(),expected_revision:'0',ledger_hash:record.financial.ledger_hash,cancellation_reason:'customer_request',reason:'Synthetic isolated order cancelled before delivery scheduling.',confirm_cancellation:'confirmed'}))form.set(k,v);
 return{db,value,receipt,form,deps,provider:()=>({reads:providerReads,writes:providerWrites})};
}
test('actual cancellation commands and original checkout lease close expired history without voiding, refunding or deleting',async()=>{
 const h=await fixture();try{
  const result=await runFirewoodOfficeCommand(h.form,h.deps);assert.equal(result.status,'success',result.message);
  const record=await inspect(h.db,h.value);assert.equal(record.lifecycle.state,'cancelled');assert.equal(record.financial.invoice_status,'credited');assert.equal(record.financial.balance_due_cents,0);assert.equal(record.financial.accounting.original_principal_cents,60000);assert.equal(record.financial.accounting.credited_principal_cents,60000);
  assert.equal((await q(h.db,'select count(*)::int n from public.payments'))[0].n,0);assert.equal((await q(h.db,'select count(*)::int n from public.invoice_checkout_sessions'))[0].n,1);assert.equal((await q(h.db,'select count(*)::int n from app_private.invoice_void_leases'))[0].n,0);
  assert.equal((await q(h.db,'select count(*)::int n from app_private.firewood_live_cancellation_credits'))[0].n,1);
  assert.equal((await runFirewoodOfficeCommand(h.form,h.deps)).status,'success');assert.equal((await q(h.db,'select count(*)::int n from app_private.firewood_live_cancellation_credits'))[0].n,1);assert.deepEqual(h.provider(),{reads:1,writes:0});
 }finally{await h.db.close();}
});
test('clean cancellation still uses the original void and requires no Stripe or competing checkout lease',async()=>{
 const h=await fixture(false);try{const result=await runFirewoodOfficeCommand(h.form,h.deps);assert.equal(result.status,'success',result.message);const record=await inspect(h.db,h.value);assert.equal(record.lifecycle.state,'cancelled');assert.equal(record.financial.invoice_status,'void');assert.equal((await q(h.db,'select count(*)::int n from app_private.firewood_live_cancellation_credits'))[0].n,0);assert.deepEqual(h.provider(),{reads:0,writes:0});}finally{await h.db.close();}
});
test('a lost credit acknowledgement recovers after lease cleanup without another credit or checkout mutation',async()=>{
 const h=await fixture();try{
  let lost=false;const base=h.deps.client;
  h.deps.client={rpc(name,args){const pending=base.rpc(name,args);return{async abortSignal(signal){
   const result=await pending.abortSignal(signal);
   if(!lost&&name==='credit_firewood_live_cancellation'&&!result.error){lost=true;throw Error('Synthetic response lost after committed credit');}
   return result;
  }};}};
  assert.equal((await runFirewoodOfficeCommand(h.form,h.deps)).status,'error');
  assert.equal((await inspect(h.db,h.value)).lifecycle.state,'cancellation_requested');
  assert.equal((await q(h.db,'select count(*)::int n from app_private.invoice_void_leases'))[0].n,0);
  assert.equal((await q(h.db,'select count(*)::int n from app_private.firewood_live_cancellation_credits'))[0].n,1);
  const retry=await runFirewoodOfficeCommand(h.form,h.deps);assert.equal(retry.status,'success',retry.message);
  const record=await inspect(h.db,h.value);assert.equal(record.lifecycle.state,'cancelled');assert.equal(record.financial.invoice_status,'credited');assert.equal(record.financial.balance_due_cents,0);
  assert.equal((await q(h.db,'select count(*)::int n from app_private.firewood_live_cancellation_credits'))[0].n,1);
  assert.equal((await q(h.db,'select count(*)::int n from public.payments'))[0].n,0);
  assert.deepEqual(h.provider(),{reads:1,writes:0});
 }finally{await h.db.close();}
});
test('paid non-refundable cancellation retains the payment and finishes without trying to expire a paid checkout',async()=>{
 const h=await fixture();try{
  await q(h.db,"insert into public.payments(invoice_id,status,currency,provider,amount_cents,surcharge_cents,total_collected_cents,succeeded_at)values($1,'succeeded','usd','manual',60000,0,60000,clock_timestamp())",[h.receipt.invoice_id]);
  await service(h.db,'select public.reconcile_invoice_balance($1)',[h.receipt.invoice_id]);
  await admin(h.db,'select public.record_firewood_live_delivery($1,0,$2,$3,$4,$5)',[h.receipt.invoice_id,new Date(Date.now()+47*3600000).toISOString(),new Date(Date.now()+49*3600000).toISOString(),'Synthetic customer-agreed delivery window.',randomUUID()]);
  const before=await inspect(h.db,h.value);h.form.set('expected_revision','1');h.form.set('ledger_hash',before.financial.ledger_hash);
  const result=await runFirewoodOfficeCommand(h.form,h.deps);assert.equal(result.status,'success',result.message);
  const record=await inspect(h.db,h.value);assert.equal(record.lifecycle.state,'cancelled');assert.equal(record.lifecycle.refund_eligibility,'non_refundable');assert.equal(record.financial.invoice_status,'paid');assert.equal(record.financial.balance_due_cents,0);assert.equal((await q(h.db,"select count(*)::int n from public.payments where status='succeeded'"))[0].n,1);assert.deepEqual(h.provider(),{reads:0,writes:0});
 }finally{await h.db.close();}
});
