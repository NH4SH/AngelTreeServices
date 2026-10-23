import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';

test('native concurrent receipt admission retains payment-level identity',{
  skip:process.env.RECEIPT_IDENTITY_DISPOSABLE!=='1',timeout:45000,
},async t=>{
  const e=JSON.parse(readFileSync(process.env.RECEIPT_IDENTITY_ENV_FILE));
  assert.match(e.projectId,/^ats_receipt_[a-f0-9]{12}$/);assert.equal(e.createdThisTask,true);
  assert.equal(e.container,'supabase_db_'+e.projectId);assert.equal(e.api,'http://127.0.0.1:61221');assert.equal(e.databasePort,61222);
  assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  const docker=process.env.RECEIPT_IDENTITY_DOCKER_BIN;assert.ok(docker);
  const args=['exec','-i',e.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'];
  function sql(source){const r=spawnSync(docker,args,{env:process.env,input:source,encoding:'utf8',timeout:15000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
  function pending(source){const p=spawn(docker,args,{env:process.env});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>resolve({code,out:out.trim(),err}));});p.stdin.end(source);return done;}
  async function hold(id){
    const p=spawn(docker,args,{env:process.env});let out='';
    const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('Owned invoice lock failed')));});
    const ready=new Promise(resolve=>p.stdout.on('data',b=>{out+=b;const m=out.match(/RECEIPT_LOCK:(\d+)/);if(m)resolve(Number(m[1]));}));
    p.stdin.write(`begin;select id from public.invoices where id='${id}'for update;select 'RECEIPT_LOCK:'||pg_backend_pid();\n`);
    return{pid:await ready,release:async()=>{p.stdin.end('commit;\n');await done;}};
  }
  const setup=readFileSync(new URL('../../../supabase/verification/payment_receipt_identity.sql',import.meta.url),'utf8').split('-- APPLY_RECEIPT_IDENTITY_CANDIDATE_HERE')[0];
  const seed=()=>JSON.parse(sql(setup+"select pg_temp.receipt_identity_seed();commit;"));
  const claim=id=>`begin;set local application_name='receipt-identity-${id}';set local role service_role;select set_config('request.jwt.claim.sub','',true);select set_config('request.jwt.claims','{"role":"service_role"}',true);select coalesce(public.claim_outbound_delivery('${id}')::text,'NO_CLAIM');commit;`;
  const proof=[];
  for(const scenario of ['distinct payments','same payment'])await t.test(scenario+' under observed simultaneous invoice-lock waits',async()=>{
    const f=seed();let second=f.second.delivery;
    if(scenario==='same payment'){
      const duplicate=JSON.parse(sql(setup+`select pg_temp.receipt_identity_prepare('${f.party}','${f.invoice}','${f.first_payment}','duplicate');commit;`));
      second=duplicate.delivery;assert.notEqual(second,f.first.delivery);
    }
    const lock=await hold(f.invoice),requests=[pending(claim(f.first.delivery)),pending(claim(second))];
    let observed=false;
    try{
      for(let i=0;i<70;i++){
        if(Number(sql(`select count(*)from pg_stat_activity where application_name in('receipt-identity-${f.first.delivery}','receipt-identity-${second}')and wait_event_type='Lock'`))===2){observed=true;break;}
        await new Promise(r=>setTimeout(r,25));
      }
    }finally{await lock.release();}
    const result=await Promise.all(requests);assert.equal(observed,true,'Both real sessions must be observed waiting');result.forEach(r=>assert.equal(r.code,0,r.err));
    const admitted=scenario==='distinct payments'?2:1;assert.equal(result.filter(r=>!r.out.includes('NO_CLAIM')).length,admitted);
    assert.equal(Number(sql(`select count(*)from app_private.outbound_delivery_attempts where delivery_id in('${f.first.delivery}','${second}')`)),admitted);
    assert.equal(Number(sql(`select count(*)from public.email_events where related_invoice_id='${f.invoice}'`)),0);
    proof.push({scenario,observedBothLockWaits:true,nativeAttempts:admitted,realProviderCalls:0});
  });
  if(process.env.RECEIPT_IDENTITY_RESULTS_FILE)writeFileSync(process.env.RECEIPT_IDENTITY_RESULTS_FILE,JSON.stringify({proof,productionChanged:false,realProviderCalls:0},null,2)+'\n',{mode:0o600});
});
