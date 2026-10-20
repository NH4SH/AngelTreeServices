import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';

const enabled=process.env.CRM_WORKFLOW_DISPOSABLE==='1'&&Boolean(process.env.CRM_WORKFLOW_LOCAL_STATUS_FILE);
// One connected journey through real Auth, PostgREST commands and the local
// mobile read route. No hosted target, email dispatcher or payment provider.
test('connected local lead-to-payment workflow retains authorization and history',{skip:!enabled,timeout:120000},async t=>{
  const c=JSON.parse(readFileSync(process.env.CRM_WORKFLOW_LOCAL_STATUS_FILE,'utf8'));
  assert.equal(c.API_URL,'http://127.0.0.1:54321');
  assert.equal(process.env.CRM_WORKFLOW_WEB_URL,'http://127.0.0.1:3102');
  const web=process.env.CRM_WORKFLOW_WEB_URL,marker='WORKFLOW_LOCAL_'+randomUUID().replaceAll('-','');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const originalFetch=globalThis.fetch;let blockedOutbound=0;
  const localFetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);
    if(![c.API_URL,web].includes(url.origin)){blockedOutbound++;throw Error('Non-local workflow request blocked.');}
    return originalFetch(input,init);
  };
  const service=createClient(c.API_URL,c.SERVICE_ROLE_KEY,{...options,global:{fetch:localFetch}});
  const anon=createClient(c.API_URL,c.ANON_KEY,{...options,global:{fetch:localFetch}});
  const actors=[],stages=[];let result={};
  const check=r=>{assert.ifError(r.error&&new Error(r.error.code+': '+r.error.message));return r.data;};
  const denied=r=>{assert.ok(r.error,'Expected authorization denial.');assert.equal(r.error.code,'42501');};
  async function actor(role){
    const password=randomUUID()+randomUUID();
    const u=check(await service.auth.admin.createUser({email:marker.toLowerCase()+'-'+role+'@example.invalid',password,email_confirm:true})).user;
    const a={id:u.id};actors.push(a);
    check(await service.from('profiles').update({status:'active'}).eq('id',a.id));
    a.employeeId=check(await service.from('employee_records').insert({auth_user_id:a.id,legal_name:marker+' '+role,employment_status:'active',is_active:true}).select('id').single()).id;
    const r=check(await service.from('roles').select('id').eq('name',role).single());
    check(await service.from('user_roles').insert({user_id:a.id,role_id:r.id}));
    a.auth=createClient(c.API_URL,c.ANON_KEY,{...options,global:{fetch:localFetch}});
    a.jwt=check(await a.auth.auth.signInWithPassword({email:u.email,password})).session.access_token;
    a.client=createClient(c.API_URL,c.ANON_KEY,{...options,global:{fetch:localFetch,headers:{authorization:'Bearer '+a.jwt}}});
    return a;
  }
  t.after(async()=>{
    try{
      for(const a of actors)if(a.auth)check(await a.auth.auth.signOut({scope:'global'}));
    }finally{
      if(actors.length){
        check(await service.from('profiles').update({status:'disabled'}).in('id',actors.map(a=>a.id)));
        check(await service.from('employee_records').update({is_active:false,employment_status:'separated'}).in('auth_user_id',actors.map(a=>a.id)));
        const retired=check(await service.from('profiles').select('id,status').in('id',actors.map(a=>a.id)));
        assert.equal(retired.length,actors.length);assert.ok(retired.every(a=>a.status==='disabled'));
        const separated=check(await service.from('employee_records').select('is_active,employment_status').in('auth_user_id',actors.map(a=>a.id)));
        assert.equal(separated.length,actors.length);assert.ok(separated.every(a=>a.is_active===false&&a.employment_status==='separated'));
      }
      if(process.env.CRM_WORKFLOW_RESULTS_FILE)writeFileSync(process.env.CRM_WORKFLOW_RESULTS_FILE,JSON.stringify({marker,stages,...result,blockedOutbound,syntheticActorsRetired:actors.length,hostedRequests:0,providerDeliveryTested:false},null,2)+'\n',{mode:0o600});
    }
  });
  const controller=await actor('owner'),office=await actor('admin'),crew=await actor('crew');
  const submission={submissionId:marker,firstName:'Synthetic',lastName:marker,name:'Synthetic '+marker,phone:'+1540'+String(parseInt(marker.slice(-7),16)).slice(-7).padStart(7,'0'),
    email:marker.toLowerCase()+'@example.invalid',serviceLabel:'Tree Care',serviceType:'other',customerTypeLabel:'Homeowner',customerType:'residential',commercialName:null,propertyScope:'1 property',
    address:'123 Synthetic Street, Fredericksburg, VA 22401',addressParts:{street:'123 Synthetic Street',city:'Fredericksburg',state:'VA',postalCode:'22401',needsConfirmation:false},
    projectDetails:marker+' remove synthetic branch',hazardPresent:false,updatesOptIn:false,preferredContactMethod:'text',preferredAppointmentTiming:'Weekday afternoon',
    pageUrl:'https://website.example.invalid/contact',referrer:null,utmSource:null,utmMedium:null,utmCampaign:null,utmTerm:null,utmContent:null,
    requestFingerprint:createHash('sha256').update(marker).digest('hex'),submittedAt:new Date().toISOString()};
  const intake=check(await service.rpc('submit_website_lead',{p_submission:submission}));
  assert.equal(intake.created,true);const replay=check(await service.rpc('submit_website_lead',{p_submission:submission}));
  assert.equal(replay.created,false);assert.equal(replay.job_id,intake.job_id);
  const job=()=>service.from('jobs').select('*').eq('id',intake.job_id).single().then(check);
  const lead=await job();assert.ok(lead.customer_id&&lead.service_location_id);assert.equal(lead.notification_outcome,'pending');
  stages.push('Lead retries retain one customer, property and lead without sending a message.');

  const lines=[{name:marker+' scope',description:'Synthetic scope only',quantity:2,unit_price_cents:12000,total_cents:24000}];
  const draft=check(await office.client.rpc('create_quote_draft',{p_header:{customer_id:lead.customer_id,service_location_id:lead.service_location_id,job_id:lead.id,customer_message:'Synthetic local proposal'},p_lines:lines}));
  const quote=()=>service.from('quotes').select('*,quote_line_items(*)').eq('id',draft.id).single().then(check);
  const before=await quote();const savedLines=before.quote_line_items.map(l=>({id:l.id,name:l.name,description:l.description,quantity:Number(l.quantity),unit_price_cents:l.unit_price_cents,total_cents:l.total_cents}));
  check(await office.client.rpc('save_quote_details',{p_quote_id:before.id,p_expected_revision:before.edit_revision,p_header:{customer_message:'Reviewed local proposal'},p_lines:savedLines}));
  const reviewed=await quote();assert.ok(reviewed.edit_revision>before.edit_revision);assert.equal(reviewed.total_cents,24000);
  const detail=await localFetch(web+'/api/mobile/quotes/'+reviewed.id,{headers:{authorization:'Bearer '+office.jwt}});assert.equal(detail.status,200);
  assert.equal((await detail.json()).data.quote.totalCents,24000);
  const stale=await office.client.rpc('approve_quote',{p_quote_id:reviewed.id,p_expected_revision:before.edit_revision});assert.equal(stale.error?.code,'40001');
  const approval=check(await office.client.rpc('approve_quote',{p_quote_id:reviewed.id,p_expected_revision:reviewed.edit_revision}));
  assert.equal(approval.job_id,lead.id);assert.equal((await job()).status,'accepted');
  assert.equal(check(await office.client.rpc('approve_quote',{p_quote_id:reviewed.id,p_expected_revision:reviewed.edit_revision})).job_id,lead.id);
  assert.equal(check(await service.from('jobs').select('id').eq('source_quote_id',reviewed.id)).length,1);
  stages.push('Reviewed quote appears through the mobile API; stale approval fails and repeated approval keeps one work order.');

  const visits=check(await office.client.rpc('save_job_employee_work_sessions',{p_job_id:lead.id,p_mode:'replace',p_expected_snapshot:[],
    p_sessions:[{date:'2031-04-15',start_time:'08:00',end_time:'10:00',assigned_user_ids:[crew.employeeId],notes:marker,status:'scheduled'}]}));
  assert.equal(visits.session_count,1);assert.equal((await job()).status,'scheduled');
  const assigned=check(await service.from('schedule_event_assignments').select('employee_id').eq('event_id',visits.sessions[0].id));assert.deepEqual(assigned.map(a=>a.employee_id),[crew.employeeId]);
  const ctx=check(await office.client.rpc('get_job_completion_context',{p_job_id:lead.id}));
  const complete={p_request_id:randomUUID(),p_job_id:lead.id,p_expected_revision:ctx.revision,p_expected_snapshot:ctx.snapshot,p_confirm_future:true};
  assert.equal(check(await office.client.rpc('complete_job_work',complete)).job_completed,true);
  const completed=await job();assert.equal(completed.status,'completed');assert.equal(completed.completed_by_user_id,office.id);
  assert.equal(check(await service.from('schedule_events').select('status').eq('id',visits.sessions[0].id).single()).status,'completed');
  assert.deepEqual(check(await service.from('schedule_event_assignments').select('employee_id').eq('event_id',visits.sessions[0].id)),assigned);
  assert.equal(check(await service.from('invoices').select('id').eq('job_id',lead.id)).length,0);
  stages.push('Scheduled crew visit completes explicitly, retaining its assignment and creating no invoice implicitly.');

  const generation={p_request_id:randomUUID(),p_job_id:lead.id};
  const bill=check(await office.client.rpc('generate_job_invoice',generation));
  assert.equal(check(await office.client.rpc('generate_job_invoice',generation)).invoice_id,bill.invoice_id);
  const invoice=()=>service.from('invoices').select('*,invoice_line_items(*)').eq('id',bill.invoice_id).single().then(check);
  let inv=await invoice();assert.equal(inv.status,'draft');assert.equal(inv.total_cents,24000);assert.equal(inv.quote_id,reviewed.id);assert.equal(inv.invoice_line_items.length,1);
  assert.equal(inv.customer_id,lead.customer_id);assert.equal(inv.service_location_id,lead.service_location_id);
  assert.equal((await job()).completed_at,completed.completed_at);
  check(await office.client.rpc('record_invoice_delivery',{p_invoice_id:inv.id,p_manual:true}));
  assert.equal((await invoice()).status,'sent');
  const payment={p_request_id:randomUUID(),p_invoice_id:inv.id,p_amount_cents:24000,p_paid_at:new Date().toISOString(),p_method:'cash',p_reference:marker,p_notes:'Synthetic local acceptance payment'};
  const paid=check(await office.client.rpc('record_manual_invoice_payment_request',payment));
  assert.equal(check(await office.client.rpc('record_manual_invoice_payment_request',payment)).payment_id,paid.payment_id);
  inv=await invoice();assert.equal(inv.status,'paid');assert.equal(inv.balance_due_cents,0);
  assert.equal(check(await service.from('payments').select('id').eq('invoice_id',inv.id)).length,1);
  const events=check(await service.from('activity_log').select('event_type').in('subject_id',[lead.id,reviewed.id,inv.id]));
  for(const type of ['website_lead_received','quote_approved','job_work_completed','manual_payment_recorded'])assert.equal(events.filter(e=>e.event_type===type).length,1,type);
  stages.push('One invoice retains quote pricing; manual delivery sends nothing; payment retries create one payment and one audit event.');

  denied(await anon.rpc('generate_job_invoice',{p_request_id:randomUUID(),p_job_id:lead.id}));
  denied(await crew.client.rpc('record_manual_invoice_payment_request',{...payment,p_request_id:randomUUID()}));
  check(await controller.client.rpc('set_employee_access_status',{p_employee_id:office.employeeId,p_status:'inactive',p_reason:'Synthetic workflow access verification'}));
  denied(await office.client.rpc('generate_job_invoice',generation));denied(await office.client.rpc('record_manual_invoice_payment_request',payment));
  assert.equal(check(await office.client.rpc('has_effective_platform_access')),false);
  check(await controller.client.rpc('set_employee_access_status',{p_employee_id:office.employeeId,p_status:'active',p_reason:'Synthetic workflow reactivation verification'}));
  assert.equal(check(await office.client.rpc('has_effective_platform_access')),true);
  assert.equal(check(await service.from('time_clock_permissions').select('is_enabled').eq('user_id',office.id).single()).is_enabled,false);
  assert.equal(check(await office.client.rpc('generate_job_invoice',generation)).invoice_id,inv.id);
  assert.equal((await invoice()).balance_due_cents,0);assert.equal(blockedOutbound,0);
  stages.push('Anonymous/crew money commands fail; the same admin JWT loses access on deactivation and regains its roles without clock permission on reactivation.');
  result={jobId:lead.id,quoteId:reviewed.id,invoiceId:inv.id,paymentId:paid.payment_id,totalCents:inv.total_cents,balanceDueCents:0,completed:true};
});
