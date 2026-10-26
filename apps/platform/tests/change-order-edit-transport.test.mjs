import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { load } from './pr10-test-helpers.mjs';

const id = randomUUID(), line = randomUUID(), requestId = randomUUID();
function form() { const f = new FormData(); for (const [key, value] of Object.entries({ change_order_id: id, request_id: requestId, expected_revision: '4', line_id: line, line_title: 'Synthetic scope' })) f.set(key, value); return f; }
const receipt = () => ({ status: 'success', message: 'Saved', savedRevision: 7, savedLineIds: [line] });
function route(result = receipt()) {
  const calls = [];
  return { calls, ...load('../src/app/api/admin/change-orders/[changeOrderId]/edit/route.ts', {
    '@/lib/actions/change-orders': { updateChangeOrder: async (_, f) => { calls.push(f); if (result === 'throw') throw Error('Lost acknowledgement'); return result; } },
    '@/lib/security/headers': { privateNoStoreHeaders: [{ key: 'Cache-Control', value: 'private, no-store' }] },
  }) };
}
const url = 'https://crm.example.invalid/api/admin/change-orders/' + id + '/edit';
test('change-order receipt route binds origin and identity before its one unchanged command', async () => {
  for (const [origin, bodyId, length, status] of [[null, id, null, 403], ['https://other.invalid', id, null, 403], ['https://crm.example.invalid', line, null, 400], ['https://crm.example.invalid', id, '30000000', 413]]) {
    const h = route(), f = form(); f.set('change_order_id', bodyId);
    const r = await h.POST(new Request(url, { method: 'POST', body: f, headers: { ...(origin ? { Origin: origin } : {}), ...(length ? { 'Content-Length': length } : {}) } }), { params: Promise.resolve({ changeOrderId: id }) });
    assert.equal(r.status, status); assert.equal(h.calls.length, 0); assert.match(r.headers.get('cache-control'), /private.*no-store/);
  }
  const h = route(), f = form(); f.set('submit_intent', 'save_close');
  const r = await h.POST(new Request(url, { method: 'POST', body: f, headers: { Origin: 'https://crm.example.invalid' } }), { params: Promise.resolve({ changeOrderId: id }) });
  assert.equal(r.status, 200); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].get('submit_intent'), 'save');
  assert.equal(h.calls[0].get('request_id'), requestId); assert.equal(h.calls[0].get('expected_revision'), '4');
});
test('configured origin is authoritative behind ingress and command uncertainty is never retried', async () => {
  const previous = process.env.APP_BASE_URL; process.env.APP_BASE_URL = 'https://crm.example.invalid';
  try {
    for (const [origin, status] of [['https://crm.example.invalid', 200], ['https://other.invalid', 403]]) {
      const h = route();
      const r = await h.POST(new Request('http://127.0.0.1:3229/edit', { method: 'POST', body: form(), headers: { Origin: origin, 'X-Forwarded-Host': 'other.invalid' } }), { params: Promise.resolve({ changeOrderId: id }) });
      assert.equal(r.status, status); assert.equal(h.calls.length, status === 200 ? 1 : 0);
    }
    const h = route('throw'), r = await h.POST(new Request(url, { method: 'POST', body: form(), headers: { Origin: 'https://crm.example.invalid' } }), { params: Promise.resolve({ changeOrderId: id }) });
    assert.equal(r.status, 503); assert.equal(h.calls.length, 1); assert.match(r.headers.get('cache-control'), /private.*no-store/);
  } finally { if (previous === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previous; }
});
test('duplicate identities, files and streamed oversized bodies cannot reach the command', async () => {
  for (const kind of ['duplicate', 'file', 'stream']) {
    const h = route(), f = form(); if (kind === 'duplicate') f.append('change_order_id', id); if (kind === 'file') f.append('file', new Blob(['synthetic']), 'synthetic.txt');
    const body = kind === 'stream' ? new ReadableStream({ start(c) { c.enqueue(new Uint8Array(26 * 1024 * 1024 + 1)); c.close(); } }) : f;
    const r = await h.POST(new Request(url, { method: 'POST', body, duplex: 'half', headers: { Origin: 'https://crm.example.invalid', ...(kind === 'stream' ? { 'Content-Type': 'multipart/form-data; boundary=synthetic' } : {}) } }), { params: Promise.resolve({ changeOrderId: id }) });
    assert.equal(r.status, kind === 'stream' ? 413 : 400); assert.equal(h.calls.length, 0);
  }
});
test('browser acknowledgement validates revision and exact ordered line identities without fallback', async () => {
  const { submitChangeOrderEdit: submit } = load('../src/lib/change-orders/submit-edit.ts'), original = globalThis.fetch;
  try {
    for (const body of [null, { ...receipt(), savedRevision: 4 }, { ...receipt(), savedRevision: '7' }, { ...receipt(), savedLineIds: [] }, { ...receipt(), savedLineIds: [id] }, { ...receipt(), reviewRequired: 'yes' }, 'throw']) {
      let calls = 0; globalThis.fetch = async () => { calls++; if (body === 'throw') throw Error('Lost receipt'); return Response.json(body); };
      await assert.rejects(submit(form())); assert.equal(calls, 1);
    }
    globalThis.fetch = async (target, options) => { assert.equal(target, '/api/admin/change-orders/' + id + '/edit'); assert.equal(options.credentials, 'same-origin'); assert.equal(options.cache, 'no-store'); return Response.json({ ...receipt(), reviewRequired: true, saveDestination: 'https://other.invalid' }); };
    const replay = await submit(form()); assert.equal(replay.reviewRequired, true); assert.equal(replay.savedRevision, 7); assert.equal(replay.saveDestination, undefined);
    for (const rejected of [true, false]) { globalThis.fetch = async () => Response.json({ status: 'error', message: 'Review current record', saveRejected: rejected, reviewRequired: rejected }); const r = await submit(form()); assert.equal(r.saveRejected, rejected); assert.equal(r.reviewRequired, rejected); assert.equal(r.savedRevision, undefined); }
    const f = form(); f.append('line_id', ''); f.append('line_title', 'New synthetic scope'); const added = randomUUID(); globalThis.fetch = async () => Response.json({ ...receipt(), savedLineIds: [line, added] }); assert.deepEqual((await submit(f)).savedLineIds, [line, added]);
    for (const ids of [[line, line], [added, line]]) { globalThis.fetch = async () => Response.json({ ...receipt(), savedLineIds: ids }); await assert.rejects(submit(f)); }
  } finally { globalThis.fetch = original; }
});
