import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './pr10-test-helpers.mjs';

const id = 'a0000000-0000-4000-8000-000000000001', line = 'a0000000-0000-4000-8000-000000000002';
function form() { const f = new FormData(); for (const [key, value] of Object.entries({ invoice_id: id, expected_updated_at: '2026-10-26T10:00:00.123456Z', invoice_line_item_id: line, invoice_line_item_client_id: 'retained' })) f.set(key, value); return f; }
function route() {
  const calls = [];
  return { calls, ...load('../src/app/api/admin/invoices/[invoiceId]/edit/route.ts', {
    '@/app/admin/invoices/actions': { updateInvoice: async (_, f) => { calls.push(f); return { status: 'success', message: 'Saved', savedUpdatedAt: '2026-10-26T10:00:00.123457Z', savedLineIds: { retained: line } }; } },
    '@/lib/security/headers': { privateNoStoreHeaders: [{ key: 'Cache-Control', value: 'private, no-store' }] },
  }) };
}
test('receipt route enforces origin, URL/body identity and bounded input before the existing command', async () => {
  for (const [origin, bodyId, length, status] of [[null, id, null, 403], ['https://other.invalid', id, null, 403], ['https://crm.example.invalid', line, null, 400], ['https://crm.example.invalid', id, '30000000', 413]]) {
    const h = route(), f = form(); f.set('invoice_id', bodyId);
    const headers = { ...(origin ? { Origin: origin } : {}), ...(length ? { 'Content-Length': length } : {}) };
    const response = await h.POST(new Request('https://crm.example.invalid/api/admin/invoices/' + id + '/edit', { method: 'POST', body: f, headers }), { params: Promise.resolve({ invoiceId: id }) });
    assert.equal(response.status, status); assert.equal(h.calls.length, 0); assert.match(response.headers.get('cache-control'), /private.*no-store/);
  }
  const h = route(), f = form(); f.set('submit_intent', 'save_close');
  const response = await h.POST(new Request('https://crm.example.invalid/api/admin/invoices/' + id + '/edit', { method: 'POST', body: f, headers: { Origin: 'https://crm.example.invalid' } }), { params: Promise.resolve({ invoiceId: id }) });
  assert.equal(response.status, 200); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].get('submit_intent'), 'save'); assert.equal(h.calls[0].get('client_navigation'), '1');
});

test('configured ingress origin is authoritative behind a proxy; forwarded-host cannot authorize another origin', async () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = 'https://crm.example.invalid';
  try {
    for (const [origin, status] of [['https://crm.example.invalid', 200], ['https://other.invalid', 403]]) {
      const h = route();
      const request = new Request('http://127.0.0.1:3229/api/admin/invoices/' + id + '/edit', { method: 'POST', body: form(), headers: { Origin: origin, 'X-Forwarded-Host': 'other.invalid' } });
      const response = await h.POST(request, { params: Promise.resolve({ invoiceId: id }) });
      assert.equal(response.status, status); assert.equal(h.calls.length, status === 200 ? 1 : 0);
    }
  } finally { if (previous === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previous; }
});

test('invoice receipts retain microsecond revision identity and reject stale/malformed acknowledgement without retry', async () => {
  const { submitInvoiceEdit: submit, invoiceRevisionIdentity: revision } = load('../src/lib/invoices/submit-edit.ts');
  const previous = '2026-10-26T10:00:00.123456Z', next = '2026-10-26T10:00:00.123457+00:00';
  assert.notEqual(revision(previous), revision(next));
  assert.equal(revision(previous), revision('2026-10-26T06:00:00.123456-04:00'));
  assert.equal(revision('2026-02-30T10:00:00Z'), null);
  const original = globalThis.fetch;
  try {
    for (const body of [null, { status: 'success', message: 'Saved', savedUpdatedAt: previous, savedLineIds: { retained: line } },
      { status: 'success', message: 'Saved', savedUpdatedAt: previous.replace('Z', '+00:00'), savedLineIds: { retained: line } },
      { status: 'success', message: 'Saved', savedUpdatedAt: next, savedLineIds: {} },
      { status: 'success', message: 'Saved', savedUpdatedAt: next, savedLineIds: { retained: id } }, 'throw']) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; if (body === 'throw') throw Error('Lost receipt'); return Response.json(body); };
      await assert.rejects(submit(form())); assert.equal(calls, 1);
    }
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/admin/invoices/' + id + '/edit'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store');
      return Response.json({ status: 'success', message: 'Saved', savedUpdatedAt: next, savedLineIds: { retained: line }, navigateTo: 'https://other.invalid' });
    };
    const saved = await submit(form()); assert.equal(saved.savedUpdatedAt, next); assert.equal(saved.navigateTo, undefined);
  } finally { globalThis.fetch = original; }
});

