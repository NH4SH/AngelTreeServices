import assert from "node:assert/strict";
import test from "node:test";
import { requestNotificationInbox } from "./inbox-request.ts";

const row = { id: "synthetic-notification", category: "quote", title: "Synthetic proposal updated",
  body: null, destination_path: "/admin/quotes", created_at: "2026-11-04T20:00:00Z", read_at: null };
const payload = { unreadCount: 4, systemUnreadCount: 2, notifications: [row] };
const request = body => async () => Response.json(body);

test("both inbox tabs and count retain their endpoint and confirmed results", async () => {
  for (const tab of ["activity", "system"]) {
    const result = await requestNotificationInbox("recent", tab, { request: async (url, options) => {
      assert.equal(url, `/api/admin/notifications?mode=recent&tab=${tab}`);
      assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
      assert(options.signal instanceof AbortSignal); return Response.json(payload);
    } });
    assert.deepEqual(result, payload);
  }
  assert.deepEqual(await requestNotificationInbox("count", "activity", { request: async url => {
    assert.equal(url, "/api/admin/notifications?mode=count"); return Response.json({ unreadCount: 4, systemUnreadCount: 2 });
  } }), { unreadCount: 4, systemUnreadCount: 2, notifications: [] });
});

for (const [name, response] of [
  ["empty successful response", () => new Response(null)],
  ["truncated JSON", () => new Response('{"notifications":')],
  ["gateway HTML", () => new Response("<html>PRIVATE backend diagnostic</html>", { status: 502 })],
  ["HTML sign-in page", () => new Response("<html>Sign in</html>")],
  ["JSON null", () => Response.json(null)],
  ["wrong notification collection", () => Response.json({ ...payload, notifications: {} })],
  ["incomplete row", () => Response.json({ ...payload, notifications: [{ id: "synthetic" }] })],
  ["missing count", () => Response.json({ notifications: [] })],
  ["negative count", () => Response.json({ ...payload, unreadCount: -1 })],
  ["fractional count", () => Response.json({ ...payload, systemUnreadCount: 0.5 })],
]) test(`${name} remains a recoverable load error instead of an empty inbox`, async () => {
  await assert.rejects(requestNotificationInbox("recent", "activity", { request: async () => response() }),
    error => error.message === "Notifications could not load. Please try again.");
});

for (const [status, message] of [[401, /Sign in again/], [403, /cannot view/], [429, /Wait a moment/]]) {
  test(`HTTP ${status} explains the available recovery without parsing its body`, async () => {
    await assert.rejects(requestNotificationInbox("recent", "activity", { request: async () => new Response(null, { status }) }), message);
  });
}

test("network and stream failures never expose the transport error and allow a subsequent retry", async () => {
  for (const transport of [async () => { throw Error("PRIVATE untrusted network diagnostic"); },
    async () => ({ ok: true, status: 200, async json() { throw Error("PRIVATE interrupted body"); } })]) {
    await assert.rejects(requestNotificationInbox("recent", "activity", { request: transport }),
      error => error.message === "Notifications could not load. Please try again.");
  }
  assert.deepEqual(await requestNotificationInbox("recent", "activity", { request: request(payload) }), payload);
});

test("deadline explains retry and caller cancellation reaches the pending request", async () => {
  await assert.rejects(requestNotificationInbox("count", "activity", { request: async () => {
    throw new DOMException("PRIVATE timeout detail", "TimeoutError");
  } }), /took too long/);
  const controller = new AbortController(); let received;
  const pending = requestNotificationInbox("recent", "activity", { signal: controller.signal,
    request: async (_url, options) => { received = options.signal; return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    }); } });
  controller.abort(); assert.equal(received.aborted, true);
  await assert.rejects(pending, /could not load/);
});

test("a confirmed empty inbox is distinguished from a failed load", async () => {
  assert.deepEqual(await requestNotificationInbox("recent", "system", {
    request: request({ unreadCount: 0, systemUnreadCount: 0, notifications: [] }),
  }), { unreadCount: 0, systemUnreadCount: 0, notifications: [] });
});
