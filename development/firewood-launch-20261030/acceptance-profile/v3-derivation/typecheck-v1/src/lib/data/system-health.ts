import type { SupabaseClient } from "@supabase/supabase-js";
import { healthComponents, type HealthStatus } from "@/lib/system-health/registry";

export type SystemHealthComponentState = {
  active_incident_started_at: string | null;
  category: string;
  check_source: string | null;
  checked_at: string | null;
  component_key: string;
  consecutive_failures: number;
  critical: boolean;
  details: Record<string, string | number | boolean | null>;
  failure_summary: string | null;
  label: string;
  last_observed_usage_at: string | null;
  last_success_at: string | null;
  latency_ms: number | null;
  status: HealthStatus;
};

export type SystemHealthIncident = {
  component_key: string;
  failure_summary: string | null;
  id: string;
  latest_status: string;
  recovery_summary: string | null;
  resolved_at: string | null;
  started_at: string;
};

export type SystemHealthUptime = {
  component_key: string;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
};

export async function getSystemHealthDashboard(supabase: SupabaseClient) {
  const [states, incidents, uptime] = await Promise.all([
    supabase.from("system_health_components").select("*").order("category").order("label"),
    supabase.from("system_health_incidents").select("id, component_key, started_at, resolved_at, latest_status, failure_summary, recovery_summary").order("started_at", { ascending: false }).limit(50),
    supabase.rpc("get_system_health_uptime"),
  ]);
  const stateByKey = new Map(((states.data ?? []) as SystemHealthComponentState[]).map((state) => [state.component_key, state]));
  const components = healthComponents.map((definition) => stateByKey.get(definition.key) ?? {
    active_incident_started_at: null,
    category: definition.category,
    check_source: null,
    checked_at: null,
    component_key: definition.key,
    consecutive_failures: 0,
    critical: definition.critical,
    details: {},
    failure_summary: null,
    label: definition.label,
    last_observed_usage_at: null,
    last_success_at: null,
    latency_ms: null,
    status: "unknown" as const,
  });
  return {
    components,
    error: states.error?.message ?? incidents.error?.message ?? uptime.error?.message ?? null,
    incidents: (incidents.data ?? []) as SystemHealthIncident[],
    uptime: new Map(((uptime.data ?? []) as SystemHealthUptime[]).map((row) => [row.component_key, {
      day: numberOrNull(row.uptime_24h),
      month: numberOrNull(row.uptime_30d),
      week: numberOrNull(row.uptime_7d),
    }])),
  };
}

function numberOrNull(value: unknown) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
