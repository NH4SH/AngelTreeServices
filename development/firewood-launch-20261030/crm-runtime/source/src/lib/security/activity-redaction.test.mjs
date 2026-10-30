import assert from "node:assert/strict";
import test from "node:test";
import { redactActivityData } from "./activity-redaction.ts";

test("activity redaction removes nested credentials and portal tokens", () => {
  const result = redactActivityData({
    customer: "Donna Goodwin",
    nested: {
      portal_token: "must-not-be-stored",
      password: "must-not-be-stored",
      status: "approved",
    },
  });

  assert.deepEqual(result, {
    customer: "Donna Goodwin",
    nested: {
      portal_token: "[redacted]",
      password: "[redacted]",
      status: "approved",
    },
  });
});

test("activity redaction limits oversized values and deep snapshots", () => {
  const result = redactActivityData({
    description: "x".repeat(900),
    one: { two: { three: { four: { five: { six: "hidden" } } } } },
  });

  assert.equal(result.description.length, 801);
  assert.equal(result.one.two.three.four.five, "[truncated]");
});

test("activity redaction removes payment and request secrets", () => {
  const result = redactActivityData({
    routing_number: "000000000",
    stripe_payment_id: "provider-reference",
    raw_body: "webhook-payload",
    amount_cents: 12500,
  });

  assert.deepEqual(result, {
    routing_number: "[redacted]",
    stripe_payment_id: "[redacted]",
    raw_body: "[redacted]",
    amount_cents: 12500,
  });
});
