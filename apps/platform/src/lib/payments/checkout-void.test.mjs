import assert from "node:assert/strict";
import test from "node:test";
import { closeCheckoutReservation, safeCheckoutLog } from "./checkout-closure.ts";
import { reviewInvoiceCheckout, voidInvoiceSafely } from "./invoice-void.ts";
import { createCheckoutBudget } from "./checkout-budget.ts";

const reservation = (changes = {}) => ({ id: "reservation-1", invoice_id: "invoice-1", status: "open", payment_channel: "ach", stripe_checkout_session_id: "cs_1", stripe_payment_intent_id: null, submitted_at: null, total_charge_cents: 100, currency: "usd", ...changes });
const session = (changes = {}) => ({ id: "cs_1", status: "open", payment_status: "unpaid", mode: "payment", livemode: false, client_reference_id: "invoice-1", metadata: { invoice_id: "invoice-1" }, amount_total: 100, currency: "usd", payment_intent: null, ...changes });
function db(rows = [reservation()], options = {}) {
  const updates = [];
  return { rows, updates, from(table) {
    assert.equal(table, "invoice_checkout_sessions");
    const filters = []; let patch;
    const q = {
      select() { return q; }, order() { return q; }, is(key, value) { return q.eq(key, value); }, update(value) { patch = value; return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      maybeSingle() { return run(true); }, then(resolve, reject) { return run(false).then(resolve, reject); },
    };
    async function run(single) {
      if (patch && options.beforeUpdate) options.beforeUpdate(rows);
      if ((patch && options.updateError) || (!patch && options.lookupError)) return { data: null, error: { message: "sensitive internal details" } };
      const matches = rows.filter(row => filters.every(f => f(row)));
      if (patch) { updates.push({ ...patch }); matches.forEach(row => Object.assign(row, patch)); }
      return { data: single ? matches[0] ?? null : matches, error: null };
    }
    return q;
  } };
}
function stripe(initial = session(), options = {}) {
  const calls = { retrieve: 0, expire: 0 }; let remote = initial;
  return { calls, checkout: { sessions: {
    async retrieve() { calls.retrieve++; if (options.retrieveError) throw options.retrieveError; return remote; },
    async expire() {
      calls.expire++;
      if (options.race) { remote = options.race; throw Object.assign(new Error("sensitive error"), { code: "checkout_session_not_open", requestId: "req_safe123", statusCode: 400 }); }
      if (options.expireError) throw options.expireError;
      remote = options.returned ?? { ...remote, status: "expired" }; return remote;
    },
  } } };
}
async function close(row, provider, store = db([row]), extras = {}) {
  return closeCheckoutReservation({ reservation: { ...row }, stripe: provider, supabase: store, livemode: false, operation: "admin_invoice_void", correlationId: "test-correlation", voidToken: "lease-1", ...extras });
}

test("open unpaid checkout expires once and is stamped for this lease", async () => {
  const row = reservation(); const store = db([row]); const provider = stripe();
  assert.equal((await close(row, provider, store)).ok, true);
  assert.equal(row.status, "expired"); assert.equal(row.void_reconciled_token, "lease-1");
  assert.equal(provider.calls.expire, 1);
});
test("remote already expired succeeds without expire and retry repairs failed local write", async () => {
  const row = reservation(); const provider = stripe(session({ status: "expired" }));
  assert.equal((await close(row, provider, db([row], { updateError: true }))).ok, false);
  assert.equal(row.status, "open");
  assert.equal((await close(row, provider)).ok, true); assert.equal(row.status, "expired"); assert.equal(provider.calls.expire, 0);
});
test("creation, local processing/completed, remote complete-unpaid, paid and processing intents block", async () => {
  for (const status of ["creating", "processing", "completed"]) {
    const row = reservation({ status }); const provider = stripe();
    assert.equal((await close(row, provider)).ok, false); assert.equal(provider.calls.expire, 0);
  }
  for (const remote of [session({ status: "complete" }), session({ payment_status: "paid" }), session({ payment_intent: { metadata: { invoice_id: "invoice-1" }, livemode: false, status: "processing", amount_received: 0 } })]) {
    const row = reservation(); const provider = stripe(remote);
    assert.equal((await close(row, provider)).ok, false); assert.equal(row.status, "open"); assert.equal(provider.calls.expire, 0);
  }
});
test("wrong invoice/client reference/mode/livemode/amount/currency and unexpanded intent fail closed", async () => {
  for (const changes of [{ metadata: { invoice_id: "other" } }, { metadata: { invoice_id: "invoice-1", checkout_reservation_id: "other" } }, { client_reference_id: "other" }, { mode: "setup" }, { livemode: true }, { amount_total: 200 }, { currency: "eur" }, { payment_intent: "pi_unknown" }]) {
    const row = reservation(); const provider = stripe(session(changes));
    assert.equal((await close(row, provider)).ok, false); assert.equal(provider.calls.expire, 0); assert.equal(row.status, "open");
  }
});
test("missing account object, auth error, timeout and rate limit do not release the reservation", async () => {
  for (const e of [{ code: "resource_missing", statusCode: 404 }, { statusCode: 401 }, { type: "StripeConnectionError" }, { statusCode: 429 }]) {
    const row = reservation(); const provider = stripe(session(), { retrieveError: e }); const result = await close(row, provider);
    assert.equal(result.ok, false); assert.equal(row.status, "open"); assert.equal(provider.calls.expire, 0);
    assert.equal(result.retryable, e.statusCode === 429 || e.type === "StripeConnectionError");
  }
});
test("expiry racing checkout completion never marks it cancelled or expired", async () => {
  const row = reservation(); const provider = stripe(session(), { race: session({ status: "complete" }) });
  const result = await close(row, provider); assert.equal(result.ok, false); assert.equal(row.status, "open"); assert.equal(provider.calls.retrieve, 2);
});
test("expiry racing another expiry accepts only authoritative expired state", async () => {
  const row = reservation(); const provider = stripe(session(), { race: session({ status: "expired" }) });
  assert.equal((await close(row, provider)).ok, true); assert.equal(row.status, "expired");
});
test("unexpected successful expiry response remains blocked", async () => {
  const row = reservation(); const provider = stripe(session(), { returned: session({ status: "open" }) });
  assert.equal((await close(row, provider)).ok, false); assert.equal(row.status, "open");
});
test("concurrent webhook status change fails the exact reservation CAS", async () => {
  const row = reservation(); const store = db([row], { beforeUpdate(rows) { rows[0].status = "processing"; } });
  const result = await close(row, stripe(), store); assert.equal(result.code, "checkout_reservation_changed"); assert.equal(row.status, "processing");
});
test("only an unsubmitted card review without remote payment is locally cancellable", async () => {
  const row = reservation({ payment_channel: "card", stripe_checkout_session_id: null });
  assert.equal((await close(row, null)).ok, true); assert.equal(row.status, "cancelled");
  for (const changes of [{ status: "creating" }, { submitted_at: "2026-01-01" }, { stripe_payment_intent_id: "pi_1" }, { payment_channel: "ach" }]) {
    const r = reservation({ payment_channel: "card", stripe_checkout_session_id: null, ...changes }); assert.equal((await close(r, null)).ok, false);
  }
});
test("legacy cancelled rows with a remote session are independently reverified", async () => {
  const row = reservation({ status: "cancelled" }); const provider = stripe();
  assert.equal((await close(row, provider)).ok, true); assert.equal(provider.calls.expire, 1); assert.equal(row.status, "expired");
});
test("safe diagnostics omit messages, URLs, bodies, arbitrary codes and all payment/customer data", () => {
  const log = safeCheckoutLog({ code: "checkout_remote_unavailable", correlationId: "c", operation: "admin_invoice_void", retryable: false,
    error: { message: "secret", code: "secret", requestId: "secret", statusCode: 401, raw: { customer: "secret", url: "secret" } } });
  assert.equal(JSON.stringify(log).includes("secret"), false);
  assert.deepEqual(Object.keys(log).sort(), ["applicationErrorCode", "correlationId", "operation", "retryable", "stripeCode", "stripeRequestId", "stripeStatus"].sort());
  assert.equal(log.stripeStatus, 401);
});
function staff(options = {}) {
  const calls = [];
  return { calls, async rpc(name) { calls.push(name);
    if (name === "check_invoice_checkout_lease") return { data: !options.leaseError, error: options.leaseError ?? null };
    if (name === "begin_invoice_void" || name === "begin_invoice_checkout_review") return { data: options.alreadyVoid ? { already_void: true } : { token: "lease-1" }, error: options.beginError ?? null };
    if (name === "finalize_invoice_void") return { data: !options.finalError, error: options.finalError ?? null };
    return { data: null, error: null };
  } };
}
test("void flow authorizes/loads through begin before Stripe, finalizes after closure, and releases", async () => {
  const client = staff(); const row = reservation(); const provider = stripe();
  const result = await voidInvoiceSafely({ invoiceId: row.invoice_id, staffSupabase: client, getPaymentContext: () => ({ stripe: provider, supabase: db([row]), livemode: false }), correlationId: "c" });
  assert.equal(result.ok, true); assert.deepEqual(client.calls.filter(n => n !== "check_invoice_checkout_lease"), ["begin_invoice_void", "finalize_invoice_void", "release_invoice_void"]);
  assert.equal(row.void_reconciled_token, "lease-1");
});
test("denied begin/repeated void never touch Stripe; denied finalizer never reports success", async () => {
  for (const options of [{ beginError: {} }, { alreadyVoid: true }]) {
    const client = staff(options); const provider = stripe();
    const result = await voidInvoiceSafely({ invoiceId: "invoice-1", staffSupabase: client, getPaymentContext: () => ({ stripe: provider, supabase: db(), livemode: false }), correlationId: "c" });
    assert.equal(result.ok, Boolean(options.alreadyVoid)); assert.equal(provider.calls.retrieve, 0);
  }
  const client = staff({ finalError: {} }); const row = reservation();
  const result = await voidInvoiceSafely({ invoiceId: row.invoice_id, staffSupabase: client, getPaymentContext: () => ({ stripe: stripe(), supabase: db([row]), livemode: false }), correlationId: "c" });
  assert.equal(result.ok, false); assert.match(result.message, /checkouts were checked/); assert.equal(row.status, "expired");
});
test("failed closure and failed reads never call the finalizer", async () => {
  for (const store of [db([reservation({ status: "processing" })]), db([], { lookupError: true })]) {
    const client = staff(); const result = await voidInvoiceSafely({ invoiceId: "invoice-1", staffSupabase: client, getPaymentContext: () => ({ stripe: stripe(), supabase: store, livemode: false }), correlationId: "c" });
    assert.equal(result.ok, false); assert.deepEqual(client.calls.filter(n => n !== "check_invoice_checkout_lease"), ["begin_invoice_void", "release_invoice_void"]);
  }
});

test("transport exceptions produce safe outcomes; release failure cannot override a committed void", async () => {
  for (const throwsAt of ["begin_invoice_void", "finalize_invoice_void", "release_invoice_void"]) {
    const client = staff(); const rpc = client.rpc.bind(client);
    client.rpc = async name => { if (name === throwsAt) throw new Error("secret transport details"); return rpc(name); };
    const result = await voidInvoiceSafely({ invoiceId: "invoice-1", staffSupabase: client, getPaymentContext: () => ({ stripe: stripe(), supabase: db(), livemode: false }), correlationId: "c" });
    assert.equal(result.ok, throwsAt === "release_invoice_void"); assert.equal(result.message.includes("secret"), false);
  }
});

test("CAS fences provider binding/amount/submission changes even when status is unchanged", async () => {
  for (const change of [{ stripe_checkout_session_id: "cs_other" }, { stripe_payment_intent_id: "pi_other" }, { total_charge_cents: 200 }, { submitted_at: "2026-01-01T00:00:00Z" }]) {
    const row = reservation();
    const store = db([row], { beforeUpdate(rows) { Object.assign(rows[0], change); } });
    const result = await close(row, stripe(), store);
    assert.equal(result.code, "checkout_reservation_changed");
    assert.equal(row.status, "open");
  }
});
test("a changed/expired or inactive lease prevents privileged context or remote calls", async () => {
  const client = staff({ leaseError: {} }), provider = stripe();
  const result = await voidInvoiceSafely({ invoiceId: "invoice-1", staffSupabase: client,
    getPaymentContext: () => ({ stripe: provider, supabase: db(), livemode: false }), correlationId: "c" });
  assert.equal(result.ok, false); assert.equal(provider.calls.retrieve, 0);
  assert.equal(client.calls.includes("finalize_invoice_void"), false);
});
test("provider budget disables automatic retries and never starts work after its deadline", async () => {
  let now = 0, called = 0;
  const budget = createCheckoutBudget(() => now, 10);
  assert.deepEqual(budget.requestOptions(), { timeout: 10, maxNetworkRetries: 0 });
  now = 11;
  await assert.rejects(budget.run(async () => { called++; }), /budget_exhausted/);
  assert.equal(called, 0);
  await assert.rejects(createCheckoutBudget(undefined, 5).run(() => new Promise(() => {})), /budget_exhausted/);
});
test("review closes a verified expired creating ACH without rewriting invoice/payment state", async () => {
  const row = reservation({ status: "creating" }), provider = stripe(session({ status: "expired" }));
  const result = await reviewInvoiceCheckout({ invoiceId: row.invoice_id, reservationId: row.id, staffSupabase: staff(),
    getPaymentContext: () => ({ stripe: provider, supabase: db([row]), livemode: false }), correlationId: "c" });
  assert.equal(result.ok, true); assert.equal(row.status, "expired");
  assert.equal(provider.calls.expire, 0);
});
test("review never clears an unidentified create, completed checkout, or processing payment", async () => {
  for (const row of [reservation({ status: "creating", stripe_checkout_session_id: null }), reservation({ status: "completed" }), reservation({ status: "processing" })]) {
    const provider = stripe(session({ status: "complete", payment_status: "paid" }));
    const before = row.status;
    const result = await reviewInvoiceCheckout({ invoiceId: row.invoice_id, reservationId: row.id, staffSupabase: staff(),
      getPaymentContext: () => ({ stripe: provider, supabase: db([row]), livemode: false }), correlationId: "c" });
    assert.equal(result.ok, false); assert.equal(row.status, before); assert.equal(provider.calls.expire, 0);
  }
});
test("a manually supplied provider reference must identify the exact reservation", async () => {
  for (const metadata of [{ invoice_id: "invoice-1" }, { invoice_id: "other", checkout_reservation_id: "reservation-1" }, { invoice_id: "invoice-1", checkout_reservation_id: "other" }]) {
    const row = reservation({ status: "creating", stripe_checkout_session_id: null });
    const store = db([row]);
    const result = await reviewInvoiceCheckout({ invoiceId: row.invoice_id, reservationId: row.id, providerReference: "cs_1", staffSupabase: staff(),
      getPaymentContext: () => ({ stripe: stripe(session({ metadata })), supabase: store, livemode: false }), correlationId: "c" });
    assert.equal(result.ok, false); assert.equal(row.stripe_checkout_session_id, null); assert.equal(store.updates.length, 0);
  }
});
test("review can bind a positively identified interrupted create and close it", async () => {
  const row = reservation({ status: "creating", stripe_checkout_session_id: null }), store = db([row]);
  const result = await reviewInvoiceCheckout({ invoiceId: row.invoice_id, reservationId: row.id, providerReference: "cs_1", staffSupabase: staff(),
    getPaymentContext: () => ({ stripe: stripe(session({ metadata: { invoice_id: "invoice-1", checkout_reservation_id: row.id } })), supabase: store, livemode: false }), correlationId: "c" });
  assert.equal(result.ok, true); assert.equal(row.stripe_checkout_session_id, "cs_1"); assert.equal(row.status, "expired");
});

test("review cancels an authenticated but unpaid card intent only after exact verification", async () => {
  const row = reservation({ payment_channel: "card", status: "processing", stripe_checkout_session_id: null,
    stripe_payment_intent_id: "pi_1", submitted_at: "2026-01-01T00:00:00Z" });
  let intent = { id: "pi_1", status: "requires_action", livemode: false, amount: 100, currency: "usd", amount_received: 0,
    metadata: { invoice_id: row.invoice_id, checkout_reservation_id: row.id, payment_channel: "card" } };
  let cancelled = 0;
  const provider = { paymentIntents: { async retrieve() { return intent; }, async cancel() { cancelled++; intent = { ...intent, status: "canceled" }; return intent; } } };
  assert.equal((await close(row, provider, db([row]), { reviewing: true })).ok, true);
  assert.equal(row.status, "expired"); assert.equal(cancelled, 1);
  // A subsequent void must re-verify the closed intent under its NEW lease.
  assert.equal((await close(row, provider, db([row]), { voidToken: "lease-2" })).ok, true);
  assert.equal(row.void_reconciled_token, "lease-2"); assert.equal(cancelled, 1);
});
test("card review protects paid/processing money, wrong binding and a cancellation race", async () => {
  for (const changes of [{ status: "succeeded" }, { status: "processing" }, { status: "requires_capture" }, { amount_received: 1 }, { livemode: true }, { amount: 200 }, { currency: "eur" }, { metadata: { invoice_id: "other" } }]) {
    const row = reservation({ payment_channel: "card", status: "processing", stripe_checkout_session_id: null, stripe_payment_intent_id: "pi_1", submitted_at: "2026-01-01T00:00:00Z" });
    const intent = { id: "pi_1", status: "requires_action", livemode: false, amount: 100, currency: "usd", amount_received: 0,
      metadata: { invoice_id: row.invoice_id, checkout_reservation_id: row.id, payment_channel: "card" }, ...changes };
    let cancelled = 0;
    const provider = { paymentIntents: { async retrieve() { return intent; }, async cancel() { cancelled++; throw Error("unexpected"); } } };
    assert.equal((await close(row, provider, db([row]), { reviewing: true })).ok, false);
    assert.equal(row.status, "processing"); assert.equal(cancelled, 0);
  }
  const row = reservation({ payment_channel: "card", status: "processing", stripe_checkout_session_id: null, stripe_payment_intent_id: "pi_1", submitted_at: "2026-01-01T00:00:00Z" });
  let intent = { id: "pi_1", status: "requires_action", livemode: false, amount: 100, currency: "usd", amount_received: 0,
    metadata: { invoice_id: row.invoice_id, checkout_reservation_id: row.id, payment_channel: "card" } };
  const provider = { paymentIntents: { async retrieve() { return intent; }, async cancel() { intent = { ...intent, status: "processing" }; throw Error("completion won"); } } };
  assert.equal((await close(row, provider, db([row]), { reviewing: true })).ok, false);
  assert.equal(row.status, "processing");
});
