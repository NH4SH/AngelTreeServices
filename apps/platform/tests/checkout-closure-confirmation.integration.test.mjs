import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { voidInvoiceSafely, reviewInvoiceCheckout } from '../src/lib/payments/invoice-void.ts';

const enabled = process.env.CHECKOUT_CLOSURE_DISPOSABLE === '1';
const literal = v => v === null ? 'null' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
test('checkout confirmation against installed SQL in a disposable rollback', { skip: !enabled, timeout: 120000 }, async t => {
  assert.equal(process.env.DOCKER_HOST, 'unix:///Users/noelsierra/.lima/pr02-disposable/sock/docker.sock');
  assert.ok(process.env.CHECKOUT_CLOSURE_DOCKER_BIN);
  const child = spawn(process.env.CHECKOUT_CLOSURE_DOCKER_BIN, ['exec', '-i', 'supabase_db_ats_pr02_disposable',
    'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let pending, diagnostic = '', exited = false;
  child.stderr.on('data', data => { diagnostic += data; });
  const closed = new Promise(resolve => child.once('close', code => {
    exited = true; pending?.reject(new Error('Disposable SQL connection stopped: ' + diagnostic)); pending = undefined; resolve(code);
  }));
  child.once('error', error => { pending?.reject(error); pending = undefined; });
  lines.on('line', line => {
    if (!pending) return;
    if (line === pending.marker) { const current = pending; pending = undefined; current.resolve(current.output); }
    else pending.output.push(line);
  });
  async function query(sql) {
    assert.equal(pending, undefined, 'Serialize commands on the one rollback connection');
    assert.equal(exited, false);
    const marker = 'DONE_' + randomUUID();
    let timer;
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
      declare result jsonb;begin execute statement into result;
        return jsonb_build_object('data',result,'error',null);
      exception when others then return jsonb_build_object('data',null,'error',jsonb_build_object('code',sqlstate));end;$$`);
    const scenarios = [
      { name: 'owner voids verified unpaid ACH' },
      { name: 'admin closes unsubmitted card review', role: 'admin', card: true },
      { name: 'interrupted ACH is bound and closed without voiding', review: true },
      { name: 'lost closure acknowledgement retains invoice and can be reverified', loseClose: true },
      { name: 'lost final acknowledgement recovers as already void', loseFinal: true },
      { name: 'crew cannot start privileged work', role: 'crew', denied: true },
      { name: 'disabled owner cannot start privileged work', disabled: true, denied: true },
      { name: 'separated owner cannot start privileged work', separated: true, denied: true },
      { name: 'expired live lease prevents provider access', expire: true },
    ];
    for (const c of scenarios) await t.test(c.name, async () => {
      const actor = randomUUID(), customer = randomUUID(), invoice = randomUUID(), reservation = randomUUID();
      const marker = 'CLOSE_ACK_' + invoice;
      await query(`savepoint fixture;set local request.jwt.claims='{}';
        insert into auth.users(id,email,raw_user_meta_data) values('${actor}','${actor}@example.invalid','{}');
        insert into public.profiles(id,email,full_name,status) values('${actor}','${actor}@example.invalid','Synthetic checkout reviewer','${c.disabled ? 'disabled' : 'active'}')
          on conflict(id) do update set status=excluded.status;
        insert into public.user_roles(user_id,role_id) select '${actor}',id from public.roles where name='${c.role ?? 'owner'}';
        ${c.separated ? `insert into public.employee_records(auth_user_id,legal_name,is_active,employment_status) values('${actor}','Synthetic separated reviewer',true,'active');
          update public.employee_records set is_active=false,employment_status='separated' where auth_user_id='${actor}';` : ''}
        insert into public.customers(id,display_name) values('${customer}','${marker}');
        insert into public.invoices(id,invoice_number,customer_id,status,subtotal_cents,total_cents,balance_due_cents,sent_at)
          values('${invoice}','${marker}','${customer}','sent',1000,1000,1000,clock_timestamp());
        insert into public.invoice_checkout_sessions(id,invoice_id,customer_id,amount_cents,invoice_principal_cents,total_charge_cents,payment_channel,currency,status,stripe_checkout_session_id)
          values('${reservation}','${invoice}','${customer}',1000,1000,1000,'${c.card ? 'card' : 'ach'}','usd','${c.review ? 'creating' : 'open'}',${c.review || c.card ? 'null' : literal('cs_' + reservation)})`);
      async function execute(sql, role = 'authenticated') {
        const result = await query(`set local role ${role};set local request.jwt.claims=${literal(JSON.stringify({ role, sub: actor }))};
          select 'RESULT:'||pg_temp.capture_json(${literal(sql)})::text;reset role`);
        return JSON.parse(result.find(line => line.startsWith('RESULT:')).slice(7));
      }
      const calls = [], provider = []; let checks = 0, contexts = 0, loseClose = Boolean(c.loseClose), loseFinal = Boolean(c.loseFinal), remoteStatus = 'open';
      const staff = { async rpc(name, args) {
        assert.ok(['begin_invoice_void', 'begin_invoice_checkout_review', 'check_invoice_checkout_lease', 'finalize_invoice_void', 'release_invoice_void'].includes(name));
        assert.equal(args.p_invoice_id, invoice); calls.push(name);
        const named = Object.entries(args).map(([key, value]) => { assert.match(key, /^p_[a-z_]+$/); return key + '=>' + literal(value); }).join(',');
        const receipt = await execute(`select to_jsonb(public.${name}(${named}))`);
        if (c.expire && name === 'check_invoice_checkout_lease' && ++checks === 1) {
          await query(`update app_private.invoice_void_leases set expires_at=clock_timestamp()-interval '1 minute' where invoice_id='${invoice}'`);
        }
        if (name === 'finalize_invoice_void' && loseFinal && receipt.error === null) { loseFinal = false; return {}; }
        return receipt;
      } };
      const db = { from(table) {
        assert.equal(table, 'invoice_checkout_sessions');
        let columns = '*', patch; const filters = [];
        const column = name => { assert.match(name, /^[a-z_]+$/); return name; };
        const q = { select(value) { assert.match(value, /^[a-z_, ]+$/); columns = value; return q; },
          eq(key, value) { filters.push(column(key) + '=' + literal(value)); return q; },
          is(key, value) { assert.equal(value, null); filters.push(column(key) + ' is null'); return q; },
          order() { return q; }, update(value) { patch = value; return q; },
          maybeSingle() { return run(true); }, then(resolve, reject) { return run(false).then(resolve, reject); } };
        async function run(single) {
          assert.ok(filters.length > 0);
          let command;
          if (patch) command = `with changed as (update public.invoice_checkout_sessions set ${Object.entries(patch).map(([key, value]) => column(key) + '=' + literal(value)).join(',')}
            where ${filters.join(' and ')} returning ${columns}) select (select to_jsonb(s) from changed s)`;
          else command = `select ${single ? '(select to_jsonb(s) from selected s)' : "(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from selected s)"}
            from (select 1) singleton`;
          if (!patch) command = `with selected as (select ${columns} from public.invoice_checkout_sessions where ${filters.join(' and ')}) ` + command;
          const result = await execute(command, 'service_role');
          if (patch?.status && loseClose && result.error === null) { loseClose = false; return { data: {}, error: null }; }
          return result;
        }
        return q;
      } };
      const session = () => ({ id: 'cs_' + reservation, status: remoteStatus, payment_status: 'unpaid', mode: 'payment', livemode: false,
        metadata: { invoice_id: invoice, checkout_reservation_id: reservation, payment_channel: 'ach' }, client_reference_id: invoice,
        amount_total: 1000, currency: 'usd', payment_intent: null });
      const stripe = { checkout: { sessions: {
        async retrieve() { provider.push('retrieve'); return session(); },
        async expire() { provider.push('expire'); remoteStatus = 'expired'; return session(); },
      } } };
      const input = { invoiceId: invoice, reservationId: reservation, staffSupabase: staff, correlationId: marker,
        getPaymentContext() { contexts++; return { stripe, supabase: db, livemode: false }; } };
      const result = c.review ? await reviewInvoiceCheckout({ ...input, providerReference: 'cs_' + reservation }) : await voidInvoiceSafely(input);
      async function state() {
        const output = await query(`select 'STATE:'||jsonb_build_object('status',i.status,'balance',i.balance_due_cents,
          'checkout',(select status from public.invoice_checkout_sessions where id='${reservation}'),
          'leases',(select count(*) from app_private.invoice_void_leases where invoice_id=i.id),
          'payments',(select count(*) from public.payments where invoice_id=i.id),
          'void_events',(select count(*) from public.activity_log where subject_id=i.id and event_type='invoice_voided'),
          'review_events',(select count(*) from public.activity_log where subject_id=i.id and event_type='invoice_checkout_reviewed'))::text
          from public.invoices i where id='${invoice}'`);
        return JSON.parse(output.find(line => line.startsWith('STATE:')).slice(6));
      }
      let saved = await state();
      assert.equal(saved.balance, 1000); assert.equal(saved.payments, 0); assert.equal(saved.leases, 0);
      if (c.denied || c.expire) {
        assert.equal(result.ok, false); assert.equal(saved.status, 'sent'); assert.equal(saved.checkout, 'open');
        assert.equal(provider.length, 0); assert.equal(calls.includes('finalize_invoice_void'), false);
        if (c.denied) assert.equal(contexts, 0);
      } else if (c.review) {
        assert.equal(result.ok, true); assert.equal(saved.status, 'sent'); assert.equal(saved.checkout, 'expired');
        assert.equal(saved.review_events, 1); assert.equal(saved.void_events, 0);
      } else {
        assert.equal(result.ok, !c.loseClose && !c.loseFinal);
        assert.equal(saved.status, c.loseClose ? 'sent' : 'void');
        assert.equal(saved.checkout, c.card ? 'cancelled' : 'expired');
        if (c.loseClose) assert.equal(calls.includes('finalize_invoice_void'), false);
        if (c.loseClose || c.loseFinal) {
          assert.equal((await voidInvoiceSafely(input)).ok, true); saved = await state();
          assert.equal(saved.status, 'void'); assert.equal(saved.void_events, 1);
          assert.equal(provider.filter(name => name === 'expire').length, 1);
        }
        const previousContexts = contexts;
        assert.equal((await voidInvoiceSafely(input)).ok, true); assert.equal(contexts, previousContexts);
      }
      await query('rollback to savepoint fixture;release savepoint fixture');
      const absent = await query(`select 'ABSENT:'||((select count(*) from auth.users where id='${actor}')+
        (select count(*) from public.invoices where id='${invoice}')+(select count(*) from public.customers where id='${customer}'))::text`);
      assert.ok(absent.includes('ABSENT:0')); proof.push({ name: c.name, pass: true, fixturesRolledBack: true });
    });
    if (process.env.CHECKOUT_CLOSURE_RESULTS_FILE) writeFileSync(process.env.CHECKOUT_CLOSURE_RESULTS_FILE,
      JSON.stringify({ proof, providerRequests: 0, outerRollback: true, independentlyCommittedRecovery: false }, null, 2) + '\n');
  } finally {
    if (!exited) { try { await query('rollback'); } finally { child.stdin.end(); } }
    await closed; lines.close();
  }
});
