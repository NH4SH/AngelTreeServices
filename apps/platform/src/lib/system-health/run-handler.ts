import type { HealthCheckResult } from "./core.ts";
import { safeHealthErrorMetadata } from "./core.ts";
import type { HealthComponentDefinition } from "./registry";

export type HealthRunCheck = {
  component: HealthComponentDefinition;
  result: HealthCheckResult;
};

export type HealthPersistenceResult = {
  complete: boolean;
  error: { stage: string; summary: string } | null;
  recorded: number;
};

type RateLimitResult = {
  allowed: boolean;
  available: boolean;
  retryAfterSeconds: number;
};

type HealthRunStage = "authorization" | "rate_limit" | "storage" | "checks" | "persistence" | "cleanup";

export type HealthRunDependencies<Storage> = {
  authorize: (request: Request) => boolean;
  createRunId: () => string;
  expectedComponentKeys: readonly string[];
  getStorage: () => Storage | null;
  logFailure: (event: {
    errorName: string;
    message: string;
    runId: string;
    stage: HealthRunStage;
    timestamp: string;
  }) => void;
  persist: (storage: Storage, checks: HealthRunCheck[]) => Promise<HealthPersistenceResult>;
  rateLimit: (request: Request) => Promise<RateLimitResult>;
  runChecks: () => Promise<HealthRunCheck[]>;
  scheduleCleanup: (storage: Storage, runId: string) => void;
};

export async function handleSystemHealthRun<Storage>(
  request: Request,
  dependencies: HealthRunDependencies<Storage>,
) {
  const runId = dependencies.createRunId();
  let stage: HealthRunStage = "authorization";

  try {
    if (!dependencies.authorize(request)) {
      return json({ kind: "request_rejected", message: "Unauthorized.", ok: false }, 401);
    }

    stage = "rate_limit";
    const rateLimit = await dependencies.rateLimit(request);
    if (!rateLimit.available) {
      return monitorFailure(dependencies, runId, stage, new Error("Shared rate limiting is unavailable."));
    }
    if (!rateLimit.allowed) {
      return json(
        { kind: "request_rejected", message: "Health checks are temporarily rate limited.", ok: false },
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    stage = "storage";
    const storage = dependencies.getStorage();
    if (!storage) {
      return monitorFailure(dependencies, runId, stage, new Error("Health persistence is not configured."));
    }

    stage = "checks";
    const checks = await dependencies.runChecks();
    validateCompleteHealthRun(checks, dependencies.expectedComponentKeys);

    stage = "persistence";
    const stored = await dependencies.persist(storage, checks);
    if (stored.error || !stored.complete || stored.recorded !== checks.length) {
      const reason = stored.error?.summary ?? `Recorded ${stored.recorded} of ${checks.length} health results.`;
      return monitorFailure(dependencies, runId, stage, new Error(reason));
    }

    stage = "cleanup";
    try {
      dependencies.scheduleCleanup(storage, runId);
    } catch (error) {
      logFailure(dependencies, runId, stage, error);
    }

    const criticalFailure = checks.some(({ component, result }) =>
      component.critical && (result.status === "outage" || result.status === "degraded"));
    return json(
      {
        checked: checks.length,
        kind: "health_run",
        ok: !criticalFailure,
        runId,
        status: criticalFailure ? "attention_required" : "operational",
      },
      criticalFailure ? 503 : 200,
    );
  } catch (error) {
    return monitorFailure(dependencies, runId, stage, error);
  }
}

export function validateCompleteHealthRun(
  checks: HealthRunCheck[],
  expectedComponentKeys: readonly string[],
) {
  if (!Array.isArray(checks) || checks.length !== expectedComponentKeys.length) {
    throw new Error("The health runner returned an incomplete result set.");
  }

  const expected = new Set(expectedComponentKeys);
  const observed = new Set<string>();
  const validStatuses = new Set(["operational", "degraded", "outage", "unknown", "not_configured"]);
  for (const check of checks) {
    const key = check?.component?.key;
    if (!key || !expected.has(key) || observed.has(key)) {
      throw new Error("The health runner returned an invalid component result.");
    }
    if (!check.result || !validStatuses.has(check.result.status) || typeof check.result.summary !== "string") {
      throw new Error("The health runner returned a malformed check result.");
    }
    observed.add(key);
  }
}

function monitorFailure<Storage>(
  dependencies: HealthRunDependencies<Storage>,
  runId: string,
  stage: HealthRunStage,
  error: unknown,
) {
  logFailure(dependencies, runId, stage, error);
  return json(
    {
      kind: "monitor_failure",
      message: "The system health runner could not complete.",
      ok: false,
      runId,
      status: "runner_failed",
    },
    500,
  );
}

function logFailure<Storage>(
  dependencies: HealthRunDependencies<Storage>,
  runId: string,
  stage: HealthRunStage,
  error: unknown,
) {
  const metadata = safeHealthErrorMetadata(error);
  try {
    dependencies.logFailure({
      ...metadata,
      runId,
      stage,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Logging must never replace the sanitized monitor response with another failure.
  }
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0", ...headers },
    status,
  });
}
