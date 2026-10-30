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

const { confirmCardReview } = load('../src/lib/stripe/card-payment.ts', {'@/lib/firewood/handoff/collector-policy':load('../src/lib/firewood/handoff/collector-policy.ts',{'server-only':{}}),
  'server-only': {}, '@/lib/payments/checkout-closure': closure,
  '@/lib/payments/checkout-budget': budget, '@/lib/payments/card-reservation-policy': policy, '@/lib/payments/card-surcharge': surcharge,
});
const enabled = process.env.CARD_CONFIRMATION_DISPOSABLE === '1';
const literal = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
test('card confirmation with installed SQL and synthetic provider in one rollback', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  assert.ok(process.env.CARD_CONFIRMATION_DOCKER_BIN);
  const child = spawn(process.env.CARD_CONFIRMATION_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable',
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
      { name: 'authentication handoff follows a confirmed reservation save' },
      { name: 'immediate provider success stays reserved for webhook accounting', succeeded: true },
      { name: 'lost claim acknowledgement prevents a provider create', loseClaim: true },
      { name: 'lost save acknowledgement retains one submission', loseSave: true },
      { name: 'provider uncertainty keeps the creating guard', providerThrows: true },
      { name: 'competing reservation completion wins the save CAS', completed: true },
      { name: 'fee change before claim blocks the reviewed amount', feeRace: true },
      { name: 'active void lease blocks the collection claim', lease: true },
      { name: 'debit payment retains the existing no-surcharge policy', debit: true },
      { name: 'expired review is closed before any provider access', expired: true },
    ];
    for (const c of scenarios) await t.test(c.name, async () => {
      const customer = randomUUID(), invoice = randomUUID(), reservation = randomUUID(), actor = randomUUID();
      const token = 'ctoken_' + reservation.replaceAll('-', ''), intentId = 'pi_' + reservation.replaceAll('-', '');
      const gross = c.debit ? 1000 : 1030;
      await query(`savepoint fixture;insert into public.customers(id,display_name) values('${customer}','CARD_ACK_${invoice}');
        insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
          values('${invoice}','CARD_ACK_${invoice}','${customer}','sent',1000,1000,1000,clock_timestamp());
        insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,amount_cents,invoice_principal_cents,surcharge_cents,total_charge_cents,
          payment_channel,currency,status,stripe_confirmation_token_id,card_brand,card_country,card_funding_type,reviewed_at,processing_expires_at)
          values('${reservation}','${invoice}','${customer}',1000,1000,${gross - 1000},${gross},'card','usd','open','${token}',
            'visa','US','${c.debit ? 'debit' : 'credit'}',clock_timestamp()-interval '${c.expired ? '20 minutes' : '1 minute'}',clock_timestamp()+interval '15 minutes')`);
      if (c.lease) await query(`insert into auth.users(id,email,raw_user_meta_data) values('${actor}','${actor}@example.invalid','{}');
        insert into public.profiles(id,email,full_name,status) values('${actor}','${actor}@example.invalid','Synthetic void owner','active')
          on conflict(id) do update set status=excluded.status;
        insert into public.user_roles(user_id,role_id) select '${actor}',id from public.roles where name='owner';
        set local role authenticated;set local request.jwt.claims='{"role":"authenticated","sub":"${actor}"}';
        select public.begin_invoice_void('${invoice}');reset role`);
      async function execute(command) {
        const output = await query(`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
          select 'RESULT:'||pg_temp.capture_json(${literal(command)})::text;reset role`);
        const result = JSON.parse(output.find(line => line.startsWith('RESULT:')).slice(7));
        return result;
      }
      let lostClaim = Boolean(c.loseClaim), lostSave = Boolean(c.loseSave), feeRace = Boolean(c.feeRace);
      const provider = [], sqlCodes = [];
      const db = { from(table) {
        assert.equal(table, 'invoice_checkout_sessions');let columns = '*', values;const filters = [];
        const column = key => { assert.match(key, /^[a-z_]+$/); return key; };
        const q = { select(value) { assert.match(value, /^[a-z_, ]+$/);columns = value;return q; },
          eq(key, value) { filters.push(column(key) + '=' + literal(value));return q; },
          is(key, value) { assert.equal(value, null);filters.push(column(key) + ' is null');return q; },
          update(value) { values = value;return q; },maybeSingle() { return run(); },then(resolve, reject) { return run().then(resolve, reject); } };
        async function run() {
          const operation = !values ? 'read' : values.status === 'creating' ? 'claim' : values.status === 'processing' ? 'save' : 'other';
          if (operation === 'claim' && feeRace) {
            feeRace = false;
            const changed = await execute(`update public.invoice_checkout_sessions set surcharge_cents=40,total_charge_cents=1040
              where id='${reservation}' returning to_jsonb(invoice_checkout_sessions)`);assert.equal(changed.error, null);
          }
          const command = values ? `with changed as (update public.invoice_checkout_sessions set
            ${Object.entries(values).map(([key, value]) => column(key) + '=' + literal(value)).join(',')}
            where ${filters.join(' and ')} returning ${columns}) select to_jsonb(s) from changed s`
            : `select to_jsonb(s) from (select ${columns} from public.invoice_checkout_sessions where ${filters.join(' and ')}) s`;
          const result = await execute(command);if(result.error)sqlCodes.push(result.error.code);
          if (operation === 'claim' && result.error === null && lostClaim) { lostClaim = false;return {data:{},error:null}; }
          if (operation === 'save' && result.error === null && lostSave) { lostSave = false;return {data:{},error:null}; }
          return result;
        }
        return q;
      } };
      const stripe = { confirmationTokens: { async retrieve() { provider.push('token');return { id:token,livemode:false,
        payment_method_preview:{type:'card',card:{brand:'visa',country:'US',funding:c.debit?'debit':'credit'}} }; } },
        paymentIntents: { async create(params, request) {
          provider.push('create');assert.equal(request.idempotencyKey,'angel-tree-card-confirm-'+reservation);
          assert.equal(params.amount,gross);assert.deepEqual(params.amount_details.line_items.map(row=>row.unit_cost),c.debit?[1000]:[1000,30]);
          if(c.completed){const changed=await execute(`update public.invoice_checkout_sessions set status='completed',stripe_payment_intent_id='${intentId}'
            where id='${reservation}' returning to_jsonb(invoice_checkout_sessions)`);assert.equal(changed.error,null);}
          if(c.providerThrows)throw Error('Synthetic unknown provider result');
          return {id:intentId,livemode:false,metadata:params.metadata,amount:gross,amount_received:c.succeeded?gross:0,currency:'usd',
            status:c.succeeded?'succeeded':'requires_action',client_secret:intentId+'_secret_SYNTHETIC_ONLY'};
        } } };
      const input={invoiceId:invoice,reviewId:reservation,invoicePrincipalCents:1000,invoiceNumber:'SYNTHETIC',billingEmail:null,
        portalUrl:'https://crm.example.invalid/portal/invoice/synthetic',livemode:false,stripe,supabase:db,surchargeBps:300,surchargeEnabled:true};
      const result=await confirmCardReview(input);
      const successful=!c.loseClaim&&!c.loseSave&&!c.providerThrows&&!c.completed&&!c.feeRace&&!c.lease&&!c.expired;
      assert.equal(result.ok,successful);if(!result.ok)assert.equal(result.clientSecret,undefined);
      assert.equal((await confirmCardReview(input)).ok,false);
      const output=await query(`select 'STATE:'||jsonb_build_object('invoice_status',i.status,'balance',i.balance_due_cents,
        'rows',(select count(*) from public.invoice_checkout_sessions where invoice_id=i.id),
        'checkout',(select status from public.invoice_checkout_sessions where id='${reservation}'),
        'reference',(select stripe_payment_intent_id from public.invoice_checkout_sessions where id='${reservation}'),
        'payments',(select count(*) from public.payments where invoice_id=i.id))::text from public.invoices i where id='${invoice}'`);
      const state=JSON.parse(output.find(line=>line.startsWith('STATE:')).slice(6));
      assert.equal(state.invoice_status,'sent');assert.equal(state.balance,1000);assert.equal(state.rows,1);assert.equal(state.payments,0);
      assert.equal(provider.filter(name=>name==='create').length,c.loseClaim||c.feeRace||c.lease||c.expired?0:1);
      if(c.lease){assert.ok(sqlCodes.includes('23514'));assert.equal(state.checkout,'open');}
      else if(c.expired){assert.equal(state.checkout,'expired');assert.equal(provider.length,0);}
      else if(c.feeRace)assert.equal(state.checkout,'cancelled');
      else if(c.completed){assert.equal(state.checkout,'completed');assert.equal(state.reference,intentId);}
      else if(c.loseClaim||c.providerThrows)assert.equal(state.checkout,'creating');
      else {assert.equal(state.checkout,'processing');assert.equal(state.reference,intentId);}
      await query('rollback to savepoint fixture;release savepoint fixture');
      const absent=await query(`select 'ABSENT:'||((select count(*) from public.invoices where id='${invoice}')+
        (select count(*) from public.customers where id='${customer}')+(select count(*) from auth.users where id='${actor}'))::text`);
      assert.ok(absent.includes('ABSENT:0'));proof.push({name:c.name,pass:true,fixturesRolledBack:true});
    });
    if(process.env.CARD_CONFIRMATION_RESULTS_FILE)writeFileSync(process.env.CARD_CONFIRMATION_RESULTS_FILE,
      JSON.stringify({proof,providerRequests:0,outerRollback:true,independentlyCommittedRecovery:false,concurrencyProof:false},null,2)+'\n');
  } finally {
    if(!exited){try{await query('rollback');}finally{child.stdin.end();}}
    await closed;lines.close();
  }
});
