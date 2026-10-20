import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { load } from './pr10-test-helpers.mjs';
import * as closure from '../src/lib/payments/checkout-closure.ts';
import { achCheckoutPaymentMethodTypes } from '../src/lib/payments/ach-checkout.ts';

const { createOrReuseInvoiceCheckout } = load('../src/lib/stripe/invoice-checkout.ts', {
  'server-only': {}, '@/lib/payments/checkout-closure': closure,
  '@/lib/payments/ach-checkout': { achCheckoutPaymentMethodTypes },
});
const enabled = process.env.ACH_HANDOFF_DISPOSABLE === '1';
const literal = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
test('bank checkout handoff with installed SQL and synthetic provider in one rollback', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  assert.ok(process.env.ACH_HANDOFF_DOCKER_BIN);
  const child = spawn(process.env.ACH_HANDOFF_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable',
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
      { name: 'fresh checkout is saved before URL handoff' },
      { name: 'lost insertion acknowledgement retains guard', loseInsert: true },
      { name: 'lost publication acknowledgement recovers by reuse', losePublish: true },
      { name: 'processing transition wins publication CAS', processing: true },
      { name: 'provider uncertainty retains guard', providerThrows: true },
      { name: 'known provider reference without URL remains reviewable', noUrl: true },
      { name: 'stale invoice amount is rejected before provider access', staleAmount: true, denied: true },
      { name: 'void invoice cannot create collection', void: true, denied: true },
      { name: 'mismatched billing party cannot create collection', wrongParty: true, denied: true },
      { name: 'a unique insert conflict rereads and reuses the winning reservation', uniqueRace: true },
    ];
    for (const c of scenarios) await t.test(c.name, async () => {
      const customer = randomUUID(), other = randomUUID(), invoice = randomUUID(), reservation = randomUUID(), actor = randomUUID();
      await query(`savepoint fixture;insert into public.customers(id,display_name) values('${customer}','ACH_HANDOFF_${invoice}'),('${other}','ACH_HANDOFF_other_${invoice}');
        insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
        values('${invoice}','ACH_HANDOFF_${invoice}','${customer}','sent',1000,1000,1000,clock_timestamp())`);
      if (c.void) await query(`insert into auth.users(id,email,raw_user_meta_data) values('${actor}','${actor}@example.invalid','{}');
        insert into public.profiles(id,email,full_name,status) values('${actor}','${actor}@example.invalid','Synthetic void reviewer','active')
          on conflict(id) do update set status=excluded.status;
        insert into public.user_roles(user_id,role_id) select '${actor}',id from public.roles where name='owner';
        set local role authenticated;set local request.jwt.claims='{"role":"authenticated","sub":"${actor}"}';
        do $$declare lease jsonb;begin lease:=public.begin_invoice_void('${invoice}');
          perform public.finalize_invoice_void('${invoice}',(lease->>'token')::uuid);end;$$;reset role`);
      let lostInsert = Boolean(c.loseInsert), lostPublish = Boolean(c.losePublish), race = Boolean(c.uniqueRace), insertAttempts = 0;
      const provider = [], sqlCodes = [];
      let remote = { id: 'cs_' + reservation.replaceAll('-', ''), mode: 'payment', status: 'open', payment_status: 'unpaid', livemode: false,
        metadata: { invoice_id: invoice, checkout_reservation_id: reservation, payment_channel: 'ach' }, client_reference_id: invoice,
        amount_total: 1000, currency: 'usd', payment_intent: null, expires_at: 1792600000,
        url: c.noUrl ? null : 'https://checkout.example.invalid/' + reservation };
      async function execute(command) {
        const result = await query(`set local role service_role;set local request.jwt.claims='{"role":"service_role"}';
          select 'RESULT:'||pg_temp.capture_json(${literal(command)})::text;reset role`);
        const receipt = JSON.parse(result.find(line => line.startsWith('RESULT:')).slice(7));
        if (receipt.error) sqlCodes.push(receipt.error.code);
        return receipt;
      }
      const db = { from(table) {
        assert.equal(table, 'invoice_checkout_sessions');
        let columns = '*', operation = 'read', values, cap = 1; const filters = [];
        const column = key => { assert.match(key, /^[a-z_]+$/); return key; };
        const q = { select(value) { assert.match(value, /^[a-z_, ]+$/); columns = value; return q; },
          eq(key, value) { filters.push(column(key) + '=' + literal(value)); return q; },
          is(key, value) { assert.equal(value, null); filters.push(column(key) + ' is null'); return q; },
          in(key, list) { filters.push(column(key) + ' in (' + list.map(literal).join(',') + ')'); return q; },
          order() { return q; }, limit(n) { assert.equal(n, 1); cap = n; return q; },
          insert(value) { operation = 'insert'; values = value; return q; }, update(value) { operation = 'update'; values = value; return q; },
          single() { return run(); }, maybeSingle() { return run(); }, then(resolve, reject) { return run().then(resolve, reject); } };
        async function run() {
          let command;
          if (operation === 'insert') {
            insertAttempts++;
            if (race) {
              race = false;
              const seeded = await execute(`insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,amount_cents,invoice_principal_cents,total_charge_cents,payment_channel,currency,status,stripe_checkout_session_id)
                values('${reservation}','${invoice}','${customer}',1000,1000,1000,'ach','usd','open',${literal(remote.id)}) returning to_jsonb(invoice_checkout_sessions)`);
              assert.equal(seeded.error, null);
            }
            const insert = { id: randomUUID(), ...values };
            command = `with changed as (insert into public.invoice_checkout_sessions(${Object.keys(insert).map(column).join(',')})
              values(${Object.values(insert).map(literal).join(',')}) returning ${columns}) select to_jsonb(s) from changed s`;
          } else if (operation === 'update') {
            command = `with changed as (update public.invoice_checkout_sessions set ${Object.entries(values).map(([key, value]) => column(key) + '=' + literal(value)).join(',')}
              where ${filters.join(' and ')} returning ${columns}) select to_jsonb(s) from changed s`;
          } else command = `select to_jsonb(s) from (select ${columns} from public.invoice_checkout_sessions
            where ${filters.join(' and ')} order by created_at desc limit ${cap}) s`;
          const receipt = await execute(command);
          if (operation === 'insert' && receipt.error === null && lostInsert) { lostInsert = false; return {}; }
          if (operation === 'update' && receipt.error === null && lostPublish) { lostPublish = false; return {}; }
          return receipt;
        }
        return q;
      } };
      const stripe = { checkout: { sessions: {
        async create(params, request) {
          provider.push('create'); assert.equal(request.idempotencyKey, 'angel-tree-invoice-checkout-' + params.metadata.checkout_reservation_id);
          remote = { ...remote, metadata: params.metadata };
          if (c.processing) {
            const changed = await execute(`update public.invoice_checkout_sessions set status='processing' where id=${literal(params.metadata.checkout_reservation_id)} returning to_jsonb(invoice_checkout_sessions)`);
            assert.equal(changed.error, null);
          }
          if (c.providerThrows) throw Error('Synthetic unknown provider outcome');
          return remote;
        },
        async retrieve() { provider.push('retrieve'); return remote; },
        async expire() { assert.fail('No expiry required in these scenarios'); },
      } } };
      const input = { invoiceId: invoice, customerId: c.wrongParty ? other : customer, organizationId: null,
        amountCents: c.staleAmount ? 900 : 1000, invoiceNumber: 'SYNTHETIC', portalUrl: 'https://crm.example.invalid/portal/invoice/synthetic',
        supabase: db, stripe, livemode: false };
      const result = await createOrReuseInvoiceCheckout(input);
      const uncertain = c.loseInsert || c.losePublish || c.processing || c.providerThrows || c.noUrl;
      assert.equal(result.ok, !c.denied && !uncertain); if (!result.ok) assert.equal(result.url, undefined);
      const retry = await createOrReuseInvoiceCheckout(input);
      assert.equal(retry.ok, Boolean(!c.denied && (!uncertain || c.losePublish)));
      const output = await query(`select 'STATE:'||jsonb_build_object('status',i.status,'balance',i.balance_due_cents,
        'rows',(select count(*) from public.invoice_checkout_sessions where invoice_id=i.id),
        'checkout',(select status from public.invoice_checkout_sessions where invoice_id=i.id limit 1),
        'reference',(select stripe_checkout_session_id from public.invoice_checkout_sessions where invoice_id=i.id limit 1),
        'payments',(select count(*) from public.payments where invoice_id=i.id))::text from public.invoices i where id='${invoice}'`);
      const state = JSON.parse(output.find(line => line.startsWith('STATE:')).slice(6));
      assert.equal(state.status, c.void ? 'void' : 'sent'); assert.equal(state.balance, 1000); assert.equal(state.payments, 0);
      assert.equal(state.rows, c.denied ? 0 : 1);
      assert.equal(provider.filter(p => p === 'create').length, c.denied || c.uniqueRace || c.loseInsert ? 0 : 1);
      if (c.denied) { assert.ok(sqlCodes.includes('23514')); assert.equal(provider.length, 0); }
      else if (c.uniqueRace) { assert.ok(sqlCodes.includes('23505')); assert.equal(insertAttempts, 1); assert.equal(state.checkout, 'open'); }
      else if (c.processing) assert.equal(state.checkout, 'processing');
      else if (c.loseInsert || c.providerThrows || c.noUrl) {
        assert.equal(state.checkout, 'creating'); if (c.noUrl) assert.equal(state.reference, remote.id);
      } else { assert.equal(state.checkout, 'open'); assert.equal(retry.url, remote.url); }
      await query('rollback to savepoint fixture;release savepoint fixture');
      const absent = await query(`select 'ABSENT:'||((select count(*) from public.invoices where id='${invoice}')+
        (select count(*) from public.customers where id in ('${customer}','${other}'))+
        (select count(*) from auth.users where id='${actor}'))::text`);
      assert.ok(absent.includes('ABSENT:0')); proof.push({ name: c.name, pass: true, fixturesRolledBack: true });
    });
    if (process.env.ACH_HANDOFF_RESULTS_FILE) writeFileSync(process.env.ACH_HANDOFF_RESULTS_FILE,
      JSON.stringify({ proof, providerRequests: 0, outerRollback: true, independentlyCommittedRecovery: false, concurrencyProof: false }, null, 2) + '\n');
  } finally {
    if (!exited) { try { await query('rollback'); } finally { child.stdin.end(); } }
    await closed; lines.close();
  }
});
