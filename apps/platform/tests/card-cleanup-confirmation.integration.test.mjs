import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import * as budget from '../src/lib/payments/checkout-budget.ts';
import * as policy from '../src/lib/payments/card-reservation-policy.ts';
import * as surcharge from '../src/lib/payments/card-surcharge.ts';

const { releaseStaleCardReservations } = load('../src/lib/stripe/card-payment.ts', {'@/lib/firewood/handoff/collector-policy':load('../src/lib/firewood/handoff/collector-policy.ts',{'server-only':{}}),
  'server-only': {}, '@/lib/payments/checkout-closure': closure,
  '@/lib/payments/checkout-budget': budget, '@/lib/payments/card-reservation-policy': policy, '@/lib/payments/card-surcharge': surcharge,
});
const enabled = process.env.CARD_CLEANUP_DISPOSABLE === '1';
const literal = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
test('card cleanup with installed SQL and synthetic provider in one rollback', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  assert.ok(process.env.CARD_CLEANUP_DOCKER_BIN);
  const child = spawn(process.env.CARD_CLEANUP_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable',
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


    const scenarios = [
      {name:'unsubmitted open review expires without provider access',unsubmitted:true},
      {name:'verified unpaid authentication intent is cancelled and expired'},
      {name:'already cancelled unpaid intent expires without cancellation',cancelled:true},
      {name:'processing intent remains reserved',hold:'processing'},
      {name:'successful intent remains reserved for webhook accounting',hold:'succeeded'},
      {name:'lost expiry acknowledgement recovers without a second cancellation',lost:true},
      {name:'new submission timestamp defeats stale expiry',submissionRace:true},
      {name:'changed provider binding defeats stale expiry',bindingRace:true},
      {name:'changed stale expiry defeats the older snapshot',expiryRace:true},
      {name:'cancellation racing successful payment retains the reservation',paidRace:true},
      {name:'missing received amount cannot authorize cancellation',unknownAmount:true},
      {name:'unidentified creating attempt remains held',unidentified:true},
    ];
    for(const c of scenarios)await t.test(c.name,async()=>{
      const customer=randomUUID(),invoice=randomUUID(),reservation=randomUUID();
      const intentId='pi_'+reservation.replaceAll('-',''),otherId='pi_changed'+reservation.replaceAll('-','');
      const originalStatus=c.unsubmitted?'open':c.unidentified?'creating':'processing';
      await query(`savepoint fixture;insert into public.customers(id,display_name)values('${customer}','CLEANUP_ACK_${invoice}');
        insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
          values('${invoice}','CLEANUP_ACK_${invoice}','${customer}','sent',1000,1000,1000,clock_timestamp());
        insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,amount_cents,invoice_principal_cents,total_charge_cents,
          payment_channel,currency,status,stripe_payment_intent_id,submitted_at,processing_expires_at)
          values('${reservation}','${invoice}','${customer}',1000,1000,1000,'card','usd','${originalStatus}',
            ${c.unsubmitted||c.unidentified?'null':literal(intentId)},${c.unsubmitted?'null':"clock_timestamp()-interval '30 minutes'"},clock_timestamp()-interval '5 minutes')`);
      async function execute(command){
        const output=await query(`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
          select 'RESULT:'||pg_temp.capture_json(${literal(command)})::text;reset role`);
        const result=JSON.parse(output.find(line=>line.startsWith('RESULT:')).slice(7));
        if(result.error)sqlErrors.push(result.error.code);return result;
      }
      let lost=Boolean(c.lost),race=Boolean(c.submissionRace||c.bindingRace||c.expiryRace);
      const provider=[],sqlErrors=[];
      let remote={id:intentId,status:c.hold??(c.cancelled?'canceled':'requires_action'),livemode:false,
        amount:1000,amount_received:c.unknownAmount?undefined:c.hold==='succeeded'?1000:0,currency:'usd',
        metadata:{invoice_id:invoice,checkout_reservation_id:reservation,payment_channel:'card'}};
      const db={from(table){assert.equal(table,'invoice_checkout_sessions');let columns='*',patch;const filters=[];
        const column=key=>{assert.match(key,/^[a-z_]+$/);return key;};
        const q={select(value){assert.match(value,/^[a-z_, ]+$/);columns=value;return q;},
          eq(key,value){filters.push(column(key)+'='+literal(value));return q;},
          is(key,value){assert.equal(value,null);filters.push(column(key)+' is null');return q;},
          in(key,values){filters.push(column(key)+' in ('+values.map(literal).join(',')+')');return q;},
          lte(key,value){filters.push(column(key)+'<='+literal(value));return q;},
          update(value){patch=value;return q;},maybeSingle(){return run(true);},then(resolve,reject){return run(false).then(resolve,reject);}};
        async function run(single){
          if(patch&&race){race=false;
            const change=c.submissionRace?"submitted_at=submitted_at+interval '1 second'":c.bindingRace?"stripe_payment_intent_id='"+otherId+"'":"processing_expires_at=processing_expires_at+interval '1 second'";
            const changed=await execute(`update public.invoice_checkout_sessions set ${change} where id='${reservation}' returning to_jsonb(invoice_checkout_sessions)`);
            assert.equal(changed.error,null);
          }
          const command=patch?`with changed as(update public.invoice_checkout_sessions set ${Object.entries(patch).map(([key,value])=>column(key)+'='+literal(value)).join(',')}
            where ${filters.join(' and ')} returning ${columns})select to_jsonb(s)from changed s`
            :`select ${single?'(select to_jsonb(s)from selected s)':"(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb)from selected s)"}
              from(select 1)singleton`;
          const result=await execute(patch?command:`with selected as(select ${columns} from public.invoice_checkout_sessions where ${filters.join(' and ')})`+command);
          if(patch&&lost&&result.error===null){lost=false;return{data:{},error:null};}
          return result;
        }return q;}};
      const stripe={paymentIntents:{async retrieve(){provider.push('retrieve');return remote;},async cancel(){provider.push('cancel');
        if(c.paidRace){remote={...remote,status:'succeeded',amount_received:1000};throw Error('Synthetic competing payment completion');}
        remote={...remote,status:'canceled'};return remote;}}};
      const input={invoiceId:invoice,stripe,supabase:db,livemode:false};
      const first=await releaseStaleCardReservations(input);
      assert.equal(first.ok,!c.lost&&!c.submissionRace&&!c.bindingRace&&!c.expiryRace&&!c.paidRace&&!c.unknownAmount&&!c.unidentified);
      const retry=await releaseStaleCardReservations(input);assert.equal(retry.ok,!c.bindingRace&&!c.unknownAmount&&!c.unidentified);
      assert.deepEqual(sqlErrors,[],'Expected held states must not pass because the SQL bridge failed');
      const output=await query(`select 'STATE:'||jsonb_build_object('invoice_status',i.status,'balance',i.balance_due_cents,
        'rows',(select count(*)from public.invoice_checkout_sessions where invoice_id=i.id),
        'checkout',(select status from public.invoice_checkout_sessions where id='${reservation}'),
        'reference',(select stripe_payment_intent_id from public.invoice_checkout_sessions where id='${reservation}'),
        'payments',(select count(*)from public.payments where invoice_id=i.id))::text from public.invoices i where id='${invoice}'`);
      const state=JSON.parse(output.find(line=>line.startsWith('STATE:')).slice(6));
      assert.equal(state.invoice_status,'sent');assert.equal(state.balance,1000);assert.equal(state.rows,1);assert.equal(state.payments,0);
      const held=Boolean(c.hold||c.bindingRace||c.paidRace||c.unknownAmount||c.unidentified);
      assert.equal(state.checkout,held?originalStatus:'expired');
      assert.equal(provider.filter(name=>name==='cancel').length,c.unsubmitted||c.cancelled||c.hold||c.unknownAmount||c.unidentified?0:1);
      if(c.bindingRace)assert.equal(state.reference,otherId);
      if(c.unsubmitted||c.unidentified)assert.equal(provider.length,0);
      await query('rollback to savepoint fixture;release savepoint fixture');
      const absent=await query(`select 'ABSENT:'||((select count(*)from public.invoices where id='${invoice}')+
        (select count(*)from public.customers where id='${customer}'))::text`);
      assert.ok(absent.includes('ABSENT:0'));proof.push({name:c.name,pass:true,fixturesRolledBack:true});
    });
    if(process.env.CARD_CLEANUP_RESULTS_FILE)writeFileSync(process.env.CARD_CLEANUP_RESULTS_FILE,
      JSON.stringify({proof,providerRequests:0,outerRollback:true,independentlyCommittedRecovery:false,concurrencyProof:false},null,2)+'\n');
  }finally{
    if(!exited){try{await query('rollback');}finally{child.stdin.end();}}
    await closed;lines.close();
  }
});
