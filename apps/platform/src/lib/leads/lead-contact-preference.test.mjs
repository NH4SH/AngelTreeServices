// Local parser integration only: no network, DB, email, or payment access.
// Run after installing the module and applying intake.patch.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import { contactPreferenceError } from "./lead-follow-up-policy.mjs";
const source = fs.readFileSync(new URL("./intake.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
let databaseCalls = 0;
const module = { exports: {} };
const safeRequire = id => {
  if (id === "server-only") return {};
  if (id === "node:crypto") return { createHash };
  if (id === "./lead-follow-up-policy.mjs") return { contactPreferenceError };
  if (id === "@/lib/supabase/admin") return { getServiceRoleClient() {
    databaseCalls++; throw new Error("Parser tests must not access a database.");
  } };
  throw new Error("Unexpected parser dependency: " + id);
};
const evaluate = vm.runInNewContext("(function(require,module,exports) {\n" + compiled.outputText + "\n})", { URL });
evaluate(safeRequire, module, module.exports);
const parse = module.exports.parsePublicLeadSubmission;
const make = extra => new Map(Object.entries({
  name: "Synthetic Fixture", phone: "5405550123", address: "123 Fixture Road, Example, VA 00000",
  message: "Synthetic project details for parser verification", service: "Tree Care",
  customer_type: "Homeowner", submission_id: "11111111-1111-4111-8111-111111111111",
  preferred_contact_method: "email", email: "", ...extra
}));
const submit = extra => parse({ formData: async () => make(extra) });
test("email preference without address is rejected before persistence", async () => {
  const r = await submit({}); assert.equal(r.data, null); assert.equal(r.spam, false);
  assert.match(r.error, /email address/);
});
test("email preference with whitespace address is rejected", async () => assert.equal((await submit({ email: "   " })).data, null));
test("email preference with usable address survives normalization", async () => {
  const r = await submit({ email: " PERSON@EXAMPLE.TEST " }); assert.equal(r.error, null);
  assert.equal(r.data.email, "person@example.test"); assert.equal(r.data.preferredContactMethod, "email");
});
for (const preferred_contact_method of ["phone", "text", ""]) test("absent optional email works for " + (preferred_contact_method || "no preference"), async () => {
  const r = await submit({ preferred_contact_method }); assert.equal(r.error, null); assert.ok(r.data);
});
test("invalid supplied email remains rejected for phone preference", async () => {
  assert.equal((await submit({ preferred_contact_method: "phone", email: "bad" })).data, null);
});
test("honeypot is skipped before validation", async () => {
  const r = await submit({ "bot-field": "synthetic-bot" }); assert.equal(r.spam, true); assert.equal(r.data, null); assert.equal(r.error, null);
});
test("existing property validation remains", async () => assert.equal((await submit({ email: "person@example.test", address: "" })).data, null));
test("parser tests never touch persistence", () => assert.equal(databaseCalls, 0));
