import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@supabase/supabase-js';
import {reminderLinkReadFixture} from './reminder-link-read-fixture.mjs';

const enabled=process.env.REMINDER_LINK_DISPOSABLE==='1'&&Boolean(process.env.REMINDER_LINK_STATUS_FILE);
test('reminder link failures and durable admission on the explicitly owned local stack',{skip:!enabled,timeout:180000},async t=>{
  const e=JSON.parse(readFileSync(process.env.REMINDER_LINK_ENV_FILE));
  const s=JSON.parse(readFileSync(process.env.REMINDER_LINK_STATUS_FILE));
  assert.match(e.projectId,/^ats_linkread_[a-f0-9]{12}$/);assert.equal(e.createdThisTask,true);
  assert.equal(e.container,'supabase_db_'+e.projectId);assert.equal(s.API_URL,'http://127.0.0.1:61221');
  const original=globalThis.fetch,proof=[];let fault=null;
  globalThis.fetch=(input,init)=>{
    const url=new URL(input instanceof Request?input.url:input);assert.equal(url.origin,s.API_URL,'External requests forbidden');
    const tokenRead=url.pathname.endsWith('_portal_tokens');
    const sourceRead=['/rest/v1/quotes','/rest/v1/invoices'].includes(url.pathname)&&url.searchParams.get('select')==='customer_id,organization_id';
    if((fault==='token'&&tokenRead)||(fault==='source'&&sourceRead))return Promise.resolve(new Response(JSON.stringify({code:'42501',message:'PRIVATE_SYNTHETIC_LINK_DIAGNOSTIC'}),{status:403,headers:{'content-type':'application/json'}}));
    return original(input,{...init,redirect:'error',signal:init?.signal??AbortSignal.timeout(15000)});
  };
  t.after(()=>{globalThis.fetch=original;if(process.env.REMINDER_LINK_RESULTS_FILE)writeFileSync(process.env.REMINDER_LINK_RESULTS_FILE,JSON.stringify({proof,actualLocalSupabaseAndDurableCommands:true,controlledHttpReadFaults:true,syntheticTransportOnly:true,realProviderCalls:0,productionChanged:false},null,2)+'\n',{mode:0o600});});
  const db=createClient(s.API_URL,s.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const anon=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const exec=promisify(execFile),modules=reminderLinkReadFixture();
  const sql=async source=>(await exec(process.env.REMINDER_LINK_DOCKER_BIN,['--host','unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock','exec','-i',e.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',source],{encoding:'utf8',timeout:30000})).stdout.trim();
  const lit=value=>"'"+String(value).replaceAll("'","''")+"'";
  const ok=result=>{assert.equal(result.error?.code??null,null,result.error?.message);return result.data;};
  async function fixture(type){
    const kind=type==='quote_follow_up'?'quote':'invoice',id=randomUUID(),customer=randomUUID(),site=randomUUID(),job=randomUUID(),token=randomUUID(),communication=randomUUID();
    const raw=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''),cipher=modules.codec.encryptPortalToken(raw);assert.equal(cipher.error,null);
    await sql(`begin;insert into customers(id,display_name,email)values(${lit(customer)},'Synthetic reminder link customer','reminder-link@example.invalid');insert into service_locations(id,customer_id,street,city,state)values(${lit(site)},${lit(customer)},'1 Synthetic Lane','Fredericksburg','VA');insert into jobs(id,customer_id,service_location_id,status,service_type,requested_scope)values(${lit(job)},${lit(customer)},${lit(site)},'accepted','other','Synthetic link verification');insert into ${kind==='quote'?'quotes':'invoices'}(id,job_id,customer_id,service_location_id,${kind}_number,status,subtotal_cents,total_cents${kind==='invoice'?',balance_due_cents':''})values(${lit(id)},${lit(job)},${lit(customer)},${lit(site)},${lit('SYNTHETIC-LINK-'+id)},'sent',10000,10000${kind==='invoice'?',10000':''});insert into ${kind}_portal_tokens(id,${kind}_id,customer_id,token_hash,token_encrypted,expires_at)values(${lit(token)},${lit(id)},${lit(customer)},${lit(modules.codec.hashPortalToken(raw))},${lit(cipher.encryptedToken)},clock_timestamp()+interval '1 day');insert into customer_communications(id,communication_type,reminder_stage,customer_id,${kind}_id,recipient_source,recipient_email,scheduled_for,is_automatic,idempotency_key)values(${lit(communication)},${lit(type)},'synthetic_link_read',${lit(customer)},${lit(id)},'customer','reminder-link@example.invalid',clock_timestamp(),false,${lit('synthetic-link-read/'+communication)});commit;`);
    return {kind,id,customer,token,communication,raw};
  }
  const run=(name,fn)=>t.test(name,async()=>{await fn();proof.push({name,passed:true});});
  const read=id=>db.from('customer_communications').select('*').eq('id',id).single().then(ok);
  const attempt=(f,send)=>modules.processor.processCommunicationById(f.communication,{db,send});
  const never=()=>assert.fail('Unverified link must never reach provider transport');
  for(const type of ['quote_follow_up','invoice_payment_reminder','overdue_invoice_reminder']) {
    for(const mode of ['token','source','revoked','expired','bad-hash','missing'])await run(type+': '+mode+' link remains failed without resend',async()=>{
      const f=await fixture(type),before=await sql(`select to_jsonb(t)from ${f.kind}_portal_tokens t where id=${lit(f.token)}`);
      if(['token','source'].includes(mode))fault=mode;
      else await sql(mode==='missing'?`delete from ${f.kind}_portal_tokens where id=${lit(f.token)}`:`update ${f.kind}_portal_tokens set ${mode==='revoked'?'revoked_at=clock_timestamp()':mode==='expired'?"expires_at=clock_timestamp()-interval '1 minute'":"token_hash=md5(gen_random_uuid()::text)||md5(gen_random_uuid()::text)"}where id=${lit(f.token)}`);
      try {const result=await attempt(f,never);assert.equal(result.outcome,'not_sent');assert.equal(result.recorded,true);}
      finally {fault=null;}
      const row=await read(f.communication);assert.equal(row.status,'failed');assert.equal(row.skip_reason,null);assert.equal(row.cancelled_at,null);assert.equal(row.last_error,'Delivery checks could not be completed safely. No email was sent.');
      assert.equal((await attempt(f,never)).status,'failed');assert.equal((await read(f.communication)).attempt_count,1);
      assert.equal(await sql(`select count(*)from app_private.outbound_deliveries where context->>'communication_id'=${lit(f.communication)}`),'0');
      if(['token','source'].includes(mode))assert.equal(await sql(`select to_jsonb(t)from ${f.kind}_portal_tokens t where id=${lit(f.token)}`),before);
    });
    await run(type+': exact healthy link reaches durable acceptance once',async()=>{
      const f=await fixture(type),calls=[];const send=input=>modules.durable.sendDurableEmail(input,{db,envelope:{from:'Synthetic <office@example.invalid>',replyTo:'office@example.invalid'},configured:true,transport:async frozen=>{calls.push(frozen);return {ok:true,outcome:'accepted',historyRecorded:true,retryable:false,providerMessageId:'synthetic-'+f.communication};}});
      assert.equal((await attempt(f,send)).outcome,'accepted');assert.equal((await attempt(f,send)).outcome,'accepted');assert.equal(calls.length,1);assert.ok(calls[0].text.includes(f.raw));
      assert.equal(await sql(`select count(*)from email_events where related_communication_id=${lit(f.communication)}and status='sent'`),'1');
      const denied=await anon.from(f.kind+'_portal_tokens').select('id').eq('id',f.token);assert.ok(denied.error||denied.data?.length===0);
    });
  }
  assert.equal(await sql('select automated_sending_enabled::text from communication_settings where singleton'),'false');
});
