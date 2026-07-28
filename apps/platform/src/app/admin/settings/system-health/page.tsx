import { Activity, AlertTriangle, Bell, CheckCircle2, ChevronDown, CircleHelp, Clock3, History, ServerCog, XCircle } from "lucide-react";
import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getSystemHealthDashboard, type SystemHealthComponentState } from "@/lib/data/system-health";
import { safeStaffMessage } from "@/lib/security/errors";
import { healthCategoryLabels, healthComponents, type HealthCategory, type HealthStatus } from "@/lib/system-health/registry";
import { ManualHealthCheck } from "./ManualHealthCheck";

const staleAfterMs = 15 * 60_000;

export default async function SystemHealthPage() {
  const context = await getAuthenticatedPlatformContext("/admin/settings/system-health");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening system health" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const dashboard = allowed ? await getSystemHealthDashboard(context.supabase) : null;
  const components = dashboard?.components ?? [];
  const overall = overallStatus(components);

  return (
    <PlatformFrame active="settings" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content system-health-page">
        <nav className="local-workflow-tabs" aria-label="Settings">
          <Link href="/admin/settings/notifications"><Bell size={16} />Notifications</Link>
          <Link href="/admin/settings/activity"><History size={16} />Activity Log</Link>
          <Link aria-current="page" href="/admin/settings/system-health"><Activity size={16} />System Health</Link>
        </nav>
        <section className="page-heading system-health-heading">
          <div>
            <p className="surface-label"><ServerCog size={18} />Operational monitoring</p>
            <h1>System Health</h1>
            <p>Website, CRM, customer portals, data, communications, and payment readiness.</p>
          </div>
          {allowed ? <ManualHealthCheck /> : null}
        </section>
        {!allowed ? <section className="empty-state"><h2>Owner or admin access required</h2><p>Detailed system monitoring is restricted.</p></section> : null}
        {dashboard?.error ? <section className="data-warning"><strong>Monitoring setup required</strong><p>{safeStaffMessage(dashboard.error, "Health history is unavailable. Apply the system-health migration, then run a check.")}</p></section> : null}
        {allowed ? (
          <>
            <section className={`system-health-overall health-${overall.status}`}>
              <StatusIcon status={overall.status} />
              <div><span>Overall status</span><h2>{statusLabel(overall.status)}</h2><p>{overall.message}</p></div>
            </section>
            {(Object.keys(healthCategoryLabels) as HealthCategory[]).map((category) => {
              const categoryComponents = components.filter((component) => component.category === category);
              if (!categoryComponents.length) return null;
              return (
                <section className="system-health-section" key={category}>
                  <div className="system-health-section-heading"><h2>{healthCategoryLabels[category]}</h2><span>{categoryComponents.length} checks</span></div>
                  <div className="system-health-grid">
                    {categoryComponents.map((component) => <HealthCard component={component} key={component.component_key} uptime={dashboard?.uptime.get(component.component_key)} />)}
                  </div>
                </section>
              );
            })}
            <section className="system-health-section">
              <div className="system-health-section-heading"><h2>Recent incidents and recoveries</h2><span>Last 50</span></div>
              {dashboard?.incidents.length ? (
                <div className="system-health-incident-list">
                  {dashboard.incidents.map((incident) => {
                    const definition = healthComponents.find((component) => component.key === incident.component_key);
                    return <article key={incident.id}><StatusIcon status={incident.resolved_at ? "operational" : "outage"} /><div><strong>{definition?.label ?? incident.component_key}</strong><p>{incident.resolved_at ? incident.recovery_summary ?? "Recovered." : incident.failure_summary ?? "Incident active."}</p><small>Started {formatDateTime(incident.started_at)}{incident.resolved_at ? ` · Recovered ${formatDateTime(incident.resolved_at)}` : " · Active"}</small></div></article>;
                  })}
                </div>
              ) : <section className="empty-state compact"><h3>No incidents recorded</h3><p>Incidents appear after confirmed consecutive failures.</p></section>}
            </section>
          </>
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function HealthCard({ component, uptime }: { component: SystemHealthComponentState; uptime?: { day: number | null; week: number | null; month: number | null } }) {
  const stale = isStale(component.checked_at);
  const displayStatus: HealthStatus = stale && component.status !== "not_configured" ? "unknown" : component.status;
  return (
    <article className={`system-health-card health-${displayStatus}`}>
      <header><StatusIcon status={displayStatus} /><div><h3>{component.label}</h3><span>{statusLabel(displayStatus)}{component.critical ? " · Critical" : ""}</span></div></header>
      <p>{stale ? "This check is stale. Run checks again before treating it as healthy." : component.failure_summary ?? statusSummary(displayStatus)}</p>
      <dl>
        <div><dt>Last checked</dt><dd>{component.checked_at ? formatRelative(component.checked_at) : "Never"}</dd></div>
        <div><dt>Last success</dt><dd>{component.last_success_at ? formatRelative(component.last_success_at) : "Never"}</dd></div>
        <div><dt>Response</dt><dd>{component.latency_ms == null ? "Not measured" : `${component.latency_ms} ms`}</dd></div>
        <div><dt>Last real use</dt><dd>{component.last_observed_usage_at ? formatRelative(component.last_observed_usage_at) : "No activity recorded"}</dd></div>
      </dl>
      <div className="system-health-uptime" aria-label={`${component.label} uptime`}>
        <span><strong>{formatUptime(uptime?.day)}</strong>24 hours</span>
        <span><strong>{formatUptime(uptime?.week)}</strong>7 days</span>
        <span><strong>{formatUptime(uptime?.month)}</strong>30 days</span>
      </div>
      {component.active_incident_started_at ? <p className="system-health-incident-duration"><Clock3 size={15} />Incident active for {duration(component.active_incident_started_at)}</p> : null}
      {Object.keys(component.details ?? {}).length ? <details><summary><ChevronDown size={15} />Technical details</summary>{Object.entries(component.details).map(([key, value]) => <p key={key}><strong>{humanize(key)}:</strong> {String(value)}</p>)}</details> : null}
    </article>
  );
}

function StatusIcon({ status }: { status: HealthStatus }) {
  if (status === "operational") return <CheckCircle2 aria-label="Operational" size={22} />;
  if (status === "degraded") return <AlertTriangle aria-label="Degraded" size={22} />;
  if (status === "outage") return <XCircle aria-label="Outage" size={22} />;
  return <CircleHelp aria-label={statusLabel(status)} size={22} />;
}

function overallStatus(components: SystemHealthComponentState[]): { status: HealthStatus; message: string } {
  if (!components.length || components.every((component) => !component.checked_at)) return { status: "unknown", message: "No completed monitoring run is available yet." };
  const effective = components.map((component) => isStale(component.checked_at) && component.status !== "not_configured" ? "unknown" : component.status);
  if (effective.includes("outage")) return { status: "outage", message: "One or more components are unavailable. Review the affected section below." };
  if (effective.includes("degraded")) return { status: "degraded", message: "Core services are reachable, but one or more checks need attention." };
  if (effective.includes("unknown") || effective.includes("not_configured")) return { status: "unknown", message: "Some components have not been checked recently or still require monitoring setup." };
  return { status: "operational", message: "All configured components passed their latest checks." };
}

function isStale(value: string | null) { return !value || Date.now() - new Date(value).getTime() > staleAfterMs; }
function statusLabel(status: HealthStatus) { return status === "not_configured" ? "Not configured" : status.charAt(0).toUpperCase() + status.slice(1); }
function statusSummary(status: HealthStatus) { return status === "operational" ? "The latest check completed normally." : status === "not_configured" ? "Required configuration is missing." : status === "unknown" ? "No recent reliable result is available." : "The latest check needs attention."; }
function formatDateTime(value: string) { return new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" }); }
function formatRelative(value: string) { const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000)); if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function duration(value: string) { return formatRelative(value).replace(" ago", ""); }
function formatUptime(value: number | null | undefined) { return value == null ? "—" : `${value.toFixed(value === 100 ? 0 : 2)}%`; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase()); }
