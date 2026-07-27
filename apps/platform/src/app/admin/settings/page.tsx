import Link from "next/link";
import { Bell, History, Settings } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { SetupRequired } from "@/components/SetupRequired";

export default async function SettingsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/settings");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening settings" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  return (
    <PlatformFrame active="settings" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading"><p className="surface-label"><Settings size={18} />Settings</p><h1>Settings</h1><p>Personal alerts and administrative history.</p></section>
        {!allowed ? <AccessDenied /> : (
          <section className="settings-link-grid">
            <Link href="/admin/settings/notifications"><Bell size={23} /><span><strong>Notifications</strong><small>Choose which customer activity also reaches your email.</small></span></Link>
            <Link href="/admin/settings/activity"><History size={23} /><span><strong>Activity Log</strong><small>Review meaningful platform changes and customer actions.</small></span></Link>
          </section>
        )}
      </div>
    </PlatformFrame>
  );
}

function AccessDenied() {
  return <section className="empty-state"><h2>Owner or admin access required</h2><p>Notification settings and the administrative activity log are restricted.</p></section>;
}
