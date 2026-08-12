import assert from "node:assert/strict";
import test from "node:test";
import { contentSecurityPolicy, platformSecurityHeaders, privateNoStoreHeaders } from "./headers.ts";

test("platform headers block framing and limit browser capabilities", () => {
  const headers = new Map(platformSecurityHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(headers.get("permissions-policy"), /camera=\(\)/);
  assert.equal(headers.has("content-security-policy-report-only"), false);
  assert.equal(headers.get("content-security-policy"), contentSecurityPolicy);
  assert.match(contentSecurityPolicy, /script-src 'self' 'unsafe-inline'/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicy, /https:\/\/js\.stripe\.com/);
  assert.match(contentSecurityPolicy, /https:\/\/\*\.supabase\.co/);
  assert.match(contentSecurityPolicy, /https:\/\/maps\.googleapis\.com/);
  assert.match(contentSecurityPolicy, /https:\/\/places\.googleapis\.com/);
});

test("private route headers disable browser and intermediary caching", () => {
  const headers = new Map(privateNoStoreHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.match(headers.get("cache-control"), /private/);
  assert.match(headers.get("cache-control"), /no-store/);
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
});
