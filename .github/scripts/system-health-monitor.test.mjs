import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIncidentBody,
  buildRecoveryComment,
  classifyDetailedHealthResult,
  classifyRetrySequence,
  decideIssueAction,
} from "./system-health-monitor.mjs";

test("HTTP 200 is a successful detailed health run", () => {
  const result = classifyDetailedHealthResult({
    bodyText: JSON.stringify({ checked: 13, kind: "health_run", status: "operational" }),
    curlExit: 0,
    httpStatus: 200,
  });
  assert.equal(result.healthy, true);
  assert.match(result.summary, /13 components/);
});

test("intentional HTTP 503 is a monitored dependency failure", () => {
  const result = classifyDetailedHealthResult({
    bodyText: JSON.stringify({ kind: "health_run", status: "attention_required" }),
    curlExit: 0,
    httpStatus: 503,
  });
  assert.equal(result.category, "monitored_dependency");
  assert.match(result.issueTitle, /Critical monitored dependency/);
});

test("an unstructured HTTP 503 is not mislabeled as a dependency result", () => {
  const result = classifyDetailedHealthResult({ bodyText: "upstream unavailable", curlExit: 0, httpStatus: 503 });
  assert.equal(result.category, "runner_internal_failure");
  assert.match(result.summary, /without the expected completed health-run response/);
});

test("HTTP 500 is a runner-internal failure", () => {
  const result = classifyDetailedHealthResult({
    bodyText: JSON.stringify({ kind: "monitor_failure", message: "The system health runner could not complete.", status: "runner_failed" }),
    curlExit: 0,
    httpStatus: 500,
  });
  assert.equal(result.category, "runner_internal_failure");
  assert.match(result.summary, /HTTP 500/);
});

test("HTTP 401 and 403 are authentication or configuration failures", () => {
  assert.equal(classifyDetailedHealthResult({ curlExit: 0, httpStatus: 401 }).category, "authentication_configuration");
  assert.equal(classifyDetailedHealthResult({ curlExit: 0, httpStatus: 403 }).category, "authentication_configuration");
});

test("curl timeout is distinct from a connection failure", () => {
  assert.equal(classifyDetailedHealthResult({ curlExit: 28, httpStatus: 0 }).category, "timeout");
  assert.equal(classifyDetailedHealthResult({ curlExit: 7, httpStatus: 0 }).category, "connection_failure");
});

test("a successful retry is healthy and a failed retry preserves the final failure", () => {
  const recovered = classifyRetrySequence([
    { curlExit: 7, httpStatus: 0 },
    { bodyText: "{}", curlExit: 0, httpStatus: 200 },
  ]);
  const failed = classifyRetrySequence([
    { curlExit: 7, httpStatus: 0 },
    { curlExit: 28, httpStatus: 0 },
  ]);
  assert.equal(recovered.healthy, true);
  assert.equal(failed.category, "timeout");
});

test("malformed response content falls back to safe HTTP classification", () => {
  const secret = "Bearer should-never-appear";
  const result = classifyDetailedHealthResult({ bodyText: `<html>${secret}</html>`, curlExit: 0, httpStatus: 500 });
  assert.equal(result.category, "runner_internal_failure");
  assert.equal(result.summary.includes(secret), false);
});

test("incident and recovery copy is precise about scheduling and outage duration", () => {
  const body = buildIncidentBody({
    category: "runner_internal_failure",
    detectedAt: "2026-08-12T16:41:12.670Z",
    httpStatus: "500",
    observations: "Public website: passed; CRM liveness: passed; Detailed system health: failed;",
    summary: "System-health runner returned HTTP 500.",
  });
  const recovery = buildRecoveryComment("2026-08-12T16:46:00.000Z");
  assert.match(body, /GitHub Actions may run late/);
  assert.match(body, /not verified outage duration/);
  assert.match(recovery, /next successful monitor run passed/);
  assert.doesNotMatch(recovery, /recovered after/);
});

test("issue lifecycle creates, deduplicates, updates category, and recovers", () => {
  const active = { title: "[System Health] System-health runner internal failure" };
  assert.equal(decideIssueAction({ activeIssue: null, healthy: false, title: active.title }), "create");
  assert.equal(decideIssueAction({ activeIssue: active, healthy: false, title: active.title }), "none");
  assert.equal(decideIssueAction({ activeIssue: active, healthy: false, title: "[System Health] CRM liveness unavailable" }), "update_category");
  assert.equal(decideIssueAction({ activeIssue: active, healthy: true, title: active.title }), "recover");
  assert.equal(decideIssueAction({ activeIssue: null, healthy: true, title: active.title }), "none");
});

test("issue body sanitizes arbitrary supplied observations", () => {
  const body = buildIncidentBody({
    category: "test",
    detectedAt: "now",
    httpStatus: "500",
    observations: "Authorization: Bearer abc123 https://private.example/path",
    summary: "password=hunter2",
  });
  assert.equal(body.includes("abc123"), false);
  assert.equal(body.includes("private.example"), false);
  assert.equal(body.includes("hunter2"), false);
});
