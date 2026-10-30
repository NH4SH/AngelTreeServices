import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../actions/record-lifecycle.ts", import.meta.url), "utf8");

test("record lifecycle previews authorize staff before inspecting server-only dependencies", () => {
  const authorization = source.indexOf("hasAllowedRole(roles, platformRoleGroups.accessApproval)");
  const serviceClient = source.indexOf("getServiceRoleClient() ?? authClient");

  assert.ok(authorization >= 0);
  assert.ok(serviceClient > authorization);
  assert.match(source, /invoice_checkout_sessions/);
});

test("job email dependencies use the current email_events relationship", () => {
  assert.match(source, /from\("email_events"\)\.select\("id, email_type"\)\.eq\("related_job_id", recordId\)/);
  assert.doesNotMatch(source, /from\("email_events"\).*\.eq\("job_id", recordId\)/);
});

test("automatic internal lead notices do not masquerade as customer delivery history", () => {
  assert.match(source, /event\.email_type !== "lead_internal_notice"/);
  assert.match(source, /communications \|\| protectedEmailEvents/);
});

test("dependency count failures disable deletion instead of silently becoming zero", () => {
  assert.match(source, /if \(error\) throw error;/);
  assert.match(source, /Permanent deletion is disabled/);
});

test("untouched generated closeout scaffolding does not block disposable lead deletion", () => {
  assert.match(source, /countProtectedCloseoutHistory\(supabase, \[recordId\]\)/);
  assert.doesNotMatch(source, /countRows\(supabase, "job_closeouts", "job_id", recordId\)/);
  assert.match(source, /job_closeout_submissions/);
  assert.match(source, /hasMeaningfulCloseoutRecord/);
  assert.match(source, /hasMeaningfulCloseoutChild/);
});
