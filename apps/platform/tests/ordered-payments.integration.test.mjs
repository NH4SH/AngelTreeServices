import {localPaymentTarget,guardPaymentFetch} from './local-payment-target.mjs';
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { processStripeWebhook, normalizeStripeWebhook } from "../src/lib/payments/webhook-recovery.ts";
import { createRequire } from "node:module";
import Stripe from "stripe";
import { createCheckoutBudget } from "../src/lib/payments/checkout-budget.ts";
import { safeWebhookLog } from "../src/lib/payments/webhook-logging.ts";

const enabled = process.env.PR07_DISPOSABLE_STACK === "1" && Boolean(process.env.PR07_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR07 ordered money: real Auth, refund observations and manual attempts", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR07_LOCAL_STATUS_FILE, "utf8"));
  const target=localPaymentTarget(c),networkGuard=guardPaymentFetch(target);
  t.after(()=>{networkGuard.restore();assert.equal(networkGuard.state.blocked,0);});
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR07_DOCKER_BIN;
  assert.ok(docker);
  const base = ["exec", "-i", target.container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  function sql(source) {
    return new Promise((resolve, reject) => {
      const p = spawn(docker, base, { env: process.env }); let out = "", err = "";
      p.stdout.on("data", b => out += b); p.stderr.on("data", b => err += b);
      p.on("error", reject); p.on("exit", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
      p.stdin.end(source);
    });
  }
  async function hold(source) {
    const p = spawn(docker, base, { env: process.env }); let err = "", lockerPid;
    p.stderr.on("data", b => err += b);
    const done = new Promise((resolve, reject) => { p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(new Error(err))); });
    const ready = new Promise((resolve, reject) => {
      p.stdout.on("data", b => { const match=String(b).match(/PR07_LOCKED:(\d+)/);if(match){lockerPid=Number(match[1]);resolve();} });
      p.on("error", reject); p.on("exit", () => reject(new Error("Lock session exited before readiness: " + err)));
    });
    p.stdin.write(`begin; ${source}; select 'PR07_LOCKED:'||pg_backend_pid();\n`);
    await ready;
    return Object.assign(async () => { p.stdin.end("commit;\n"); await done; },{pid:lockerPid});
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
    const u = check(await service.auth.admin.createUser({ email: `pr07-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR07 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin");
  const customer = check(await service.from("customers").insert({ display_name: `PR07 disposable ${marker}`, email: `pr07-${marker}@example.invalid` }).select("id").single());
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
  function event(type,objectId){return {id:`evt_pr07_${marker}_${++counter}`,type,created:Math.floor(Date.now()/1000),livemode:false,data:{object:{id:objectId}}};}
  async function fixture(channel='ach'){
    const inv=await invoice();const suffix=`${marker}_${++counter}`;
    const pi=`pi_pr07_${suffix}`,cs=`cs_test_pr07_${suffix}`,ch=`ch_pr07_${suffix}`;
    const row=await reservation(inv,'open',{payment_channel:channel,stripe_checkout_session_id:channel==='ach'?cs:null,stripe_payment_intent_id:pi,
      stripe_confirmation_token_id:channel==='card'?`ct_pr07_${suffix}`:null});
    const charge={id:ch,object:'charge',livemode:false,amount:1000,amount_refunded:0,currency:'usd',paid:true,payment_intent:pi,
      balance_transaction:{id:`txn_pr07_${suffix}`,fee:30,net:970},payment_method_details:channel==='card'?{card:{brand:'visa',funding:'credit'}}:{us_bank_account:{}}};
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
  const manualArgs=(inv,request=randomUUID(),amount=100)=>({p_request_id:request,p_invoice_id:inv.id,p_amount_cents:amount,p_paid_at:'2026-10-15T12:00:00.000Z',p_method:'cash',p_reference:'Disposable installment',p_notes:null});
  const record=(args,who=owner)=>who.client.rpc('record_manual_invoice_payment_request',args);
  const resolve=(inv,key,who=owner)=>who.client.rpc('resolve_manual_invoice_payment_request',{p_invoice_id:inv.id,p_request_id:key});
  const addRefund=(f,amount,status='succeeded')=>{
    const refund={id:`re_pr07_${marker}_${++counter}`,charge:f.charge.id,payment_intent:f.intent.id,amount,currency:'usd',status,created:Math.floor(Date.now()/1000)};
    const all=refundObjects.get(f.charge.id)??[];all.push(refund);refundObjects.set(f.charge.id,all);providerObjects.set(refund.id,refund);return refund;
  };
  const refundEvent=(refund,type='refund.updated')=>event(type,refund.id);
  const countAudit=async(inv,type)=>check(await service.from('activity_log').select('id').eq('subject_id',inv.id).eq('event_type',type)).length;
  await run('same request returns the original partial installment; a deliberate equal second installment remains valid',async()=>{
    const inv=await invoice(),args=manualArgs(inv);const first=check(await record(args)),again=check(await record(args));
    assert.equal(again.payment_id,first.payment_id);assert.equal(again.replayed,true);assert.equal((await rows(inv)).length,1);
    const second=check(await record({...args,p_request_id:randomUUID()}));assert.notEqual(second.payment_id,first.payment_id);
    assert.equal((await financial(inv)).balance_due_cents,800);assert.equal(await countAudit(inv,'manual_payment_recorded'),2);
  });
  await run('changed amount, method, date, invoice or actor cannot reuse an existing identity',async()=>{
    const inv=await invoice(),other=await invoice(),args=manualArgs(inv);check(await record(args));
    for(const change of [{p_amount_cents:101},{p_method:'check'},{p_paid_at:'2026-10-14T12:00:00Z'},{p_invoice_id:other.id}])denied(await record({...args,...change}),'23514');
    denied(await record(args,admin),'23514');assert.equal((await rows(inv)).length,1);assert.equal((await rows(other)).length,0);
  });
  await run('full-payment replay succeeds after paid state and never restores a corrected payment',async()=>{
    const inv=await invoice(),args=manualArgs(inv,randomUUID(),1000),first=check(await record(args));
    assert.equal(check(await record(args)).payment_id,first.payment_id);assert.equal((await financial(inv)).status,'paid');
    check(await owner.client.rpc('cancel_manual_invoice_payment',{p_invoice_id:inv.id,p_payment_id:first.payment_id,p_reason:'Disposable correction'}));
    const replay=check(await record(args));assert.equal(replay.payment_status,'cancelled');assert.equal((await financial(inv)).balance_due_cents,1000);
    check(await owner.client.rpc('restore_cancelled_manual_invoice_payment',{p_invoice_id:inv.id,p_payment_id:first.payment_id}));
    assert.equal((await financial(inv)).balance_due_cents,0);assert.equal(await countAudit(inv,'manual_payment_recorded'),1);
  });
  await run('resolve confirms a committed request, or tombstones it before a delayed original can arrive',async()=>{
    const inv=await invoice(),args=manualArgs(inv),first=check(await record(args));
    assert.equal(check(await resolve(inv,args.p_request_id)).payment_id,first.payment_id);
    const abandoned=manualArgs(inv);assert.equal(check(await resolve(inv,abandoned.p_request_id)).state,'abandoned');
    denied(await record(abandoned),'23514');assert.equal((await rows(inv)).length,1);
    check(await record({...abandoned,p_request_id:randomUUID()}));assert.equal((await rows(inv)).length,2);
  });
  await run('simultaneous replay has one payment/audit; simultaneous new installments both serialize',async()=>{
    const inv=await invoice(),args=manualArgs(inv);const pair=await Promise.all([record(args),record(args)]);const data=pair.map(r=>check(r));
    assert.equal(data[0].payment_id,data[1].payment_id);assert.equal(data.filter(d=>d.replayed).length,1);
    await Promise.all([record(manualArgs(inv)),record(manualArgs(inv))]).then(all=>all.forEach(r=>check(r)));
    assert.equal((await rows(inv)).length,3);assert.equal((await financial(inv)).balance_due_cents,700);assert.equal(await countAudit(inv,'manual_payment_recorded'),3);
  });
  await run('resolve racing record has exactly one durable outcome and no hidden delayed installment',async()=>{
    const inv=await invoice(),args=manualArgs(inv);const [recorded,resolved]=await Promise.all([record(args),resolve(inv,args.p_request_id)]);
    const settled=check(resolved),payments=await rows(inv);
    if(settled.state==='recorded'){check(recorded);assert.equal(payments.length,1);assert.equal(payments[0].id,settled.payment_id);}
    else{denied(recorded);assert.equal(payments.length,0);denied(await record(args));}
  });
  await run('manual audit failure rolls back money, request identity and balance together',async()=>{
    const inv=await invoice(),args=manualArgs(inv),constraint=`pr07_audit_${marker}`;
    await sql(`alter table public.activity_log add constraint ${constraint} check(not(subject_id='${inv.id}' and event_type='manual_payment_recorded')) not valid`);
    try{denied(await record(args));assert.equal((await rows(inv)).length,0);assert.equal((await financial(inv)).balance_due_cents,1000);}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    const result=check(await record(args));assert.equal(result.replayed,false);assert.equal((await financial(inv)).balance_due_cents,900);
  });
  await run('new commands retain owner/admin and old-JWT gates; unsafe legacy record/dispute RPCs are withdrawn',async()=>{
    const inv=await invoice(),args=manualArgs(inv),staff=await account('estimator');
    denied(await record(args,staff),'42501');denied(await anon.rpc('record_manual_invoice_payment_request',args),'42501');
    denied(await owner.client.rpc('record_manual_invoice_payment',{p_invoice_id:inv.id,p_amount_cents:100,p_paid_at:args.p_paid_at,p_method:'cash'}),'42501');
    denied(await service.rpc('reconcile_stripe_dispute',{p_charge_id:'ch_unknown',p_dispute_id:'dp_unknown',p_dispute_status:'lost',p_disputed_gross_cents:100,p_event_type:'charge.dispute.closed',p_event_created_at:args.p_paid_at}),'42501');
    const retired=await account('owner','retired');
    check(await owner.client.rpc('set_employee_access_status',{p_employee_id:retired.employeeId,p_status:'separated',p_reason:'Disposable PR07 gate'}));
    denied(await record(args,retired),'42501');denied(await resolve(inv,args.p_request_id,retired),'42501');
    for(const role of [anon,staff.client])denied(await role.rpc('prepare_stripe_webhook_snapshot',{p_event_id:'evt_missing',p_token:randomUUID(),p_evidence:{}}),'42501');
  });
  await run('pending refund does not reopen an invoice; success and later failure converge to current funds',async()=>{
    const f=await fixture();await runEvent(f.event);const refund=addRefund(f,400,'pending');f.charge.amount_refunded=400;
    await runEvent(refundEvent(refund,'refund.created'));assert.equal((await financial(f.inv)).balance_due_cents,0);
    await runEvent(refundEvent(refund));assert.equal(await countAudit(f.inv,'customer_payment_refunded'),1);
    refund.status='succeeded';await runEvent(refundEvent(refund));assert.equal((await financial(f.inv)).balance_due_cents,400);
    refund.status='failed';f.charge.amount_refunded=0;await runEvent(refundEvent(refund,'refund.failed'));
    assert.equal((await financial(f.inv)).balance_due_cents,0);assert.equal((await rows(f.inv))[0].refunded_principal_cents,0);
  });
  await run('full refund failure restores payment success; late success delivery cannot reapply the failed refund',async()=>{
    const f=await fixture(),refund=addRefund(f,1000);f.charge.amount_refunded=1000;await runEvent(f.event);
    assert.equal((await rows(f.inv))[0].status,'refunded');assert.equal((await financial(f.inv)).balance_due_cents,1000);
    refund.status='failed';f.charge.amount_refunded=0;const old=refundEvent(refund,'refund.failed');old.created-=86400;
    await runEvent(old);await runEvent(event('checkout.session.async_payment_succeeded',f.session.id));
    assert.equal((await rows(f.inv))[0].status,'succeeded');assert.equal((await financial(f.inv)).balance_due_cents,0);
  });
  await run('requires-action and canceled refunds retain history without counting uncompleted returned money',async()=>{
    const f=await fixture();await runEvent(f.event);const refund=addRefund(f,250,'requires_action');
    await runEvent(refundEvent(refund,'charge.refund.updated'));assert.equal((await financial(f.inv)).balance_due_cents,0);
    refund.status='succeeded';await runEvent(refundEvent(refund));assert.equal((await financial(f.inv)).balance_due_cents,250);
    refund.status='requires_action';await runEvent(refundEvent(refund));assert.equal((await financial(f.inv)).balance_due_cents,0);
    refund.status='canceled';await runEvent(refundEvent(refund));assert.equal((await financial(f.inv)).balance_due_cents,0);
  });
  await run('known refund omitted from a later list cannot erase its ledger or receive ACK',async()=>{
    const f=await fixture();await runEvent(f.event);const refund=addRefund(f,300);await runEvent(refundEvent(refund));
    refundObjects.set(f.charge.id,[]);const e=event('charge.refunded',f.charge.id);await assert.rejects(runEvent(e));
    assert.equal((await receipt(e)).processed_at,null);assert.equal((await rows(f.inv))[0].refunded_principal_cents,300);
    refundObjects.set(f.charge.id,[refund]);await runEvent(e);assert.equal((await financial(f.inv)).balance_due_cents,300);
  });
  await run('immutable refund amount, wrong currency, duplicate IDs and unknown status fail closed',async()=>{
    const f=await fixture();await runEvent(f.event);const refund=addRefund(f,200);await runEvent(refundEvent(refund));
    for(const change of [{amount:201},{currency:'eur'},{status:'made_up'}]){
      const saved={...refund};Object.assign(refund,change);const e=refundEvent(refund);await assert.rejects(runEvent(e));assert.equal((await receipt(e)).processed_at,null);Object.assign(refund,saved);
    }
    refundObjects.get(f.charge.id).push(refund);await assert.rejects(runEvent(event('charge.refunded',f.charge.id)));
    assert.equal((await rows(f.inv))[0].refunded_principal_cents,200);
  });
  await run('all refund pages are consumed, including later failed rows and the last successful cent',async()=>{
    const f=await fixture();await runEvent(f.event);for(let i=0;i<105;i++)addRefund(f,1,i===104?'succeeded':'failed');
    await runEvent(event('charge.refunded',f.charge.id));assert.equal((await financial(f.inv)).balance_due_cents,1);
  });
  await run('empty has-more pages and excessive pagination retain an unfinished receipt',async()=>{
    const f=await fixture();await runEvent(f.event);const e=event('charge.refunded',f.charge.id);
    await assert.rejects(runEvent(e,{stripe:{...provider,refunds:{...provider.refunds,list:async()=>({data:[],has_more:true})}}}));
    assert.equal((await receipt(e)).processed_at,null);
    for(let i=0;i<1001;i++)addRefund(f,1,'failed');await assert.rejects(runEvent(event('charge.refunded',f.charge.id)));
    assert.equal((await financial(f.inv)).balance_due_cents,0);
  });
  await run('a later invoice observation fences an older still-live snapshot, which recovers with fresh evidence',async()=>{
    const f=await fixture();await runEvent(f.event);const first=addRefund(f,400),a=refundEvent(first),owned=check(await claim(a));
    let evidence=await normalizeStripeWebhook(a,deps,createCheckoutBudget());
    evidence.snapshot_token=check(await service.rpc('prepare_stripe_webhook_snapshot',{p_event_id:a.id,p_token:owned.token,p_evidence:evidence}));
    const second=addRefund(f,400);await runEvent(refundEvent(second));
    const rejected=await service.rpc('apply_stripe_webhook',{p_event_id:a.id,p_token:owned.token,p_evidence:evidence});denied(rejected,'PT409');
    assert.equal((await financial(f.inv)).balance_due_cents,800);await expire(a);await runEvent(a);assert.equal((await financial(f.inv)).balance_due_cents,800);
  });
  await run('a provider response delayed until after a newer event commits cannot overwrite that event',async()=>{
    const f=await fixture();await runEvent(f.event);const first=addRefund(f,300);let entered,release;
    const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let held=false;
    const slow={...provider,refunds:{...provider.refunds,list:async args=>{const snapshot=await provider.refunds.list(args);if(args.charge===f.charge.id&&!held){held=true;entered();await gate;}return snapshot;}}};
    const older=refundEvent(first),pending=runEvent(older,{stripe:slow});await waiting;
    const second=addRefund(f,200);await runEvent(refundEvent(second));release();await assert.rejects(pending,/provider_snapshot_superseded/);
    assert.equal((await financial(f.inv)).balance_due_cents,500);await runEvent(older);assert.equal((await financial(f.inv)).balance_due_cents,500);
  });
  await run('manual payment and an irrevocable Stripe success serialize without losing either accepted fact',async()=>{
    const f=await fixture(),args=manualArgs(f.inv);const [manual,stripe]=await Promise.all([record(args),runEvent(f.event)]);assert.equal(stripe.status,'completed');
    const money=await rows(f.inv);assert.equal(money.filter(p=>p.provider==='stripe').length,1);
    if(manual.error)assert.equal(money.length,1);else{check(manual);assert.equal(money.length,2);assert.equal(money.reduce((n,p)=>n+p.amount_cents,0),1100);}
    assert.equal((await financial(f.inv)).balance_due_cents,0);
  });
  await run('a refund waits behind a manual command and derives balance from both committed changes',async()=>{
    const f=await fixture();await runEvent(f.event);const refund=addRefund(f,600);await runEvent(refundEvent(refund));
    const args=manualArgs(f.inv);const release=await hold(`select set_config('request.jwt.claim.sub','${owner.id}',true);select public.record_manual_invoice_payment_request('${args.p_request_id}','${f.inv.id}',100,'${args.p_paid_at}','cash','Disposable installment',null)`);
    refund.status='failed';let done=false;const updating=runEvent(refundEvent(refund,'refund.failed')).then(r=>{done=true;return r;});
    try{
      let blocked=false;
      for(let i=0;i<40&&!blocked;i++){
        blocked=Number(await sql(`select count(*) from pg_stat_activity where wait_event_type='Lock' and ${release.pid}=any(pg_blocking_pids(pid))`))>0;
        if(!blocked)await new Promise(r=>setTimeout(r,25));
      }
      assert.equal(blocked,true,'The provider apply/prepare must actually wait on the independent invoice transaction');assert.equal(done,false);
    }finally{await release();}
    await updating;assert.equal((await rows(f.inv)).length,2);assert.equal((await financial(f.inv)).balance_due_cents,0);
  });
  await run('disputes use current provider status, not older event creation time or a permanent lost/won gate',async()=>{
    const f=await fixture();await runEvent(f.event);const dispute={id:`dp_pr07_${marker}_${++counter}`,livemode:false,charge:f.charge.id,amount:500,status:'lost',currency:'usd'};providerObjects.set(dispute.id,dispute);
    await runEvent(event('charge.dispute.closed',dispute.id));assert.equal((await financial(f.inv)).balance_due_cents,500);
    dispute.status='won';const older=event('charge.dispute.updated',dispute.id);older.created-=86400;await runEvent(older);
    assert.equal((await financial(f.inv)).balance_due_cents,0);assert.equal((await rows(f.inv))[0].dispute_status,'won');
    const notices=await countAudit(f.inv,'customer_payment_dispute_updated'),sent=sends;assert.equal(notices,2);
    await runEvent(event('charge.dispute.funds_reinstated',dispute.id));assert.equal((await financial(f.inv)).balance_due_cents,0);
    assert.equal(await countAudit(f.inv,'customer_payment_dispute_updated'),notices);assert.equal(sends,sent);
  });
  await run('refund arriving before payment remains recoverable; success imports current refunds in the same transaction',async()=>{
    const f=await fixture(),refund=addRefund(f,500),early=refundEvent(refund);await assert.rejects(runEvent(early));assert.equal((await receipt(early)).processed_at,null);
    await runEvent(f.event);await runEvent(early);assert.equal((await rows(f.inv)).length,1);assert.equal((await financial(f.inv)).balance_due_cents,500);
  });
  await run('actual local mobile endpoint advertises safe requests and returns one payment reference on replay',async()=>{
    const origin=process.env.PR07_WEB_URL;assert.equal(origin,target.web);const inv=await invoice(),key=randomUUID();
    const body={requestId:key,amountCents:100,method:'cash',receivedAt:'2026-10-15T12:00:00Z'};
    const url=`${origin}/api/mobile/invoices/${inv.id}/manual-payment/attempt`;
    const post=async input=>{const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${owner.jwt}`,'Content-Type':'application/json'},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};};
    const detail=await fetch(`${origin}/api/mobile/invoices/${inv.id}`,{headers:{Authorization:`Bearer ${owner.jwt}`}});assert.equal((await detail.json()).data.manualPaymentRequestVersion,1);
    const first=await post(body);assert.equal(first.status,200);const again=await post(body);assert.equal(again.status,200);
    assert.equal(first.body.data.manualPayment.paymentId,again.body.data.manualPayment.paymentId);assert.equal(again.body.data.manualPayment.replayed,true);
    assert.equal((await rows(inv)).length,1);const missing=await post({...body,requestId:undefined});assert.equal(missing.status,400);
    const checked=await post({requestId:key,intent:'resolve'});assert.equal(checked.body.data.manualPayment.state,'recorded');
    const blocked=randomUUID();assert.equal((await post({requestId:blocked,intent:'resolve'})).body.data.manualPayment.state,'abandoned');
    assert.equal((await post({...body,requestId:blocked})).status,503);assert.equal((await rows(inv)).length,1);
  });
  await run('a known invoice binding cannot become an ignored ACK when provider metadata changes between reads',async()=>{
    const f=await fixture('card');let reads=0;
    const stripe={...provider,paymentIntents:{retrieve:async(...args)=>{const value=await provider.paymentIntents.retrieve(...args);if(++reads>1)value.metadata.payment_channel='ach';return value;}}};
    await assert.rejects(runEvent(f.event,{stripe}),/intent_binding_invalid/);assert.equal((await receipt(f.event)).processed_at,null);assert.equal((await rows(f.inv)).length,0);
    // The reservation may exist before a timed-out create response saved its
    // provider ID. Its immutable metadata binding must also prevent ignored ACK.
    check(await service.from('invoice_checkout_sessions').update({stripe_payment_intent_id:null}).eq('id',f.row.id));f.intent.metadata.payment_channel='ach';
    const unbound=event('payment_intent.succeeded',f.intent.id);await assert.rejects(runEvent(unbound),/intent_binding_invalid/);
    assert.equal((await receipt(unbound)).processed_at,null);assert.equal((await rows(f.inv)).length,0);
  });
  if(target.fresh)await run('more than 100 office notifications resume without repeating money or accepted emails',async()=>{
    const ids=Array.from({length:101},()=>randomUUID()),accepted=new Set();let mailCalls=0;
    try{
      // Synthetic recipients exist only in the independently guarded fresh stack.
      await sql(`insert into auth.users(id,email,raw_user_meta_data)values ${ids.map(id=>`('${id}','batch-${id}@example.invalid','{}')`).join(',')};
        update public.profiles set status='active'where id in (${ids.map(id=>`'${id}'`).join(',')});
        insert into public.employee_records(auth_user_id,legal_name,employment_status,is_active)
          select id,'PR07 isolated batch recipient','active',true from public.profiles where id in (${ids.map(id=>`'${id}'`).join(',')});
        insert into public.user_roles(user_id,role_id)select p.id,r.id from public.profiles p cross join public.roles r
          where p.id in (${ids.map(id=>`'${id}'`).join(',')})and r.name='admin';`);
      const f=await fixture();
      const extra={sendEmail:async input=>{assert.ok(!accepted.has(input.notificationId),'An accepted notification must never be sent twice');
        accepted.add(input.notificationId);mailCalls++;return{ok:true,configured:true,providerMessageId:'local_batch_'+mailCalls,retryable:false};}};
      await assert.rejects(runEvent(f.event,extra),/complete_receipt_failed/);
      const pending=await receipt(f.event);assert.equal(pending.processed_at,null);assert.equal(pending.phase,'effects_ready');assert.equal(pending.state,'failed');
      assert.equal((await rows(f.inv)).length,1);assert.equal((await financial(f.inv)).balance_due_cents,0);
      const first=check(await service.from('admin_notifications').select('id,stripe_email_state').eq('stripe_event_id',f.event.id));
      assert.ok(first.length>100);assert.equal(first.filter(n=>n.stripe_email_state==='accepted').length,100);assert.ok(first.some(n=>n.stripe_email_state==='queued'));
      assert.equal((await runEvent(f.event,extra)).status,'completed');
      const done=await receipt(f.event),notifications=check(await service.from('admin_notifications').select('id,stripe_email_state').eq('stripe_event_id',f.event.id));
      assert.ok(done.processed_at);assert.equal(notifications.length,first.length);assert.ok(notifications.every(n=>n.stripe_email_state==='accepted'));
      assert.equal(mailCalls,notifications.length);assert.equal(accepted.size,mailCalls);assert.equal((await rows(f.inv)).length,1);
      assert.equal(await countAudit(f.inv,'customer_payment_succeeded'),1);
      assert.equal((await runEvent(f.event,extra)).status,'completed');assert.equal(mailCalls,notifications.length);
    }finally{
      check(await service.from('profiles').update({status:'disabled'}).in('id',ids));
      check(await service.from('employee_records').update({employment_status:'separated',is_active:false}).in('auth_user_id',ids));
    }
  });
  if(process.env.PR07_RESULTS_FILE)writeFileSync(process.env.PR07_RESULTS_FILE,JSON.stringify({marker,results,provider_reads:network.length},null,2));
});
