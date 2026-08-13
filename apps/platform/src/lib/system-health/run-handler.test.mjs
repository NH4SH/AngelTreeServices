import assert from "node:assert/strict";
import test from "node:test";
import {
  HealthMonitorInvariantError,
  runBestEffortHealthOperation,
  runIsolatedHealthChecks,
} from "./core.ts";
import { handleSystemHealthRun } from "./run-handler.ts";

const criticalComponent = component("critical_service", true);
const optionalComponent = component("optional_service", false);

test("a complete healthy run returns 200 after all results are persisted", async () => {
  const { dependencies } = fixture();
  const response = await handleSystemHealthRun(request(), dependencies);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.kind, "health_run");
  assert.equal(body.status, "operational");
  assert.equal(body.checked, 2);
});

test("a completed run with a degraded critical dependency returns deliberate 503", async () => {
  const { dependencies } = fixture({ criticalStatus: "degraded" });
  const response = await handleSystemHealthRun(request(), dependencies);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.kind, "health_run");
  assert.equal(body.status, "attention_required");
});

test("a completed run with a critical dependency outage returns deliberate 503", async () => {
  const { dependencies } = fixture({ criticalStatus: "outage" });
  const response = await handleSystemHealthRun(request(), dependencies);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).kind, "health_run");
});

test("one component exception becomes an isolated component outage", async () => {
  const checks = await runIsolatedHealthChecks(
    [criticalComponent, optionalComponent],
    async (key) => {
      if (key === criticalComponent.key) throw new Error("provider network failure");
      return result("operational");
    },
  );

  assert.equal(checks.length, 2);
  assert.equal(checks[0].result.status, "outage");
  assert.equal(checks[0].result.summary, "The component check could not complete.");
  assert.equal(checks[1].result.status, "operational");
});

test("an explicit monitoring invariant failure aborts the run as an internal failure", async () => {
  await assert.rejects(
    runIsolatedHealthChecks([criticalComponent], async () => {
      throw new HealthMonitorInvariantError("invalid registry state");
    }),
    HealthMonitorInvariantError,
  );
});

test("health result persistence failure is classified as a monitor failure", async () => {
  const { dependencies, logs } = fixture({
    persistence: {
      complete: false,
      error: { stage: "insert_check_history", summary: "Database write failed." },
      recorded: 0,
    },
  });
  const response = await handleSystemHealthRun(request(), dependencies);
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.kind, "monitor_failure");
  assert.equal(body.status, "runner_failed");
  assert.equal(logs[0].stage, "persistence");
});

test("health registry initialization failure is classified as a monitor failure", async () => {
  const { dependencies } = fixture({
    persistence: {
      complete: false,
      error: { stage: "registry_initialization", summary: "Registry unavailable." },
      recorded: 0,
    },
  });
  const response = await handleSystemHealthRun(request(), dependencies);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).kind, "monitor_failure");
});

test("unexpected route-level exceptions return a sanitized monitor failure", async () => {
  const secret = "super-sensitive-monitor-value";
  const { dependencies, logs } = fixture({
    rateLimit: async () => {
      throw new Error(`Authorization: Bearer ${secret} https://private.example/path`);
    },
  });
  const response = await handleSystemHealthRun(request(), dependencies);
  const bodyText = await response.text();

  assert.equal(response.status, 500);
  assert.equal(bodyText.includes(secret), false);
  assert.equal(bodyText.includes("private.example"), false);
  assert.equal(logs[0].message.includes(secret), false);
  assert.equal(logs[0].message.includes("private.example"), false);
  assert.equal(logs[0].stage, "rate_limit");
});

test("a malformed check result is classified as a monitor failure", async () => {
  const { dependencies, logs } = fixture();
  dependencies.runChecks = async () => [{ component: criticalComponent, result: { status: "broken" } }];
  dependencies.expectedComponentKeys = [criticalComponent.key];

  const response = await handleSystemHealthRun(request(), dependencies);
  assert.equal(response.status, 500);
  assert.equal((await response.json()).kind, "monitor_failure");
  assert.equal(logs[0].stage, "checks");
});

test("cleanup scheduling failure is logged without changing a valid health result", async () => {
  const { dependencies, logs } = fixture({
    scheduleCleanup: () => {
      throw new Error("retention scheduler unavailable");
    },
  });
  const response = await handleSystemHealthRun(request(), dependencies);

  assert.equal(response.status, 200);
  assert.equal(logs[0].stage, "cleanup");
});

test("alert failures can be handled as best-effort operations", async () => {
  const failures = [];
  const completed = await runBestEffortHealthOperation(
    async () => {
      throw new Error("notification provider failed");
    },
    (error) => failures.push(error),
  );

  assert.equal(completed, false);
  assert.equal(failures.length, 1);
});

function fixture(options = {}) {
  const logs = [];
  const checks = [
    { component: criticalComponent, result: result(options.criticalStatus ?? "operational") },
    { component: optionalComponent, result: result("operational") },
  ];
  const persistence = options.persistence ?? { complete: true, error: null, recorded: checks.length };
  const dependencies = {
    authorize: () => true,
    createRunId: () => "test-run-id",
    expectedComponentKeys: checks.map((check) => check.component.key),
    getStorage: () => ({}),
    logFailure: (event) => logs.push(event),
    persist: async () => persistence,
    rateLimit: options.rateLimit ?? (async () => ({ allowed: true, available: true, retryAfterSeconds: 0 })),
    runChecks: async () => checks,
    scheduleCleanup: options.scheduleCleanup ?? (() => {}),
  };
  return { dependencies, logs };
}

function component(key, critical) {
  return {
    category: "crm",
    critical,
    description: `${key} check`,
    key,
    label: key,
  };
}

function result(status) {
  return { latencyMs: 10, status, summary: `${status} result` };
}

function request() {
  return new Request("https://admin.angeltreeservices.org/api/internal/system-health/run", { method: "POST" });
}
