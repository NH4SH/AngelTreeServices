import assert from 'node:assert/strict';
import test from 'node:test';
import * as crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {load} from './pr10-test-helpers.mjs';
import {scanDocumentBytes} from '../src/lib/security/document-scanner.ts';

const enabled=process.env.PRIVATE_FILES_DISPOSABLE==='1'&&Boolean(process.env.PRIVATE_FILES_LOCAL_STATUS_FILE);
test('local live roles, private files and issued-session revocation',{skip:!enabled,timeout:120000},async t=>{
  const c=JSON.parse(readFileSync(process.env.PRIVATE_FILES_LOCAL_STATUS_FILE,'utf8'));
  const web=process.env.PRIVATE_FILES_WEB_URL;
  assert.equal(c.API_URL,'http://127.0.0.1:54321');assert.equal(web,'http://127.0.0.1:3102');
  assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  assert.equal(process.env.DOCUMENT_SCANNER_URL,'http://127.0.0.1:3311/scan');
  const originalFetch=globalThis.fetch;let blockedOutbound=0;
  const localFetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    if(![c.API_URL,web,'http://127.0.0.1:3311'].includes(url.origin)){blockedOutbound++;throw Error('Non-local permission test request blocked');}
    return originalFetch(input,init);
  };
  const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}};
  const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,opts),actors=[],docs=[],results=[];
  const marker='PERMISSIONS_LOCAL_'+crypto.randomUUID().replaceAll('-','');
  const ok=r=>{assert.ifError(r.error&&new Error(r.error.code+': '+r.error.message));return r.data;};
  const sql=source=>new Promise((resolve,reject)=>{
    const p=spawn(process.env.PRIVATE_FILES_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});
    let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);
  });
  const originalSetting=await sql('select enabled from app_private.document_scan_settings where singleton');
  t.after(async()=>{
    try{
      for(const a of actors)if(a.auth)ok(await a.auth.auth.signOut({scope:'global'}));
    }finally{
      if(docs.length)ok(await db.from('documents').update({archived_at:new Date().toISOString()}).in('id',docs));
      if(actors.length){
        ok(await db.from('profiles').update({status:'disabled'}).in('id',actors.map(a=>a.id)));
        ok(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors.map(a=>a.id)));
      }
      await sql(`update app_private.document_scan_settings set enabled=${originalSetting==='t'?'true':'false'} where singleton`);
      assert.equal(blockedOutbound,0);
      if(process.env.PRIVATE_FILES_RESULTS_FILE)writeFileSync(process.env.PRIVATE_FILES_RESULTS_FILE,JSON.stringify({marker,results,syntheticActorsRetired:actors.length,blockedOutbound,hostedRequests:0},null,2)+'\n',{mode:0o600});
    }
  });
  async function actor(role,label=role){
    const password=crypto.randomUUID()+crypto.randomUUID();
    const u=ok(await db.auth.admin.createUser({email:marker.toLowerCase()+'-'+label+'@example.invalid',password,email_confirm:true})).user;
    const a={id:u.id,role};actors.push(a);
    ok(await db.from('profiles').update({status:'active'}).eq('id',u.id));
    a.employeeId=ok(await db.from('employee_records').insert({auth_user_id:u.id,legal_name:marker+' '+label,is_active:true,employment_status:'active'}).select('id').single()).id;
    const r=ok(await db.from('roles').select('id').eq('name',role).single());
    ok(await db.from('user_roles').insert({user_id:a.id,role_id:r.id}));
    ok(await db.from('time_clock_permissions').upsert({user_id:a.id,is_enabled:true}));
    a.auth=createClient(c.API_URL,c.ANON_KEY,opts);
    const session=ok(await a.auth.auth.signInWithPassword({email:u.email,password})).session;
    a.jwt=session.access_token;
    a.client=createClient(c.API_URL,c.ANON_KEY,{...opts,global:{fetch:localFetch,headers:{authorization:'Bearer '+a.jwt}}});
    const cookies=new Map();
    const ssr=createServerClient(c.API_URL,c.ANON_KEY,{global:{fetch:localFetch},cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:entries=>entries.forEach(({name,value})=>cookies.set(name,value))}});
    ok(await ssr.auth.setSession({access_token:a.jwt,refresh_token:session.refresh_token}));
    a.cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
    return a;
  }
  const controller=await actor('owner','controller');
  const targets=[];for(const role of ['owner','admin','payroll_admin','estimator','crew','customer','property_manager'])targets.push(await actor(role));
  const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
  const headers=(a,cookie=false)=>cookie?{cookie:a.cookie}:{authorization:'Bearer '+a.jwt};
  const bytes=Buffer.from(marker+' synthetic private file\n');
  const scanner=load('../src/lib/security/document-scan-service.ts',{'server-only':{},'node:crypto':crypto,'@supabase/supabase-js':{createClient},'./document-scanner':{scanDocumentBytes:(b)=>scanDocumentBytes(b,{fetcher:localFetch})}});
  await sql('update app_private.document_scan_settings set enabled=true where singleton');
  async function document(classification){
    const path=controller.id+'/'+crypto.randomUUID()+'.txt';
    const d=ok(await controller.client.from('documents').insert({title:marker,storage_path:path,document_type:'other',mime_type:'text/plain',file_size_bytes:bytes.length,uploaded_by_user_id:controller.id,access_classification:classification}).select('id').single());docs.push(d.id);
    ok(await controller.client.storage.from('platform-documents').upload(path,bytes,{contentType:'text/plain',cacheControl:'0'}));
    assert.equal(await scanner.checkStoredDocument(db,d.id,controller.id,crypto.createHash('sha256').update(bytes).digest('hex')),'clean');
    return {...d,path,route:web+'/files/platform_document/'+d.id};
  }
  const staff=await document('staff'),sensitive=await document('employee_sensitive');
  let crewPhoto;
  function cacheHeaders(r){
    assert.match(r.headers.get('cache-control'),/private, no-store/);
    for(const key of ['cdn-cache-control','netlify-cdn-cache-control'])assert.equal(r.headers.get(key),'no-store');
    assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('x-content-type-options'),'nosniff');
    assert.match(r.headers.get('vary'),/Cookie, Authorization/);
  }
  async function info(d,a,cookie=false){const r=await localFetch(d.route+'?info=1',{headers:headers(a,cookie)});cacheHeaders(r);return r;}
  async function chunk(d,a,version){const r=await localFetch(d.route,{headers:{...headers(a),range:'bytes=0-'+(bytes.length-1),'x-ats-file-version':version}});cacheHeaders(r);return r;}
  await run('assigned crew can upload and read a private photo; removing the assignment revokes the next chunk',async()=>{
    const crew=targets.find(a=>a.role==='crew');
    const customer=ok(await db.from('customers').insert({display_name:marker}).select('id').single());
    const location=ok(await db.from('service_locations').insert({customer_id:customer.id,label:marker,street:'123 Synthetic Lane',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());
    const job=ok(await db.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,assigned_crew_user_id:crew.id,assigned_crew_employee_id:crew.employeeId,service_type:'tree_removal'}).select('id').single());
    const image=await sharp({create:{width:4,height:4,channels:3,background:'green'}}).png().toBuffer();
    const form=new FormData();form.set('photo',new File([image],'synthetic.png',{type:'image/png'}));form.set('photo_type','before');form.set('caption',marker);
    const uploaded=await localFetch(web+'/api/crew/jobs/'+job.id+'/photos',{method:'POST',headers:headers(crew),body:form});assert.equal(uploaded.status,201,await uploaded.clone().text());
    const p=ok(await db.from('job_photos').select('id').eq('caption',marker).single());crewPhoto={route:web+'/files/job_photo/'+p.id};
    const manifest=await(await info(crewPhoto,crew)).json();
    const photoChunk=()=>localFetch(crewPhoto.route,{headers:{...headers(crew),range:'bytes=0-2','x-ats-file-version':manifest.version}});
    const part=await photoChunk();assert.equal(part.status,206);cacheHeaders(part);assert.equal((await part.arrayBuffer()).byteLength,3);
    ok(await db.from('jobs').update({assigned_crew_user_id:null,assigned_crew_employee_id:null}).eq('id',job.id));
    assert.equal((await photoChunk()).status,404);
    ok(await db.from('jobs').update({assigned_crew_user_id:crew.id,assigned_crew_employee_id:crew.employeeId}).eq('id',job.id));
    assert.equal((await info(crewPhoto,crew)).status,200);
  });
  for(const a of targets)await run(a.role+': metadata, HTTP bytes, API role boundaries and foreign access',async()=>{
    const office=['owner','admin','payroll_admin','estimator'].includes(a.role),admin=['owner','admin'].includes(a.role);
    for(const [d,allowed] of [[staff,office],[sensitive,admin]]){
      assert.equal(ok(await a.client.from('documents').select('id').eq('id',d.id)).length,allowed?1:0);
      for(const cookie of [false,true]){
        const r=await info(d,a,cookie);assert.equal(r.status,allowed?200:404);
        if(allowed){const manifest=await r.json();assert.doesNotMatch(JSON.stringify(manifest),/storage_path|signedUrl|token=/);const content=await chunk(d,a,manifest.version);assert.equal(content.status,206);assert.deepEqual(Buffer.from(await content.arrayBuffer()),bytes);}
      }
      assert.equal(Boolean((await a.client.rpc('private_file_descriptor',{p_source_type:'platform_document',p_source_id:d.id})).data?.length),allowed);
    }
    for(const path of ['/api/mobile/quotes?scope=draft&limit=1','/api/mobile/invoices?scope=outstanding&limit=1'])assert.equal((await localFetch(web+path,{headers:headers(a)})).status,office?200:403);
    if(!admin)assert.equal((await a.client.rpc('begin_invoice_void',{p_invoice_id:crypto.randomUUID()})).error?.code,'42501');
    if(!admin)assert.equal((await a.client.rpc('set_employee_access_status',{p_employee_id:crypto.randomUUID(),p_status:'inactive',p_reason:marker})).error?.code,'42501');
  });
  await run('unknown, anonymous, forged-token and stale-version requests fail without caching or bytes',async()=>{
    for(const path of [staff.route+'?info=1',web+'/files/platform_document/'+crypto.randomUUID()+'?info=1',web+'/files/unknown/'+staff.id+'?info=1']){
      const r=await localFetch(path);assert.equal(r.status,404);cacheHeaders(r);
    }
    const bad=await localFetch(staff.route+'?info=1',{headers:{authorization:'Bearer invalid'}});assert.equal(bad.status,404);cacheHeaders(bad);
    const stale=await chunk(staff,controller,'"stale"');assert.equal(stale.status,412);
    const range=await localFetch(staff.route,{headers:{...headers(controller),range:'bytes=0-999999999','x-ats-file-version':'"stale"'}});assert.equal(range.status,416);cacheHeaders(range);
  });
  await run('real Storage link expires; previously issued bearer links remain a separate time-limited boundary',async()=>{
    const signed=ok(await controller.client.storage.from('platform-documents').createSignedUrl(staff.path,1)).signedUrl;
    assert.equal((await localFetch(signed)).status,200);
    await new Promise(resolve=>setTimeout(resolve,2200));
    assert.ok((await localFetch(signed)).status>=400);
  });
  for(const a of targets.filter(a=>['owner','admin','payroll_admin','estimator','crew'].includes(a.role)))await run(a.role+': original JWT/cookie lose access on deactivation and roles return without clock permission',async()=>{
    const accessible=a.role==='crew'?crewPhoto:staff;
    assert.ok(accessible);assert.equal((await info(accessible,a)).status,200);
    const manifest=await(await info(accessible,a)).json();
    const rolesBefore=ok(await db.from('user_roles').select('role_id').eq('user_id',a.id));
    const legacy=a.role==='admin'?ok(await a.client.storage.from('platform-documents').createSignedUrl(staff.path,30)).signedUrl:null;
    ok(await controller.client.rpc('set_employee_access_status',{p_employee_id:a.employeeId,p_status:'inactive',p_reason:marker}));
    assert.equal(ok(await a.client.rpc('has_effective_platform_access')),false);
    for(const cookie of [false,true])assert.equal((await info(accessible,a,cookie)).status,404);
    assert.equal((await chunk(accessible,a,manifest.version)).status,404);
    assert.ok((await a.client.storage.from('platform-documents').createSignedUrl(staff.path,60)).error);
    // A historical bearer URL cannot recheck the employee session. The CRM's
    // authenticated routes above are the revocable path; never log this URL.
    if(legacy)assert.equal((await localFetch(legacy)).status,200);
    assert.ok((await localFetch(web+'/api/mobile/quotes?scope=draft',{headers:headers(a)})).status>=400);
    assert.ok((await localFetch(web+'/api/uploads',{method:'POST',headers:{...headers(a),'content-type':'application/json'},body:JSON.stringify({name:'x.txt',type:'text/plain',size:1})})).status>=400);
    ok(await controller.client.rpc('set_employee_access_status',{p_employee_id:a.employeeId,p_status:'active',p_reason:marker}));
    assert.equal(ok(await a.client.rpc('has_effective_platform_access')),true);
    assert.deepEqual(ok(await db.from('user_roles').select('role_id').eq('user_id',a.id)),rolesBefore);
    assert.equal(ok(await db.from('time_clock_permissions').select('is_enabled').eq('user_id',a.id).single()).is_enabled,false);
    assert.equal((await info(staff,a)).status,a.role==='crew'?404:200);
    assert.equal((await info(accessible,a)).status,200);
  });
  await run('classification changes and archive invalidate already-open manifests on the next request',async()=>{
    const estimator=targets.find(a=>a.role==='estimator');const manifest=await(await info(staff,estimator)).json();
    ok(await controller.client.from('documents').update({access_classification:'employee_sensitive'}).eq('id',staff.id));
    assert.equal((await chunk(staff,estimator,manifest.version)).status,404);
    assert.equal((await info(staff,controller)).status,200);
    ok(await controller.client.from('documents').update({archived_at:new Date().toISOString()}).eq('id',staff.id));
    assert.equal((await chunk(staff,controller,manifest.version)).status,404);
    assert.equal((await info(staff,controller)).status,404);
  });
});
