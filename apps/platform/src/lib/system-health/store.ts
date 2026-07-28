import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitSystemHealthAlert } from "./alerts";
import { boundedLatency, getHealthTransition, sanitizeHealthSummary, type HealthCheckResult } from "./core";
import { healthComponents, type HealthComponentDefinition } from "./registry";

type ServiceClient = SupabaseClient<any, "public", any>;

export async function initializeHealthRegistry(supabase: ServiceClient) {
  const { error } = await supabase.from("system_health_components").upsert(
    healthComponents.map((component) => ({
      category: component.category,
      component_key: component.key,
      critical: component.critical,
      label: component.label,
    })),
    { onConflict: "component_key" },
  );
  return error?.message ?? null;
}

export async function persistHealthRun(
  supabase: ServiceClient,
  checks: Array<{ component: HealthComponentDefinition; result: HealthCheckResult }>,
  source: "scheduled" | "manual",
) {
  const registryError = await initializeHealthRegistry(supabase);
  if (registryError) return { error: registryError, recorded: 0 };

  let recorded = 0;
  for (const check of checks) {
    const error = await persistHealthCheck(supabase, check.component, check.result, source);
    if (error) return { error, recorded };
    recorded += 1;
  }

  const retentionBefore = new Date(Date.now() - 35 * 24 * 60 * 60_000).toISOString();
  const incidentRetentionBefore = new Date(Date.now() - 365 * 24 * 60 * 60_000).toISOString();
  await Promise.all([
    supabase.from("system_health_checks").delete().lt("checked_at", retentionBefore),
    supabase.from("system_health_incidents").delete().not("resolved_at", "is", null).lt("resolved_at", incidentRetentionBefore),
  ]);
  return { error: null, recorded };
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
  if (previousResult.error || !previousResult.data) return previousResult.error?.message ?? "Health component state is unavailable.";
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
  if (activeIncidentResult.error) return activeIncidentResult.error.message;
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
  if (history.error) return history.error.message;

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
    if (opened.error || !opened.data) return opened.error?.message ?? "The health incident could not be opened.";
    incidentStartedAt = opened.data.started_at;
    await supabase.from("system_health_incidents").update({ alert_attempted_at: checkedAt }).eq("id", opened.data.id);
    await emitSystemHealthAlert(supabase, {
      componentKey: component.key,
      componentLabel: component.label,
      incidentId: opened.data.id,
      kind: "incident",
      status: input.status,
      summary,
      timestamp: checkedAt,
    });
  } else if (transition === "update_incident" && activeIncident) {
    await supabase.from("system_health_incidents").update({
      failure_count: Number(activeIncident.failure_count ?? 0) + 1,
      failure_summary: summary,
      latest_status: input.status,
      updated_at: checkedAt,
    }).eq("id", activeIncident.id);
  } else if (transition === "recover" && activeIncident) {
    await supabase.from("system_health_incidents").update({
      latest_status: "operational",
      recovery_alert_attempted_at: checkedAt,
      recovery_summary: summary,
      resolved_at: checkedAt,
      updated_at: checkedAt,
    }).eq("id", activeIncident.id);
    incidentStartedAt = null;
    await emitSystemHealthAlert(supabase, {
      componentKey: component.key,
      componentLabel: component.label,
      incidentId: activeIncident.id,
      kind: "recovery",
      status: "operational",
      summary,
      timestamp: checkedAt,
    });
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
  return state.error?.message ?? null;
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
