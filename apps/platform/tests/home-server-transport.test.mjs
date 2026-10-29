import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseServerFetch } from '../src/lib/supabase/server-transport.mjs';
const publicUrl = 'https://admin.angeltreeservices.org/backend';

test('cloud installations retain their current fetch implementation', () => {
  const fetchImpl = () => {};
  assert.equal(createSupabaseServerFetch('https://example.supabase.co', undefined, fetchImpl), fetchImpl);
});
test('private transport preserves mutation bytes, authorization, method and abort signal', async () => {
  const controller = new AbortController(); let calls = 0;
  const transport = createSupabaseServerFetch(publicUrl, 'http://api-gw:8000', async (request, init) => {
    calls++; assert.equal(request.url, 'http://api-gw:8000/rest/v1/rpc/save_quote?select=id');
    assert.equal(request.method, 'POST'); assert.equal(request.headers.get('authorization'), 'Bearer synthetic');
    assert.equal(await request.text(), '{"quantity":2}'); assert.equal(init.redirect, 'error');
    controller.abort(); assert.equal(request.signal.aborted, true);
    return Response.json({ ok: true });
  });
  assert.equal((await transport(publicUrl + '/rest/v1/rpc/save_quote?select=id', { method: 'POST',
    headers: { authorization: 'Bearer synthetic' }, body: '{"quantity":2}', signal: controller.signal })).status, 200);
  assert.equal(calls, 1);
});
test('Request bodies and streamed downloads are forwarded without buffering or replay', async () => {
  const source = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } });
  let calls = 0;
  const transport = createSupabaseServerFetch(publicUrl, 'http://api-gw:8000', async request => {
    calls++; assert.deepEqual([...new Uint8Array(await request.arrayBuffer())], [1, 2, 3]);
    return new Response('private', { status: 206, headers: { 'content-type': 'application/octet-stream' } });
  });
  const response = await transport(new Request(publicUrl + '/storage/v1/object/documents/file', {
    method: 'POST', body: source, duplex: 'half',
  }));
  assert.equal(response.status, 206); assert.equal(await response.text(), 'private'); assert.equal(calls, 1);
});
test('unexpected endpoints, URL credentials, ports and alternate internal services are rejected', async () => {
  for (const internal of ['https://api-gw:8000', 'http://127.0.0.1:8000', 'http://api-gw:8000/path', 'http://api-gw:8000/?key=bad']) {
    assert.throws(() => createSupabaseServerFetch(publicUrl, internal));
  }
  assert.throws(() => createSupabaseServerFetch('https://user:pass@example.invalid/backend', 'http://api-gw:8000'));
  let calls = 0;
  const transport = createSupabaseServerFetch(publicUrl, 'http://api-gw:8000', async () => { calls++; });
  for (const url of ['https://example.invalid/backend/auth/v1/user', 'https://admin.angeltreeservices.org/other',
    'https://admin.angeltreeservices.org/backend-evil/auth/v1/user']) await assert.rejects(transport(url));
  assert.equal(calls, 0);
});
