import type { HealthComponentDefinition, HealthStatus } from "./registry";

export type HealthCheckResult = {
  details?: Record<string, string | number | boolean | null>;
  lastObservedUsageAt?: string | null;
  latencyMs?: number | null;
  status: HealthStatus;
  summary: string;
};

export type HealthTransition = "none" | "open_incident" | "update_incident" | "recover";

export class HealthMonitorInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthMonitorInvariantError";
  }
}

export function getHealthTransition({
  activeIncident,
  consecutiveFailures,
  consecutiveSuccesses,
  critical,
  status,
}: {
  activeIncident: boolean;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  critical: boolean;
  status: HealthStatus;
}): HealthTransition {
  const failing = status === "degraded" || status === "outage";
  const threshold = critical ? 2 : 3;

  if (failing && activeIncident) return "update_incident";
  if (failing && consecutiveFailures >= threshold) return "open_incident";
  if (!failing && activeIncident && status === "operational" && consecutiveSuccesses >= 1) return "recover";
  return "none";
}

export function sanitizeHealthSummary(value: unknown, fallback = "The check did not complete.") {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/https?:\/\/\S+/gi, "[endpoint]")
    .replace(/(?:bearer\s+|sk_(?:live|test)_|whsec_|re_|sbp_)[a-z0-9._-]+/gi, "[redacted]")
    .replace(/\b(?:password|secret|token|authorization|cookie|service[_-]?role)\s*[:=]\s*\S+/gi, "[redacted]")
    .trim();
  return (text || fallback).slice(0, 300);
}

export function safeHealthErrorMetadata(error: unknown) {
  const errorRecord = typeof error === "object" && error !== null
    ? error as { message?: unknown; name?: unknown }
    : null;
  const rawName = error instanceof Error ? error.name : errorRecord?.name;
  const errorName = typeof rawName === "string"
    ? rawName.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 80) || "Error"
    : "UnknownError";
  const rawMessage = error instanceof Error ? error.message : errorRecord?.message ?? error;
  const message = sanitizeHealthSummary(rawMessage);
  return { errorName, message };
}

export async function runIsolatedHealthChecks(
  components: readonly HealthComponentDefinition[],
  execute: (componentKey: string) => Promise<HealthCheckResult>,
) {
  const settled = await Promise.allSettled(components.map((component) => execute(component.key)));
  const invariantFailure = settled.find((outcome) =>
    outcome.status === "rejected" && outcome.reason instanceof HealthMonitorInvariantError);
  if (invariantFailure?.status === "rejected") throw invariantFailure.reason;

  return components.map((component, index) => {
    const outcome = settled[index];
    return {
      component,
      result: outcome.status === "fulfilled"
        ? outcome.value
        : { latencyMs: null, status: "outage" as const, summary: "The component check could not complete." },
    };
  });
}

export async function runBestEffortHealthOperation(
  operation: () => Promise<void>,
  onFailure: (error: unknown) => void,
) {
  try {
    await operation();
    return true;
  } catch (error) {
    onFailure(error);
    return false;
  }
}

export function boundedLatency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(120_000, Math.round(value)));
}

export function classifyResendCredentialCheck(statusCode: number, errorName: string | null) {
  if (statusCode >= 200 && statusCode < 300) {
    return {
      status: "operational" as const,
      summary: "Resend API is reachable without sending an email.",
    };
  }
  if (errorName === "restricted_api_key") {
    return {
      status: "operational" as const,
      summary: "Resend recognized the configured send-only credential.",
    };
  }
  if (errorName === "invalid_api_key" || errorName === "missing_api_key" || statusCode === 401 || statusCode === 403) {
    return {
      status: "outage" as const,
      summary: "Resend rejected the configured credential.",
    };
  }
  return {
    status: "outage" as const,
    summary: `Resend returned HTTP ${statusCode}.`,
  };
}

export function uptimePercentage(
  checks: Array<{ checked_at: string; status: HealthStatus }>,
  since: Date,
) {
  const relevant = checks.filter((check) =>
    new Date(check.checked_at) >= since
    && ["operational", "degraded", "outage"].includes(check.status));
  if (!relevant.length) return null;
  const successful = relevant.filter((check) => check.status === "operational").length;
  return Math.round((successful / relevant.length) * 10_000) / 100;
}
