import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { processStripeWebhook } from "../src/lib/payments/webhook-recovery.ts";
import { createRequire } from "node:module";
import Stripe from "stripe";
import { safeWebhookLog } from "../src/lib/payments/webhook-logging.ts";

const enabled = process.env.PR06_DISPOSABLE_STACK === "1" && Boolean(process.env.PR06_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR06 webhook recovery: actual receipts, money, ownership and downstream effects", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR06_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR06_DOCKER_BIN;
  assert.ok(docker);
  const base = ["exec", "-i", "supabase_db_ats_pr02_disposable", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  function sql(source) {
    return new Promise((resolve, reject) => {
      const p = spawn(docker, base, { env: process.env }); let out = "", err = "";
      p.stdout.on("data", b => out += b); p.stderr.on("data", b => err += b);
      p.on("error", reject); p.on("exit", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
      p.stdin.end(source);
    });
  }
  async function hold(source) {
    const p = spawn(docker, base, { env: process.env }); let err = "";
    p.stderr.on("data", b => err += b);
    const done = new Promise((resolve, reject) => { p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(new Error(err))); });
    const ready = new Promise((resolve, reject) => {
      p.stdout.on("data", b => { if (String(b).includes("PR06_LOCKED")) resolve(); });
      p.on("error", reject); p.on("exit", () => reject(new Error("Lock session exited before readiness: " + err)));
    });
    p.stdin.write(`begin; ${source}; select 'PR06_LOCKED';\n`);
    await ready;
    return async () => { p.stdin.end("commit;\n"); await done; };
  }
  const service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, options);
  const anon = createClient(c.API_URL, c.ANON_KEY, options);
  const marker = randomBytes(5).toString("hex"), results = [];
  const check = (r, label = "request") => { assert.ifError(r.error && new Error(`${label}: ${r.error.message} [${r.error.code}]`)); return r.data; };
  const denied = (r, code) => { assert.ok(r.error, "Expected rejection"); if (code) assert.equal(r.error.code, code); };
  const client = jwt => createClient(c.API_URL, c.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  async function account(role, label = role) {
    check(await service.from("roles").upsert({ name: role }, { onConflict: "name" }));
    const password = randomBytes(24).toString("base64url");
    const u = check(await service.auth.admin.createUser({ email: `pr06-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR06 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin");
  const customer = check(await service.from("customers").insert({ display_name: `PR06 disposable ${marker}`, email: `pr06-${marker}@example.invalid` }).select("id").single());
  async function invoice(changes = {}) {
    return check(await service.from("invoices").insert({ customer_id: customer.id, status: "sent", subtotal_cents: 1000, tax_cents: 0, total_cents: 1000, balance_due_cents: 1000, sent_at: new Date().toISOString(), ...changes }).select("*").single());
  }
  async function reservation(inv, status = "open", changes = {}) {
    return check(await service.from("invoice_checkout_sessions").insert({ invoice_id: inv.id, customer_id: customer.id, status, amount_cents: 1000, invoice_principal_cents: 1000, total_charge_cents: 1000, surcharge_cents: 0, currency: "usd", payment_channel: "ach", ...changes }).select("*").single());
  }
  async function payment(inv, status = "pending", changes = {}) {
    return check(await service.from("payments").insert({ invoice_id: inv.id, customer_id: customer.id, status, amount_cents: 1000, total_collected_cents: 1000, currency: "usd", payment_method: "ach", provider: "stripe", ...changes }).select("*").single());
  }
  const run = async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  let counter=0, sends=0, syncs=0;
  const providerObjects=new Map(), refundObjects=new Map(), network=[];
  const provider={
    checkout:{sessions:{retrieve:async(id,_args,opts)=>{network.push({id,opts});assert.equal(opts.maxNetworkRetries,0);return structuredClone(providerObjects.get(id));}}},
    paymentIntents:{retrieve:async(id,_args,opts)=>{network.push({id,opts});return structuredClone(providerObjects.get(id));}},
    charges:{retrieve:async(id,_args,opts)=>{network.push({id,opts});return structuredClone(providerObjects.get(id));}},
    refunds:{retrieve:async(id)=>structuredClone([...refundObjects.values()].flat().find(r=>r.id===id)),list:async({charge,starting_after})=>{const all=refundObjects.get(charge)??[];const start=starting_after?all.findIndex(r=>r.id===starting_after)+1:0;return {data:structuredClone(all.slice(start,start+100)),has_more:start+100<all.length};}},
    disputes:{retrieve:async(id,_args,opts)=>{network.push({id,opts});return structuredClone(providerObjects.get(id));}},
  };
  const deps={supabase:service,stripe:provider,livemode:false,
    sendEmail:async input=>{if(input.to===owner.email){sends++;return {ok:true,configured:true,providerMessageId:`local_mail_${counter}_${sends}`,retryable:false};} return {ok:false,configured:false,providerMessageId:null,retryable:false};},
    syncCommunications:async()=>{syncs++;return {error:null};},
  };
  function event(type,objectId){return {id:`evt_pr06_${marker}_${++counter}`,type,created:Math.floor(Date.now()/1000),livemode:false,data:{object:{id:objectId}}};}
  async function fixture(channel='ach'){
    const inv=await invoice();const suffix=`${marker}_${++counter}`;
    const pi=`pi_pr06_${suffix}`,cs=`cs_test_pr06_${suffix}`,ch=`ch_pr06_${suffix}`;
    const row=await reservation(inv,'open',{payment_channel:channel,stripe_checkout_session_id:channel==='ach'?cs:null,stripe_payment_intent_id:pi,
      stripe_confirmation_token_id:channel==='card'?`ct_pr06_${suffix}`:null});
    const charge={id:ch,object:'charge',livemode:false,amount:1000,amount_refunded:0,currency:'usd',paid:true,payment_intent:pi,
      balance_transaction:{id:`txn_pr06_${suffix}`,fee:30,net:970},payment_method_details:channel==='card'?{card:{brand:'visa',funding:'credit'}}:{us_bank_account:{}}};
    const intent={id:pi,object:'payment_intent',livemode:false,amount:1000,amount_received:1000,currency:'usd',status:'succeeded',latest_charge:charge,
      metadata:{invoice_id:inv.id,checkout_reservation_id:row.id,payment_channel:channel}};
    const session={id:cs,object:'checkout.session',livemode:false,created:Math.floor(Date.now()/1000),amount_total:1000,currency:'usd',payment_status:'paid',status:'complete',
      client_reference_id:inv.id,metadata:{invoice_id:inv.id,checkout_reservation_id:row.id,payment_channel:channel},payment_intent:intent};
    providerObjects.set(cs,session);providerObjects.set(pi,intent);providerObjects.set(ch,charge);
    return {inv,row,session,intent,charge,event:event(channel==='card'?'payment_intent.succeeded':'checkout.session.completed',channel==='card'?pi:cs)};
  }
  const runEvent=(e,extra={})=>processStripeWebhook(e,{...deps,...extra});
  const receipt=async e=>check(await service.from('stripe_webhook_events').select('*').eq('event_id',e.id).single());
  const claim=e=>service.rpc('claim_stripe_webhook',{p_event_id:e.id,p_event_type:e.type,p_object_id:e.data.object.id,p_created_at:new Date(e.created*1000).toISOString(),p_livemode:e.livemode});
  const financial=async inv=>check(await service.from('invoices').select('status,balance_due_cents').eq('id',inv.id).single());
  const rows=async inv=>check(await service.from('payments').select('*').eq('invoice_id',inv.id));
  async function expire(e){await sql(`update public.stripe_webhook_events set lease_expires_at=clock_timestamp()-interval '1 second' where event_id='${e.id}'`);}
  const finish=(e,token)=>service.rpc('complete_stripe_webhook',{p_event_id:e.id,p_token:token});
  async function applied(f){
    const c=check(await claim(f.event));
    const {normalizeStripeWebhook}=await import('../src/lib/payments/webhook-recovery.ts');
    const {createCheckoutBudget}=await import('../src/lib/payments/checkout-budget.ts');
    const evidence=await normalizeStripeWebhook(f.event,deps,createCheckoutBudget());
    evidence.snapshot_token=check(await service.rpc('prepare_stripe_webhook_snapshot',{p_event_id:f.event.id,p_token:c.token,p_evidence:evidence}));
    check(await service.rpc('apply_stripe_webhook',{p_event_id:f.event.id,p_token:c.token,p_evidence:evidence}));
    return {token:c.token,evidence};
  }
  await run('legacy incomplete receipts resume; historical completed receipts remain complete',async()=>{
    const f=await fixture();
    await sql(`insert into public.stripe_webhook_events(event_id,event_type) values('${f.event.id}','${f.event.type}')`);
    assert.equal((await runEvent(f.event)).status,'completed');assert.equal((await financial(f.inv)).balance_due_cents,0);
    const done=event('local.unsupported','obj_legacy');
    await sql(`insert into public.stripe_webhook_events(event_id,event_type,processed_at,state,phase) values('${done.id}','${done.type}',now(),'completed','completed')`);
    const before=network.length;assert.equal((await runEvent(done)).status,'completed');assert.equal(network.length,before);
  });
  await run('duplicate completed events create one payment, one notification per recipient and one provider send',async()=>{
    const f=await fixture(),before=sends;
    assert.equal((await runEvent(f.event)).status,'completed');const first=check(await service.from('admin_notifications').select('id').eq('stripe_event_id',f.event.id));
    assert.equal((await runEvent(f.event)).status,'completed');assert.equal((await rows(f.inv)).length,1);
    assert.equal(sends,before+1);assert.equal(check(await service.from('admin_notifications').select('id').eq('stripe_event_id',f.event.id)).length,first.length);
  });
  await run('simultaneous claims choose one owner; busy delivery is never completed',async()=>{
    const f=await fixture();const claims=await Promise.all([claim(f.event),claim(f.event)]);assert.deepEqual(claims.map(r=>check(r).status).sort(),['busy','claimed']);
    assert.equal((await runEvent(f.event)).status,'busy');assert.equal((await receipt(f.event)).processed_at,null);
    await expire(f.event);assert.equal((await runEvent(f.event)).status,'completed');
  });
  await run('crash after claim reclaims by lease; stale failure/completion cannot touch new owner',async()=>{
    const f=await fixture(),old=check(await claim(f.event));await expire(f.event);const current=check(await claim(f.event));
    denied(await finish(f.event,old.token),'55P03');assert.equal(check(await service.rpc('fail_stripe_webhook',{p_event_id:f.event.id,p_token:old.token,p_problem:'processing_failed'})),false);
    assert.equal((await receipt(f.event)).owner_token,current.token);await expire(f.event);await runEvent(f.event);
  });
  await run('a crash after atomic financial apply resumes downstream work without repeating money',async()=>{
    const f=await fixture();await applied(f);assert.equal((await financial(f.inv)).balance_due_cents,0);const pay=(await rows(f.inv))[0];
    await expire(f.event);const reads=network.length;await runEvent(f.event);assert.equal(network.length,reads);assert.equal((await rows(f.inv))[0].id,pay.id);
    assert.equal((await receipt(f.event)).state,'completed');
  });
  await run('audit/inbox failure rolls payment, checkout, balance and progress back together',async()=>{
    const f=await fixture(),constraint=`pr06_audit_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${f.inv.id}'::uuid or event_type<>'customer_payment_succeeded') not valid`);
    try {await assert.rejects(runEvent(f.event));assert.equal((await rows(f.inv)).length,0);assert.equal((await financial(f.inv)).balance_due_cents,1000);assert.equal((await receipt(f.event)).phase,'pending');}
    finally {await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    await runEvent(f.event);assert.equal((await financial(f.inv)).balance_due_cents,0);
  });
  await run('queue planning failure keeps financial checkpoint and resumes it without another payment',async()=>{
    const f=await fixture();await assert.rejects(runEvent(f.event,{syncCommunications:async()=>({error:'local injected failure'})}));
    assert.equal((await receipt(f.event)).phase,'effects_ready');assert.equal((await receipt(f.event)).processed_at,null);
    const before=network.length;await runEvent(f.event);assert.equal(network.length,before);assert.equal((await rows(f.inv)).length,1);
  });
  await run('crash after provider accepted but before local result never resends an uncertain notification',async()=>{
    const f=await fixture();await applied(f);
    const notice=check(await service.from('admin_notifications').select('id').eq('stripe_event_id',f.event.id).eq('recipient_user_id',owner.id).single());
    const original=await receipt(f.event);
    const sending=check(await service.rpc('begin_stripe_notification_email',{p_event_id:f.event.id,p_token:original.owner_token,p_notification:notice.id}));assert.equal(sending.status,'send');
    const before=sends;await expire(f.event);await runEvent(f.event);assert.equal(sends,before);
    let n=check(await service.from('admin_notifications').select('stripe_email_state,stripe_email_attempt_token').eq('id',notice.id).single());assert.equal(n.stripe_email_state,'review');
    assert.equal(check(await service.rpc('finish_stripe_notification_email',{p_notification:notice.id,p_attempt_token:original.owner_token,p_outcome:'accepted',p_provider_id:'local_late_acceptance'})),true);
    n=check(await service.from('admin_notifications').select('stripe_email_state').eq('id',notice.id).single());assert.equal(n.stripe_email_state,'accepted');
    denied(await finish(f.event,original.owner_token),'55P03');
  });
  await run('unknown send failure is visible and is not retried after receipt recovery',async()=>{
    const f=await fixture();let attempts=0;
    await assert.rejects(runEvent(f.event,{sendEmail:async input=>{if(input.to===owner.email){attempts++;throw new Error('local timeout');}return deps.sendEmail(input);}}));
    await runEvent(f.event);assert.equal(attempts,1);
    assert.equal(check(await service.from('admin_notifications').select('stripe_email_state').eq('stripe_event_id',f.event.id).eq('recipient_user_id',owner.id).single()).stripe_email_state,'review');
  });
  await run('receipt completion requires financial progress, queue sync and resolved notification submissions',async()=>{
    const f=await fixture(),c=check(await claim(f.event));denied(await finish(f.event,c.token),'23514');
    await expire(f.event);await applied(f);const current=await receipt(f.event);denied(await finish(f.event,current.owner_token),'23514');await expire(f.event);await runEvent(f.event);
  });
  await run('attempt exhaustion stays incomplete and visible; only an owner/admin can grant one more attempt',async()=>{
    const f=await fixture();check(await claim(f.event));await expire(f.event);await sql(`update public.stripe_webhook_events set attempts=12 where event_id='${f.event.id}'`);
    assert.equal((await runEvent(f.event)).status,'review');assert.equal((await receipt(f.event)).processed_at,null);
    check(await owner.client.rpc('request_stripe_webhook_retry',{p_event_id:f.event.id}));await runEvent(f.event);assert.equal((await receipt(f.event)).attempts,13);
  });
  await run('staff/public clients cannot read receipt payloads, claim, apply, finish or request recovery',async()=>{
    const f=await fixture();
    for(const actor of [{client:anon},await account('estimator'),await account('crew'),await account('customer'),await account('payroll_admin')]){
      denied(await actor.client.from('stripe_webhook_events').select('*'),'42501');
      denied(await actor.client.rpc('get_stripe_webhook_recovery'),'42501');
      denied(await actor.client.rpc('request_stripe_webhook_retry',{p_event_id:f.event.id}),'42501');
      denied(await actor.client.rpc('claim_stripe_webhook',{p_event_id:f.event.id,p_event_type:f.event.type,p_object_id:f.event.data.object.id,p_created_at:new Date(f.event.created*1000).toISOString(),p_livemode:false}),'42501');
      denied(await actor.client.rpc('apply_stripe_webhook',{p_event_id:f.event.id,p_token:owner.id,p_evidence:{operation:'ignored'}}),'42501');
      denied(await actor.client.rpc('complete_stripe_webhook',{p_event_id:f.event.id,p_token:owner.id}),'42501');
    }
    denied(await service.from('stripe_webhook_events').delete().eq('event_id',f.event.id),'42501');
  });
  await run('deactivation revokes recovery from an already issued owner JWT',async()=>{
    const u=await account('owner','deactivated'),f=await fixture();check(await claim(f.event));await expire(f.event);
    check(await service.from('employee_records').update({employment_status:'separated',is_active:false}).eq('id',u.employeeId));
    denied(await u.client.rpc('request_stripe_webhook_retry',{p_event_id:f.event.id}),'42501');denied(await u.client.rpc('get_stripe_webhook_recovery'),'42501');
  });
  await run('receipt identity/mode mismatches fail before financial mutation',async()=>{
    const f=await fixture();await assert.rejects(runEvent({...f.event,livemode:true}));
    check(await claim(f.event));denied(await service.rpc('claim_stripe_webhook',{p_event_id:f.event.id,p_event_type:'charge.refunded',p_object_id:f.charge.id,p_created_at:new Date(f.event.created*1000).toISOString(),p_livemode:false}),'23514');
    await expire(f.event);f.session.amount_total=999;await assert.rejects(runEvent(f.event));assert.equal((await rows(f.inv)).length,0);
  });
  await run('latest provider state defeats a late unpaid completion or failure after success',async()=>{
    const f=await fixture();await runEvent(f.event);
    const e=event('checkout.session.async_payment_failed',f.session.id);await runEvent(e);
    assert.equal((await rows(f.inv))[0].status,'succeeded');assert.equal((await financial(f.inv)).balance_due_cents,0);
    // Even a controlled stale provider snapshot cannot demote durable success.
    f.session.payment_status='unpaid';f.intent.status='processing';f.intent.amount_received=0;
    await runEvent(event('checkout.session.completed',f.session.id));assert.equal((await rows(f.inv))[0].status,'succeeded');
  });
  function refunds(f,amount,status='succeeded') {
    const refund={id:`re_pr06_${marker}_${++counter}`,charge:f.charge.id,payment_intent:f.intent.id,amount,currency:'usd',status,created:Math.floor(Date.now()/1000)};
    refundObjects.set(f.charge.id,[refund]);f.charge.amount_refunded=amount;return refund;
  }
  await run('current individual refund objects defeat stale charge totals; success-after-refund stays refunded',async()=>{
    const f=await fixture();await runEvent(f.event);const refund=refunds(f,800);
    await runEvent(event('charge.refunded',f.charge.id));assert.equal((await rows(f.inv))[0].refunded_principal_cents,800);
    f.charge.amount_refunded=300;await runEvent(event('charge.refunded',f.charge.id));
    assert.equal((await rows(f.inv))[0].refunded_principal_cents,800);
    refundObjects.get(f.charge.id).push({...refund,id:`re_pr06_${marker}_${++counter}`,amount:200});f.charge.amount_refunded=1000;
    await runEvent(event('charge.refunded',f.charge.id));await runEvent(event('checkout.session.async_payment_succeeded',f.session.id));
    assert.equal((await rows(f.inv))[0].status,'refunded');assert.equal((await financial(f.inv)).balance_due_cents,1000);
  });
  await run('success first observed after a full provider refund never credits the invoice',async()=>{
    const f=await fixture();refunds(f,1000);await runEvent(f.event);
    assert.equal((await rows(f.inv))[0].status,'refunded');assert.equal((await financial(f.inv)).balance_due_cents,1000);
  });
  await run('card confirmation flow and authoritative failed/processing states preserve all paths',async()=>{
    const card=await fixture('card');await runEvent(card.event);assert.equal((await rows(card.inv))[0].status,'succeeded');
    const bank=await fixture();bank.session.payment_status='unpaid';bank.intent.status='processing';bank.intent.amount_received=0;
    await runEvent(bank.event);assert.equal((await rows(bank.inv))[0].status,'pending');
    bank.intent.status='requires_payment_method';await runEvent(event('checkout.session.async_payment_failed',bank.session.id));assert.equal((await rows(bank.inv))[0].status,'failed');
    const expired=await fixture();expired.session.payment_status='unpaid';expired.session.status='expired';expired.session.payment_intent=null;
    check(await service.from('invoice_checkout_sessions').update({stripe_payment_intent_id:null}).eq('id',expired.row.id));
    await runEvent(event('checkout.session.expired',expired.session.id));assert.equal(check(await service.from('invoice_checkout_sessions').select('status').eq('id',expired.row.id).single()).status,'expired');
  });
  await run('dispute money and balance commit together and replay does not apply it twice',async()=>{
    const f=await fixture();await runEvent(f.event);
    const dispute={id:`dp_pr06_${marker}_${++counter}`,livemode:false,charge:f.charge.id,amount:1000,status:'lost',currency:'usd'};providerObjects.set(dispute.id,dispute);
    const e=event('charge.dispute.closed',dispute.id);await runEvent(e);await runEvent(e);
    assert.equal((await rows(f.inv))[0].disputed_principal_cents,1000);assert.equal((await financial(f.inv)).balance_due_cents,1000);
  });
  await run('an owner waiting on the invoice loses mutation authority when its lease expires',async()=>{
    const f=await fixture(),c=check(await claim(f.event));
    const {normalizeStripeWebhook}=await import('../src/lib/payments/webhook-recovery.ts');
    const {createCheckoutBudget}=await import('../src/lib/payments/checkout-budget.ts');
    const evidence=await normalizeStripeWebhook(f.event,deps,createCheckoutBudget());
    evidence.snapshot_token=check(await service.rpc('prepare_stripe_webhook_snapshot',{p_event_id:f.event.id,p_token:c.token,p_evidence:evidence}));
    const release=await hold(`select id from public.invoices where id='${f.inv.id}' for update`);
    await sql(`update public.stripe_webhook_events set lease_expires_at=clock_timestamp()+interval '300 milliseconds' where event_id='${f.event.id}'`);
    let done=false;const applying=service.rpc('apply_stripe_webhook',{p_event_id:f.event.id,p_token:c.token,p_evidence:evidence}).then(r=>{done=true;return r;});
    try {await new Promise(r=>setTimeout(r,500));assert.equal(done,false);}finally{await release();}
    denied(await applying,'55P03');assert.equal((await rows(f.inv)).length,0);await runEvent(f.event);
  });
  await run('legacy activity with an uncertain email is repaired without resending it',async()=>{
    const f=await fixture(),before=sends;
    const activity=check(await service.from('activity_log').insert({subject_type:'invoice',subject_id:f.inv.id,event_type:'customer_payment_succeeded',
      idempotency_key:`stripe-checkout:${f.row.id}:payment-succeeded`}).select('id').single());
    check(await service.from('admin_notifications').insert({activity_id:activity.id,recipient_user_id:owner.id,category:'payments',title:'Customer payment received',body:'Legacy fixture',email_status:'pending'}));
    await runEvent(f.event);assert.equal(sends,before);
    assert.equal(check(await service.from('admin_notifications').select('stripe_email_state').eq('activity_id',activity.id).eq('recipient_user_id',owner.id).single()).stripe_email_state,'review');
  });
  await run('the total provider budget expires before a financial write and retains the receipt',async()=>{
    const f=await fixture();let clock=0;const {createCheckoutBudget}=await import('../src/lib/payments/checkout-budget.ts');
    await assert.rejects(runEvent(f.event,{budget:createCheckoutBudget(()=>clock),stripe:{...provider,checkout:{sessions:{retrieve:async()=>{clock=60001;return f.session;}}}}}));
    assert.equal((await rows(f.inv)).length,0);assert.equal((await receipt(f.event)).state,'failed');
  });
  await run('existing payment confirmations are planned once without changing automation settings or running a sender',async()=>{
    const f=await fixture();await runEvent(f.event);
    const {syncInvoicePaymentCommunications}=await import('../src/lib/communications/queue.ts');
    const setting=check(await service.from('communication_settings').select('*').eq('singleton',true).single());
    const projection={...setting,automated_sending_enabled:true,payment_confirmation_enabled:true,invoice_reminder_enabled:false,updated_at:'1970-01-01T00:00:00Z'};
    // Only the settings read is projected. Actual local PostgREST queries and
    // unique queue inserts execute; the real master switch is never changed.
    const planner={from(table){if(table!=='communication_settings')return service.from(table);
      const q={select(){return q;},eq(){return q;},maybeSingle(){return Promise.resolve({data:projection,error:null});}};return q;
    }};
    assert.equal((await syncInvoicePaymentCommunications(planner,f.inv.id)).error,null);
    assert.equal((await syncInvoicePaymentCommunications(planner,f.inv.id)).error,null);
    const queued=check(await service.from('customer_communications').select('id,status').eq('invoice_id',f.inv.id).eq('communication_type','payment_confirmation'));
    assert.equal(queued.length,1);assert.equal(queued[0].status,'pending');
    check(await service.from('customer_communications').update({status:'cancelled',skip_reason:'Disposable PR06 verification complete.'}).eq('id',queued[0].id));
    assert.equal(check(await service.from('communication_settings').select('automated_sending_enabled').eq('singleton',true).single()).automated_sending_enabled,setting.automated_sending_enabled);
  });
  await run('different events for one invoice follow the shared invoice-first lock order',async()=>{
    const f=await fixture();const e=event('checkout.session.async_payment_succeeded',f.session.id);
    const events=[f.event,e],outcomes=await Promise.allSettled(events.map(current=>runEvent(current)));
    assert.ok(outcomes.some(r=>r.status==='fulfilled'&&r.value.status==='completed'));
    for(let i=0;i<outcomes.length;i++)if(outcomes[i].status==='rejected'){
      assert.equal(outcomes[i].reason.applicationErrorCode,'provider_snapshot_superseded');
      assert.equal((await receipt(events[i])).processed_at,null);await runEvent(events[i]);
    }
    assert.ok((await receipt(f.event)).processed_at);assert.ok((await receipt(e)).processed_at);
    assert.equal((await rows(f.inv)).length,1);assert.equal((await financial(f.inv)).balance_due_cents,0);
    const notices=check(await service.from('activity_log').select('id').eq('subject_id',f.inv.id).eq('event_type','customer_payment_succeeded'));assert.equal(notices.length,1);
  });
  await run('a committed notification effect does not grow its recipient set on another success event',async()=>{
    const f=await fixture();await runEvent(f.event);const later=await account('owner','later_recipient');
    await runEvent(event('checkout.session.async_payment_succeeded',f.session.id));
    assert.equal(check(await service.from('admin_notifications').select('id').eq('recipient_user_id',later.id).in('activity_id',check(await service.from('activity_log').select('id').eq('subject_id',f.inv.id)).map(a=>a.id))).length,0);
  });
  await run('unsupported signed events finish durably without provider or money work',async()=>{
    const e=event('local.unsupported','obj_local');const before=network.length,syncBefore=syncs;await runEvent(e);assert.equal(network.length,before);assert.equal(syncs,syncBefore);assert.ok((await receipt(e)).processed_at);
  });
  await run('a completed receipt replay before ACK is safe with no repeated downstream work',async()=>{
    const f=await fixture();await runEvent(f.event);const before={sends,syncs,reads:network.length};await runEvent(f.event);assert.deepEqual({sends,syncs,reads:network.length},before);
  });
  // Full route with Stripe's real signature verification, actual processor and DB;
  // all provider retrievals remain deterministic in-process doubles.
  await run('actual POST preserves signature checks and returns non-2xx for unfinished ownership',async()=>{
    const require=createRequire(import.meta.url),ts=require('typescript');
    const source=ts.transpileModule(readFileSync(new URL('../src/app/api/stripe/webhook/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const secret='local_signature_fixture_only';
    const config={configured:true,livemode:false,stripe:{...provider,webhooks:Stripe.webhooks}};
    const mocks={
      '@/lib/payments/webhook-recovery':{processStripeWebhook},'@/lib/payments/webhook-email':{sendWebhookNotificationEmail:deps.sendEmail},
      '@/lib/communications/queue':{syncInvoicePaymentCommunications:deps.syncCommunications},'@/lib/payments/webhook-logging':{safeWebhookLog},
      '@/lib/stripe/server':{getStripeServerConfig:()=>config,getStripeWebhookSecret:()=>secret},'@/lib/supabase/admin':{getServiceRoleClient:()=>service},
    };
    const module={exports:{}};new Function('require','module','exports',source)(name=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports);
    const f=await fixture(),body=JSON.stringify({...f.event,object:'event'});
    const post=sig=>module.exports.POST(new Request('http://127.0.0.1/api/stripe/webhook',{method:'POST',body,headers:{'stripe-signature':sig}}));
    assert.equal((await post('invalid')).status,400);assert.equal(check(await service.from('stripe_webhook_events').select('event_id').eq('event_id',f.event.id)).length,0);
    const signature=Stripe.webhooks.generateTestHeaderString({payload:body,secret});
    check(await claim(f.event));assert.equal((await post(signature)).status,503);
    await expire(f.event);assert.equal((await post(signature)).status,200);assert.equal((await post(signature)).status,200);
  });
  if(process.env.PR06_PREPARE_REVIEW_FILE){
    const f=await fixture();const a=await applied(f);
    check(await service.rpc('fail_stripe_webhook',{p_event_id:f.event.id,p_token:a.token,p_problem:'local_review_fixture'}));
    writeFileSync(process.env.PR06_PREPARE_REVIEW_FILE,JSON.stringify({eventId:f.event.id,invoiceId:f.inv.id},null,2));
  }
  if(process.env.PR06_RESULTS_FILE)writeFileSync(process.env.PR06_RESULTS_FILE,JSON.stringify({marker,results,provider_reads:network.length,configured_provider_sends:sends},null,2));
});
