import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAppBaseUrl } from "./app-base-url.ts";
import { safeLocalRedirect } from "./local-redirect.ts";

const redirectCases = [
  ["/admin", "/admin"],
  ["/admin/jobs?id=123#work", "/admin/jobs?id=123#work"],
  ["//evil.example", "/admin"],
  ["/\\evil.example", "/admin"],
  ["%2f%2fevil.example", "/admin"],
  ["/%5cevil.example", "/admin"],
  ["https://evil.example", "/admin"],
  ["javascript:alert(1)", "/admin"],
  ["/admin\nSet-Cookie: bad=1", "/admin"],
  ["/%E0%A4%A", "/admin"],
];

for (const [input, expected] of redirectCases) {
  test(`local redirect policy: ${JSON.stringify(input)}`, () => {
    assert.equal(safeLocalRedirect(input), expected);
  });
}

test("production base URL accepts only the canonical HTTPS origin", () => {
  assert.equal(
    normalizeAppBaseUrl("https://admin.angeltreeservices.org", "production"),
    "https://admin.angeltreeservices.org",
  );
  assert.equal(normalizeAppBaseUrl("http://admin.angeltreeservices.org", "production"), null);
  assert.equal(normalizeAppBaseUrl("https://evil.example", "production"), null);
  assert.equal(normalizeAppBaseUrl("https://admin.angeltreeservices.org/path", "production"), null);
  assert.equal(normalizeAppBaseUrl("https://user:pass@admin.angeltreeservices.org", "production"), null);
});

test("development base URL permits loopback only", () => {
  assert.equal(normalizeAppBaseUrl("http://localhost:3000", "development"), "http://localhost:3000");
  assert.equal(normalizeAppBaseUrl("http://192.168.1.2:3000", "development"), null);
});

test('optimized Firewood QA requires a scoped test profile and a loopback backend',()=>{
 const manifest={staging:null},env={FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED:'1',FIREWOOD_HANDOFF_V2_ENVIRONMENT_ID:'ats_fwhandoff_home_012345abcdef',STRIPE_SECRET_KEY:'rk_test_SYNTHETIC',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3230'};
 assert.equal(normalizeAppBaseUrl('http://127.0.0.1:3228','production',{manifest,env}),'http://127.0.0.1:3228');
 for(const patch of[{FIREWOOD_HANDOFF_V2_COLLECTOR_TEST_ENABLED:'0'},{FIREWOOD_HANDOFF_V2_ENVIRONMENT_ID:'production'},{STRIPE_SECRET_KEY:'rk_live_SYNTHETIC'},{NEXT_PUBLIC_SUPABASE_URL:'https://hosted.example.invalid'},{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:3230/path'},{APP_ENV:'staging'}])assert.equal(normalizeAppBaseUrl('http://127.0.0.1:3228','production',{manifest,env:{...env,...patch}}),null);
 for(const origin of['http://192.168.1.170:3228','https://evil.invalid','http://127.0.0.1:3228/?token=foo'])assert.equal(normalizeAppBaseUrl(origin,'production',{manifest,env}),null);
});
