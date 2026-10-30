import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as accounting from '../src/lib/firewood/handoff/office-accounting.mjs';
import { load } from './pr10-test-helpers.mjs';
const { runFirewoodOfficeCommand } = load('../src/lib/firewood/office-command.ts', {
  'server-only': {}, '../business-time.ts': {}, './handoff/office-accounting.mjs': accounting,
});
const id = randomUUID(), invoice = randomUUID(), user = randomUUID(), credit = randomUUID();
const reviewed = { issued_at: '2026-10-30T00:00:00Z', original_principal_cents: 60000,
  raw_balance_due_cents: 60000, credited_principal_cents: 0, collectible_balance_cents: 60000, credit_id: null };
function harness({ resultChange = {}, readChange = {} } = {}) {
  const calls = [], record = { order: { order_id: id, invoice_id: invoice, principal_cents: 60000 },
    lifecycle: { state: 'cancellation_requested', revision: 3 }, financial: { accounting: reviewed }, ...readChange };
  const result = { order_id: id, invoice_id: invoice, revision: 4, state: 'cancellation_requested',
    accounting: { ...reviewed, credited_principal_cents: 60000, collectible_balance_cents: 0, credit_id: credit }, ...resultChange };
  const client = { rpc(name, args) { calls.push({ name, args }); return { async abortSignal() {
    return { data: name === 'inspect_firewood_live_office' ? record : result, error: null };
  } }; } };
  return { calls, deps: { client, userId: user, roles: ['owner'], admitted: true } };
}
function form() { const result = new FormData(); for (const [key, value] of Object.entries({ intent: 'credit_cancellation',
  order_id: id, invoice_id: invoice, request_id: randomUUID(), expected_revision: '3', ledger_hash: 'a'.repeat(64),
  reason: 'Full-refund cancellation reviewed; no retained money or open checkout.', confirm_credit: 'confirmed' })) result.set(key, value); return result; }
test('credit action sends only reviewed identity, version, ledger and reason; no amount or financial instruction', async () => {
  const h = harness(), input = form(), result = await runFirewoodOfficeCommand(input, h.deps);
  assert.equal(result.status, 'success'); assert.match(result.message, /balance was released/); assert.match(result.message, /No money or message/);
  assert.deepEqual(h.calls[1], { name: 'credit_firewood_live_cancellation', args: { p_invoice: invoice, p_revision: 3,
    p_ledger_hash: 'a'.repeat(64), p_request_id: input.get('request_id'), p_reason: input.get('reason') } });
});
test('missing confirmation, unapproved fields and inactive/non-owner contexts cannot authorize credit', async () => {
  for (const change of [value => value.delete('confirm_credit'), value => value.set('credit_amount', '60000'), value => value.set('send_email', 'true')]) {
    const h = harness(), input = form(); change(input); assert.equal((await runFirewoodOfficeCommand(input, h.deps)).status, 'error');
    assert.equal(h.calls.some(call => call.name === 'credit_firewood_live_cancellation'), false);
  }
  for (const deps of [{ admitted: false }, { roles: ['crew'] }, { userId: null }]) {
    const h = harness(); assert.equal((await runFirewoodOfficeCommand(form(), { ...h.deps, ...deps })).status, 'error'); assert.equal(h.calls.length, 0);
  }
});
test('uncertain, partial, or falsely-paid credit result never becomes a successful acknowledgement', async () => {
  for (const resultChange of [{ accounting: null }, { state: 'active' }, { invoice_id: randomUUID() },
    { accounting: { ...reviewed, issued_at: '2026-10-29T00:00:00Z', credited_principal_cents: 60000, collectible_balance_cents: 0, credit_id: credit } },
    { accounting: { ...reviewed, credited_principal_cents: 30000, collectible_balance_cents: 30000, credit_id: credit } }]) {
    const h = harness({ resultChange }); assert.equal((await runFirewoodOfficeCommand(form(), h.deps)).status, 'error');
  }
});
