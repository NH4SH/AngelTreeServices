import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(file, deps = {}) {
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((name) => { assert.ok(name in deps, `Unexpected import ${name}`); return deps[name]; }, module, module.exports);
  return module.exports;
}
const { employeeClockState, employeeActivityPresentation } = load("../src/lib/employee-presentation.ts");
const active = { authId: "linked", active: true, archived: false, employmentStatus: "active", profileStatus: "active", permission: true, eligibleRole: true };
test("Clock display respects inactive accounts, roles and hidden permission data", () => {
  assert.equal(employeeClockState(active), "enabled");
  for (const change of [{ active: false }, { archived: true }, { employmentStatus: "separated" }, { profileStatus: "disabled" }, { permission: false }, { eligibleRole: false }]) {
    assert.equal(employeeClockState({ ...active, ...change }), "disabled");
  }
  for (const change of [{ permission: undefined }, { permission: null }, { profileStatus: undefined }, { eligibleRole: undefined }]) {
    assert.equal(employeeClockState({ ...active, ...change }), "unavailable");
  }
  assert.equal(employeeClockState({ ...active, authId: null }), "no_account");
});
test("History shows actor, reason and recorded changes without arbitrary technical metadata", () => {
  const entry = employeeActivityPresentation({ event_type: "employee_marked_inactive", actor_user_id: "actor", actorName: "Demo Owner", metadata_json: {
    reason: "Season ended", secret: "must-not-render", session_cleanup_reason: "must-not-render",
    previous_state: { employment_status: "active", is_active: true, profile_status: "active", time_clock_enabled: true },
    resulting_state: { employment_status: "inactive", is_active: false, profile_status: "disabled", time_clock_enabled: false, roles_retained: true, session_cleanup: "must-not-render" },
  }});
  assert.equal(entry.actor, "Demo Owner");
  assert.equal(entry.reason, "Season ended");
  assert.deepEqual(entry.changes, [
    { label: "Employment status", before: "Active", after: "Inactive" },
    { label: "CRM access", before: "Enabled", after: "Disabled" },
    { label: "Time-clock permission", before: "Enabled", after: "Disabled" },
  ]);
  assert.doesNotMatch(JSON.stringify(entry), /must-not-render/);
  assert.equal(entry.rolesRetained, true);
});
test("Older and partially visible history has honest fallbacks", () => {
  const entry = employeeActivityPresentation({ event_type: "employee_edited", actor_user_id: "hidden", metadata_json: null });
  assert.match(entry.actor, /name unavailable/);
  assert.equal(entry.title, "Employee Edited");
  assert.deepEqual(entry.changes, []);
  assert.equal(entry.reason, "");
  assert.equal(employeeActivityPresentation({ actor_label: "Earlier administrator" }).actor, "Earlier administrator");
  const malformed = employeeActivityPresentation({ metadata_json: { previous_state: { employment_status: "jwt-secret" }, resulting_state: { employment_status: "active" } } });
  assert.deepEqual(malformed.changes, [{ label: "Employment status", before: "Not recorded", after: "Active" }]);
});
function actionFixture({ allowed = true, result = { data: { id: "task" }, error: null } } = {}) {
  const writes = [], audit = [], paths = [];
  const query = {
    update(values) { writes.push({ values, filters: [] }); return this; },
    eq(key, value) { writes.at(-1).filters.push([key, value]); return this; },
    select(value) { assert.equal(value, "id"); return this; },
    async maybeSingle() { return result; },
  };
  const actions = load("../src/app/admin/employees/actions.ts", {
    "next/cache": { revalidatePath: (path) => paths.push(path) }, "next/navigation": {},
    "@/lib/activity-log": { recordActivity: async (_client, event) => audit.push(event) }, "@/lib/business-time": {},
    "@/lib/auth/roles": { getCurrentUserRolesFromClient: async () => allowed ? ["admin"] : ["crew"], hasAllowedRole: (roles, group) => roles.some((role) => group.includes(role)), platformRoleGroups: { accessApproval: ["owner", "admin"] } },
    "@/lib/data/employees": {}, "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) }, from: (table) => { assert.equal(table, "employee_separation_items"); return query; } }) },
    "@/lib/security/attachment-scan-service": {}, "@/lib/security/upload-validation": {}, "@/lib/security/errors": { safeStaffMessage: (message) => message },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ employee_id: "employee", item_id: "task", completion_status: "complete", notes: "Returned PPE" })) form.set(key, value);
  return { run: () => actions.updateSeparationItem({ status: "idle", message: "" }, form), writes, audit, paths, form };
}
test("Offboarding task failure and zero-row results cannot emit successful audit or revalidation", async () => {
  for (const result of [{ data: null, error: { message: "Database failure" } }, { data: null, error: null }]) {
    const f = actionFixture({ result });
    const state = await f.run();
    assert.equal(state.status, "error");
    assert.equal(f.audit.length, 0);
    assert.equal(f.paths.length, 0);
    assert.equal(f.form.get("notes"), "Returned PPE");
  }
});
test("Offboarding task save stays scoped to employee and task, retains attribution and logs only after success", async () => {
  const f = actionFixture();
  assert.equal((await f.run()).status, "success");
  assert.deepEqual(f.writes[0].filters, [["id", "task"], ["employee_id", "employee"]]);
  assert.equal(f.writes[0].values.completed_by_user_id, "admin");
  assert.equal(f.writes[0].values.notes, "Returned PPE");
  assert.equal(f.audit.length, 1);
  assert.ok(f.paths.includes("/admin/employees/employee"));
  f.form.set("completion_status", "incomplete");
  await f.run();
  assert.equal(f.writes[1].values.completed_at, null);
  assert.equal(f.writes[1].values.completed_by_user_id, null);
});
test("Offboarding task updates retain owner/admin authorization and status validation", async () => {
  const denied = actionFixture({ allowed: false });
  assert.equal((await denied.run()).status, "error");
  assert.equal(denied.writes.length, 0);
  const invalid = actionFixture(); invalid.form.set("completion_status", "invalid");
  assert.equal((await invalid.run()).status, "error");
  assert.equal(invalid.writes.length, 0);
});

