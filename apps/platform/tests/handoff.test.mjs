import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(file, mocks = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)(name => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import ${name}`); }, module, module.exports);
  return module.exports;
}
const helpers = load("lib/next-actions.ts");
const requestId = "12345678-1234-1234-1234-123456789012";

function fixture({ role = "admin", assigneeRole = "admin", unavailable = false, lostResponse = false } = {}) {
  const saved = new Map(); const activities = []; const paths = [];
  let lose = lostResponse;
  const db = { auth: { getUser: async () => ({ data: { user: role ? { id: "actor" } : null } }) }, from(table) {
    let inserted; let updated; const filters = {};
    const query = {
      insert(value) { inserted = value; return this; }, update(value) { updated = value; return this; }, select() { return this; }, eq(k,v) { filters[k] = v; return this; },
      async single() {
        if (unavailable && table === "customers") return { data: null, error: { message: "denied" } };
        if (table !== "follow_up_tasks") return { data: { id: "customer", customer_id: "customer", organization_id: null } };
        if (inserted) {
          if (saved.has(inserted.dedupe_key)) return { data: null, error: { code: "23505" } };
          saved.set(inserted.dedupe_key, { id: "task", ...inserted });
          if (lose) { lose = false; throw Error("Connection lost after save"); }
          return { data: { id: "task" } };
        }
        if (updated) { saved.set("updated", updated); return { data: { id: "task", customer_id: "customer", job_id: "job" } }; }
        return { data: [...saved.values()].find(row => row.dedupe_key === filters.dedupe_key && row.created_by_user_id === filters.created_by_user_id) ?? null };
      }, maybeSingle() { return this.single(); },
    }; return query;
  } };
  const actions = load("lib/actions/recurring.ts", {
    "next/cache": { revalidatePath: path => paths.push(path) }, "next/navigation": { redirect() { throw Error("Unexpected redirect"); } },
    "@/lib/activity-log": { recordActivity: async (_db, event) => activities.push(event) },
    "@/lib/business-time": { getBusinessDateKey: () => "2026-09-07", parseBusinessDateTime: value => new Date(`${value}:00-04:00`) },
    "@/lib/auth/roles": { getUserRoles: async (_db,id) => [id === "actor" ? role : assigneeRole], hasAllowedRole: (roles, allowed) => roles.some(role => allowed.includes(role)), platformRoleGroups: { internalStaff: ["owner", "admin", "payroll_admin", "estimator"] } },
    "@/lib/supabase/server": { createClient: async () => db }, "@/lib/security/errors": { safeStaffMessage: text => text }, "@/lib/next-actions": helpers,
  });
  return { actions, saved, activities, paths };
}
function form() { const data = new FormData(); for (const [key,value] of Object.entries({ customer_id: "customer", title: "Call after 4 PM", description: "Waiting for HOA\napproval", due_at: "2026-09-08T16:00", request_id: requestId })) data.set(key,value); return data; }

test("admin can create a linked handoff once across repeated submits", async () => {
  const f = fixture();
  assert.equal((await f.actions.createFollowUpTask({}, form())).status, "success");
  assert.equal((await f.actions.createFollowUpTask({}, form())).status, "success");
  assert.equal(f.saved.size, 1); assert.equal(f.activities.length, 1);
  assert.equal([...f.saved.values()][0].description, "Waiting for HOA\napproval");
  assert.ok(f.paths.includes("/admin")); assert.ok(f.paths.includes("/admin/follow-ups"));
});
test("retry after a lost save response does not duplicate the task", async () => {
  const f = fixture({ lostResponse: true });
  await assert.rejects(f.actions.createFollowUpTask({}, form()));
  assert.equal((await f.actions.createFollowUpTask({}, form())).status, "success");
  assert.equal(f.saved.size, 1);
});
for (const role of ["crew", "customer", null]) test(`${role}: cannot create office handoffs`, async () => {
  const f = fixture({ role }); assert.equal((await f.actions.createFollowUpTask({}, form())).status, "error"); assert.equal(f.saved.size, 0);
});
test("inaccessible party and non-office assignee are rejected", async () => {
  const denied = fixture({ unavailable: true }); assert.equal((await denied.actions.createFollowUpTask({}, form())).status, "error");
  const f = fixture({ assigneeRole: "crew" }); const data = form(); data.set("assigned_to_user_id", "crew");
  assert.equal((await f.actions.createFollowUpTask({}, data)).status, "error"); assert.equal(f.saved.size, 0);
});
test("completion is audited; reopening clears a previous snooze", async () => {
  const f = fixture(); const data = new FormData(); data.set("task_id", "task"); data.set("task_intent", "complete");
  assert.equal((await f.actions.updateFollowUpTask({}, data)).status, "success");
  assert.equal(f.saved.get("updated").completed_by_user_id, "actor");
  data.set("task_intent", "reopen"); await f.actions.updateFollowUpTask({}, data);
  assert.equal(f.saved.get("updated").snoozed_until, null);
  assert.ok(f.paths.includes("/admin/jobs/job"));
});
test("due calculations respect snoozes; links prefer the specific record and organization", () => {
  assert.equal(helpers.nextActionHref({ organization_id: "org" }), "/admin/organizations/org");
  assert.equal(helpers.nextActionHref({ customer_id: "c", quote_id: "q" }), "/admin/quotes/q");
  assert.equal(helpers.nextActionDue({ due_at: "2026-09-01T12:00:00Z", snoozed_until: "2026-10-01T12:00:00Z" }), Date.parse("2026-10-01T12:00:00Z"));
  assert.notEqual(helpers.followUpRequestKey("one", requestId), helpers.followUpRequestKey("two", requestId));
  assert.equal(helpers.followUpRequestKey("one", "invalid"), null);
});

function readerFixture(role = "admin", rows = []) {
  const calls = [];
  const query = { then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
  for (const name of ["select", "eq", "in", "or", "order", "limit"]) query[name] = (...args) => { calls.push([name, ...args]); return query; };
  const db = { auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) }, from: table => { calls.push(["from", table]); return query; } };
  const readers = load("lib/data/next-actions.ts", {
    "server-only": {}, "react": { cache: fn => fn }, "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/auth/roles": { getUserRoles: async () => [role], hasAllowedRole: (roles, allowed) => roles.some(role => allowed.includes(role)), platformRoleGroups: { internalStaff: ["admin", "owner", "payroll_admin", "estimator"] } },
  });
  return { readers, calls };
}
test("handoff reads are staff-gated and filtered before the bounded limit", async () => {
  const blocked = readerFixture("crew");
  assert.ok((await blocked.readers.getNextActions()).error); assert.equal(blocked.calls.length, 0);
  const allowed = readerFixture(); await allowed.readers.getNextActions("customer_id", "customer", "manager", true);
  assert.ok(allowed.calls.some(call => call[0] === "eq" && call[1] === "assigned_to_user_id" && call[2] === "manager"));
  assert.ok(allowed.calls.some(call => call[0] === "eq" && call[1] === "customer_id" && call[2] === "customer"));
  assert.ok(allowed.calls.some(call => call[0] === "in" && call[1] === "status" && !call[2].includes("completed")));
  assert.ok(allowed.calls.some(call => call[0] === "or" && call[1].includes("snoozed_until")));
  assert.deepEqual(allowed.calls.at(-1), ["limit", 20]);
});
test("completed-estimate preview excludes existing drafts, job proposals, and archived jobs", async () => {
  const plain = { id: "needs-proposal", proposals: [], jobs: null };
  const f = readerFixture("admin", [plain, { ...plain, id: "draft", proposals: [{ id: "quote" }] }, { ...plain, id: "job-quote", jobs: { archived_at: null, source_quote_id: null, quotes: [{ id: "quote" }] } }, { ...plain, id: "archived", jobs: { archived_at: "2026-01-01", source_quote_id: null, quotes: [] } }]);
  const result = await f.readers.getCompletedEstimatesWithoutProposal();
  assert.deepEqual(result.data.map(row => row.id), ["needs-proposal"]);
  assert.ok(f.calls.some(call => call[0] === "eq" && call[1] === "status" && call[2] === "completed"));
  assert.deepEqual(f.calls.at(-1), ["limit", 100]);
});
test("dashboard job queues exclude actual bookings and existing nonvoid invoices", async () => {
  const source = readFileSync(new URL("../src/lib/data/jobs.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("jobs.ts", source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "getDashboardJobSummaries");
  const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const queries = [];
  const db = { from() { const calls = []; queries.push(calls); const query = { then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } }; for (const name of ["select", "is", "eq", "neq", "in", "gte", "lt", "order", "limit"]) query[name] = (...args) => { calls.push([name, ...args]); return query; }; return query; } };
  const module = { exports: {} };
  new Function("exports", "createClient", "getBusinessDayRange", js)(module.exports, async () => db, () => ({ start: new Date(), endExclusive: new Date() }));
  await module.exports.getDashboardJobSummaries();
  assert.ok(queries[1].some(call => call[0] === "eq" && call[1] === "status" && call[2] === "new_lead"));
  for (const index of [1, 2]) for (const relation of ["booked", "legacy"]) assert.ok(queries[index].some(call => call[0] === "is" && call[1] === relation && call[2] === null));
  assert.ok(queries[3].some(call => call[0] === "neq" && call[1] === "billed.status" && call[2] === "void"));
  assert.ok(queries[3].some(call => call[0] === "is" && call[1] === "billed" && call[2] === null));
  assert.ok(queries[2][0][1].includes("schedule_events!schedule_events_job_id_fkey()"));
});
