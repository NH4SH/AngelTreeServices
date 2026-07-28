import Link from "next/link";
import { Activity, Bell, ChevronDown, History, SlidersHorizontal } from "lucide-react";
import { ListPagination } from "@/components/list-pagination";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getActivityFilterOptions, getActivityLogPage } from "@/lib/data/notifications";
import { SetupRequired } from "@/components/SetupRequired";

type Props = { searchParams: Promise<{ action?: string; actor?: string; category?: string; date_from?: string; date_to?: string; page?: string; record_type?: string }> };

export default async function ActivityLogPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/settings/activity");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening the activity log" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const page = positivePage(params.page);
  const [log, options] = allowed ? await Promise.all([
    getActivityLogPage({ action: params.action, actor: params.actor, category: params.category, dateFrom: params.date_from, dateTo: params.date_to, page, pageSize: 50, recordType: params.record_type }),
    getActivityFilterOptions(),
  ]) : [{ actors: new Map(), count: 0, data: [], error: null }, { actions: [], actors: [], categories: [], recordTypes: [] }];
  return (
    <PlatformFrame active="settings" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content activity-log-page">
        <nav className="local-workflow-tabs" aria-label="Settings">
          <Link href="/admin/settings/notifications"><Bell size={16} />Notifications</Link>
          <Link aria-current="page" href="/admin/settings/activity"><History size={16} />Activity Log</Link>
          <Link href="/admin/settings/system-health"><Activity size={16} />System Health</Link>
        </nav>
        <section className="page-heading"><p className="surface-label"><History size={18} />Administrative history</p><h1>Activity Log</h1><p>Meaningful changes and customer actions, newest first. History is append-only.</p></section>
        {!allowed ? <section className="empty-state"><h2>Owner or admin access required</h2><p>The complete administrative history is restricted.</p></section> : null}
        {log.error ? <section className="data-warning"><strong>Database notice</strong><p>{log.error}</p></section> : null}
        {allowed ? (
          <>
            <form className="activity-filter-grid">
              <span><SlidersHorizontal size={17} />Filters</span>
              <label>From<input defaultValue={params.date_from} name="date_from" type="date" /></label>
              <label>Through<input defaultValue={params.date_to} name="date_to" type="date" /></label>
              <label>Actor<select defaultValue={params.actor ?? ""} name="actor"><option value="">All actors</option>{options.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.label}</option>)}</select></label>
              <label>Category<select defaultValue={params.category ?? ""} name="category"><option value="">All categories</option>{options.categories.map((category) => <option key={category} value={category}>{humanize(category)}</option>)}</select></label>
              <label>Action<select defaultValue={params.action ?? ""} name="action"><option value="">All actions</option>{options.actions.map((action) => <option key={action} value={action}>{humanize(action)}</option>)}</select></label>
              <label>Record type<select defaultValue={params.record_type ?? ""} name="record_type"><option value="">All records</option>{options.recordTypes.map((recordType) => <option key={recordType} value={recordType}>{humanize(recordType)}</option>)}</select></label>
              <button className="secondary-action" type="submit">Apply filters</button>
            </form>
            {log.data.length ? (
              <section className="activity-log-list">
                {log.data.map((entry) => {
                  const actor = entry.actor_label || (entry.actor_user_id ? log.actors.get(entry.actor_user_id) : null) || actorTypeLabel(entry.actor_type);
                  const hasDetail = Object.keys(entry.changes_json ?? {}).length > 0 || Object.keys(entry.metadata_json ?? {}).length > 0;
                  return (
                    <article key={entry.id}>
                      <div className="activity-log-main">
                        <span className={`activity-actor-badge ${entry.actor_type}`}>{initials(actor)}</span>
                        <div><strong>{entry.summary || humanize(entry.event_type)}</strong><p>{actor} · {entry.record_label || humanize(entry.subject_type)}</p><time>{formatDateTime(entry.created_at)}</time></div>
                        {entry.destination_path ? <Link href={entry.destination_path}>Open</Link> : <span className="deleted-record-label">Record unavailable</span>}
                      </div>
                      {hasDetail ? <details><summary><ChevronDown size={16} />View details</summary><ActivityDetails changes={entry.changes_json} metadata={entry.metadata_json} /></details> : null}
                    </article>
                  );
                })}
              </section>
            ) : <section className="empty-state"><History size={28} /><h2>No matching activity</h2><p>Try a wider date range or fewer filters.</p></section>}
            <ListPagination basePath="/admin/settings/activity" count={log.count} page={page} pageSize={50} params={{ action: params.action, actor: params.actor, category: params.category, date_from: params.date_from, date_to: params.date_to, record_type: params.record_type }} />
          </>
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function ActivityDetails({ changes, metadata }: { changes: Record<string, unknown>; metadata: Record<string, unknown> }) {
  const rows = Object.entries(changes ?? {});
  const context = Object.entries(metadata ?? {}).filter(([, value]) => value !== null && value !== "");
  return <div className="activity-detail-grid">{rows.map(([field, value]) => {
    const change = value as { before?: unknown; after?: unknown };
    return <div key={field}><strong>{humanize(field)}</strong><span>{displayValue(change.before)} → {displayValue(change.after)}</span></div>;
  })}{context.map(([field, value]) => <div key={field}><strong>{humanize(field)}</strong><span>{displayValue(value)}</span></div>)}</div>;
}

function positivePage(value?: string) { const parsed = Number.parseInt(value ?? "1", 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
function humanize(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function actorTypeLabel(value: string) { return value === "portal" ? "Customer portal" : humanize(value || "system"); }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AT"; }
function displayValue(value: unknown) { if (value === null || value === undefined || value === "") return "Not set"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
