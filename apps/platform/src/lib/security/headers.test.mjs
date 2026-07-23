import assert from "node:assert/strict";
import test from "node:test";
import { contentSecurityPolicyReportOnly, platformSecurityHeaders, privateNoStoreHeaders } from "./headers.ts";

test("platform headers block framing and limit browser capabilities", () => {
  const headers = new Map(platformSecurityHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.match(headers.get("permissions-policy"), /camera=\(\)/);
  assert.match(contentSecurityPolicyReportOnly, /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicyReportOnly, /https:\/\/js\.stripe\.com/);
  assert.match(contentSecurityPolicyReportOnly, /https:\/\/\*\.supabase\.co/);
});

test("private route headers disable browser and intermediary caching", () => {
  const headers = new Map(privateNoStoreHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.match(headers.get("cache-control"), /private/);
  assert.match(headers.get("cache-control"), /no-store/);
  assert.equal(headers.get("referrer-policy"), "no-referrer");
});
