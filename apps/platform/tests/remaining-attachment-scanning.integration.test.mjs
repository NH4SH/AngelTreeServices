import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import * as crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import sharp from 'sharp';
import {load} from './pr10-test-helpers.mjs';
import {scanDocumentBytes} from '../src/lib/security/document-scanner.ts';
import {prepareSafeUpload} from '../src/lib/security/upload-validation.ts';
const enabled=process.env.ATTACHMENT_DISPOSABLE_STACK==='1'&&Boolean(process.env.ATTACHMENT_LOCAL_STATUS_FILE);
test('remaining attachment areas retain permissions and bind scans to actual objects',{skip:!enabled},async t=>{
 const c=JSON.parse(readFileSync(process.env.ATTACHMENT_LOCAL_STATUS_FILE,'utf8'));assert.equal(c.API_URL,'http://127.0.0.1:54321');
 const db=createClient(c.API_URL,c.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}});
 const marker='ATTACH_LOCAL_'+randomUUID().slice(0,8),actors=[],documents=[],results=[];
 const ok=r=>{assert.ifError(r.error&&Error(r.error.message));return r.data;};
 const sql=source=>new Promise((resolve,reject)=>{const p=spawn(process.env.ATTACHMENT_DOCKER_BIN,['exec','-i','supabase_db_ats_pr02_disposable','psql','-X','-qAt','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err)):resolve(out.trim()));p.stdin.end(source);});
 let originals=[];
 const run=(name,fn)=>t.test(name,async()=>{await fn();results.push({name,pass:true});});
 async function actor(role,suffix=role){const password=randomUUID()+randomUUID();const u=ok(await db.auth.admin.createUser({email:`${marker}-${suffix}@example.invalid`,password,email_confirm:true})).user;actors.push(u.id);ok(await db.from('profiles').update({status:'active'}).eq('id',u.id));const e=ok(await db.from('employee_records').insert({auth_user_id:u.id,legal_name:marker+' '+suffix,is_active:true,employment_status:'active'}).select('id').single());const r=ok(await db.from('roles').select('id').eq('name',role).single());ok(await db.from('user_roles').insert({user_id:u.id,role_id:r.id}));const client=createClient(c.API_URL,c.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});ok(await client.auth.signInWithPassword({email:u.email,password}));return{client,id:u.id,employeeId:e.id};}
 t.after(async()=>{if(documents.length)ok(await db.from('employee_documents').update({archived_at:new Date().toISOString()}).in('id',documents));ok(await db.from('profiles').update({status:'disabled'}).in('id',actors));ok(await db.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors));for(const r of originals)await sql(`update app_private.attachment_scan_settings set enabled=${r.enabled?'true':'false'} where bucket_id='${r.bucket_id}'`);if(process.env.ATTACHMENT_RESULTS_FILE)writeFileSync(process.env.ATTACHMENT_RESULTS_FILE,JSON.stringify({marker,results},null,2));});
 const owner=await actor('owner'),admin=await actor('admin'),crew=await actor('crew'),other=await actor('crew','other'),estimator=await actor('estimator');
 const customer=ok(await db.from('customers').insert({display_name:marker}).select('id').single());const location=ok(await db.from('service_locations').insert({customer_id:customer.id,label:marker,street:'123 Synthetic Lane',city:'Fredericksburg',state:'VA',postal_code:'22401'}).select('id').single());const job=ok(await db.from('jobs').insert({customer_id:customer.id,service_location_id:location.id,assigned_crew_user_id:crew.id,assigned_crew_employee_id:crew.employeeId,service_type:'tree_removal'}).select('id').single());
 const asset=ok(await db.from('equipment_assets').insert({asset_number:marker,name:marker,category:'other'}).select('id').single());const training=ok(await db.from('training_sessions').insert({title:marker,training_type:'other',starts_at:new Date().toISOString()}).select('id').single());
 const buckets=['employee-files','employee-program-files','equipment-files','material-files','job-cost-receipts','job-photos'];
 originals=JSON.parse(await sql('select json_agg(s) from app_private.attachment_scan_settings s'));await sql('update app_private.attachment_scan_settings set enabled=true');

 const service=load('../src/lib/security/attachment-scan-service.ts',{'server-only':{},'node:crypto':crypto,'./document-scan-service':{getDocumentScanClient:()=>db},'./document-scanner':{scanDocumentBytes}});
 const bytes=await sharp({create:{width:4,height:4,channels:3,background:'green'}}).png().toBuffer(),hash=createHash('sha256').update(bytes).digest('hex');
 const prepared={bytes,contentType:'image/png',fileName:'synthetic.png',size:bytes.length,scanStatus:'content_validated_not_malware_scanned'};
 const path=(bucket,who=owner)=>bucket==='employee-files'?`${who.employeeId}/submitted/${randomUUID()}.png`:bucket==='employee-program-files'?`training/${training.id}/${randomUUID()}.png`:bucket==='equipment-files'?`${asset.id}/documents/${randomUUID()}.png`:bucket==='material-files'?`${who.id}/purchase/${randomUUID()}.png`:bucket==='job-cost-receipts'?`${job.id}/${who.id}/${randomUUID()}.png`:`${job.id}/before/${randomUUID()}.png`;
 async function metadata(bucket,p,who=owner,classification='employee_visible'){
  let r;
  if(bucket==='employee-files'){r=ok(await db.from('employee_documents').insert({employee_id:who.employeeId,document_type:'credential',title:marker,storage_path:p,mime_type:'image/png',file_size_bytes:bytes.length,access_classification:classification,review_status:'approved',uploaded_by_user_id:who.id}).select('id').single());documents.push(r.id);}
  if(bucket==='employee-program-files')r=ok(await db.from('employee_program_files').insert({training_session_id:training.id,title:marker,storage_path:p,file_kind:'attachment',uploaded_by_user_id:who.id}).select('id').single());
  if(bucket==='equipment-files')r=ok(await db.from('equipment_documents').insert({asset_id:asset.id,title:marker,document_type:'other',storage_path:p,uploaded_by_user_id:who.id}).select('id').single());
  if(bucket==='material-files')r=ok(await db.from('material_purchases').insert({vendor_name:marker,receipt_storage_path:p,created_by_user_id:who.id,idempotency_key:randomUUID()}).select('id').single());
  if(bucket==='job-cost-receipts')r=ok(await db.from('job_cost_entries').insert({job_id:job.id,category:'other',description:marker,amount_cents:123,incurred_on:'2026-10-16',receipt_storage_path:p,submitted_by_user_id:who.id}).select('id').single());
  if(bucket==='job-photos')r=ok(await db.from('job_photos').insert({job_id:job.id,photo_type:'before',storage_path:p,caption:marker,uploaded_by_user_id:who.id}).select('id').single());
  return r;
 }
 const claim=async(bucket,p,who=owner)=>db.rpc('claim_attachment_scan',{p_bucket:bucket,p_path:p,p_actor:who.id,p_expected_sha256:hash});
 const finish=(bucket,p,a,who=owner,digest=hash)=>db.rpc('finish_attachment_scan',{p_bucket:bucket,p_path:p,p_actor:who.id,p_token:a.token,p_verdict:'clean',p_sha256:digest});
 await run('staged activation preserves old access until enabled and never labels legacy bytes clean',async()=>{
  await sql("update app_private.attachment_scan_settings set enabled=false where bucket_id='equipment-files'");
  const p=path('equipment-files');const r=await service.uploadCheckedAttachment(owner.client,'equipment-files',p,prepared,owner.id);assert.equal(r.scanStatus,'unscanned');await metadata('equipment-files',p);assert.ok(!(await owner.client.storage.from('equipment-files').createSignedUrl(p,60)).error);
  await sql("update app_private.attachment_scan_settings set enabled=true where bucket_id='equipment-files'");assert.ok((await owner.client.storage.from('equipment-files').createSignedUrl(p,60)).error);assert.equal(await service.checkStoredAttachment(db,'equipment-files',p,owner.id),'clean');
 });
 for(const bucket of buckets)await run(`${bucket}: real uploader, ClamAV, stored digest, metadata and private download`,async()=>{
  const p=path(bucket);const r=await service.uploadCheckedAttachment(owner.client,bucket,p,prepared,owner.id);assert.equal(r.error,null);assert.equal(r.scanStatus,'clean');await metadata(bucket,p);
  const stored=JSON.parse(await sql(`select row_to_json(s) from app_private.attachment_scans s where bucket_id='${bucket}' and storage_path='${p}'`));assert.equal(stored.upload_actor,owner.id);assert.equal(stored.sha256,hash);
  const signed=ok(await owner.client.storage.from(bucket).createSignedUrl(p,60));assert.equal((await fetch(signed.signedUrl)).status,200);
  const states=ok(await owner.client.rpc('get_attachment_scan_states',{p_bucket:bucket,p_paths:[p]}));assert.equal(states[0].status,'clean');assert.equal(ok(await owner.client.from('attachment_file_checks').select('can_open').eq('bucket_id',bucket).eq('storage_path',p).limit(1).single()).can_open,true);
 });
 for(const bucket of buckets)await run(`${bucket}: direct forged-MIME antivirus test stays quarantined`,async()=>{
  const p=path(bucket),eicar=Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}','$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''));
  ok(await owner.client.storage.from(bucket).upload(p,eicar,{contentType:'image/png',upsert:false}));await metadata(bucket,p);assert.ok((await owner.client.storage.from(bucket).createSignedUrl(p,60)).error);
  assert.equal(await service.checkStoredAttachment(db,bucket,p,owner.id),'quarantined');assert.ok((await owner.client.storage.from(bucket).download(p)).error);
 });
 await run('the shared web/mobile photo command keeps all six categories and their mandatory audit history',async()=>{
  const paths=load('../src/lib/storage/job-photo-paths.ts');
  const photos=load('../src/lib/storage/job-photo-upload.ts',{'server-only':{},'next/cache':{revalidatePath(){}},'@/lib/storage/job-photo-paths':paths,'@/lib/security/attachment-scan-service':service,'@/lib/security/upload-validation':{prepareSafeUpload}});
  for(const category of ['before','during','after','issue','completion','equipment_access']){
   const caption=marker+' '+category;
   const result=await photos.uploadJobPhotoForUser({caption,category,file:new File([bytes],randomUUID()+'.png',{type:'image/png'}),jobId:job.id,supabase:crew.client,userId:crew.id});assert.equal(result.status,'success',result.message);
   const photo=ok(await db.from('job_photos').select('id,storage_path,photo_type,uploaded_by_user_id').eq('caption',caption).single());assert.equal(photo.photo_type,category);assert.equal(photo.uploaded_by_user_id,crew.id);assert.ok(!(await crew.client.storage.from('job-photos').createSignedUrl(photo.storage_path,60)).error);
   const audit=ok(await db.from('activity_log').select('actor_user_id,metadata_json').eq('idempotency_key','job-photo-uploaded/'+photo.id).single());assert.equal(audit.actor_user_id,crew.id);assert.equal(audit.metadata_json.photo_type,category);
  }
 });
 await t.test('authenticated file routes refuse held/forged records and freshly sign only authorized clean bytes',{skip:process.env.ATTACHMENT_APP_URL!=='http://127.0.0.1:3102'},async()=>{
  async function headers(who){const cookies=new Map();const ssr=createServerClient(c.API_URL,c.ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:entries=>entries.forEach(({name,value})=>cookies.set(name,value))}});const session=ok(await who.client.auth.getSession()).session;ok(await ssr.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token}));return{cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')};}
  const p=path('employee-files');ok(await owner.client.storage.from('employee-files').upload(p,bytes,{contentType:'image/png'}));const record=await metadata('employee-files',p,owner,'admin_only');const url=process.env.ATTACHMENT_APP_URL+'/files/employee_document/'+record.id;
  const ownerHeaders=await headers(owner),otherHeaders=await headers(other);
  assert.equal((await fetch(url,{headers:ownerHeaders,redirect:'manual'})).status,404);
  assert.equal(await service.checkStoredAttachment(db,'employee-files',p,owner.id),'clean');
  const response=await fetch(url,{headers:ownerHeaders,redirect:'manual'});assert.equal(response.status,303);assert.match(response.headers.get('cache-control'),/private.*no-store/);const location=new URL(response.headers.get('location'));assert.equal(location.origin,c.API_URL);assert.equal((await fetch(location)).status,200);
  assert.equal((await fetch(url,{headers:otherHeaders,redirect:'manual'})).status,404);
  assert.equal((await fetch(process.env.ATTACHMENT_APP_URL+'/files/employee_document/'+randomUUID(),{headers:ownerHeaders,redirect:'manual'})).status,404);
  results.push({name:'real authenticated attachment download route',pass:true});
 });
 await run('crew self-service upload can scan its own file without gaining access to someone else',async()=>{
  const p=path('employee-files',crew);const r=await service.uploadCheckedAttachment(crew.client,'employee-files',p,prepared,crew.id);assert.equal(r.scanStatus,'clean');await metadata('employee-files',p,crew);
  assert.ok(!(await crew.client.storage.from('employee-files').createSignedUrl(p,60)).error);assert.ok((await other.client.storage.from('employee-files').createSignedUrl(p,60)).error);
  assert.deepEqual(ok(await other.client.rpc('get_attachment_scan_states',{p_bucket:'employee-files',p_paths:[p]})),[]);
  assert.equal((await claim('employee-files',p,other)).error?.code,'42501');
 });
 await run('restricted employee documents and receipts retain the underlying metadata permissions',async()=>{
  const p=path('employee-files');ok(await service.uploadCheckedAttachment(owner.client,'employee-files',p,prepared,owner.id));await metadata('employee-files',p,owner,'admin_only');
  assert.deepEqual(ok(await crew.client.from('attachment_file_sources').select('*').eq('storage_path',p)),[]);assert.ok((await crew.client.storage.from('employee-files').createSignedUrl(p,60)).error);
  const cost=path('job-cost-receipts',crew);ok(await service.uploadCheckedAttachment(crew.client,'job-cost-receipts',cost,prepared,crew.id));await metadata('job-cost-receipts',cost,crew);assert.ok(!(await crew.client.storage.from('job-cost-receipts').createSignedUrl(cost,60)).error);assert.ok((await other.client.storage.from('job-cost-receipts').createSignedUrl(cost,60)).error);
 });
 await run('supervisor visibility follows the original employee classification and metadata rules',async()=>{
  ok(await db.from('employee_records').update({is_supervisor:true}).eq('id',crew.employeeId));ok(await db.from('employee_records').update({supervisor_employee_id:crew.employeeId}).eq('id',other.employeeId));
  const p=path('employee-files',other);assert.equal((await service.uploadCheckedAttachment(other.client,'employee-files',p,prepared,other.id)).scanStatus,'clean');const document=await metadata('employee-files',p,other,'supervisor_visible');
  assert.ok(!(await crew.client.storage.from('employee-files').createSignedUrl(p,60)).error);ok(await db.from('employee_documents').update({access_classification:'admin_only'}).eq('id',document.id));assert.ok((await crew.client.storage.from('employee-files').createSignedUrl(p,60)).error);assert.deepEqual(ok(await crew.client.from('attachment_file_checks').select('source_id').eq('storage_path',p)),[]);
 });
 await run('a disposal receipt linked to a job cost uses its actual material-file bucket',async()=>{
  const p=path('material-files');assert.equal((await service.uploadCheckedAttachment(owner.client,'material-files',p,prepared,owner.id)).scanStatus,'clean');const cost=ok(await db.from('job_cost_entries').insert({job_id:job.id,category:'disposal',description:marker+' linked receipt',amount_cents:100,incurred_on:'2026-10-16',receipt_storage_path:p,submitted_by_user_id:owner.id}).select('id').single());
  ok(await db.from('disposal_records').insert({job_id:job.id,destination_type:'other',destination_name:marker,quantity:1,unit:'cubic_yard',receipt_storage_path:p,job_cost_entry_id:cost.id,created_by_user_id:owner.id,idempotency_key:randomUUID()}));const source=ok(await owner.client.from('attachment_file_checks').select('bucket_id,can_open').eq('source_type','job_cost').eq('source_id',cost.id).single());assert.equal(source.bucket_id,'material-files');assert.equal(source.can_open,true);
 });
 await run('service-only claims/results and private scan state cannot be forged',async()=>{
  const p=path('equipment-files');ok(await owner.client.storage.from('equipment-files').upload(p,bytes,{contentType:'image/png'}));await metadata('equipment-files',p);
  assert.ok((await owner.client.rpc('claim_attachment_scan',{p_bucket:'equipment-files',p_path:p,p_actor:owner.id})).error);assert.ok((await owner.client.rpc('finish_attachment_scan',{p_bucket:'equipment-files',p_path:p,p_actor:owner.id,p_token:randomUUID(),p_verdict:'clean',p_sha256:hash})).error);
  const races=await Promise.all([claim('equipment-files',p),claim('equipment-files',p)]);assert.equal(races.filter(r=>!r.error).length,1);assert.equal(races.find(r=>r.error).error.code,'55P03');const a=races.find(r=>!r.error).data;
  assert.equal(ok(await finish('equipment-files',p,{token:randomUUID()})),false);assert.equal(ok(await finish('equipment-files',p,a)),true);assert.equal(ok(await finish('equipment-files',p,a)),false);
  assert.ok((await owner.client.storage.from('equipment-files').upload(p,Buffer.from('replacement'),{contentType:'image/png',upsert:true})).error);
 });
 await run('privileged replacement and delete/reinsert invalidate approval and stale scan tokens',async()=>{
  const p=path('equipment-files');ok(await owner.client.storage.from('equipment-files').upload(p,bytes,{contentType:'image/png'}));await metadata('equipment-files',p);const a=ok(await claim('equipment-files',p));
  ok(await db.storage.from('equipment-files').upload(p,Buffer.from('new synthetic bytes'),{contentType:'image/png',upsert:true}));assert.equal(ok(await finish('equipment-files',p,a)),false);assert.ok((await owner.client.storage.from('equipment-files').createSignedUrl(p,60)).error);
  assert.equal(await service.checkStoredAttachment(db,'equipment-files',p,owner.id),'clean');const b=ok(await claim('equipment-files',p));assert.equal(b.status,'clean');
  // Delete only this test's newly created synthetic object, never existing files.
  ok(await db.storage.from('equipment-files').remove([p]));ok(await db.storage.from('equipment-files').upload(p,bytes,{contentType:'image/png'}));assert.ok((await owner.client.storage.from('equipment-files').createSignedUrl(p,60)).error);
 });
 await run('expired claims recover; an old digest cannot approve replacement content',async()=>{
  const p=path('equipment-files');ok(await owner.client.storage.from('equipment-files').upload(p,bytes,{contentType:'image/png'}));await metadata('equipment-files',p);const a=ok(await claim('equipment-files',p));await sql(`update app_private.attachment_scan_attempts set started_at=clock_timestamp()-interval '100 seconds' where token='${a.token}'`);assert.equal(ok(await finish('equipment-files',p,a)),false);const b=ok(await claim('equipment-files',p));assert.equal(ok(await finish('equipment-files',p,b,owner,'0'.repeat(64))),true);assert.ok((await owner.client.storage.from('equipment-files').createSignedUrl(p,60)).error);assert.equal(await service.checkStoredAttachment(db,'equipment-files',p,owner.id),'clean');
 });
 await run('scanner outage retains receipts and leaves financial values unchanged',async()=>{
  const held=load('../src/lib/security/attachment-scan-service.ts',{'server-only':{},'node:crypto':crypto,'./document-scan-service':{getDocumentScanClient:()=>db},'./document-scanner':{scanDocumentBytes:async()=>({status:'unavailable'})}});
  const actions=load('../src/lib/actions/reporting.ts',{'next/cache':{revalidatePath(){}},'@/lib/business-time':{getBusinessDateKey:()=> '2026-10-16'},'@/lib/auth/roles':{getUserRoles:async()=>['owner'],hasAllowedRole:(r,g)=>g.includes('owner'),platformRoleGroups:{crewApp:['owner'],financialReporting:['owner']}},'@/lib/supabase/server':{createClient:async()=>owner.client},'@/lib/security/upload-validation':{prepareSafeUpload:async()=>({data:prepared})},'@/lib/security/attachment-scan-service':held,'@/lib/security/errors':{safeStaffMessage:x=>x}});
  const form=new FormData();for(const[k,v]of Object.entries({job_id:job.id,category:'other',description:marker+' outage',amount:'12.34',approve_now:'on'}))form.set(k,v);form.set('receipt',new File([bytes],'synthetic.png',{type:'image/png'}));assert.equal((await actions.addJobCost({status:'idle',message:''},form)).status,'success');const cost=ok(await db.from('job_cost_entries').select('*').eq('description',marker+' outage').single());assert.equal(cost.amount_cents,1234);assert.equal(cost.review_status,'approved');assert.ok(cost.receipt_storage_path);assert.ok((await owner.client.storage.from('job-cost-receipts').createSignedUrl(cost.receipt_storage_path,60)).error);
 });
 await run('disabling an actor during a check prevents finalization and access with an issued token',async()=>{
  const p=path('equipment-files');ok(await owner.client.storage.from('equipment-files').upload(p,bytes,{contentType:'image/png'}));await metadata('equipment-files',p);const a=ok(await claim('equipment-files',p));ok(await db.from('profiles').update({status:'disabled'}).eq('id',owner.id));assert.equal((await finish('equipment-files',p,a)).error?.code,'42501');assert.deepEqual(ok(await owner.client.from('attachment_file_checks').select('*')),[]);assert.ok((await owner.client.storage.from('equipment-files').createSignedUrl(p,60)).error);
 });
});
