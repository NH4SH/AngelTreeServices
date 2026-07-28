import Link from "next/link";
import { Activity, Bell, History } from "lucide-react";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getNotificationPreferences } from "@/lib/data/notifications";
import { SetupRequired } from "@/components/SetupRequired";

export default async function NotificationSettingsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/settings/notifications");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening notification settings" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const preferences = allowed ? await getNotificationPreferences(context.user.id) : null;
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
        {preferences ? <NotificationPreferencesForm preferences={preferences.data} /> : null}
      </div>
    </PlatformFrame>
  );
}
