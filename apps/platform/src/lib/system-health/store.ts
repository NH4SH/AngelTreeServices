import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitSystemHealthAlert } from "./alerts";
import {
  boundedLatency,
  getHealthTransition,
  runBestEffortHealthOperation,
  safeHealthErrorMetadata,
  sanitizeHealthSummary,
  type HealthCheckResult,
} from "./core";
import { healthComponents, type HealthComponentDefinition } from "./registry";

type ServiceClient = SupabaseClient<any, "public", any>;
type PersistenceFailure = { stage: string; summary: string };

export async function initializeHealthRegistry(supabase: ServiceClient) {
  try {
    const { error } = await supabase.from("system_health_components").upsert(
      healthComponents.map((component) => ({
        category: component.category,
        component_key: component.key,
        critical: component.critical,
        label: component.label,
      })),
      { onConflict: "component_key" },
    );
    return error ? persistenceFailure("registry_initialization", error) : null;
  } catch (error) {
    return persistenceFailure("registry_initialization", error);
  }
}

export async function persistHealthRun(
  supabase: ServiceClient,
  checks: Array<{ component: HealthComponentDefinition; result: HealthCheckResult }>,
  source: "scheduled" | "manual",
) {
  const registryError = await initializeHealthRegistry(supabase);
  if (registryError) return { complete: false, error: registryError, recorded: 0 };

  let recorded = 0;
  for (const check of checks) {
    let error: PersistenceFailure | null;
    try {
      error = await persistHealthCheck(supabase, check.component, check.result, source);
    } catch (caught) {
      error = persistenceFailure(`component:${check.component.key}`, caught);
    }
    if (error) return { complete: false, error, recorded };
    recorded += 1;
  }

  return { complete: recorded === checks.length, error: null, recorded };
}

export async function pruneHealthHistory(supabase: ServiceClient) {
  try {
    const retentionBefore = new Date(Date.now() - 35 * 24 * 60 * 60_000).toISOString();
    const incidentRetentionBefore = new Date(Date.now() - 365 * 24 * 60 * 60_000).toISOString();
    const [checks, incidents] = await Promise.all([
      supabase.from("system_health_checks").delete().lt("checked_at", retentionBefore),
      supabase.from("system_health_incidents").delete().not("resolved_at", "is", null).lt("resolved_at", incidentRetentionBefore),
    ]);
    if (checks.error) return persistenceFailure("prune_checks", checks.error);
    if (incidents.error) return persistenceFailure("prune_incidents", incidents.error);
    return null;
  } catch (error) {
    return persistenceFailure("prune_history", error);
  }
}

