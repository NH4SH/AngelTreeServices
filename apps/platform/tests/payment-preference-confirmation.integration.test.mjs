import {localPaymentTarget} from './local-payment-target.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {preferenceRouteFixture} from './payment-preference-fixture.mjs';
const literal=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
test('payment preference routes use installed SQL in one rollback; no provider or customer sends',{
 skip:process.env.PREFERENCE_DISPOSABLE!=='1',timeout:120000},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.PREFERENCE_DOCKER_BIN);
  const target=localPaymentTarget();
  const child = spawn(process.env.PREFERENCE_DOCKER_BIN, ['exec', '-i', target.container,
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let pending, diagnostic = '', exited = false;
  child.stderr.on('data', data => { diagnostic += data; });
  const closed = new Promise(resolve => child.once('close', code => {
    exited = true; pending?.reject(Error('Disposable SQL connection stopped: ' + diagnostic)); pending = undefined; resolve(code);
  }));
  child.once('error', error => { pending?.reject(error); pending = undefined; });
  lines.on('line', line => {
    if (!pending) return;
    if (line === pending.marker) { const current = pending; pending = undefined; current.resolve(current.output); }
    else pending.output.push(line);
  });
  async function query(sql) {
    assert.equal(pending, undefined); assert.equal(exited, false);
    const marker = 'DONE_' + randomUUID(); let timer;
    try { return await new Promise((resolve, reject) => {
      pending = { marker, output: [], resolve, reject };
      timer = setTimeout(() => { pending = undefined; child.stdin.end(); reject(Error('Disposable SQL command timed out')); }, 20000);
      child.stdin.write(sql + ';\nselect ' + literal(marker) + ';\n');
    }); } finally { clearTimeout(timer); }
  }
  const proof = [];
  try {
    await query(`begin;set local statement_timeout='10s';set local lock_timeout='3s';
      create function pg_temp.capture_json(statement text) returns jsonb language plpgsql as $$
      declare result jsonb;begin execute statement into result;return jsonb_build_object('data',result,'error',null);
      exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$`);




    const scenarios=[
      {name:'bank selection confirms a real changed row before preparation',kind:'bank'},
      {name:'card selection confirms a real changed row before preparation',kind:'card'},
      {name:'organization-only bank selection preserves the installed party',kind:'bank',organization:true},
      {name:'organization-only card selection preserves the installed party',kind:'card',organization:true},
      {name:'explicit preference form returns its durable source identity',kind:'form'},
      {name:'all four explicit preferences retain one source per actual transition',kind:'form',methods:true},
      {name:'lost bank save acknowledgement recovers on explicit no-op retry',kind:'bank',lost:true},
      {name:'lost card save acknowledgement recovers on explicit no-op retry',kind:'card',lost:true},
      {name:'lost form save acknowledgement reuses its original durable source',kind:'form',lost:true},
      {name:'throw after actual form save reuses its original durable source',kind:'form',throwAfter:true},
      {name:'notification failure preserves saved form state and exact recovery identity',kind:'form',deliveryThrows:true},
      {name:'revoked token is rejected by actual preference SQL after initial lookup',kind:'bank',revoked:true,code:'P0002'},
      {name:'expired token is rejected by actual preference SQL after initial lookup',kind:'card',expired:true,code:'P0002'},
      {name:'unpayable invoice is rejected by actual preference SQL after initial lookup',kind:'form',unpayable:true,code:'P0001'},
      {name:'anonymous caller cannot execute the existing payment preference command',kind:'bank',role:'anon',code:'42501'},
      {name:'authenticated browser cannot execute the existing source event command',kind:'form',role:'authenticated',code:'42501'},
    ];
    for(const c of scenarios)await t.test(c.name,async()=>{
      const invoice=randomUUID(),party=randomUUID(),tokenId=randomUUID();
      const hash=createHash('sha256').update(randomUUID()).digest('hex');
      await query(`savepoint fixture;
        ${c.organization?`insert into public.organizations(id,name)values('${party}','PREFERENCE_ACK_${invoice}')`:
          `insert into public.customers(id,display_name)values('${party}','PREFERENCE_ACK_${invoice}')`};
        insert into public.invoices(id,invoice_number,customer_id,organization_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
        values('${invoice}','PREFERENCE_ACK_${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'${c.unpayable?'draft':'sent'}',1000,1000,1000,clock_timestamp());
        insert into public.invoice_portal_tokens(id,invoice_id,customer_id,organization_id,token_hash,expires_at,revoked_at)
        values('${tokenId}','${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'${hash}',
          clock_timestamp()+interval '${c.expired?'-1':'1'} day',${c.revoked?'clock_timestamp()':'null'})`);
      let lost=Boolean(c.lost),throwAfter=Boolean(c.throwAfter);const codes=[],commands=[];
      async function rpc(name,args){
        assert.ok(['record_invoice_payment_preference','record_invoice_preference_with_event'].includes(name));
        commands.push({name,args});const invocation=`public.${name}(p_token_hash=>${literal(args.p_token_hash)},p_preference=>${literal(args.p_preference)})`;
        const sql=name==='record_invoice_payment_preference'?`select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ${invocation} r`:`select ${invocation}`;
        const lines=await query(`set local role ${c.role??'service_role'};set local request.jwt.claims='{"role":"${c.role??'service_role'}"}';
          select 'RESULT:'||pg_temp.capture_json(${literal(sql)})::text;reset role`);
        const receipt=JSON.parse(lines.find(line=>line.startsWith('RESULT:')).slice(7));if(receipt.error)codes.push(receipt.error.code);
        if(lost){lost=false;return{data:null,error:null};}if(throwAfter){throwAfter=false;throw Error('Synthetic lost transport after completed SQL');}return receipt;
      }
      const f=preferenceRouteFixture(c.kind,{invoiceId:invoice,tokenHash:hash,rpc,partyId:party,organization:c.organization,deliveryThrows:c.deliveryThrows});
      let first=await f.run();
      if(c.code){assert.equal(first.status,503);assert.deepEqual(codes,[c.code]);assert.equal(f.next.length,0);assert.equal(f.handoffs.length,0);}
      else{
        if(c.lost||c.throwAfter){assert.equal(first.status,503);assert.equal(f.next.length,0);assert.equal(f.handoffs.length,0);assert.equal(commands.length,1);first=await f.run();}
        assert.equal(first.status,200);const body=await first.json();assert.equal(body.ok,true);
        if(c.kind==='form'){assert.equal(body.changed,!(c.lost||c.throwAfter));assert.equal(body.notificationFailed,Boolean(c.deliveryThrows));assert.equal(f.handoffs.length,1);}
        else{assert.equal(f.next.length,1);assert.equal(f.handoffs.length,0);assert.equal(f.next[0].customerId,c.organization?null:party);assert.equal(f.next[0].organizationId,c.organization?party:null);}
        const repeated=await f.run();assert.equal(repeated.status,200);
        if(c.kind==='form'){assert.equal((await repeated.json()).changed,false);assert.deepEqual(f.handoffs[0],f.handoffs[1]);}
        assert.deepEqual(codes,[]);
      }
      async function state(){
        const lines=await query(`select 'STATE:'||jsonb_build_object('preference',(select payment_preference from invoices where id='${invoice}'),
          'sources',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'hold',preparation_problem)),'[]') from app_private.customer_source_events where event->>'subject_id'='${invoice}'),
          'audits',(select count(*) from activity_log where subject_id='${invoice}' and event_type='customer_selected_payment_preference'),
          'payments',(select count(*) from payments where invoice_id='${invoice}'),
          'checkouts',(select count(*) from invoice_checkout_sessions where invoice_id='${invoice}'),
          'total',(select total_cents from invoices where id='${invoice}'),
          'balance',(select balance_due_cents from invoices where id='${invoice}'),
          'customer',(select customer_id from invoices where id='${invoice}'),
          'organization',(select organization_id from invoices where id='${invoice}'))::text`);
        return JSON.parse(lines.find(line=>line.startsWith('STATE:')).slice(6));
      }
      let saved=await state();assert.equal(saved.total,1000);assert.equal(saved.balance,1000);assert.equal(saved.payments,0);assert.equal(saved.checkouts,0);
      assert.equal(saved.customer,c.organization?null:party);assert.equal(saved.organization,c.organization?party:null);
      if(c.code){assert.equal(saved.preference,null);assert.equal(saved.audits,0);assert.equal(saved.sources.length,0);}
      else{
        assert.equal(saved.preference,c.kind==='card'?'card':'ach');assert.equal(saved.audits,1);assert.equal(saved.sources.length,1);
        if(c.kind==='form'){assert.equal(saved.sources[0].id,f.handoffs[0].id);assert.equal(saved.sources[0].hold,null);}
        else assert.equal(saved.sources[0].hold,'legacy_activity_hold');
      }
      if(c.methods){
        for(const method of ['card','cash_check_pickup','check_mail']){
          const option=preferenceRouteFixture('form',{invoiceId:invoice,tokenHash:hash,rpc,method});assert.equal((await option.run()).status,200);assert.equal((await option.run()).status,200);
        }
        saved=await state();assert.equal(saved.preference,'check_mail');assert.equal(saved.audits,4);assert.equal(saved.sources.length,4);assert.equal(new Set(saved.sources.map(s=>s.id)).size,4);
      }
      proof.push({name:c.name,pass:true,commands:commands.length,expectedSqlErrors:codes});
      await query('rollback to savepoint fixture;release savepoint fixture');
      const remaining=await query(`select 'ABSENT:'||count(*) from public.invoices where id='${invoice}'`);assert.ok(remaining.includes('ABSENT:0'));
    });
  } finally {
    if(!exited){await query('rollback');child.stdin.end();}await closed;lines.close();
    if(process.env.PREFERENCE_RESULTS_FILE)writeFileSync(process.env.PREFERENCE_RESULTS_FILE,JSON.stringify({scenarios:proof,outerRollback:true,syntheticDownstreamOnly:true,realProviderRequests:0,hostedReadiness:false},null,2)+'\n');
  }
});
