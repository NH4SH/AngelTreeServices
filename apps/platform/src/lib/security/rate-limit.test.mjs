import assert from "node:assert/strict";
import test from "node:test";
import { hashRateLimitKey, trustedClientIp } from "./rate-limit-core.ts";

test("rate-limit identifiers are deterministic hashes without raw token or IP", () => {
  const hash = hashRateLimitKey(["198.51.100.12", "customer-portal-token"]);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes("198.51.100.12"), false);
  assert.equal(hash.includes("customer-portal-token"), false);
  assert.equal(hash, hashRateLimitKey(["198.51.100.12", "customer-portal-token"]));
});

test("Netlify's direct client address takes precedence over forwarded chains", () => {
  const headers = new Headers({
    "x-nf-client-connection-ip": "203.0.113.10",
    "x-forwarded-for": "198.51.100.2, 10.0.0.1",
  });
  assert.equal(trustedClientIp(headers), "203.0.113.10");
});

test("malformed client addresses are ignored", () => {
  assert.equal(trustedClientIp(new Headers({ "x-forwarded-for": "not-an-ip" })), null);
});
