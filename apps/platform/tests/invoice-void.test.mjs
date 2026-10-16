import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { voidInvoiceSafely, reviewInvoiceCheckout } from "../src/lib/payments/invoice-void.ts";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(file, deps) {
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    assert.ok(name in deps, `Unexpected import ${name}`); return deps[name];
  }, m, m.exports);
  return m.exports;
}
const id = "00000000-0000-4000-8000-000000000001";
function fixture(options = {}) {
  const calls = [], events = [];
  const staff = {
    auth: { async getUser() { return { data: { user: options.signedOut ? null : { id } } }; } },
    async rpc(name) {
      calls.push(name); events.push(name);
      if (name === "has_effective_platform_access") return { data: !options.inactive, error: options.accessError ?? null };
      if (name === "begin_invoice_void") return { data: options.alreadyVoid ? { already_void: true } : { token: id }, error: options.beginError ?? null };
      if (name === "check_invoice_checkout_lease") return { data: true, error: null };
      if (name === "finalize_invoice_void") return { data: true, error: null };
      return { data: null, error: null };
    },
    from(table) {
      assert.equal(table, "user_roles");
      const q = { select() { return q; }, eq() { return q; }, then(resolve, reject) {
        return Promise.resolve({ data: [{ roles: { name: options.role ?? "owner" } }], error: options.rolesError ?? null }).then(resolve, reject);
      } }; return q;
    },
  };
  const service = { from(table) {
    assert.equal(table, "invoice_checkout_sessions");
    const q = { select() { return q; }, eq() { return q; }, order() { return q; },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); } }; return q;
  } };
  const server = { createClient: async () => staff };
  const roles = load("../src/lib/auth/roles.ts", { "@/lib/supabase/server": server });
  const noop = {};
  const workflow = load("../src/lib/actions/workflow.ts", {
    "next/cache": { revalidatePath() {} }, "next/navigation": noop,
    "@/lib/activity-log": noop, "@/lib/auth/roles": roles, "@/lib/supabase/server": server,
    "@/lib/quotes/workflow": noop,
    "@/lib/payments/invoice-void": { voidInvoiceSafely, reviewInvoiceCheckout },
    "@/lib/stripe/server": { getStripeServerConfig() { events.push("stripe-client"); return { configured: false }; } },
    "@/lib/supabase/admin": { getServiceRoleClient() { events.push("service-client"); return service; } },
    "@/lib/communications/queue": noop, "@/lib/payments/reconciliation": noop,
    "@/lib/security/errors": noop, "@/lib/jobs/complete-after-invoice": noop,
    "@/lib/invoices/due-date": noop,
  });
  const form = new FormData(); form.set("invoice_id", id); form.set("next_status", "void");
  form.set("reservation_id", id);
  return { workflow, form, calls, events };
}
for (const options of [
  { signedOut: true }, { role: "customer" }, { role: "crew" }, { role: "estimator" },
  { role: "payroll_admin" }, { role: "property_manager" }, { role: "admin", inactive: true },
  { role: "owner", inactive: true }, { accessError: {} }, { rolesError: {} },
]) {
  test(`invoice void/review rejects unauthorized session before privileged clients: ${JSON.stringify(options)}`, async () => {
    for (const action of ["updateInvoiceStatus", "reviewInvoicePaymentCheckout"]) {
      const f = fixture(options), result = await f.workflow[action]({ status: "idle", message: "" }, f.form);
      assert.equal(result.status, "error");
      assert.equal(f.events.includes("service-client"), false);
      assert.equal(f.events.includes("stripe-client"), false);
      assert.equal(f.calls.includes("begin_invoice_void"), false);
    }
  });
}
test("DB target authorization denies even a previously authorized role before privileged work", async () => {
  const f = fixture({ beginError: { code: "42501" } });
  assert.equal((await f.workflow.updateInvoiceStatus({}, f.form)).status, "error");
  assert.ok(f.calls.includes("begin_invoice_void"));
  assert.equal(f.events.includes("service-client"), false);
});
test("missing invoice and repeated void do not construct provider/service clients", async () => {
  for (const options of [{ beginError: { code: "P0002" } }, { alreadyVoid: true }]) {
    const f = fixture(options), result = await f.workflow.updateInvoiceStatus({}, f.form);
    assert.equal(result.status, options.alreadyVoid ? "success" : "error");
    assert.equal(f.events.includes("service-client"), false);
  }
});
test("owner and admin void through authenticated commands; no direct invoice write occurs", async () => {
  for (const role of ["owner", "admin"]) {
    const f = fixture({ role });
    assert.equal((await f.workflow.updateInvoiceStatus({}, f.form)).status, "success");
    assert.ok(f.events.indexOf("begin_invoice_void") < f.events.indexOf("service-client"));
    assert.ok(f.calls.includes("finalize_invoice_void"));
  }
});
test("invalid invoice/status never reaches financial commands", async () => {
  for (const [key, value] of [["invoice_id", ""], ["invoice_id", "not-an-invoice"], ["next_status", "paid"]]) {
    const f = fixture(); f.form.set(key, value);
    assert.equal((await f.workflow.updateInvoiceStatus({}, f.form)).status, "error");
    assert.equal(f.events.includes("service-client"), false);
  }
});

for (const type of ["checkout.session.async_payment_failed", "payment_intent.processing", "payment_intent.payment_failed"]) {
  test(`a contested webhook write returns retryable failure rather than ACK: ${type}`, async () => {
    let completed = 0, released = 0, notified = 0;
    const service = { from(table) {
      let operation;
      const q = {
        select() { operation = "select"; return q; }, insert() { operation = "insert"; return q; },
        update() { operation = "update"; return q; }, delete() { operation = "delete"; return q; },
        eq() { return q; }, in() { return q; }, is() { return q; }, maybeSingle() { return q; },
        then(resolve, reject) {
          if (table === "stripe_webhook_events" && operation === "update") completed++;
          if (table === "stripe_webhook_events" && operation === "delete") released++;
          const error = table !== "stripe_webhook_events" && operation === "update" ? { code: "55P03", message: "Lock unavailable" } : null;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      }; return q;
    } };
    const event = { id: "evt_fixture", type, data: { object: { id: "provider_fixture", metadata: { payment_channel: "ach" } } } };
    const route = load("../src/app/api/stripe/webhook/route.ts", {
      "@/lib/activity-log": { recordActivity: async () => {} },
      "@/lib/payments/card-surcharge": {}, "@/lib/payments/reconciliation": {},
      "@/lib/payments/webhook-logging": { safeWebhookLog: () => ({}), WebhookProcessingError: Error },
      "@/lib/stripe/server": { getStripeWebhookSecret: () => "fixture", getStripeServerConfig: () => ({ configured: true, stripe: { webhooks: { constructEvent: () => event } } }) },
      "@/lib/supabase/admin": { getServiceRoleClient: () => service },
      "@/lib/notifications/customer-activity": { emitCustomerActivity: async () => { notified++; } },
    });
    const response = await route.POST(new Request("http://127.0.0.1/api/stripe/webhook", { method: "POST", body: "fixture", headers: { "stripe-signature": "fixture" } }));
    assert.equal(response.status, 500); assert.equal(completed, 0); assert.equal(released, 1); assert.equal(notified, 0);
  });
}