async function persistHealthCheck(
  supabase: ServiceClient,
  component: HealthComponentDefinition,
  input: HealthCheckResult,
  source: "scheduled" | "manual",
) {
  const checkedAt = new Date().toISOString();
  const summary = sanitizeHealthSummary(input.summary);
  const details = sanitizeDetails(input.details);
  const previousResult = await supabase
    .from("system_health_components")
    .select("*")
    .eq("component_key", component.key)
    .single();
  if (previousResult.error || !previousResult.data) {
    return persistenceFailure("read_component_state", previousResult.error ?? "Health component state is unavailable.");
  }
  const previous = previousResult.data;
  const failing = input.status === "degraded" || input.status === "outage";
  const consecutiveFailures = failing ? Number(previous.consecutive_failures ?? 0) + 1 : 0;
  const consecutiveSuccesses = input.status === "operational" ? Number(previous.consecutive_successes ?? 0) + 1 : 0;
  const activeIncidentResult = await supabase
    .from("system_health_incidents")
    .select("*")
    .eq("component_key", component.key)
    .is("resolved_at", null)
    .maybeSingle();
  if (activeIncidentResult.error) return persistenceFailure("read_active_incident", activeIncidentResult.error);
  const activeIncident = activeIncidentResult.data;
  const transition = getHealthTransition({
    activeIncident: Boolean(activeIncident),
    consecutiveFailures,
    consecutiveSuccesses,
    critical: component.critical,
    status: input.status,
  });

  const history = await supabase.from("system_health_checks").insert({
    check_source: source,
    checked_at: checkedAt,
    component_key: component.key,
    details,
    latency_ms: boundedLatency(input.latencyMs),
    status: input.status,
    summary,
  });
  if (history.error) return persistenceFailure("insert_check_history", history.error);

  let incidentStartedAt = activeIncident?.started_at ?? previous.active_incident_started_at ?? null;
  if (transition === "open_incident") {
    const opened = await supabase.from("system_health_incidents").insert({
      component_key: component.key,
      failure_count: consecutiveFailures,
      failure_summary: summary,
      latest_status: input.status,
      opening_status: input.status,
      started_at: checkedAt,
    }).select("id, started_at").single();
    if (opened.error || !opened.data) {
      return persistenceFailure("open_incident", opened.error ?? "The health incident could not be opened.");
    }
    incidentStartedAt = opened.data.started_at;
    await runBestEffortHealthOperation(async () => {
      const attempted = await supabase
        .from("system_health_incidents")
        .update({ alert_attempted_at: checkedAt })
        .eq("id", opened.data.id);
      if (attempted.error) throw attempted.error;
    }, (error) => logAncillaryFailure("mark_incident_alert_attempt", error));
    await safelyEmitSystemHealthAlert(() => emitSystemHealthAlert(supabase, {
      componentKey: component.key,
      componentLabel: component.label,
      incidentId: opened.data.id,
      kind: "incident",
      status: input.status,
      summary,
      timestamp: checkedAt,
    }));
  } else if (transition === "update_incident" && activeIncident) {
    const updated = await supabase.from("system_health_incidents").update({
      failure_count: Number(activeIncident.failure_count ?? 0) + 1,
      failure_summary: summary,
      latest_status: input.status,
      updated_at: checkedAt,
    }).eq("id", activeIncident.id);
    if (updated.error) return persistenceFailure("update_incident", updated.error);
  } else if (transition === "recover" && activeIncident) {
    const recovered = await supabase.from("system_health_incidents").update({
      latest_status: "operational",
      recovery_alert_attempted_at: checkedAt,
      recovery_summary: summary,
      resolved_at: checkedAt,
      updated_at: checkedAt,
    }).eq("id", activeIncident.id);
    if (recovered.error) return persistenceFailure("recover_incident", recovered.error);
    incidentStartedAt = null;
    await safelyEmitSystemHealthAlert(() => emitSystemHealthAlert(supabase, {
      componentKey: component.key,
      componentLabel: component.label,
      incidentId: activeIncident.id,
      kind: "recovery",
      status: "operational",
      summary,
      timestamp: checkedAt,
    }));
  }

  const state = await supabase.from("system_health_components").update({
    active_incident_started_at: incidentStartedAt,
    check_source: source,
    checked_at: checkedAt,
    consecutive_failures: consecutiveFailures,
    consecutive_successes: consecutiveSuccesses,
    details,
    failure_summary: failing ? summary : null,
    last_observed_usage_at: input.lastObservedUsageAt ?? previous.last_observed_usage_at,
    last_success_at: input.status === "operational" ? checkedAt : previous.last_success_at,
    latency_ms: boundedLatency(input.latencyMs),
    status: input.status,
    updated_at: checkedAt,
  }).eq("component_key", component.key);
  return state.error ? persistenceFailure("update_component_state", state.error) : null;
}

export async function safelyEmitSystemHealthAlert(emit: () => Promise<void>) {
  let failure: PersistenceFailure | null = null;
  await runBestEffortHealthOperation(emit, (error) => {
    failure = persistenceFailure("alert_emission", error);
    logAncillaryFailure("alert_emission", error);
  });
  return failure;
}

function sanitizeDetails(details: HealthCheckResult["details"]) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (/(url|token|secret|password|authorization|cookie|key)/i.test(key)) continue;
    if (typeof value === "string") safe[key.slice(0, 60)] = sanitizeHealthSummary(value);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) safe[key.slice(0, 60)] = value;
  }
  return safe;
}

function persistenceFailure(stage: string, error: unknown): PersistenceFailure {
  return { stage, summary: safeHealthErrorMetadata(error).message };
}

function logAncillaryFailure(stage: string, error: unknown) {
  console.warn("System health ancillary operation failed.", {
    ...safeHealthErrorMetadata(error),
    stage,
  });
}
