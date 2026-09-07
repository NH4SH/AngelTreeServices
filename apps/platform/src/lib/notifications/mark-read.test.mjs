import assert from "node:assert/strict";
import test from "node:test";
import { persistNotificationRead } from "./mark-read.ts";

test("read requests preserve endpoint, payload and navigation-safe delivery", async () => {
  await persistNotificationRead("success", async (url, options) => {
    assert.equal(url, "/api/admin/notifications");
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { id: "success", read: true });
    assert.equal(options.keepalive, true);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(null, { status: 204 });
  });
});

test("duplicate in-flight requests are coalesced", async () => {
  let resolve;
  let calls = 0;
  const request = () => { calls++; return new Promise((done) => { resolve = done; }); };
  const first = persistNotificationRead("duplicate", request);
  assert.equal(persistNotificationRead("duplicate", request), first);
  await Promise.resolve();
  resolve(new Response(null, { status: 204 }));
  await first;
  assert.equal(calls, 1);
});

test("HTTP errors reject and permit retry", async () => {
  await assert.rejects(persistNotificationRead("retry", async () => new Response(null, { status: 500 })));
  await persistNotificationRead("retry", async () => new Response(null, { status: 204 }));
});

test("network errors reject and permit retry", async () => {
  await assert.rejects(persistNotificationRead("offline", async () => { throw new TypeError("Offline"); }));
  await persistNotificationRead("offline", async () => new Response(null, { status: 204 }));
});
