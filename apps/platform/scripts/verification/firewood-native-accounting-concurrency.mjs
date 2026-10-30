// Owned native synthetic accounting races only. No discovery or provider clients.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { seedNativeOfficeActor } from './firewood-native-concurrency.mjs';
import { LIVE_HANDOFF_SOURCE as source, LIVE_HANDOFF_CONTRACT, LIVE_HANDOFF_ENVIRONMENT,
  LIVE_ACCOUNT, LIVE_ACCEPTED_TERMS, LIVE_PAYMENT_POLICY, priceLiveOrder, liveHandoffDigest } from '../../src/lib/firewood/handoff/live-contract.mjs';
export async function runNativeAccountingConcurrency({ pool, identity, outputPath }) {
  assert.match(identity.database, /^fw_[a-z0-9_]*native[a-z0-9_]+$/);
  const target = (await pool.query("select current_database()database,(pg_control_system()).system_identifier::text id,shobj_description(oid,'pg_database')marker,inet_server_addr()address from pg_database where datname=current_database()")).rows[0];
  assert.equal(target.database, identity.database); assert.equal(target.id, identity.systemIdentifier); assert.equal(target.marker, identity.marker); assert.equal(target.address, null);
  const actor = await seedNativeOfficeActor(pool, { label: 'Synthetic native accounting race owner' });
  const A = await pool.connect(), B = await pool.connect(), O = await pool.connect();
  const cases = [], barriers = []; let phone = 9000, fault = null;
  const one = async (client, sql, args = []) => (await client.query(sql, args)).rows[0]?.value;
  async function begin(client, role = 'authenticated') {
    await client.query('begin'); await client.query("set local statement_timeout='10s';set local lock_timeout='3s'");
    await client.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)", [role === 'authenticated' ? actor.userId : '', JSON.stringify({ role, ...(role === 'authenticated' ? { sub: actor.userId } : {}) })]);
    await client.query('set local role ' + role);
  }
  async function action(role, sql, args = []) {
    const c = await pool.connect(); try { await begin(c, role); const v = await one(c, sql, args); await c.query('commit'); return v; }
    catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  }
  async function waiting(label) {
    const end = Date.now() + 1600;
    while (Date.now() < end) {
      const row = (await O.query('select $1=any(pg_blocking_pids($2)) blocked', [A.processID, B.processID])).rows[0];
      if (row.blocked) { barriers.push({ label, observedNativeLockWait: true }); return; }
      await new Promise(resolve => setTimeout(resolve, 15));
    }
    throw Error('Native lock barrier was not observed: ' + label);
  }
  const inspect = order => action('authenticated', 'select public.inspect_firewood_live_office($1)value', [order]);
  const creditSql = 'select public.credit_firewood_live_cancellation($1,$2,$3,$4,$5)value';
  async function fixture() {
    const orderId = randomUUID(), order = { ...priceLiveOrder({ quantity: 'full', stacking: true }), tax_basis: 'va_domestic_use_locality_exempt', terms: structuredClone(LIVE_ACCEPTED_TERMS), accepted_at_ms: Date.now(), office_approval: null, payment_policy: structuredClone(LIVE_PAYMENT_POLICY),
      contact: { name: 'Synthetic accounting race ' + orderId.slice(0, 8), email: 'native-race-' + orderId + '@angeltreeservice.org', phone: '202555' + phone++, address: '1 Synthetic Accounting Race Lane', address2: '', city: 'Fredericksburg', state: 'VA', postal: '22407', notes: 'Isolated native synthetic fixture; no transport.' } };
    const req = { contract: LIVE_HANDOFF_CONTRACT, source_id: source, environment_id: LIVE_HANDOFF_ENVIRONMENT, account_id: LIVE_ACCOUNT, mode: 'live', order_id: orderId, reference: 'FW-' + orderId.slice(0, 8).toUpperCase(), snapshot_hash: liveHandoffDigest(order), order };
    const receipt = await action('service_role', 'select public.prepare_firewood_live_handoff($1,$2,$3)value', [source, req, { token_hash: randomBytes(32).toString('hex'), token_hint: 'NATRAC', token_encrypted: 'v1.YQ.Yg.Yw', expires_at: new Date(Date.now() + 1200000).toISOString() }]);
    const payment = await action('authenticated', "select public.record_manual_invoice_payment_request($1,$2,60000,clock_timestamp(),'cash','NATIVE SYNTHETIC','Synthetic ledger fixture, not money received.')value", [randomUUID(), receipt.invoice_id]);
    // Explicit privileged local refund snapshot; not an actual refund operation.
    await pool.query("update public.payments set refunded_principal_cents=60000,status='refunded'where id=$1", [payment.payment_id]);
    await action('service_role', 'select public.reconcile_invoice_balance($1)value', [receipt.invoice_id]);
    await action('authenticated', "select public.request_firewood_live_cancellation($1,0,'customer_request','Synthetic native cancellation review',$2)value", [receipt.invoice_id, randomUUID()]);
    const view = await inspect(orderId); assert.equal(view.can_credit, true);
    return { orderId, invoiceId: receipt.invoice_id, paymentId: payment.payment_id, view, args: [receipt.invoice_id, view.lifecycle.revision, view.financial.ledger_hash, randomUUID(), 'Synthetic reviewed full cancellation credit'] };
  }
  const snapshot = async value => (await pool.query(`select jsonb_build_object('invoice',to_jsonb(i),'workflow',(select to_jsonb(w)from app_private.firewood_live_order_workflows w where invoice_id=i.id),
    'credits',(select coalesce(jsonb_agg(to_jsonb(c)order by id),'[]')from app_private.firewood_live_cancellation_credits c where invoice_id=i.id),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)order by id),'[]')from app_private.firewood_live_office_events e where invoice_id=i.id),
    'audit',(select coalesce(jsonb_agg(to_jsonb(l)order by id),'[]')from public.activity_log l where subject_id=i.id),
    'payments',(select coalesce(jsonb_agg(to_jsonb(p)order by id),'[]')from public.payments p where invoice_id=i.id))value from public.invoices i where id=$1`, [value.invoiceId])).rows[0].value;
  try {
    const first = await fixture(); await begin(A); const ack = await one(A, creditSql, first.args);
    await begin(B); const pending = one(B, creditSql, first.args); const settled = pending.then(value => ({ value }), error => ({ error }));
    await waiting('same identity credit waits for original credit commit'); await A.query('commit'); const replay = await settled; if (replay.error) throw replay.error; await B.query('commit'); assert.deepEqual(replay.value, ack);
    const counts = (await pool.query('select(select count(*)from app_private.firewood_live_cancellation_credits where invoice_id=$1)::int credits,(select count(*)from app_private.firewood_live_office_receipts where request_id=$2)::int acknowledgements', [first.invoiceId, first.args[3]])).rows[0]; assert.deepEqual(counts, { credits: 1, acknowledgements: 1 });
    const current = await inspect(first.orderId); await action('authenticated', 'select public.confirm_firewood_live_cancellation($1,$2,$3,$4,$5)value', [first.invoiceId, current.lifecycle.revision, current.financial.ledger_hash, randomUUID(), 'Synthetic final review after posted credit']);
    assert.equal((await inspect(first.orderId)).lifecycle.state, 'cancelled');
    cases.push({ name: 'concurrent identical credit returns one original acknowledgement, then fresh cancellation confirms', passed: true, credits: 1, acknowledgements: 1 });

    const late = await fixture(); const paidProof = (await pool.query('select original_paid_evidence from app_private.firewood_live_handoffs where invoice_id=$1', [late.invoiceId])).rows[0].original_paid_evidence;
    await begin(A); await one(A, creditSql, late.args); await begin(B, 'service_role');
    const insertion = B.query("insert into public.payments(invoice_id,customer_id,amount_cents,surcharge_cents,total_collected_cents,currency,payment_method,provider,provider_payment_id,status,paid_at,succeeded_at)select id,customer_id,60000,0,60000,'usd','ach','stripe',$2,'succeeded',clock_timestamp(),clock_timestamp()from public.invoices where id=$1 returning id", [late.invoiceId, 'pi_NATIVE' + randomBytes(8).toString('hex')]);
    const arrived = insertion.then(value => ({ value }), error => ({ error })); await waiting('late synthetic provider settlement waits for credit commit'); await A.query('commit'); const inserted = await arrived; if (inserted.error) throw inserted.error;
    const reconciled = await one(B, 'select public.reconcile_invoice_balance($1)value', [late.invoiceId]); await B.query('commit');
    assert.equal(reconciled.status, 'credited'); assert.equal(reconciled.balance_due_cents, 0); const after = await inspect(late.orderId); assert.equal(after.can_confirm, false); assert.equal(after.financial_disposition, 'refund_review');
    const row = (await pool.query('select status,balance_due_cents,paid_at from public.invoices where id=$1', [late.invoiceId])).rows[0]; assert.deepEqual(row, { status: 'credited', balance_due_cents: 0, paid_at: null });
    assert.deepEqual((await pool.query('select original_paid_evidence from app_private.firewood_live_handoffs where invoice_id=$1', [late.invoiceId])).rows[0].original_paid_evidence, paidProof);
    cases.push({ name: 'late synthetic settlement retains money after credit and requires refund review without reopening debt', passed: true, providerEvidenceSynthetic: true, storedAndReturnedCredited: true, originalPaidEvidenceRetained: true });

    const failed = await fixture(), before = await snapshot(failed); fault = 'native_credit_fail_' + randomBytes(6).toString('hex');
    await pool.query(`create function app_private.${fault}()returns trigger language plpgsql as $$begin if new.operation='cancellation_credited'and new.request_id='${failed.args[3]}'::uuid then raise exception 'Owned native credit late acknowledgement fault';end if;return new;end;$$;create trigger ${fault} before insert on app_private.firewood_live_office_receipts for each row execute function app_private.${fault}()`);
    await assert.rejects(action('authenticated', creditSql, failed.args), /Owned native credit late acknowledgement fault/); assert.deepEqual(await snapshot(failed), before);
    await pool.query(`drop trigger ${fault} on app_private.firewood_live_office_receipts;drop function app_private.${fault}()`); fault = null;
    const retried = await action('authenticated', creditSql, failed.args); assert.ok(retried.accounting.credit_id); assert.equal((await pool.query('select count(*)::int n from app_private.firewood_live_cancellation_credits where invoice_id=$1', [failed.invoiceId])).rows[0].n, 1);
    cases.push({ name: 'late credit acknowledgement failure rolls all financial, workflow, audit and receipt effects back; exact retry posts once', passed: true, fullSnapshotRollback: true });
    await pool.query('update app_private.firewood_live_handoff_sources set enabled=false,collector_enabled=false,surcharge_reporting_enabled=false,sender_enabled=false');
    const proof = { kind: 'firewood-native-accounting-concurrency', passed: true, target: { ...target, systemIdentifier: target.id }, cases, barriers, providerCalls: 0, emailsSent: 0, refundsIssued: 0, productionChanged: false, originalEvidencePreserved: true, syntheticDataRetained: true, sourceFlagsOff: true };
    writeFileSync(outputPath, JSON.stringify(proof, null, 2) + '\n'); return proof;
  } finally {
    for (const c of [A, B, O]) { await c.query('rollback').catch(() => {}); c.release(); }
    if (fault) await pool.query(`drop trigger if exists ${fault} on app_private.firewood_live_office_receipts;drop function if exists app_private.${fault}()`);
  }
}
