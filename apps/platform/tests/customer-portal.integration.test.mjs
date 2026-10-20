import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

const enabled=process.env.CUSTOMER_PORTAL_DISPOSABLE==='1'&&Boolean(process.env.CUSTOMER_PORTAL_LOCAL_STATUS_FILE);
test('local customer quote/invoice capabilities, tracking and approval retain their boundaries',{skip:!enabled,timeout:180000},async t=>{
  const c=JSON.parse(readFileSync(process.env.CUSTOMER_PORTAL_LOCAL_STATUS_FILE,'utf8')),web=process.env.CUSTOMER_PORTAL_WEB_URL;
  assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.equal(web,'http://127.0.0.1:3102');
  const originalFetch=globalThis.fetch;let blocked=0;
  const localFetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    if(![c.API_URL,web].includes(url.origin)){blocked++;throw Error('Non-local customer portal request blocked');}
    return originalFetch(input,init);
  };
  const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}};
  const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),anon=createClient(c.API_URL,c.ANON_KEY,opts);
  const marker='PORTAL_LOCAL_'+randomUUID().replaceAll('-',''),privateCanary='PRIVATE_'+randomUUID().replaceAll('-',''),encryptedCanary='ENCRYPTED_'+randomUUID();
  const tokens=[],proof=[];let actor,auth,client,invoiceId;
  const ok=r=>{assert.ifError(r.error&&new Error(r.error.code+': '+r.error.message));return r.data;};
  t.after(async()=>{
    try{if(auth)ok(await auth.auth.signOut({scope:'global'}));}
    finally{
      for(const kind of ['quote','invoice']){const ids=tokens.filter(t=>t.kind===kind).map(t=>t.id);if(ids.length)ok(await db.from(kind+'_portal_tokens').update({revoked_at:new Date().toISOString()}).in('id',ids));}
      if(actor){ok(await db.from('profiles').update({status:'disabled'}).eq('id',actor.id));ok(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).eq('auth_user_id',actor.id));}
      assert.equal(blocked,0);
      if(process.env.CUSTOMER_PORTAL_RESULTS_FILE)writeFileSync(process.env.CUSTOMER_PORTAL_RESULTS_FILE,JSON.stringify({marker,proof,syntheticActorsRetired:actor?1:0,syntheticTokensRevoked:tokens.length,blockedOutbound:blocked,providerRequests:0},null,2)+'\n',{mode:0o600});
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
  function privateHeaders(r){
    // Next dev overrides HTML Cache-Control. Verify compiled HTML separately;
    // actual JSON API responses must retain no-store even in development.
    assert.match(r.headers.get('cache-control'),r.url.startsWith(web+'/portal/')?/no-store|^no-cache, must-revalidate$/:/no-store/);
    assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
  }
  async function page(item){const r=await localFetch(web+'/portal/'+item.kind+'/'+item.raw);assert.equal(r.status,200);privateHeaders(r);const body=await r.text();assert.ok(!body.includes(privateCanary),'Internal notes or property access details reached the public response');assert.ok(!body.includes(encryptedCanary),'Encrypted token field reached the public response');assert.ok(!body.includes(item.hash),'Stored token hash reached the public response');assert.ok(!body.includes(c.SERVICE_ROLE_KEY),'Server credential reached the public response');return body;}
  async function track(item,sessionId,headers={}){const r=await localFetch(web+'/api/portal/views',{method:'POST',headers:{origin:web,'content-type':'application/json',...headers},body:JSON.stringify({documentType:item.kind,token:item.raw,sessionId})});privateHeaders(r);return r;}
  await run('anonymous quote capability renders reviewed scope and totals without internal details or stored credentials',async()=>{
    const body=await page(active);assert.ok(body.includes(marker));assert.ok(body.includes('$240.00'));assert.ok(body.includes('Review your proposal'));
    for(const table of ['quotes','quote_portal_tokens']){const read=await anon.from(table).select('id').eq('id',table==='quotes'?draft.id:active.id);assert.ok(read.error||read.data.length===0);}
    assert.equal((await anon.rpc('approve_quote_by_portal',{p_token_hash:active.hash,p_expected_revision:(await quote()).edit_revision})).error?.code,'42501');
  });
  await run('simultaneous view beacons count one meaningful session and retain one history event',async()=>{
    const session=randomUUID().replaceAll('-',''),responses=await Promise.all(Array.from({length:4},()=>track(active,session)));
    assert.ok(responses.every(r=>r.status===200));const bodies=await Promise.all(responses.map(r=>r.json()));assert.equal(bodies.filter(r=>r.recorded).length,1);
    assert.equal((await quote()).view_count,1);
    assert.equal(ok(await db.from('portal_view_events').select('id').eq('document_id',draft.id)).length,1);
    assert.equal(ok(await db.from('activity_log').select('id').eq('subject_id',draft.id).eq('event_type','customer_viewed_quote')).length,1);
  });
  await run('stale customer approval fails; concurrent current/repeated approval creates one work order and audit event',async()=>{
    const before=await quote(),lines=before.quote_line_items.map(l=>({id:l.id,name:l.name,description:l.description,quantity:Number(l.quantity),unit_price_cents:l.unit_price_cents,total_cents:l.total_cents}));
    ok(await client.rpc('save_quote_details',{p_quote_id:draft.id,p_expected_revision:before.edit_revision,p_header:{customer_message:'Reviewed synthetic customer-facing scope'},p_lines:lines}));
    assert.equal((await db.rpc('approve_quote_by_portal',{p_token_hash:active.hash,p_expected_revision:before.edit_revision})).error?.code,'40001');
    assert.equal(ok(await db.from('jobs').select('id').eq('source_quote_id',draft.id)).length,0);
    const current=await quote(),args={p_token_hash:active.hash,p_expected_revision:current.edit_revision};
    const approvals=await Promise.all([db.rpc('approve_quote_by_portal',args),db.rpc('approve_quote_by_portal',args)]);approvals.forEach(ok);
    assert.equal(approvals[0].data.job_id,approvals[1].data.job_id);assert.equal(ok(await db.from('jobs').select('id').eq('source_quote_id',draft.id)).length,1);
    assert.equal(ok(await db.from('activity_log').select('id').eq('subject_id',draft.id).eq('event_type','quote_approved')).length,1);
    assert.ok((await page(active)).includes('Proposal approved'));
    assert.ok(ok(await db.from('quote_portal_tokens').select('used_at').eq('id',active.id).single()).used_at);
  });
  let invoiceToken;
  await run('customer invoice renders the correct balance before and after an idempotent local manual payment',async()=>{
    const q=await quote();const inv=ok(await db.from('invoices').insert({job_id:q.job_id,quote_id:q.id,customer_id:customer.id,service_location_id:location.id,status:'sent',subtotal_cents:24000,total_cents:24000,balance_due_cents:24000,sent_at:new Date().toISOString()}).select('id').single());invoiceId=inv.id;
    ok(await db.from('invoice_line_items').insert({invoice_id:inv.id,name:marker+' scope',quantity:2,unit_price_cents:12000,total_cents:24000}));
    invoiceToken=await token('invoice',inv.id);let body=await page(invoiceToken);assert.ok(body.includes('$240.00'));assert.ok(body.includes('Balance due'));
    const args={p_request_id:randomUUID(),p_invoice_id:inv.id,p_amount_cents:6000,p_paid_at:new Date().toISOString(),p_method:'cash',p_reference:marker,p_notes:privateCanary};
    const paid=ok(await client.rpc('record_manual_invoice_payment_request',args));assert.equal(ok(await client.rpc('record_manual_invoice_payment_request',args)).payment_id,paid.payment_id);
    body=await page(invoiceToken);assert.ok(body.includes('$180.00'));assert.ok(!body.includes(privateCanary));
    const latest=ok(await db.from('invoices').select('balance_due_cents,status').eq('id',inv.id).single());assert.equal(latest.balance_due_cents,18000);assert.equal(latest.status,'partially_paid');
    assert.equal(ok(await db.from('payments').select('id').eq('invoice_id',inv.id)).length,1);
  });
  await run('quote and invoice expired, revoked, unknown and wrong-document capabilities reveal no customer record',async()=>{
    for(const [kind,id]of [['quote',draft.id],['invoice',invoiceId]]){
      for(const extra of [{expires_at:'2020-01-01T00:00:00Z'},{revoked_at:new Date().toISOString()}]){
        const item=await token(kind,id,extra),body=await page(item);assert.ok(body.includes(kind==='quote'?'Quote link unavailable':'Invoice link unavailable'));assert.ok(!body.includes(marker));assert.equal((await track(item,randomUUID().replaceAll('-',''))).status,404);
      }
      const unknown={kind,raw:randomBytes(32).toString('base64url'),hash:'not-stored'};assert.ok(!(await page(unknown)).includes(marker));
    }
    assert.ok(!(await page({...active,kind:'invoice'})).includes(marker));
    assert.ok(!(await page({...invoiceToken,kind:'quote'})).includes(marker));
    ok(await db.from('quote_portal_tokens').update({revoked_at:new Date().toISOString()}).eq('id',active.id));
    assert.ok(!(await page(active)).includes(marker));assert.equal((await db.rpc('approve_quote_by_portal',{p_token_hash:active.hash,p_expected_revision:(await quote()).edit_revision})).error?.code,'42501');
  });
  await run('malformed and streamed oversized beacons fail safely; foreign origin and direct RPC callers cannot record a view',async()=>{
    for(const value of [null,[],1,'text',{},true]){
      const r=await localFetch(web+'/api/portal/views',{method:'POST',headers:{origin:web,'content-type':'application/json'},body:JSON.stringify(value)});assert.equal(r.status,400);privateHeaders(r);
    }
    const stream=new ReadableStream({start(c){c.enqueue(Buffer.from(JSON.stringify({padding:'x'.repeat(5000)})));c.close();}});
    const oversized=await localFetch(web+'/api/portal/views',{method:'POST',headers:{origin:web,'content-type':'application/json'},body:stream,duplex:'half'});assert.equal(oversized.status,413);privateHeaders(oversized);
    assert.equal((await track(invoiceToken,randomUUID().replaceAll('-',''),{origin:'https://foreign.invalid'})).status,403);
    assert.equal((await anon.rpc('record_portal_view',{p_document_type:'invoice',p_token_hash:invoiceToken.hash,p_visitor_session_id:randomUUID().replaceAll('-','')})).error?.code,'42501');
    assert.equal(ok(await db.from('portal_view_events').select('id').eq('document_id',invoiceId)).length,0);
  });
});
