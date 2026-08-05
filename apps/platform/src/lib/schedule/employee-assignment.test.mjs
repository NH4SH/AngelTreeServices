import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
