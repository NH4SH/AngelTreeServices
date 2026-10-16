import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { reviewInvoiceCheckout, voidInvoiceSafely } from "../src/lib/payments/invoice-void.ts";

const enabled = process.env.PR03_DISPOSABLE_STACK === "1" && Boolean(process.env.PR03_LOCAL_STATUS_FILE);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
test("PR03 real local Auth, RLS, guarded void, recovery fences and PostgreSQL concurrency", { skip: !enabled, timeout: 180000 }, async t => {
  const c = JSON.parse(readFileSync(process.env.PR03_LOCAL_STATUS_FILE, "utf8"));
  assert.equal(c.API_URL, "http://127.0.0.1:54321");
  assert.match(process.env.DOCKER_HOST ?? "", /^unix:\/\//);
  const docker = process.env.PR03_DOCKER_BIN;
  assert.ok(docker);
  const base = ["exec", "-i", "supabase_db_ats_pr02_disposable", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
  function sql(source) {
    return new Promise((resolve, reject) => {
      const p = spawn(docker, base, { env: process.env }); let out = "", err = "";
      p.stdout.on("data", b => out += b); p.stderr.on("data", b => err += b);
      p.on("error", reject); p.on("exit", code => code === 0 ? resolve(out.trim()) : reject(new Error(err)));
      p.stdin.end(source);
    });
  }
  async function hold(source) {
    const p = spawn(docker, base, { env: process.env }); let err = "";
    p.stderr.on("data", b => err += b);
    const done = new Promise((resolve, reject) => { p.on("error", reject); p.on("exit", code => code === 0 ? resolve() : reject(new Error(err))); });
    const ready = new Promise((resolve, reject) => {
      p.stdout.on("data", b => { if (String(b).includes("PR03_LOCKED")) resolve(); });
      p.on("error", reject); p.on("exit", () => reject(new Error("Lock session exited before readiness: " + err)));
    });
    p.stdin.write(`begin; ${source}; select 'PR03_LOCKED';\n`);
    await ready;
    return async () => { p.stdin.end("commit;\n"); await done; };
  }
  const service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, options);
  const anon = createClient(c.API_URL, c.ANON_KEY, options);
  const marker = randomBytes(5).toString("hex"), results = [];
  const check = (r, label = "request") => { assert.ifError(r.error && new Error(`${label}: ${r.error.message} [${r.error.code}]`)); return r.data; };
  const denied = (r, code) => { assert.ok(r.error, "Expected rejection"); if (code) assert.equal(r.error.code, code); };
  const client = jwt => createClient(c.API_URL, c.ANON_KEY, { ...options, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  async function account(role, label = role) {
    check(await service.from("roles").upsert({ name: role }, { onConflict: "name" }));
    const password = randomBytes(24).toString("base64url");
    const u = check(await service.auth.admin.createUser({ email: `pr03-${label}-${marker}@example.invalid`, password, email_confirm: true })).user;
    check(await service.from("profiles").update({ status: "active" }).eq("id", u.id));
    const employee = check(await service.from("employee_records").insert({ auth_user_id: u.id, legal_name: `PR03 ${label} ${marker}`, employment_status: "active", is_active: true }).select("id").single());
    const rr = check(await service.from("roles").select("id").eq("name", role).single());
    check(await service.from("user_roles").insert({ user_id: u.id, role_id: rr.id }));
    const auth = createClient(c.API_URL, c.ANON_KEY, options);
    const session = check(await auth.auth.signInWithPassword({ email: u.email, password })).session;
    return { ...u, employeeId: employee.id, client: client(session.access_token), jwt: session.access_token };
  }
  const owner = await account("owner"), admin = await account("admin");
  const customer = check(await service.from("customers").insert({ display_name: `PR03 disposable ${marker}`, email: `pr03-${marker}@example.invalid` }).select("id").single());
  async function invoice(changes = {}) {
    return check(await service.from("invoices").insert({ customer_id: customer.id, status: "sent", subtotal_cents: 1000, tax_cents: 0, total_cents: 1000, balance_due_cents: 1000, sent_at: new Date().toISOString(), ...changes }).select("*").single());
  }
  async function reservation(inv, status = "open", changes = {}) {
    return check(await service.from("invoice_checkout_sessions").insert({ invoice_id: inv.id, customer_id: customer.id, status, amount_cents: 1000, invoice_principal_cents: 1000, total_charge_cents: 1000, surcharge_cents: 0, currency: "usd", payment_channel: "ach", ...changes }).select("*").single());
  }
  async function payment(inv, status = "pending", changes = {}) {
    return check(await service.from("payments").insert({ invoice_id: inv.id, customer_id: customer.id, status, amount_cents: 1000, total_collected_cents: 1000, currency: "usd", payment_method: "ach", provider: "stripe", ...changes }).select("*").single());
  }
  const begin = async (inv, actor = owner) => check(await actor.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }));
  const finish = (inv, token, actor = owner) => actor.client.rpc("finalize_invoice_void", { p_invoice_id: inv.id, p_token: token });
  const release = (inv, token, actor = owner) => actor.client.rpc("release_invoice_void", { p_invoice_id: inv.id, p_token: token });
  const state = async inv => check(await service.from("invoices").select("status").eq("id", inv.id).single()).status;
  const stamp = (row, token) => service.from("invoice_checkout_sessions").update({ status: "expired", void_reconciled_token: token }).eq("id", row.id);
  const run = async (name, fn) => t.test(name, async () => { await fn(); results.push({ name, pass: true }); });

  await run("anonymous, customer, field, estimator and payroll roles cannot execute money commands", async () => {
    const inv = await invoice();
    for (const role of ["customer", "property_manager", "crew", "estimator", "payroll_admin"]) {
      const u = await account(role);
      denied(await u.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "42501");
      denied(await u.client.rpc("begin_invoice_checkout_review", { p_invoice_id: inv.id }), "42501");
      denied(await u.client.rpc("get_invoice_checkout_review", { p_invoice_id: inv.id }), "42501");
    }
    denied(await anon.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "42501");
    denied(await service.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "42501");
  });
  await run("no authenticated client can tamper with checkout attestation or private lease", async () => {
    const inv = await invoice(); const row = await reservation(inv);
    const result = await owner.client.from("invoice_checkout_sessions").update({ status: "expired" }).eq("id", row.id).select("id");
    assert.ok(result.error || result.data.length === 0);
    assert.equal(check(await service.from("invoice_checkout_sessions").select("status").eq("id", row.id).single()).status, "open");
    assert.equal(await sql("select has_table_privilege('authenticated','app_private.invoice_void_leases','select')"), "f");
  });
  await run("direct void and direct restore bypass fail; legitimate restore still works", async () => {
    const inv = await invoice();
    denied(await owner.client.from("invoices").update({ status: "void" }).eq("id", inv.id), "42501");
    const token = (await begin(inv)).token;
    check(await finish(inv, token));
    denied(await owner.client.from("invoices").update({ status: "sent" }).eq("id", inv.id), "42501");
    assert.equal(check(await admin.client.rpc("restore_voided_invoice", { p_invoice_id: inv.id })), "sent");
    assert.equal(await state(inv), "sent");
  });
  await run("money and creating/processing/completed reservations block void", async () => {
    for (const status of ["pending", "succeeded", "refunded"]) {
      const inv = await invoice(); await payment(inv, status);
      denied(await owner.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "23514");
      assert.equal(await state(inv), "sent");
    }
    for (const changes of [{ refunded_principal_cents: 1 }, { refunded_surcharge_cents: 1, surcharge_cents: 1, total_collected_cents: 1001 }, { dispute_status: "lost" }, { disputed_gross_cents: 1 }]) {
      const inv = await invoice(); await payment(inv, "failed", changes);
      denied(await owner.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "23514");
    }
    for (const status of ["creating", "processing", "completed"]) {
      const inv = await invoice(); await reservation(inv, status);
      denied(await owner.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "23514");
    }
  });
  await run("all historical reservations need current attestation; party/amount/status changes fail closed", async () => {
    const inv = await invoice(); const row = await reservation(inv, "failed");
    const token = (await begin(inv)).token;
    denied(await finish(inv, token), "23514");
    check(await stamp(row, token));
    check(await service.from("invoice_checkout_sessions").update({ submitted_at: new Date().toISOString() }).eq("id", row.id));
    denied(await finish(inv, token), "23514");
    check(await stamp(row, token)); check(await finish(inv, token));
    // A no-op repeat of the same attestation grants no new authority; finalization remains fenced.
  });
  await run("void, pending reminder cancellation and audit commit once; processing mail is retained", async () => {
    const inv = await invoice(); const row = await reservation(inv);
    const comms = check(await service.from("customer_communications").insert(["pending", "processing"].map(status => ({ invoice_id: inv.id, customer_id: customer.id, communication_type: "invoice_payment_reminder", reminder_stage: "first", recipient_email: customer.email ?? "fixture@example.invalid", scheduled_for: new Date().toISOString(), status, idempotency_key: `pr03-${marker}-${inv.id}-${status}` }))).select("id,status"));
    const token = (await begin(inv)).token; check(await stamp(row, token));
    check(await finish(inv, token)); check(await finish(inv, token));
    const statuses = check(await service.from("customer_communications").select("status").eq("invoice_id", inv.id)).map(x => x.status).sort();
    assert.deepEqual(statuses, ["cancelled", "processing"]);
    assert.equal(check(await service.from("activity_log").select("id").eq("subject_id", inv.id).eq("event_type", "invoice_voided")).length, 1);
    assert.equal((await begin(inv)).already_void, true);
    // No worker runs, but leave fixtures explicitly unsendable for later sessions.
    check(await service.from("customer_communications").update({ status: "skipped", skip_reason: "PR03 local fixture; never send" }).in("id", comms.map(x => x.id)));
  });
  await run("a failed audit rolls back invoice and reminders; retry commits cleanly", async () => {
    const inv = await invoice(); const token = (await begin(inv)).token;
    await sql(`alter table public.activity_log add constraint pr03_reject_test_audit check(not(subject_id='${inv.id}'::uuid and event_type='invoice_voided'))`);
    try {
      denied(await finish(inv, token), "23514"); assert.equal(await state(inv), "sent");
    } finally { await sql("alter table public.activity_log drop constraint pr03_reject_test_audit"); }
    check(await finish(inv, token)); assert.equal(await state(inv), "void");
  });
  await run("late real money is retained and conflict audit deduplicates; collection stays blocked", async () => {
    const inv = await invoice(); check(await finish(inv, (await begin(inv)).token));
    const p = await payment(inv, "succeeded");
    check(await service.from("payments").update({ status: "succeeded" }).eq("id", p.id));
    assert.equal(check(await service.from("payments").select("id").eq("id", p.id)).length, 1);
    assert.equal(check(await service.from("activity_log").select("id").eq("subject_id", inv.id).eq("event_type", "invoice_void_payment_conflict")).length, 1);
    const attempted = await service.from("invoice_checkout_sessions").insert({ invoice_id: inv.id, customer_id: customer.id, amount_cents: 1000, invoice_principal_cents: 1000, surcharge_cents: 0, total_charge_cents: 1000, payment_channel: "ach", status: "creating" });
    denied(attempted, "23514");
  });
  await run("old token, different actor, expired lease and stale release are fenced", async () => {
    const inv = await invoice(); const old = (await begin(inv)).token;
    denied(await finish(inv, old, admin), "55P03");
    denied(await owner.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }), "55P03");
    await sql(`update app_private.invoice_void_leases set expires_at=clock_timestamp()-interval '1 second' where invoice_id='${inv.id}'`);
    denied(await finish(inv, old), "55P03");
    const current = (await begin(inv, admin)).token; assert.notEqual(current, old);
    check(await release(inv, old));
    denied(await finish(inv, old), "55P03"); check(await finish(inv, current, admin));
  });
  await run("a real already-issued admin JWT loses begin/check/finalize after offboarding", async () => {
    const u = await account("admin", "offboarded"), inv = await invoice();
    const token = (await begin(inv, u)).token;
    check(await owner.client.rpc("set_employee_access_status", { p_employee_id: u.employeeId, p_status: "inactive", p_reason: "PR03 disposable access fence" }));
    denied(await u.client.rpc("check_invoice_checkout_lease", { p_invoice_id: inv.id, p_token: token }), "42501");
    denied(await finish(inv, token, u), "42501");
    denied(await u.client.rpc("begin_invoice_checkout_review", { p_invoice_id: inv.id }), "42501");
    assert.equal(await state(inv), "sent");
  });
  await run("review lease cannot finalize a void and does not force-clear missing remote evidence", async () => {
    const inv = await invoice(); await reservation(inv, "creating");
    const token = check(await admin.client.rpc("begin_invoice_checkout_review", { p_invoice_id: inv.id })).token;
    assert.equal(check(await admin.client.rpc("check_invoice_checkout_lease", { p_invoice_id: inv.id, p_token: token })), true);
    denied(await finish(inv, token, admin), "55P03");
    const rows = check(await admin.client.rpc("get_invoice_checkout_review", { p_invoice_id: inv.id }));
    assert.equal(rows.length, 1); assert.equal(rows[0].status, "creating");
    check(await release(inv, token, admin));
  });
  await run("actual review command binds exact provider evidence, closes and audits transactionally", async () => {
    const inv = await invoice(), row = await reservation(inv, "creating");
    let remote = { id: `cs_test_pr03${marker}`, status: "open", payment_status: "unpaid", mode: "payment", livemode: false,
      client_reference_id: inv.id, metadata: { invoice_id: inv.id, checkout_reservation_id: row.id, payment_channel: "ach" },
      amount_total: 1000, currency: "usd", payment_intent: null };
    let expires = 0;
    const stripe = { checkout: { sessions: {
      async retrieve() { return remote; },
      async expire() { expires++; remote = { ...remote, status: "expired" }; return remote; },
    } } };
    const result = await reviewInvoiceCheckout({ invoiceId: inv.id, reservationId: row.id, providerReference: remote.id,
      staffSupabase: admin.client, getPaymentContext: () => ({ stripe, supabase: service, livemode: false }), correlationId: marker });
    assert.equal(result.ok, true, result.message); assert.equal(expires, 1); assert.equal(await state(inv), "sent");
    assert.equal(check(await service.from("invoice_checkout_sessions").select("status").eq("id", row.id).single()).status, "expired");
    assert.equal(check(await service.from("activity_log").select("id").eq("subject_id", inv.id).eq("event_type", "invoice_checkout_reviewed")).length, 1);
    const token = (await begin(inv)).token;
    // Review proof cannot be reused as proof for a different void operation.
    denied(await finish(inv, token), "23514");
    check(await stamp(row, token)); check(await finish(inv, token));
  });
  await run("card recovery followed by actual void re-verifies the cancelled intent under a new lease", async () => {
    const inv = await invoice(); const providerId = `pi_pr03${marker}`;
    const row = await reservation(inv, "processing", { payment_channel: "card", stripe_payment_intent_id: providerId, submitted_at: new Date().toISOString() });
    let intent = { id: providerId, status: "requires_action", livemode: false, amount: 1000, amount_received: 0, currency: "usd",
      metadata: { invoice_id: inv.id, checkout_reservation_id: row.id, payment_channel: "card" } };
    let cancelled = 0;
    const stripe = { paymentIntents: { async retrieve() { return intent; }, async cancel() { cancelled++; intent = { ...intent, status: "canceled" }; return intent; } } };
    const input = { invoiceId: inv.id, staffSupabase: admin.client, getPaymentContext: () => ({ stripe, supabase: service, livemode: false }), correlationId: marker };
    const review = await reviewInvoiceCheckout({ ...input, reservationId: row.id });
    assert.equal(review.ok, true, review.message); assert.equal(await state(inv), "sent");
    const result = await voidInvoiceSafely(input);
    assert.equal(result.ok, true, result.message); assert.equal(await state(inv), "void"); assert.equal(cancelled, 1);
  });
  await run("paid/void header and lines are protected; ordinary draft lines remain editable", async () => {
    for (const paid of [false, true]) {
      const inv = await invoice();
      const line = check(await service.from("invoice_line_items").insert({ invoice_id: inv.id, name: "Fixture", quantity: 1, unit_price_cents: 1000, total_cents: 1000 }).select("id").single());
      if (paid) check(await owner.client.rpc("record_manual_invoice_payment", { p_invoice_id: inv.id, p_amount_cents: 1000, p_paid_at: new Date().toISOString(), p_method: "cash" }));
      else check(await finish(inv, (await begin(inv)).token));
      denied(await owner.client.from("invoices").update({ total_cents: 2000 }).eq("id", inv.id), "23514");
      denied(await owner.client.from("invoice_line_items").update({ total_cents: 2000 }).eq("id", line.id), "23514");
      denied(await owner.client.from("invoice_line_items").delete().eq("id", line.id), "23514");
    }
    const inv = await invoice({ status: "draft", sent_at: null });
    const line = check(await owner.client.from("invoice_line_items").insert({ invoice_id: inv.id, name: "Draft", quantity: 1, unit_price_cents: 1000, total_cents: 1000 }).select("id").single());
    check(await owner.client.from("invoice_line_items").update({ name: "Still editable" }).eq("id", line.id));
    check(await owner.client.from("invoice_line_items").delete().eq("id", line.id));
  });
  await run("manual correction and restore still work with the new row locks", async () => {
    const inv = await invoice();
    const p = check(await owner.client.rpc("record_manual_invoice_payment", { p_invoice_id: inv.id, p_amount_cents: 1000, p_paid_at: new Date().toISOString(), p_method: "cash" }));
    assert.equal(await state(inv), "paid");
    check(await owner.client.rpc("cancel_manual_invoice_payment", { p_invoice_id: inv.id, p_payment_id: p, p_reason: "PR03 fixture correction" }));
    assert.equal(await state(inv), "sent");
    check(await owner.client.rpc("restore_cancelled_manual_invoice_payment", { p_invoice_id: inv.id, p_payment_id: p }));
    assert.equal(await state(inv), "paid");
  });
  await run("new collection validates current principal and contracting party in the DB", async () => {
    const inv = await invoice();
    denied(await service.from("invoice_checkout_sessions").insert({ invoice_id: inv.id, customer_id: customer.id, amount_cents: 999, invoice_principal_cents: 999, total_charge_cents: 999, surcharge_cents: 0, payment_channel: "ach", status: "creating" }), "23514");
    const row = await reservation(inv);
    const other = await invoice();
    denied(await service.from("invoice_checkout_sessions").update({ invoice_id: other.id }).eq("id", row.id), "23514");
  });
  await run("separate sessions: ACH/card inserts wait for parent then reject committed void lease; other invoice proceeds", async () => {
    for (const channel of ["ach", "card"]) {
      const inv = await invoice(), other = await invoice();
      const unlock = await hold(`select id from public.invoices where id='${inv.id}' for update; set local request.jwt.claim.sub='${owner.id}'; select public.begin_invoice_void('${inv.id}')`);
      let completed = false;
      const contender = service.from("invoice_checkout_sessions").insert({ invoice_id: inv.id, customer_id: customer.id, amount_cents: 1000, invoice_principal_cents: 1000, total_charge_cents: 1000, surcharge_cents: 0, currency: "usd", payment_channel: channel, status: "open" }).then(r => { completed = true; return r; });
      try {
        await reservation(other, "creating");
        await new Promise(resolve => setTimeout(resolve, 80));
        assert.equal(completed, false);
      } finally { await unlock(); }
      denied(await contender, "23514");
      await sql(`delete from app_private.invoice_void_leases where invoice_id='${inv.id}'`);
    }
  });
  await run("separate sessions: reservation-first makes later void wait then reject", async () => {
    const inv = await invoice();
    const unlock = await hold(`insert into public.invoice_checkout_sessions(invoice_id,customer_id,amount_cents,invoice_principal_cents,total_charge_cents,payment_channel,status) values('${inv.id}','${customer.id}',1000,1000,1000,'ach','creating')`);
    let completed = false;
    const contender = owner.client.rpc("begin_invoice_void", { p_invoice_id: inv.id }).then(r => { completed = true; return r; });
    try { await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(completed, false); } finally { await unlock(); }
    denied(await contender, "23514");
  });
  await run("contested child updates fail fast instead of deadlocking invoice-first correction", async () => {
    const inv = await invoice(), p = await payment(inv, "failed"), row = await reservation(inv);
    const unlock = await hold(`select id from public.invoices where id='${inv.id}' for update`);
    try {
      denied(await service.from("payments").update({ status: "pending" }).eq("id", p.id), "55P03");
      denied(await service.from("invoice_checkout_sessions").update({ status: "expired" }).eq("id", row.id), "55P03");
    } finally { await unlock(); }
    check(await service.from("payments").update({ status: "pending" }).eq("id", p.id));
    check(await service.from("invoice_checkout_sessions").update({ status: "expired" }).eq("id", row.id));
  });
  if (process.env.PR03_RESULTS_FILE) writeFileSync(process.env.PR03_RESULTS_FILE, JSON.stringify({ marker, cases: results }, null, 2));
});
