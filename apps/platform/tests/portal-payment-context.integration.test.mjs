import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {writeFileSync} from 'node:fs';
import {contextFixture} from './portal-payment-context-fixture.mjs';
import {load} from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import * as budget from '../src/lib/payments/checkout-budget.ts';
import * as policy from '../src/lib/payments/card-reservation-policy.ts';
import * as surcharge from '../src/lib/payments/card-surcharge.ts';
const {releaseStaleCardReservations}=load('../src/lib/stripe/card-payment.ts',{'server-only':{},
 '@/lib/payments/checkout-closure':closure,'@/lib/payments/checkout-budget':budget,'@/lib/payments/card-reservation-policy':policy,'@/lib/payments/card-surcharge':surcharge});
const literal=v=>v===null?'null':"'"+String(v).replaceAll("'","''")+"'";
test('portal payment context with installed reads and cleanup in one rollback; no provider calls',{
 skip:process.env.CONTEXT_DISPOSABLE!=='1',timeout:120000},async t=>{
 assert.equal(process.env.DOCKER_HOST,'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
 assert.ok(process.env.CONTEXT_DOCKER_BIN);
  const child = spawn(process.env.CONTEXT_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable',
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
      {name:'unpaid individual invoice has exact collectible principal'},
      {name:'organization-only invoice retains its billing identity',organization:true},
      {name:'successful principal reduces amount due',payments:[{amount:400}],expected:600},
      {name:'refund restores only refunded principal',payments:[{amount:400,refund:200}],expected:800},
      {name:'lost dispute restores only disputed principal',payments:[{amount:400,dispute:100,state:'lost'}],expected:700},
      {name:'won dispute does not restore satisfied principal',payments:[{amount:400,dispute:100,state:'won'}],expected:600},
      {name:'overlapping refund and lost dispute remain clamped',payments:[{amount:400,refund:300,dispute:300,state:'lost'}],expected:1000},
      {name:'multiple successful rows match installed SQL net principal',payments:[{amount:200},{amount:300,refund:100}],expected:600},
      {name:'fully paid invoice cannot start another collection',payments:[{amount:1000}],status:409},
      {name:'capped history cannot overstate amount to collect',payments:[{amount:200},{amount:200},{amount:200}],cap:1,status:503},
      {name:'revoked token fails before cleanup',revoked:true,status:404},
      {name:'expired token fails before cleanup',expired:true,status:404},
      {name:'existing creating reservation remains held',processing:'creating',status:409,afterCleanup:true},
      {name:'existing processing reservation remains held',processing:'processing',status:409,afterCleanup:true},
      {name:'draft invoice remains unavailable',draft:true,status:409},
    ];
    for(const c of scenarios)await t.test(c.name,async()=>{
      const invoice=randomUUID(),party=randomUUID(),token=randomUUID();const hash=createHash('sha256').update(randomUUID()).digest('hex');
      await query(`savepoint fixture;
        ${c.organization?`insert into public.organizations(id,name,billing_email)values('${party}','CONTEXT_ACK_${invoice}','org@example.invalid')`:
          `insert into public.customers(id,display_name,email)values('${party}','CONTEXT_ACK_${invoice}','individual@example.invalid')`};
        insert into public.invoices(id,invoice_number,customer_id,organization_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
          values('${invoice}','CONTEXT_ACK_${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'${c.draft?'draft':'sent'}',1000,1000,1000,${c.draft?'null':'clock_timestamp()'});
        insert into public.invoice_portal_tokens(id,invoice_id,customer_id,organization_id,token_hash,expires_at,revoked_at)
          values('${token}','${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},'${hash}',clock_timestamp()+interval '${c.expired?'-1':'1'} day',${c.revoked?'clock_timestamp()':'null'})`);
      for(const p of c.payments??[])await query(`insert into public.payments(id,invoice_id,customer_id,organization_id,amount_cents,total_collected_cents,surcharge_cents,currency,payment_method,provider,status,
        refunded_principal_cents,disputed_principal_cents,disputed_gross_cents,dispute_status)
        values('${randomUUID()}','${invoice}',${c.organization?'null':literal(party)},${c.organization?literal(party):'null'},${p.amount},${p.amount},0,'usd','cash','manual','succeeded',${p.refund??0},${p.dispute??0},${p.dispute??0},${literal(p.state??null)})`);
      if(c.processing)await query(`insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,currency,payment_channel,status,processing_expires_at)
        values('${randomUUID()}','${invoice}','${party}',1000,1000,0,1000,'usd','card','${c.processing}',clock_timestamp()+interval '10 minutes')`);
      const codes=[],calls=[];
      const db={from(table){
        assert.ok(['invoices','invoice_portal_tokens','payments','invoice_checkout_sessions'].includes(table));let fields,selectOptions,limit,single=false;const filters=[];
        const q={select(v,o){fields=v;selectOptions=o;return q;},eq(k,v){filters.push([k,'=',v]);return q;},is(k,v){assert.equal(v,null);filters.push([k,'is',v]);return q;},
          in(k,v){filters.push([k,'in',v]);return q;},lte(k,v){filters.push([k,'<=',v]);return q;},limit(v){limit=v;return q;},abortSignal(){return q;},
          single(){single=true;return run();},maybeSingle(){single=true;return run();},then(resolve,reject){return run().then(resolve,reject);}};
        async function run(){
          calls.push(table);const where=filters.map(([k,op,v])=>{assert.match(k,/^[a-z_]+$/);return 'r.'+k+(op==='is'?' is null':op==='in'?' in ('+v.map(literal).join(',')+')':' '+op+' '+literal(v));}).join(' and ')||'true';
          let projection;
          if(table==='invoices'){
            assert.match(fields,/accounts_payable_contact:organization_contacts/);
            projection=`jsonb_build_object('id',r.id,'customer_id',r.customer_id,'organization_id',r.organization_id,'invoice_number',r.invoice_number,'status',r.status,'total_cents',r.total_cents,
              'customers',(select jsonb_build_object('id',id,'email',email)from public.customers where id=r.customer_id),
              'organizations',(select jsonb_build_object('id',id,'billing_email',billing_email)from public.organizations where id=r.organization_id),
              'billing_contact',(select jsonb_build_object('email',email)from public.organization_contacts where id=r.billing_contact_id),
              'accounts_payable_contact',(select jsonb_build_object('email',email)from public.organization_contacts where id=r.accounts_payable_contact_id),
              'jobs',(select jsonb_build_object('service_location_id',service_location_id)from public.jobs where id=r.job_id))`;
          }else{assert.match(fields,/^[a-z_, ]+$/);projection='jsonb_build_object('+fields.split(',').map(k=>{k=k.trim();return literal(k)+',r.'+k;}).join(',')+')';}
          const cap=table==='payments'?c.cap:limit;
          const statement=`with matched as(select ${projection} row from public.${table} r where ${where}),visible as(select row from matched ${cap?'limit '+cap:''})
            select jsonb_build_object('data',${single?"(select row from visible limit 1)":"(select coalesce(jsonb_agg(row),'[]'::jsonb)from visible)"},'error',null,'count',${selectOptions?.count==='exact'?'(select count(*) from matched)':'null'})`;
          const lines=await query(`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select 'RESULT:'||pg_temp.capture_json(${literal(statement)})::text;reset role`);
          const result=JSON.parse(lines.find(s=>s.startsWith('RESULT:')).slice(7));if(result.error){codes.push(result.error.code);return result;}return result.data;
        }return q;
      }};
      const f=contextFixture({db,expectedId:invoice,tokenHash:hash,cleanupCommand:input=>releaseStaleCardReservations({...input,
        stripe:{paymentIntents:{retrieve:()=>assert.fail('No stale remote intent in a context fixture')}}})});
      const result=await f.run();assert.deepEqual(codes,[]);
      if(c.status){assert.equal(result.ok,false);assert.equal(result.status,c.status);assert.equal(f.cleanups.length,c.afterCleanup?1:0);}
      else{
        assert.equal(result.ok,true);assert.equal(result.invoicePrincipalCents,c.expected??1000);assert.equal(result.invoice.customer_id,c.organization?null:party);
        assert.equal(result.invoice.organization_id,c.organization?party:null);assert.equal(result.billingEmail,c.organization?'org@example.invalid':'individual@example.invalid');assert.equal(f.cleanups.length,1);
      }
      const lines=await query(`select 'STATE:'||jsonb_build_object('paid',app_private.invoice_paid_principal('${invoice}'),'total',(select total_cents from invoices where id='${invoice}'),
        'paymentCount',(select count(*) from payments where invoice_id='${invoice}'),'preference',(select payment_preference from invoices where id='${invoice}'),
        'sources',(select count(*) from app_private.customer_source_events where event->>'subject_id'='${invoice}'))::text`);
      const state=JSON.parse(lines.find(s=>s.startsWith('STATE:')).slice(6));assert.equal(state.total,1000);assert.equal(state.paymentCount,(c.payments??[]).length);assert.equal(state.preference,null);assert.equal(state.sources,0);
      if(result.ok)assert.equal(result.invoicePrincipalCents,1000-state.paid);
      proof.push({name:c.name,pass:true,sqlErrors:codes,reads:calls.length,installedNetPrincipal:state.paid});
      await query('rollback to savepoint fixture;release savepoint fixture');
      assert.ok((await query(`select 'ABSENT:'||count(*) from invoices where id='${invoice}'`)).includes('ABSENT:0'));
    });
  } finally {
    if(!exited){await query('rollback');child.stdin.end();}await closed;lines.close();
    if(process.env.CONTEXT_RESULTS_FILE)writeFileSync(process.env.CONTEXT_RESULTS_FILE,JSON.stringify({scenarios:proof,outerRollback:true,realProviderRequests:0,hostedReadiness:false},null,2)+'\n');
  }
});
