import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

// Execute the actual page-loading blocks with controlled, deferred readers.
// No production credentials, imports, writes, or database calls are involved.
for (const kind of ["quotes", "invoices", "customers"]) {
  const singular = kind.slice(0, -1);
  const source = await readFile(new URL(`../src/app/admin/${kind}/[${singular}Id]/page.tsx`, import.meta.url), "utf8");
  const start = source.indexOf(kind === "customers" ? "  const [detail, leadSources" : "  const detail =");
  const end = source.indexOf(kind === "customers" ? "\n  return (" : "  const recipient =", start);
  assert.ok(start > 0 && end > start);
  const block = source.slice(start, end);
  const readers = [...new Set(block.match(/\bget[A-Z]\w+(?=\()/g))];
  const sync = new Set(["getEmailSetupState", "getStripeServerConfig"]);
  const primary = kind === "quotes" ? "getQuoteDetail" : kind === "invoices" ? "getInvoiceDetail" : "getCustomerDetail";

  async function run({ owner = true, found = true } = {}) {
    const calls = [];
    const pending = [];
    const values = {
      [`${singular}Id`]: "fixture", context: { roles: owner ? ["owner"] : ["crew"] },
      platformRoleGroups: { accessApproval: ["owner", "admin"] },
      hasAllowedRole: (roles, allowed) => roles.some(role => allowed.includes(role)),
    };
    for (const name of readers) values[name] = (...args) => {
      calls.push(name);
      if (sync.has(name)) return {};
      if (name === primary) return Promise.resolve({ data: found ? { status: "approved", customer_id: "customer", organization_id: null } : null });
      if (name === "getLeadSources" || name === "getRecurringSummaryForCustomer") return Promise.resolve({ data: [] });
      return new Promise(resolve => pending.push(() => resolve({ data: [], error: null, args })));
    };
    const execute = new Function(...Object.keys(values), `return (async()=>{${block}})()`);
    const complete = execute(...Object.values(values));
    await new Promise(resolve => setImmediate(resolve));
    const before = [...calls];
    for (const resolve of pending) resolve();
    // A serial regression must fail without hanging the test process.
    await Promise.race([complete, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Reader waterfall detected")), 100); timer.unref(); })]);
    return before;
  }

  test(`${kind}: independent readers start without awaiting each other`, async () => {
    const calls = await run();
    for (const name of readers.filter(name => !sync.has(name))) assert.ok(calls.includes(name), `${name} should have started`);
  });
  test(`${kind}: lifecycle access remains role-gated`, async () => {
    const calls = await run({ owner: false });
    assert.equal(calls.includes("getRecordLifecyclePreview"), false);
    if (kind === "invoices") assert.equal(calls.includes("getInvoicePortalTokens"), false);
  });
  test(`${kind}: missing record skips dependent histories`, async () => {
    const calls = await run({ found: false });
    for (const name of ["getEmailEvents", "getCustomerCommunications", "getRecordLifecyclePreview", "getCommunicationRecipientOptions"]) assert.equal(calls.includes(name), false);
  });
}
