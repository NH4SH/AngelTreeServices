import {callDeliveryCommand} from '../src/lib/email/delivery-commands.ts';
import {emailDeliveryContext} from '../src/lib/email/delivery-context.ts';
import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { load } from "./pr10-test-helpers.mjs";
import { withDeadline, mapBounded } from "../src/lib/runtime/deadline.ts";
import { netSuccessfulPaymentPrincipal } from "../src/lib/payments/payment-accounting.ts";
import { buildJobPhotoPath } from "../src/lib/storage/job-photo-paths.ts";
import { prepareSafeUpload } from "../src/lib/security/upload-validation.ts";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.PR10_DISPOSABLE_STACK === "1" && Boolean(process.env.PR10_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR10 provider outcomes and mandatory photo audit with real local Auth, RLS and concurrent transactions", { skip: !enabled, timeout: 240000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR10_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR10_DOCKER_BIN;
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
    const p=spawn(docker,base,{env:process.env});let err='',pid;
    p.stderr.on('data',b=>err+=b);
    const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(err)));});
    const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{const m=String(b).match(/PR10_LOCKED:(\d+)/);if(m){pid=Number(m[1]);resolve();}});p.on('error',reject);p.on('exit',()=>reject(new Error('Lock exited before ready: '+err)));});
    p.stdin.write(`begin; ${source}; select 'PR10_LOCKED:'||pg_backend_pid();\n`);await ready;
    return Object.assign(async()=>{p.stdin.end('rollback;\n');await done;},{pid});
  }
  async function waitBlocked(pid) {
    for(let i=0;i<40;i++) {
      if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`))>0)return;
      await new Promise(r=>setTimeout(r,25));
    }
    assert.fail('Independent transaction did not reach the expected parent lock');
  }
  const service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, options);
  const anon = createClient(c.API_URL, c.ANON_KEY, options);
  const marker = randomBytes(5).toString("hex"), results = [], accountIds = [];
  t.after(async()=>{
    if(accountIds.length) {check(await service.from("profiles").update({status:"disabled"}).in("id",accountIds));check(await service.from("employee_records").update({is_active:false,employment_status:"separated"}).in("auth_user_id",accountIds));}
  });
  const check = (r, label = "request") => { assert.ifError(r.error && new Error(`${label}: ${r.error.message} [${r.error.code}]`)); return r.data; };
  const denied = (r, code) => { assert.ok(r.error, "Expected rejection"); if (code) assert.equal(r.error.code, code); };
  const client = jwt => createClient(c.API_URL, c.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  async function account(role, label = role) {
    check(await service.from("roles").upsert({ name: role }, { onConflict: "name" }));
    const password = randomBytes(24).toString("base64url");
    const u = check(await service.auth.admin.createUser({ email: `pr10-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    accountIds.push(u.id);
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR10 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin"), estimator = await account("estimator"), payroll = await account("payroll_admin");
  const customer=check(await service.from('customers').insert({display_name:`PR10 disposable ${marker}`,email:`pr10-${marker}@example.invalid`}).select('id').single());
  const location=check(await service.from('service_locations').insert({customer_id:customer.id,label:'PR10 local property',street:'123 Test Street',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
  const run=async(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  let seq=0;
  async function job(extra={}) {return check(await service.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'scheduled',service_type:'tree_removal',requested_scope:'Synthetic PR10 work only',...extra}).select('*').single());}
  async function quote(j,amount=1000,extra={}) {
    const row=check(await service.from('quotes').insert({job_id:j?.id??null,customer_id:customer.id,service_location_id:location.id,status:'approved',subtotal_cents:amount,tax_cents:100,total_cents:amount+100,...extra}).select('*').single());
    if(amount) check(await service.from('quote_line_items').insert({quote_id:row.id,name:`PR10 source ${++seq}`,quantity:1,unit_price_cents:amount,total_cents:amount}));
    if(j) check(await service.from('jobs').update({source_quote_id:row.id}).eq('id',j.id));
    return row;
  }
  async function addition(j,extra={}) {
    const row=check(await service.from('change_orders').insert({job_id:j.id,customer_id:j.customer_id,organization_id:j.organization_id,service_location_id:j.service_location_id,
      source_quote_id:j.source_quote_id,created_by_user_id:owner.id,title:'PR10 additional work',status:'approved',subtotal_cents:500,tax_cents:50,fee_cents:25,total_cents:575,...extra}).select('*').single());
    check(await service.from('change_order_line_items').insert({change_order_id:row.id,title:'Approved limb removal',quantity:1,unit_price_cents:500,amount_cents:500}));return row;
  }
  async function session(j){return check(await service.from('schedule_events').insert({job_id:j.id,service_location_id:j.service_location_id,title:'PR10 work session',event_type:'job',status:'scheduled',starts_at:'2026-11-01T14:00:00Z',ends_at:'2026-11-01T16:00:00Z',created_by_user_id:owner.id}).select('*').single());}
  const gen=(j,id=randomUUID(),actor=owner,extra={})=>actor.client.rpc('generate_job_invoice',{p_request_id:id,p_job_id:j?.id??null,...extra});
  const read=async id=>check(await service.from('invoices').select('*,invoice_line_items(*)').eq('id',id).single());
  const jobRead=async j=>check(await service.from('jobs').select('*').eq('id',j.id).single());
  const invoices=async j=>check(await service.from('invoices').select('id').eq('job_id',j.id));
  const requests=async j=>JSON.parse(await sql(`select coalesce(json_agg(r),'[]') from app_private.invoice_generation_requests r where job_id='${j.id}'`));
  const crew=await account('crew'),other=await account('customer');
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:'#285a42'}}).png().toBuffer();
  const cryptoModule=await import('node:crypto');
  const scannerModule=await import('../src/lib/security/document-scanner.ts');
  const attachmentModule=load('../src/lib/security/attachment-scan-service.ts',{'server-only':{},'node:crypto':cryptoModule,'./document-scan-service':{getDocumentScanClient:()=>service},'./document-scanner':scannerModule});
  const uploadModule=load('../src/lib/storage/job-photo-upload.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'next/cache':{revalidatePath(){}},'@/lib/storage/job-photo-paths':{buildJobPhotoPath,JOB_PHOTO_BUCKET:'job-photos'},'@/lib/security/upload-validation':{prepareSafeUpload},'@/lib/security/attachment-scan-service':attachmentModule});
  const upload=(j,actor=owner,category='completion')=>uploadModule.uploadJobPhotoForUser({caption:'PR10 disposable photo',category,file:new File([bytes],'local.png',{type:'image/png'}),jobId:j.id,supabase:actor.client,userId:actor.id});
  const photos=async j=>check(await service.from('job_photos').select('*').eq('job_id',j.id));
  const photoAudits=async j=>check(await service.from('activity_log').select('*').eq('subject_id',j.id).eq('event_type','job_photo_uploaded'));
  await run('all six photo categories persist their metadata and mandatory audit exactly once without service credentials',async()=>{
    const j=await job({assigned_crew_user_id:crew.id,assigned_crew_employee_id:crew.employeeId});
    for(const actor of [owner,admin,estimator,payroll,crew])for(const category of ['before','during','after','issue','completion','equipment_access']) {
      assert.equal((await upload(j,actor,category)).status,'success');
    }
    const records=await photos(j),audits=await photoAudits(j);assert.equal(records.length,30);assert.equal(audits.length,30);
    for(const photo of records){const matches=audits.filter(a=>a.metadata_json.photo_id===photo.id);assert.equal(matches.length,1);assert.equal(matches[0].actor_user_id,photo.uploaded_by_user_id);assert.equal(matches[0].metadata_json.photo_type,photo.photo_type);}
    assert.equal((await jobRead(j)).completed_at,null);
  });
  await run('a mandatory photo audit failure rolls metadata back and removes only the newly uploaded private object',async()=>{
    const j=await job(),constraint=`pr10_photo_${marker}`;await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${j.id}'::uuid or event_type<>'job_photo_uploaded') not valid`);
    try{const r=await upload(j);assert.equal(r.status,'error');assert.equal((await photos(j)).length,0);assert.equal((await photoAudits(j)).length,0);assert.equal(await sql(`select count(*) from storage.objects where bucket_id='job-photos' and name like '${j.id}/%'`),'0');}
    finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    assert.equal((await upload(j)).status,'success');assert.equal((await photoAudits(j)).length,1);
  });
  await run('direct metadata inserts also receive the audit and cannot forge another uploader',async()=>{
    const j=await job();check(await owner.client.from('job_photos').insert({job_id:j.id,uploaded_by_user_id:owner.id,photo_type:'before',storage_path:`${j.id}/before/imported-local.png`}));assert.equal((await photoAudits(j)).length,1);
    denied(await owner.client.from('job_photos').insert({job_id:j.id,uploaded_by_user_id:admin.id,photo_type:'before',storage_path:`${j.id}/before/forged.png` }),'42501');assert.equal((await photos(j)).length,1);
    denied(await owner.client.from('activity_log').insert({actor_user_id:owner.id,subject_type:'job',subject_id:j.id,event_type:'forged'}),'42501');
  });
  await run('anonymous, unassigned crew, disabled issued JWTs and cross-job uploads remain denied',async()=>{
    const j=await job();assert.equal((await upload(j,crew)).status,'error');assert.equal((await upload(j,other)).status,'error');
    denied(await anon.from('job_photos').insert({job_id:j.id,photo_type:'before',storage_path:'invalid'}),'42501');
    const actor=await account('admin','disabled-photo');check(await service.from('profiles').update({status:'disabled'}).eq('id',actor.id));assert.equal((await upload(j,actor)).status,'error');assert.equal((await photoAudits(j)).length,0);
  });
  await run('the audit trigger grants no general audit write or callable privileged endpoint',async()=>{
    for(const role of ['authenticated','anon','service_role'])assert.equal(await sql(`select has_function_privilege('${role}','app_private.audit_job_photo_upload()','EXECUTE')`),'f');
    assert.equal(await sql("select has_table_privilege('authenticated','public.activity_log','INSERT')"),'f');
    const bucket=check(await service.storage.getBucket('job-photos'));assert.equal(bucket.public,false);
  });
  const queueJob=await job();
  const pending=async(extra={})=>check(await service.from('customer_communications').insert({job_id:queueJob.id,customer_id:customer.id,communication_type:'work_reminder',reminder_stage:'manual_now',recipient_source:'customer',recipient_email:'pr10-local@example.invalid',scheduled_for:'1900-01-01T00:00:00Z',status:'pending',idempotency_key:`pr10-${randomUUID()}`,...extra}).select('*').single());
  await run('expired processing is quarantined without automatic resend; known acceptance reconciles from history',async()=>{
    const a=await pending({status:'processing',processing_started_at:'2000-01-01T00:00:00Z',attempt_count:1}),b=await pending({status:'processing',processing_started_at:'2000-01-01T00:00:00Z',attempt_count:1});
    check(await service.from('email_events').insert({recipient_email:'pr10-local@example.invalid',subject:'Local receipt',email_type:'work_reminder',status:'sent',related_communication_id:b.id,provider_message_id:'local-accepted-before-crash',sent_at:new Date().toISOString()}));
    const output=await sql(`begin;set local role service_role;select count(*) from public.claim_due_customer_communications(1);select jsonb_agg(jsonb_build_object('id',id,'status',status,'attempt_count',attempt_count,'provider_message_id',provider_message_id) order by id) from public.customer_communications where id in('${a.id}','${b.id}');rollback;`);
    const rows=JSON.parse(output.split('\n').find(x=>x.startsWith('[')));assert.equal(rows.find(x=>x.id===a.id).status,'failed');assert.equal(rows.find(x=>x.id===b.id).status,'sent');assert.ok(rows.every(x=>x.attempt_count===1));
    check(await service.from('customer_communications').update({status:'cancelled',processing_started_at:null}).in('id',[a.id,b.id]));
  });
  await run('independent transactions claim different due rows with skip-locked and authenticated callers cannot claim batches',async()=>{
    const a=await pending(),b=await pending({scheduled_for:'1900-01-02T00:00:00Z'});
    const release=await hold(`set local role service_role;select id from public.claim_due_customer_communications(1)`);
    try{const out=await sql('begin;set local role service_role;select id from public.claim_due_customer_communications(1);rollback;');assert.equal(out,b.id);}
    finally{await release();}
    denied(await owner.client.rpc('claim_due_customer_communications',{p_limit:1}),'42501');denied(await anon.rpc('claim_due_customer_communications',{p_limit:1}),'42501');
    check(await service.from('customer_communications').update({status:'cancelled',processing_started_at:null}).in('id',[a.id,b.id]));
  });
  // Only Resend is mocked. Auth, RLS, queue reads/claims/acks and email history use
  // real loopback HTTP/PostgreSQL. Unknown network destinations are forbidden.
  const nativeFetch=globalThis.fetch;let transport='accepted',sendCount=0,active=0,peak=0,templateBalance;
  globalThis.fetch=async(url,init)=>{const target=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url);
    if(target.origin==='https://api.resend.com'){assert.match(JSON.parse(init.body).to[0],/@example.invalid$/);sendCount++;active++;peak=Math.max(peak,active);try{if(transport==='timeout')return await new Promise(()=>{});if(transport==='429')return new Response('{"message":"LOCAL REJECTION"}',{status:429});return new Response(JSON.stringify({id:`local-pr10-${randomUUID()}`}),{status:200});}finally{active--;}}
    assert.equal(target.origin,c.API_URL,'External network is forbidden');return nativeFetch(url,init);
  };
  t.after(()=>{globalThis.fetch=nativeFetch;});
  const sender=load('../src/lib/email/send.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'@/lib/email/config':{getEmailProviderConfig:()=>({apiKey:'LOCAL-NONCREDENTIAL',from:'office@example.invalid',replyTo:'office@example.invalid'})},'@/lib/supabase/admin':{getServiceRoleClient:()=>assert.fail('Use local DB')},'@/lib/runtime/deadline':{withDeadline},'@/lib/email/delivery-followups':{completeDeliveryFollowups:()=>assert.fail('Transport-only test')},'@/lib/email/delivery':{sendDurableEmail:()=>assert.fail('Transport-only test')}}).sendEmailTransport;
  const processor=load('../src/lib/communications/processor.ts',{'server-only':{},'@/lib/email/delivery-commands':{callDeliveryCommand},'../quotes/proposal-number.ts':{formatProposalNumber:x=>x},'@/lib/payments/payment-accounting':{netSuccessfulPaymentPrincipal},'@/lib/communications/portal-links':{getExistingCommunicationPortalUrl:async()=>({url:'http://127.0.0.1:3102/local-only-test'})},'@/lib/communications/queue':{syncAutomatedCommunications:async()=>({error:null}),getCommunicationSettingsFromClient:async db=>{const r=await db.from('communication_settings').select('*').eq('singleton',true).single();return{data:r.data,error:r.error?.message};}},'@/lib/communications/templates':{invoiceReminderTemplate:args=>{templateBalance=args.balanceDueCents;return{subject:'Local test reminder',text:'Local only',html:'<p>Local</p>'};}},'@/lib/email/delivery-context':{emailDeliveryContext},'@/lib/email/send':{sendTransactionalEmail:()=>assert.fail('Use mock transport')},'@/lib/supabase/admin':{getServiceRoleClient:()=>assert.fail('Use local DB')},'@/lib/runtime/deadline':{withDeadline,mapBounded}});
  const reminder=async()=>{const inv=check(await service.from('invoices').insert({customer_id:customer.id,status:'sent',subtotal_cents:1000,tax_cents:0,total_cents:1000,balance_due_cents:1000,sent_at:new Date().toISOString()}).select('id').single());return pending({invoice_id:inv.id,communication_type:'invoice_payment_reminder',scheduled_for:new Date().toISOString()});};
  const processReminder=id=>processor.processCommunicationById(id,{db:service,send:input=>sender({...input,timeoutMs:20})});
  await run('actual queue acceptance records one provider receipt and one sent acknowledgement; repeated clicks do not send',async()=>{
    const row=await reminder(),before=sendCount,r=await processReminder(row.id);assert.equal(r.recorded,true);assert.equal(r.outcome,'accepted');assert.equal(templateBalance,1000);assert.equal(sendCount,before+1);
    assert.equal(check(await service.from('email_events').select('id').eq('related_communication_id',row.id).eq('status','sent')).length,1);await processReminder(row.id);assert.equal(sendCount,before+1);
  });
  await run('real simultaneous manual claims have one sender and one retained delivery',async()=>{
    const row=await reminder(),before=sendCount;await Promise.all([processReminder(row.id),processReminder(row.id)]);assert.equal(sendCount,before+1);assert.equal(check(await service.from('customer_communications').select('status').eq('id',row.id).single()).status,'sent');
  });
  await run('provider acceptance plus an injected history failure is never misreported as not sent',async()=>{
    const row=await reminder(),constraint=`pr10_history_${marker}`;await sql(`alter table public.email_events add constraint ${constraint} check(related_communication_id<>'${row.id}'::uuid) not valid`);
    try{const r=await processReminder(row.id);assert.equal(r.outcome,'accepted');assert.equal(r.recorded,false);assert.equal(check(await service.from('customer_communications').select('status').eq('id',row.id).single()).status,'sent');}
    finally{await sql(`alter table public.email_events drop constraint ${constraint}`);}
  });
  await run('provider acceptance plus failed queue acknowledgement retains history and does not repeat the send',async()=>{
    const row=await reminder(),constraint=`pr10_ack_${marker}`,before=sendCount;await sql(`alter table public.customer_communications add constraint ${constraint} check(id<>'${row.id}'::uuid or status<>'sent') not valid`);
    try{const r=await processReminder(row.id);assert.equal(r.outcome,'accepted');assert.equal(r.recorded,false);assert.equal(check(await service.from('customer_communications').select('status').eq('id',row.id).single()).status,'processing');await processReminder(row.id);assert.equal(sendCount,before+1);}
    finally{await sql(`alter table public.customer_communications drop constraint ${constraint}`);check(await service.from('customer_communications').update({status:'cancelled',processing_started_at:null}).eq('id',row.id));}
  });
  await run('timed-out transport becomes a reviewable failed delivery without resending or leaking diagnostics',async()=>{
    transport='timeout';const row=await reminder(),before=sendCount;try{const r=await processReminder(row.id);assert.equal(r.outcome,'unknown');assert.match(r.message,/before sending again/);await processReminder(row.id);assert.equal(sendCount,before+1);assert.equal(check(await service.from('customer_communications').select('status').eq('id',row.id).single()).status,'failed');}finally{transport='accepted';}
  });
  await run('known 429 rejection uses a saved pending retry and does not claim clean acceptance',async()=>{
    transport='429';const row=await reminder();try{const r=await processReminder(row.id);assert.equal(r.status,'pending');assert.equal(r.outcome,'not_sent');const saved=check(await service.from('customer_communications').select('status,attempt_count,scheduled_for').eq('id',row.id).single());assert.equal(saved.attempt_count,1);assert.ok(Date.parse(saved.scheduled_for)>Date.now());}finally{transport='accepted';check(await service.from('customer_communications').update({status:'cancelled'}).eq('id',row.id));}
  });
  if(process.env.PR10_RESULTS_FILE)writeFileSync(process.env.PR10_RESULTS_FILE,JSON.stringify({marker,checks:results.length,results},null,2));
});
