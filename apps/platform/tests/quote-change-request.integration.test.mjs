import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {load} from './pr10-test-helpers.mjs';
import {createClient} from '@supabase/supabase-js';

const enabled=process.env.QUOTE_CHANGE_DISPOSABLE==='1'&&Boolean(process.env.QUOTE_CHANGE_LOCAL_STATUS_FILE);
test('quote change requests: real local authorization, atomicity, concurrency and recovery',{skip:!enabled,timeout:180000},async t=>{
  const c=JSON.parse(readFileSync(process.env.QUOTE_CHANGE_LOCAL_STATUS_FILE,'utf8')),web=process.env.QUOTE_CHANGE_WEB_URL;
  assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.equal(web,'http://127.0.0.1:3102');
  const originalFetch=globalThis.fetch;let blocked=0;
  const localFetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    if(![c.API_URL,web].includes(url.origin)){blocked++;throw Error('Non-local customer portal request blocked');}
    return originalFetch(input,init);
  };
  const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}};
  const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),anon=createClient(c.API_URL,c.ANON_KEY,opts);
  const marker='QUOTE_CHANGE_LOCAL_'+randomUUID().replaceAll('-',''),privateCanary='PRIVATE_'+randomUUID().replaceAll('-',''),encryptedCanary='ENCRYPTED_'+randomUUID();
  const tokens=[],proof=[];let actor,auth,client,invoiceId;
  const ok=r=>{assert.ifError(r.error&&new Error(r.error.code+': '+r.error.message));return r.data;};
  t.after(async()=>{
    try{if(auth)ok(await auth.auth.signOut({scope:'global'}));}
    finally{
      for(const kind of ['quote','invoice']){const ids=tokens.filter(t=>t.kind===kind).map(t=>t.id);if(ids.length)ok(await db.from(kind+'_portal_tokens').update({revoked_at:new Date().toISOString()}).in('id',ids));}
      if(actor){ok(await db.from('profiles').update({status:'disabled'}).eq('id',actor.id));ok(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',actor.id));}
      assert.equal(blocked,0);
      if(process.env.QUOTE_CHANGE_RESULTS_FILE)writeFileSync(process.env.QUOTE_CHANGE_RESULTS_FILE,JSON.stringify({marker,proof,syntheticActorsRetired:actor?1:0,syntheticTokensRevoked:tokens.length,blockedOutbound:blocked,providerRequests:0},null,2)+'\n',{mode:0o600});
    }
  });
  const password=randomUUID()+randomUUID();actor=ok(await db.auth.admin.createUser({email:marker.toLowerCase()+'@example.invalid',password,email_confirm:true})).user;
  ok(await db.from('profiles').update({status:'active'}).eq('id',actor.id));
  ok(await db.from('employee_records').insert({auth_user_id:actor.id,legal_name:marker,is_active:true,employment_status:'active'}));
  const role=ok(await db.from('roles').select('id').eq('name','owner').single());ok(await db.from('user_roles').insert({user_id:actor.id,role_id:role.id}));
  auth=createClient(c.API_URL,c.ANON_KEY,opts);const jwt=ok(await auth.auth.signInWithPassword({email:actor.email,password})).session.access_token;
  client=createClient(c.API_URL,c.ANON_KEY,{...opts,global:{fetch:localFetch,headers:{authorization:'Bearer '+jwt}}});
  const customer=ok(await db.from('customers').insert({display_name:marker,email:marker.toLowerCase()+'@example.invalid'}).select('id').single());
  const location=ok(await db.from('service_locations').insert({customer_id:customer.id,label:'Synthetic service site',street:'123 Synthetic Lane',city:'Fredericksburg',state:'VA',postal_code:'22401',gate_code:privateCanary,access_notes:privateCanary,service_notes:privateCanary}).select('id').single());
  ok(await db.from('notes').insert({customer_id:customer.id,service_location_id:location.id,visibility:'internal',body:privateCanary,author_user_id:actor.id}));
  const draft=ok(await client.rpc('create_quote_draft',{p_header:{customer_id:customer.id,service_location_id:location.id,customer_message:'Synthetic customer-facing scope'},p_lines:[{name:marker+' scope',description:'Synthetic service only',quantity:2,unit_price_cents:12000,total_cents:24000}]}));
  const quote=()=>db.from('quotes').select('*,quote_line_items(*)').eq('id',draft.id).single().then(ok);
  async function token(kind,id,extra={}){
    const raw=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(raw).digest('hex');
    const row=ok(await db.from(kind+'_portal_tokens').insert({[kind+'_id']:id,customer_id:customer.id,token_hash:hash,token_encrypted:encryptedCanary,created_by_user_id:actor.id,expires_at:new Date(Date.now()+86400000).toISOString(),...extra}).select('id').single());
    const item={id:row.id,raw,hash,kind};tokens.push(item);return item;
  }
  const active=await token('quote',draft.id);
  const run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,pass:true});});
  assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const docker=process.env.QUOTE_CHANGE_DOCKER_BIN;assert.ok(docker);
  const base=['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
  function processSQL(source,hold=false){
    const p=spawn(docker,base,{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);
    const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve(out.trim()):reject(Error(err)));});
    if(hold){p.stdin.write(`begin;${source};select 'CHANGE_LOCK:'||pg_backend_pid();\n`);return{p,done,ready:new Promise((resolve,reject)=>{p.stdout.on('data',()=>{const m=out.match(/CHANGE_LOCK:(\d+)/);if(m)resolve(Number(m[1]));});p.on('error',reject);})};}
    p.stdin.end(source);return done;
  }
  const sql=s=>processSQL(s);
  async function hold(source){const x=processSQL(source,true),pid=await x.ready;return Object.assign(async()=>{x.p.stdin.end('commit;\n');await x.done;},{pid});}
  async function waitBlocked(pid){for(let n=0;n<60;n++){if(Number(await sql(`select count(*) from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))`)))return;await new Promise(r=>setTimeout(r,25));}assert.fail('Command never reached independent lock');}
  const denied=(r,code)=>assert.equal(r.error?.code,code,JSON.stringify(r.error));
  const read=async q=>ok(await db.from('quotes').select('*').eq('id',q.id).single());
  async function newDraft(linked=false){let jobId;if(linked)jobId=ok(await db.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,status:'quoted',service_type:'other',requested_scope:marker}).select('id').single()).id;
    return read(ok(await client.rpc('create_quote_draft',{p_header:{customer_id:customer.id,service_location_id:location.id,job_id:jobId},p_lines:[{name:marker,quantity:1,unit_price_cents:1000,total_cents:1000}]})));}
  const args=(q,k,extra={})=>({p_request_id:randomUUID(),p_token_hash:k.hash,p_expected_revision:q.edit_revision,p_message:'Please adjust the synthetic scope',...extra});
  const change=a=>db.rpc('request_quote_changes_by_portal',a);
  const events=async q=>ok(await db.from('activity_log').select('*').eq('subject_id',q.id).eq('event_type','quote_change_request_recorded'));
  const notes=async()=>ok(await db.from('notes').select('*').eq('customer_id',customer.id));
  const receipt=async id=>JSON.parse(await sql(`select coalesce(jsonb_agg(to_jsonb(r)),'[]') from app_private.quote_change_requests r where request_id='${id}'`));
  const state=async(q,k,id)=>({q:await read(q),notes:await notes(),token:ok(await db.from('quote_portal_tokens').select('*').eq('id',k.id).single()),reminders:ok(await db.from('customer_communications').select('*').eq('quote_id',q.id)),events:await events(q),receipt:await receipt(id)});
  await run('simultaneous duplicate requests commit one note, revision, audit and stable replay',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k),before=(await notes()).length;
    const replies=(await Promise.all([change(a),change(a),change(a)])).map(ok);assert.equal(replies.filter(r=>!r.replayed).length,1);assert.equal(new Set(replies.map(r=>r.note_id)).size,1);
    assert.equal((await notes()).length,before+1);assert.equal((await read(q)).edit_revision,q.edit_revision+1);assert.equal((await events(q)).length,1);assert.equal((await receipt(a.p_request_id)).length,1);
    const saved=await state(q,k,a.p_request_id);assert.equal(ok(await change(a)).replayed,true);assert.deepEqual(await state(q,k,a.p_request_id),saved);
    denied(await change({...a,p_message:'Different payload'}),'22023');const other=await token('quote',q.id);denied(await change({...a,p_token_hash:other.hash}),'22023');
  });
  await run('second intentional note advances revision while already change_requested and invalidates old approval',async()=>{
    const q=await newDraft(),k=await token('quote',q.id);ok(await change(args(q,k)));const next=await read(q);ok(await change(args(next,k,{p_message:'Another considered adjustment'})));
    assert.equal((await read(q)).edit_revision,next.edit_revision+1);denied(await db.rpc('approve_quote_by_portal',{p_token_hash:k.hash,p_expected_revision:next.edit_revision}),'40001');
  });
  await run('stale review and closed or archived proposals create no notes or receipts',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k);ok(await db.from('quotes').update({customer_message:'New scope'}).eq('id',q.id));
    const before=await state(q,k,a.p_request_id);denied(await change(a),'40001');assert.deepEqual(await state(q,k,a.p_request_id),before);
    ok(await db.from('quotes').update({status:'declined'}).eq('id',q.id));denied(await change(args(await read(q),k)),'23514');
    const archived=await newDraft(),ka=await token('quote',archived.id);ok(await db.from('quotes').update({archived_at:new Date().toISOString()}).eq('id',archived.id));denied(await change(args(archived,ka)),'42501');assert.equal((await events(archived)).length,0);
  });
  await run('approval versus change request chooses one transaction without reopening or orphan notes',async()=>{
    for(let n=0;n<3;n++){const q=await newDraft(n===0),k=await token('quote',q.id),a=args(q,k),before=(await notes()).length;
      const [changed,approval]=await Promise.all([change(a),db.rpc('approve_quote_by_portal',{p_token_hash:k.hash,p_expected_revision:q.edit_revision})]);
      const after=await read(q);if(changed.error){denied(changed,'40001');ok(approval);assert.equal(after.status,'approved');assert.equal((await notes()).length,before);assert.equal((await events(q)).length,0);}
      else{ok(changed);denied(approval,'40001');assert.equal(after.status,'change_requested');assert.equal((await notes()).length,before+1);assert.equal(ok(await db.from('jobs').select('id').eq('source_quote_id',q.id)).length,0);}
    }
  });
  await run('real editor lock rechecks revision after waiting',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k),release=await hold(`update public.quotes set customer_message='Editor won' where id='${q.id}'`),pending=change(a).then(r=>r);
    try{await waitBlocked(release.pid);}finally{await release();}denied(await pending,'40001');assert.equal((await receipt(a.p_request_id)).length,0);assert.equal((await events(q)).length,0);
  });
  await run('revocation and expiry committed during parent lock are rechecked after waiting',async()=>{
    for(const kind of ['revoked','expired']){const q=await newDraft(true),k=await token('quote',q.id),a=args(q,k),release=await hold(`select id from public.jobs where id='${q.job_id}' for update;update public.quote_portal_tokens set ${kind==='revoked'?'revoked_at=clock_timestamp()':"expires_at=clock_timestamp()-interval '1 second'"} where id='${k.id}'`),pending=change(a).then(r=>r);
      try{await waitBlocked(release.pid);}finally{await release();}denied(await pending,'42501');assert.equal((await read(q)).status,'draft');assert.equal((await events(q)).length,0);assert.equal((await receipt(a.p_request_id)).length,0);
    }
  });
  await run('wall-clock expiry during an actual lock wait is refused even though the transaction began earlier',async()=>{
    const q=await newDraft(true),k=await token('quote',q.id),a=args(q,k);
    const release=await hold(`select id from public.jobs where id='${q.job_id}' for update;update public.quote_portal_tokens set expires_at=clock_timestamp()+interval '900 milliseconds' where id='${k.id}'`);
    const pending=change(a).then(r=>r);
    try{await waitBlocked(release.pid);await sql('select pg_sleep(1.1)');}finally{await release();}
    denied(await pending,'42501');assert.equal((await read(q)).status,'draft');assert.equal((await receipt(a.p_request_id)).length,0);
  });
  await run('audit failure rolls back note, quote, reminders, token and receipt; retry succeeds',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k);
    for(const status of ['pending','processing'])ok(await db.from('customer_communications').insert({customer_id:customer.id,quote_id:q.id,communication_type:'quote_follow_up',reminder_stage:'first',recipient_source:'customer',recipient_email:marker.toLowerCase()+'@example.invalid',scheduled_for:new Date().toISOString(),status,idempotency_key:randomUUID()}));
    const before=await state(q,k,a.p_request_id),constraint='qc_failure_'+randomUUID().replaceAll('-','');
    await sql(`alter table public.activity_log add constraint ${constraint} check(subject_id<>'${q.id}'::uuid or event_type<>'quote_change_request_recorded') not valid`);
    try{denied(await change(a),'23514');assert.deepEqual(await state(q,k,a.p_request_id),before);}finally{await sql(`alter table public.activity_log drop constraint ${constraint}`);}
    ok(await change(a));const after=await state(q,k,a.p_request_id);assert.deepEqual(after.reminders.map(r=>r.status).sort(),['cancelled','processing']);assert.ok(after.token.used_at);assert.equal(after.events.length,1);
  });
  await run('lost response replays after approval; revoked link cannot recover or mutate receipt',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k),saved=ok(await change(a)),current=await read(q);ok(await db.rpc('approve_quote_by_portal',{p_token_hash:k.hash,p_expected_revision:current.edit_revision}));
    const before=await state(q,k,a.p_request_id),replay=ok(await change(a));assert.equal(replay.replayed,true);assert.equal(replay.note_id,saved.note_id);assert.equal(replay.requested_at,saved.requested_at);assert.deepEqual(await state(q,k,a.p_request_id),before);
    ok(await db.from('quote_portal_tokens').update({revoked_at:new Date().toISOString()}).eq('id',k.id));denied(await change(a),'42501');assert.equal((await read(q)).status,'approved');
  });
  await run('anonymous and authenticated callers cannot invoke command or read private receipts',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k);denied(await anon.rpc('request_quote_changes_by_portal',a),'42501');denied(await client.rpc('request_quote_changes_by_portal',a),'42501');
    for(const role of ['anon','authenticated','service_role']){
      assert.equal(await sql(`select has_table_privilege('${role}','app_private.quote_change_requests','select')`),'f');
      assert.equal(await sql(`select has_function_privilege('${role}','app_private.request_quote_changes_locked(uuid,text,integer,text)','execute')`),'f');
    }
    assert.equal(await sql("select relrowsecurity from pg_class where oid='app_private.quote_change_requests'::regclass"),'t');
  });
  await run('existing link deletion can remove retry metadata while retaining the note and required history',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),a=args(q,k);ok(await change(a));
    const before=await state(q,k,a.p_request_id);
    // Exercise only this synthetic link, then roll back the deletion. This is
    // compatibility evidence, not a cleanup path or a changed deletion policy.
    assert.equal(await sql(`begin;delete from public.quote_portal_tokens where id='${k.id}';select count(*) from app_private.quote_change_requests where request_id='${a.p_request_id}';rollback;`),'0');
    assert.deepEqual(await state(q,k,a.p_request_id),before);
  });
  await run('actual server action uses stable notification identity on response-loss retry',async()=>{
    const q=await newDraft(),k=await token('quote',q.id),id=randomUUID(),notifications=[],paths=[];
    const page=await localFetch(web+'/portal/quote/'+k.raw);assert.equal(page.status,200);
    const html=await page.text(),formTag=html.match(/<form[^>]*class="customer-change-form"[^>]*>/)?.[0];
    assert.ok(formTag);assert.match(formTag,/method="post"/); // No pre-hydration GET carrying private form fields.
    const {requestQuoteChanges}=load('../src/lib/quotes/change-request.ts',{'server-only':{}});
    const action=load('../src/lib/actions/portal-tokens.ts',{
      'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/activity-log':{},'@/lib/auth/roles':{},'@/lib/data/portal-quote':{},'@/lib/quotes/workflow':{},
      '@/lib/quotes/change-request':{requestQuoteChanges},'@/lib/supabase/admin':{getServiceRoleClient:()=>db},'@/lib/supabase/server':{},'@/lib/portal/quote-links':{},
      '@/lib/portal/tokens':{hashPortalToken:raw=>createHash('sha256').update(raw).digest('hex')},'@/lib/portal/urls':{},'@/lib/quotes/multi-email':{},
      '@/lib/security/portal-rate-limit':{checkPortalActionRateLimit:async()=>({available:true,allowed:true})},'@/lib/security/errors':{},
      '@/lib/notifications/source-events':{deliverCustomerSourceEvent:async x=>notifications.push(x)},
    }).requestQuoteChangesByPortalToken;
    const form=()=>{const f=new FormData();for(const[key,value]of Object.entries({token:k.raw,message:'Please retain this exact message',request_id:id,expected_revision:String(q.edit_revision)}))f.set(key,value);return f;};
    const first=await action({},form()),retry=await action({},form());assert.equal(first.status,'success');assert.deepEqual(first,retry);assert.equal(notifications.length,2);assert.equal(notifications[0].key,notifications[1].key);assert.equal((await events(q)).length,1);assert.ok(paths.includes(`/admin/quotes/${q.id}`));
  });
});
