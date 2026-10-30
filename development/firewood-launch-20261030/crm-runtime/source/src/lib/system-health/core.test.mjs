import assert from "node:assert/strict";
import test from "node:test";
import { classifyResendCredentialCheck, getHealthTransition, sanitizeHealthSummary, uptimePercentage } from "./core.ts";
import { healthComponents } from "./registry.ts";
import { isAuthenticatedMonitoringCanary, monitoringSecretMatches } from "../security/monitoring-secret.ts";

test("component registry keys are unique and every component has a category", () => {
  assert.equal(new Set(healthComponents.map((component) => component.key)).size, healthComponents.length);
  assert.ok(healthComponents.every((component) => component.category && component.label));
});

test("critical failures open one incident only after confirmation", () => {
  assert.equal(getHealthTransition({ activeIncident: false, consecutiveFailures: 1, consecutiveSuccesses: 0, critical: true, status: "outage" }), "none");
  assert.equal(getHealthTransition({ activeIncident: false, consecutiveFailures: 2, consecutiveSuccesses: 0, critical: true, status: "outage" }), "open_incident");
  assert.equal(getHealthTransition({ activeIncident: true, consecutiveFailures: 3, consecutiveSuccesses: 0, critical: true, status: "outage" }), "update_incident");
  assert.equal(getHealthTransition({ activeIncident: true, consecutiveFailures: 0, consecutiveSuccesses: 1, critical: true, status: "operational" }), "recover");
});

test("health summaries redact endpoints and credentials", () => {
  const summary = sanitizeHealthSummary("Bearer abc123 https://private.example/path?token=secret password=hunter2");
  assert.equal(summary.includes("abc123"), false);
  assert.equal(summary.includes("private.example"), false);
  assert.equal(summary.includes("hunter2"), false);
});

test("uptime excludes unknown and not-configured samples", () => {
  const now = new Date("2026-07-28T00:00:00.000Z");
  const uptime = uptimePercentage([
    { checked_at: "2026-07-27T23:55:00.000Z", status: "operational" },
    { checked_at: "2026-07-27T23:50:00.000Z", status: "outage" },
    { checked_at: "2026-07-27T23:45:00.000Z", status: "unknown" },
  ], new Date(now.getTime() - 60 * 60_000));
  assert.equal(uptime, 50);
});

test("monitoring authorization requires an exact 32+ character secret", () => {
  const secret = "a-secure-monitoring-secret-value-123";
  assert.equal(monitoringSecretMatches(secret, secret), true);
  assert.equal(monitoringSecretMatches(secret, `${secret}x`), false);
  assert.equal(monitoringSecretMatches("short", "short"), false);
  assert.equal(isAuthenticatedMonitoringCanary(secret, secret, "contact-form-v1"), true);
  assert.equal(isAuthenticatedMonitoringCanary(secret, secret, "ordinary-submission"), false);
});

test("Resend send-only credentials are recognized without hiding invalid keys", () => {
  assert.equal(classifyResendCredentialCheck(401, "restricted_api_key").status, "operational");
  assert.equal(classifyResendCredentialCheck(403, "invalid_api_key").status, "outage");
  assert.equal(classifyResendCredentialCheck(503, null).status, "outage");
});
