import Link from "next/link";
import { CalendarSync, ChevronLeft } from "lucide-react";
import { GoogleCalendarSettings } from "@/components/google-calendar-settings";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getGoogleCalendarConfiguration } from "@/lib/integrations/google-calendar/config";
import { toPublicGoogleCalendarConnection } from "@/lib/integrations/google-calendar/public-connection";
import { getGoogleCalendarConnectionForUser } from "@/lib/integrations/google-calendar/repository";
import { getWritableGoogleCalendars } from "@/lib/integrations/google-calendar/service";
import { getServiceRoleClient } from "@/lib/supabase/admin";

type Props = { searchParams: Promise<{ google?: string }> };

export const dynamic = "force-dynamic";

export default async function GoogleCalendarIntegrationPage({ searchParams }: Props) {
  const context = await getAuthenticatedPlatformContext("/employee/integrations/google-calendar");
  if (!context.configured || !context.user) return <SetupRequired title="Configure Supabase before opening integrations" />;
  const allowed = hasAllowedRole(context.roles, platformRoleGroups.crewApp);
  const canSyncCompany = hasAllowedRole(context.roles, platformRoleGroups.accessApproval);
  const configuration = getGoogleCalendarConfiguration();
  const query = await searchParams;
  let connection = null;
  let calendars: Awaited<ReturnType<typeof getWritableGoogleCalendars>> = [];
  let databaseNotice: string | null = null;

  if (allowed && configuration.configured) {
    const serviceRole = getServiceRoleClient();
    if (!serviceRole) {
      databaseNotice = "The server-side database connection is unavailable.";
    } else {
      try {
        connection = await getGoogleCalendarConnectionForUser(serviceRole, context.user.id);
        if (connection?.syncEnabled) {
          try {
            calendars = await getWritableGoogleCalendars(connection);
          } catch {
            calendars = [];
            connection = await getGoogleCalendarConnectionForUser(serviceRole, context.user.id) ?? connection;
          }
        }
      } catch {
        databaseNotice = "Apply the Google Calendar migration before connecting an account.";
      }
    }
  }

  const active = canSyncCompany ? "settings" : "employee-self";
  return (
    <PlatformFrame active={active} roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content google-calendar-page">
        <Link className="back-link" href={canSyncCompany ? "/admin/settings" : "/employee"}><ChevronLeft aria-hidden="true" size={17} />Back to {canSyncCompany ? "settings" : "my profile"}</Link>
        <section className="page-heading">
          <p className="surface-label"><CalendarSync aria-hidden="true" size={18} />Integration</p>
          <h1>Google Calendar</h1>
          <p>Mirror Angel Tree estimates and workdays into one Google calendar. Scheduling stays in Angel Tree.</p>
        </section>
        {!allowed ? <section className="empty-state"><h2>Internal access required</h2><p>This integration is available only to authorized Angel Tree staff and crew.</p></section> : (
          <GoogleCalendarSettings
            calendars={calendars}
            canSyncCompany={canSyncCompany}
            configured={configuration.configured}
            connection={connection ? toPublicGoogleCalendarConnection(connection) : null}
            databaseNotice={databaseNotice}
            notice={noticeForQuery(query.google)}
          />
        )}
      </div>
    </PlatformFrame>
  );
}

function noticeForQuery(code: string | undefined): { message: string; status: "success" | "warning" } | null {
  const notices: Record<string, { message: string; status: "success" | "warning" }> = {
    callback_invalid: { message: "Google returned an incomplete connection response. Try connecting again.", status: "warning" },
    cancelled: { message: "Google Calendar connection was cancelled. Nothing changed.", status: "warning" },
    connected: { message: "Google Calendar connected. Choose preferences, then use Sync now.", status: "success" },
    connection_failed: { message: "Google Calendar could not be connected. Angel Tree scheduling was not changed.", status: "warning" },
    different_account: { message: "Disconnect the current Google account before connecting a different one.", status: "warning" },
    not_authorized: { message: "Your account does not have internal calendar access.", status: "warning" },
    not_configured: { message: "Google Calendar integration is not configured on this server.", status: "warning" },
    refresh_token_missing: { message: "Google did not provide offline access. Try connecting again and approve Calendar access.", status: "warning" },
    session_required: { message: "Sign in again before connecting Google Calendar.", status: "warning" },
    state_invalid: { message: "The connection request expired or could not be verified. Start again from this page.", status: "warning" },
  };
  return code ? notices[code] ?? null : null;
}
