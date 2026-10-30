import Link from "next/link";
import { Activity, Bell, History } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getManagerEmailHistory, getNotificationPreferences } from "@/lib/data/notifications";
import { formatBusinessDateTime } from "@/lib/business-time";
import { SetupRequired } from "@/components/SetupRequired";

export default async function NotificationSettingsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/settings/notifications");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening notification settings" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const [preferences, history] = allowed ? await Promise.all([getNotificationPreferences(context.user.id), getManagerEmailHistory(context.user.id)]) : [null, null];
  return (
    <PlatformFrame active="settings" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content settings-page">
        <nav className="local-workflow-tabs" aria-label="Settings">
          <Link aria-current="page" href="/admin/settings/notifications"><Bell size={16} />Notifications</Link>
          <Link href="/admin/settings/activity"><History size={16} />Activity Log</Link>
          <Link href="/admin/settings/system-health"><Activity size={16} />System Health</Link>
        </nav>
        <section className="page-heading"><p className="surface-label"><Bell size={18} />Personal alerts</p><h1>Notification settings</h1><p>Important activity always stays in your in-platform inbox. These choices control only your email alerts.</p></section>
        {!allowed ? <section className="empty-state"><h2>Owner or admin access required</h2><p>Personal administrative alerts are restricted.</p></section> : null}
        {preferences?.error ? <section className="data-warning"><strong>Database notice</strong><p>{preferences.error}</p></section> : null}
        {preferences ? <NotificationPreferencesForm preferences={preferences.data} disabled={Boolean(preferences.error)} recipientEmail={context.user.email} /> : null}
        {allowed ? <section className="detail-panel"><h2>Recent manager emails</h2><p>Accepted means the email provider accepted the message, not confirmed inbox delivery.</p>{history?.error ? <p role="status">{history.error}</p> : null}{history?.data.map(row => <article className="next-action-item" key={row.id}><strong>{row.title}</strong><p>{row.email_status === "sent" ? "Accepted by email provider" : row.email_status === "failed" ? "Delivery needs review" : row.email_status === "skipped" ? "Not sent" : "Queued for delivery"} · {formatBusinessDateTime(row.email_attempted_at ?? row.created_at)}</p>{row.manager_email_problem ? <small>{row.manager_email_problem === "retry_window_ended" ? "Automatic retries stopped to avoid a duplicate. Review delivery history before taking further action." : "Review this notification's preferences, assignment, and delivery history."}</small> : null}</article>)}{!history?.error && !history?.data.length ? <p>No manager emails queued yet.</p> : null}</section> : null}
      </div>
    </PlatformFrame>
  );
}
