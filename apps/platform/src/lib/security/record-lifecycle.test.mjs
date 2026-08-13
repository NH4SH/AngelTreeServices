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
  assert.match(source, /countRows\(supabase, "email_events", "related_job_id", recordId\)/);
  assert.doesNotMatch(source, /countRows\(supabase, "email_events", "job_id", recordId\)/);
});

test("dependency count failures disable deletion instead of silently becoming zero", () => {
  assert.match(source, /if \(error\) throw error;/);
  assert.match(source, /Permanent deletion is disabled/);
});
