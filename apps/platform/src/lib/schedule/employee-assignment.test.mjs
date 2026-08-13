import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  filterEmployeeOptions,
  normalizeEmployeeSelection,
  toggleEmployeeSelection,
} from "./employee-selection.ts";

const repoRoot = new URL("../../../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, repoRoot), "utf8");
}

test("schedule selectors use active operational employees without requiring login access", async () => {
  const scheduleData = await source("apps/platform/src/lib/data/schedule.ts");
  const scheduleActions = await source("apps/platform/src/app/admin/schedule/actions.ts");
  assert.match(scheduleData, /from\("employee_records"\)/);
  assert.match(scheduleData, /\.eq\("is_active", true\)/);
  assert.match(scheduleActions, /employee_id: assignedUserId/);
});

test("multi-day work sessions persist employee IDs through the compatibility RPC", async () => {
  const jobActions = await source("apps/platform/src/app/admin/jobs/actions.ts");
  const jobData = await source("apps/platform/src/lib/data/jobs.ts");
  const migration = await source("supabase/migrations/20260805024208_employee_assignment_identity.sql");
  assert.match(jobActions, /rpc\("save_job_employee_work_sessions"/);
  assert.match(jobData, /eq\("assigned_crew_employee_id", assignedCrewId\)/);
  assert.match(migration, /insert into public\.schedule_event_assignments\(event_id, employee_id, assignment_role\)/);
  assert.match(migration, /assigned_crew_employee_id/);
});

test("the additive employee scheduling wrapper uses unambiguous local identifiers", async () => {
  const migration = await source("supabase/migrations/20260810225226_align_employee_work_session_identifiers.sql");
  assert.match(migration, /target_event_id/);
  assert.match(migration, /target_employee_id/);
  assert.doesNotMatch(migration, /where assignment\.event_id = event_id/);
  assert.doesNotMatch(migration, /values \(event_id, employee_id,/);
});

test("admin promotion stays behind the existing audited role RPC", async () => {
  const employeeActions = await source("apps/platform/src/app/admin/employees/actions.ts");
  assert.match(employeeActions, /getStaffContext\(true\)/);
  assert.match(employeeActions, /rpc\("replace_platform_user_roles"/);
  assert.doesNotMatch(employeeActions, /user_metadata/);
});

test("employee records remain independent from Supabase Auth", async () => {
  const employeeFoundation = await source("supabase/migrations/20260716235514_employee_onboarding_training_compliance.sql");
  const assignmentMigration = await source("supabase/migrations/20260805024208_employee_assignment_identity.sql");
  assert.match(employeeFoundation, /auth_user_id uuid unique references public\.profiles\(id\) on delete set null/);
  assert.doesNotMatch(assignmentMigration, /auth\.users/);
});

test("employee selection toggles one or many employees without modifier keys", () => {
  const one = toggleEmployeeSelection([], "employee-noel");
  const many = toggleEmployeeSelection(toggleEmployeeSelection(one, "employee-saul"), "employee-angel");
  assert.deepEqual(one, ["employee-noel"]);
  assert.deepEqual(many, ["employee-noel", "employee-saul", "employee-angel"]);
});

test("deselecting one employee preserves the other selected employees", () => {
  const selected = ["employee-noel", "employee-saul", "employee-angel"];
  assert.deepEqual(toggleEmployeeSelection(selected, "employee-saul"), ["employee-noel", "employee-angel"]);
});

test("preselected and submitted employee IDs remain ordered and duplicate-free", () => {
  assert.deepEqual(
    normalizeEmployeeSelection(["employee-noel", "employee-saul", "employee-noel", "", "employee-angel"]),
    ["employee-noel", "employee-saul", "employee-angel"],
  );
  assert.deepEqual(normalizeEmployeeSelection([]), []);
});

test("employee search matches names, email addresses, and roles", () => {
  const employees = [
    { id: "employee-noel", full_name: "Noel Sierra", email: "noel@example.com", role_names: ["admin"] },
    { id: "employee-saul", full_name: "Saul Hernandez", email: "saul@example.com", role_names: ["crew"] },
  ];
  assert.deepEqual(filterEmployeeOptions(employees, "noel admin").map((employee) => employee.id), ["employee-noel"]);
  assert.deepEqual(filterEmployeeOptions(employees, "crew").map((employee) => employee.id), ["employee-saul"]);
});

test("schedule assignment surfaces use the reusable checkbox picker and preserve payloads", async () => {
  const picker = await source("apps/platform/src/components/employee-multi-select.tsx");
  const manager = await source("apps/platform/src/components/job-schedule-manager.tsx");
  const eventForm = await source("apps/platform/src/app/admin/schedule/ScheduleEventForm.tsx");
  const eventActions = await source("apps/platform/src/app/admin/schedule/actions.ts");
  const styles = await source("apps/platform/src/styles/globals.css");

  assert.match(picker, /type="checkbox"/);
  assert.match(picker, /name=\{name\}/);
  assert.match(picker, /aria-label=\{`Remove \$\{employeeLabel\}`\}/);
  assert.match(picker, /normalizeEmployeeSelection\(defaultSelectedIds\)/);
  assert.match(picker, />Clear all</);
  assert.match(picker, />Select all</);
  assert.doesNotMatch(manager, /<select[^>]*multiple/);
  assert.doesNotMatch(eventForm, /<select[^>]*multiple/);
  assert.match(manager, /name="sessions_json"/);
  assert.match(manager, /assigned_user_ids: employeeIds/);
  assert.match(eventActions, /\.getAll\("assigned_user_ids"\)/);
  assert.match(eventActions, /employee_id: assignedUserId/);
  assert.match(styles, /\.employee-selection-option\s*\{[^}]*min-height:\s*48px/s);
  assert.match(styles, /\.employee-selection-chips\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.employee-multi-select/);
});