test("Directory time-clock reads stay within authorized employees and retain multiple role rows", async () => {
  const presentation = load("../src/lib/employee-presentation.ts");
  for (const visibleTimer of [true, false]) {
    const reads = [];
    const data = load("../src/lib/data/employees.ts", {
      "server-only": {}, "@/lib/employee-presentation": presentation,
      "@/lib/auth/roles": { platformRoleGroups: { timeClockEligible: ["owner", "admin", "payroll_admin", "estimator", "crew"] } },
      "@/lib/security/errors": {}, "@/lib/business-time": {},
      "@/lib/supabase/server": { createClient: async () => ({
        rpc: async (name) => { assert.equal(name, "get_employee_operational_directory"); return { data: { employees: [{ id: "visible-employee", auth_user_id: "visible-user", is_active: true, employment_status: "active", archived_at: null }] }, error: null }; },
        from: (table) => ({ select: () => ({
          in: async (column, ids) => {
            reads.push({ table, column, ids });
            return { error: null, data: table === "user_roles" ? [{ user_id: "visible-user", roles: { name: "crew" } }, { user_id: "visible-user", roles: { name: "customer" } }] : table === "profiles" ? [{ id: "visible-user", status: "active" }] : visibleTimer ? [{ user_id: "visible-user", is_enabled: true }] : [] };
          },
          eq: async () => ({ data: [], error: null }),
        }) }),
      }) },
    });
    const result = await data.getEmployees();
    assert.equal(result.error, null);
    assert.deepEqual(result.data[0].roleNames, ["crew", "customer"]);
    assert.equal(result.data[0].timeClockState, visibleTimer ? "enabled" : "unavailable");
    assert.deepEqual(reads.find((read) => read.table === "time_clock_permissions"), { table: "time_clock_permissions", column: "user_id", ids: ["visible-user"] });
  }
});
