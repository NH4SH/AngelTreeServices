// Owned fresh native fixtures only. No provider API, real email or signed admission.
import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
export async function runNativeReceiptChecks({pool,identity}){
 const cases=[];let source='website_firewood_invoice_live_v1';
 async function op(role,sql,args=[]){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE postgres');
  const fact=(await c.query("SELECT current_database()database,(pg_control_system()).system_identifier::text sid,shobj_description(oid,'pg_database')marker FROM pg_database WHERE datname=current_database()")).rows[0];assert.equal(fact.database,identity.database);assert.equal(fact.sid,identity.systemIdentifier);assert.equal(fact.marker,identity.marker);
  if(role==='service_role'){await c.query("SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");await c.query('SET LOCAL ROLE service_role');}
  const r=await c.query(sql,args);await c.query('COMMIT');return r.rows;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const one=async p=>(await p)[0].value;
 async function test(name,fn){await fn();cases.push({name,passed:true});}
 const flags=enabled=>op('operator','UPDATE app_private.firewood_live_handoff_sources SET enabled=false,collector_enabled=false,surcharge_reporting_enabled=false,sender_enabled=$2 WHERE id=$1',[source,enabled]);
 const base=(await op('operator',"SELECT i.id,i.customer_id,i.organization_id,c.email FROM public.invoices i JOIN app_private.firewood_live_handoffs h ON h.invoice_id=i.id JOIN public.customers c ON c.id=i.customer_id WHERE i.status='credited'ORDER BY i.id LIMIT 1"))[0];assert.ok(base);
 const ids=[];
 async function ordinary(marked=false,correctTerms=false){const order=randomUUID(),id=randomUUID();await op('operator',"INSERT INTO public.invoices(id,customer_id,invoice_number,status,subtotal_cents,tax_cents,total_cents,balance_due_cents,document_terms_version)VALUES($1,$2,$3,'sent',1000,0,1000,1000,$4)",[id,base.customer_id,marked?'INV-FW-'+order.toUpperCase():'INV-SYNTHETIC-RECEIPT-'+order,correctTerms?'firewood-household-live-2026-10-29-v1':'legacy-2026-10-22']);return{...base,id};}
 async function payment(invoice){const id=(await op('operator',"INSERT INTO public.payments(invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,currency,payment_method,provider,provider_charge_id,status,paid_at,succeeded_at,notes)VALUES($1,$2,$3,1000,1000,'usd','card','stripe',$4,'succeeded',clock_timestamp(),clock_timestamp(),'SYNTHETIC native receipt evidence; no real charge or email.')RETURNING id",[invoice.id,invoice.customer_id,invoice.organization_id,'ch_SYNTHETIC_RECEIPT_'+randomUUID().replaceAll('-','')]))[0].id;return{invoice,payment:id};}
 const normal=await ordinary(),badTerms=await ordinary(true,false),unknownHandoff=await ordinary(true,true);
 const fixtures={};for(const name of ['held','accepted','not_attempted','unknown','second_payment','bad_payment','bad_invoice','source_busy'])fixtures[name]=await payment(base);
 fixtures.ordinary=await payment(normal);fixtures.bad_terms=await payment(badTerms);fixtures.unknown_handoff=await payment(unknownHandoff);
 // Finish synthetic ledger changes before freezing source snapshots for any messages.
 for(const id of new Set(Object.values(fixtures).map(f=>f.invoice.id)))await op('service_role','SELECT public.reconcile_invoice_balance($1)',[id]);
 async function prepare(f,name,mutate=x=>x){
  const cm=(await op('operator',"INSERT INTO public.customer_communications(customer_id,organization_id,invoice_id,payment_id,communication_type,reminder_stage,recipient_email,idempotency_key,scheduled_for,status,is_automatic)VALUES($1,$2,$3,$4,'payment_confirmation','payment_received',$5,$6,clock_timestamp(),'pending',false)RETURNING id",[f.invoice.customer_id,f.invoice.organization_id,f.invoice.id,f.payment,f.invoice.email,'synthetic-communication-'+randomUUID()]))[0].id;
  const context=mutate({kind:'communication',email_type:'payment_confirmation',communication_id:cm,invoice_id:f.invoice.id,payment_id:f.payment,customer_id:f.invoice.customer_id});
  const payload={from:'Synthetic ATS <noreply@checkout.invalid>',reply_to:'reply@checkout.invalid',to:[f.invoice.email],subject:'SYNTHETIC receipt '+name,text:'Owned local fixture only. No actual payment or email.'};
  const key='synthetic-receipt-'+randomUUID();const value=await one(op('service_role','SELECT public.prepare_outbound_delivery($1,$2,$3,null)value',[key,payload,context]));assert.equal(value.conflict,false);assert.ok(value.id);ids.push(value.id);return{...f,context,payload,key,cm,id:value.id};
 }
 const saved={};for(const[name,f]of Object.entries(fixtures))saved[name]=await prepare(f,name,c=>name==='bad_payment'?{...c,payment_id:randomUUID()}:name==='bad_invoice'?{...c,invoice_id:normal.id}:c);
 const state=id=>one(op('operator',`SELECT jsonb_build_object('delivery',to_jsonb(d),'requests',(SELECT jsonb_agg(to_jsonb(r)ORDER BY request_key)FROM app_private.outbound_delivery_requests r WHERE r.delivery_id=d.id),'attempts',coalesce((SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM app_private.outbound_delivery_attempts a WHERE a.delivery_id=d.id),'[]'),'events',coalesce((SELECT jsonb_agg(to_jsonb(e)ORDER BY id)FROM public.email_events e WHERE e.outbound_delivery_id=d.id),'[]'))value FROM app_private.outbound_deliveries d WHERE d.id=$1`,[id]));
 const claim=id=>one(op('service_role','SELECT public.claim_outbound_delivery($1)value',[id]));
 const finish=(id,attempt,outcome,provider=null)=>one(op('service_role','SELECT public.finish_outbound_delivery($1,$2,$3,$4)value',[id,attempt,outcome,provider]));
 try{
  await test('Sender hold preserves prepared payload, request aliases, history and zero attempts',async()=>{
   await flags(false);const f=saved.held,alias='synthetic-receipt-alias-'+randomUUID();const duplicate=await one(op('service_role','SELECT public.prepare_outbound_delivery($1,$2,$3,null)value',[alias,f.payload,f.context]));assert.equal(duplicate.id,f.id);
   const before=await state(f.id);assert.equal(await claim(f.id),null);assert.deepEqual(await state(f.id),before);assert.equal(before.attempts.length,0);assert.equal(before.requests.length,2);
  });
  await test('Genuine late succeeded-payment receipt admits with collection, preparation and cancelled order held',async()=>{
   await flags(true);const f=saved.accepted;const lifecycle=(await op('operator','SELECT state FROM app_private.firewood_live_order_workflows WHERE invoice_id=$1',[f.invoice.id]))[0];assert.notEqual(lifecycle.state,'active');
   const c=await claim(f.id);assert.ok(c?.attempt_id);assert.equal(c.idempotency_key,f.key);await flags(false);
   const accepted=await finish(f.id,c.attempt_id,'accepted','SYNTHETIC_NATIVE_ACCEPTED_'+randomUUID().replaceAll('-',''));assert.equal(accepted.state,'accepted');assert.equal(accepted.history_recorded,true);
   const before=await state(f.id);assert.equal(await claim(f.id),null);await finish(f.id,c.attempt_id,'accepted',accepted.provider_message_id);assert.deepEqual(await state(f.id),before);
  });
  await test('A different payment on the same invoice keeps payment-level duplicate semantics',async()=>{
   await flags(true);const f=saved.second_payment,c=await claim(f.id);assert.ok(c?.attempt_id);const out=await finish(f.id,c.attempt_id,'accepted','SYNTHETIC_NATIVE_SECOND_'+randomUUID().replaceAll('-',''));assert.equal(out.state,'accepted');assert.equal(out.history_recorded,true);
  });
  await test('Pre-provider not_attempted preserves its attempt, needs-review state and disables blind retries',async()=>{
   await flags(true);const f=saved.not_attempted,c=await claim(f.id);assert.ok(c?.attempt_id);await flags(false);const out=await finish(f.id,c.attempt_id,'not_attempted');assert.equal(out.state,'not_attempted');assert.equal(out.repair_state,'needs_review');assert.equal(out.retry_authorized,false);const before=await state(f.id);assert.equal(before.attempts.length,1);assert.equal(before.attempts[0].id,c.attempt_id);assert.equal(await claim(f.id),null);assert.deepEqual(await state(f.id),before);
  });
  await test('Unknown provider outcome remains held without a new attempt or idempotency key',async()=>{
   await flags(true);const f=saved.unknown,c=await claim(f.id);assert.ok(c?.attempt_id);const out=await finish(f.id,c.attempt_id,'unknown');assert.equal(out.state,'unknown');const before=await state(f.id);assert.equal(await claim(f.id),null);assert.deepEqual(await state(f.id),before);assert.equal(before.delivery.provider_key,f.key);
  });
  await test('Unknown payment, mismatched invoice, malformed terms and missing handoff fail closed without mutating prepared records',async()=>{
   await flags(true);for(const name of ['bad_payment','bad_invoice','bad_terms','unknown_handoff']){const f=saved[name],before=await state(f.id);assert.equal(await claim(f.id),null);assert.deepEqual(await state(f.id),before);assert.equal(before.attempts.length,0);}
  });
  await test('A locked source transition returns no claim NOWAIT, without prepared/history/attempt mutation',async()=>{
   await flags(true);const f=saved.source_busy,before=await state(f.id),holder=await pool.connect();try{await holder.query('BEGIN');await holder.query('UPDATE app_private.firewood_live_handoff_sources SET sender_enabled=sender_enabled WHERE id=$1',[source]);assert.equal(await claim(f.id),null);assert.deepEqual(await state(f.id),before);}finally{await holder.query('ROLLBACK');holder.release();}
  });
  await test('Ordinary invoice receipt remains admitted even with the live Firewood sender held',async()=>{
   await flags(false);const f=saved.ordinary,c=await claim(f.id);assert.ok(c?.attempt_id);const out=await finish(f.id,c.attempt_id,'not_attempted');assert.equal(out.state,'not_attempted');
  });
  return{passed:true,cases,preparedSyntheticDeliveryIds:ids,sourceId:source,providerCalls:0,actualEmailsSent:0,acceptedProviderEvidence:'Expressly synthetic native finish inputs only; no provider transport or actual acceptance.'};
 }finally{await flags(false);}
}
