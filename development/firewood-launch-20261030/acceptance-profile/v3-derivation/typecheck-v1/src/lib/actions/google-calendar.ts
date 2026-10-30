"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { GoogleCalendarActionState } from "@/lib/integrations/google-calendar/action-state";
import { getGoogleCalendarConnectionForUser } from "@/lib/integrations/google-calendar/repository";
import {
  disconnectGoogleCalendar,
  normalizeIntegrationError,
  syncGoogleCalendarNow,
  updateGoogleCalendarPreferences,
} from "@/lib/integrations/google-calendar/service";

export async function saveGoogleCalendarPreferences(
  _state: GoogleCalendarActionState,
  formData: FormData,
): Promise<GoogleCalendarActionState> {
  const context = await requireGoogleCalendarUser();
  if (context.error) return context.error;
  const calendarId = String(formData.get("calendar_id") ?? "").trim().slice(0, 1024);
  if (!calendarId) return fail("Choose a writable Google calendar.");

  try {
    await updateGoogleCalendarPreferences({
      authUserId: context.userId,
      calendarId,
      syncCompanyAll: formData.get("sync_company_all") === "1",
      syncEstimates: formData.get("sync_estimates") === "1",
      syncJobs: formData.get("sync_jobs") === "1",
    });
    revalidateIntegrationPages();
    return ok("Google Calendar preferences saved. Changes are queued for reconciliation.");
  } catch (error) {
    return fail(messageForGoogleCalendarError(error));
  }
}

export async function syncGoogleCalendarConnectionNow(
  _state: GoogleCalendarActionState,
  _formData: FormData,
): Promise<GoogleCalendarActionState> {
  const context = await requireGoogleCalendarUser();
  if (context.error) return context.error;
  const serviceRole = getServiceRoleClient();
  if (!serviceRole) return fail("Google Calendar synchronization is not configured.");
  const connection = await getGoogleCalendarConnectionForUser(serviceRole, context.userId);
  if (!connection || !connection.syncEnabled) return fail("Connect Google Calendar before syncing.");

  try {
    const result = await syncGoogleCalendarNow(connection.id);
    revalidateIntegrationPages();
    const changed = result.created + result.updated + result.deleted;
    return ok(changed
      ? `Google Calendar reconciled ${changed} ${changed === 1 ? "event" : "events"}.`
      : "Google Calendar is already up to date.");
  } catch (error) {
    revalidateIntegrationPages();
    return fail(messageForGoogleCalendarError(error));
  }
}

export async function disconnectGoogleCalendarConnection(
  _state: GoogleCalendarActionState,
  formData: FormData,
): Promise<GoogleCalendarActionState> {
  const context = await requireGoogleCalendarUser();
  if (context.error) return context.error;
  const serviceRole = getServiceRoleClient();
  if (!serviceRole) return fail("Google Calendar synchronization is not configured.");
  const connection = await getGoogleCalendarConnectionForUser(serviceRole, context.userId);
  if (!connection || connection.status === "disconnected") return ok("Google Calendar is already disconnected.");

  try {
    await disconnectGoogleCalendar({
      connection,
      removeFutureEvents: formData.get("remove_future_events") === "1",
    });
    revalidateIntegrationPages();
    return ok("Google Calendar disconnected. Angel Tree scheduling is unchanged.");
  } catch (error) {
    revalidateIntegrationPages();
    return fail(messageForGoogleCalendarError(error));
  }
}

async function requireGoogleCalendarUser(): Promise<
  { error: null; userId: string }
  | { error: GoogleCalendarActionState; userId: null }
> {
  const supabase = await createClient();
  if (!supabase) return { error: fail("Supabase is not configured."), userId: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: fail("Sign in before changing calendar settings."), userId: null };
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.crewApp)) {
    return { error: fail("Your account does not have internal calendar access."), userId: null };
  }
  return { error: null, userId: user.id };
}

function messageForGoogleCalendarError(error: unknown) {
  const failure = normalizeIntegrationError(error);
  const messages: Record<string, string> = {
    authorization_revoked: "Google access was revoked. Reconnect the account to resume syncing.",
    calendar_not_writable: "Choose a Google calendar where this account can edit events.",
    company_sync_not_authorized: "Only owners and admins can mirror all company work.",
    connection_not_active: "Reconnect Google Calendar before changing these settings.",
    credential_unavailable: "The saved Google credential cannot be read. Reconnect the account.",
    integration_not_configured: "Google Calendar integration is not configured.",
    network_unavailable: "Google Calendar could not be reached. Angel Tree scheduling is safe; try again shortly.",
    temporarily_unavailable: "Google Calendar is temporarily unavailable. Angel Tree scheduling is safe; retry is available.",
  };
  return messages[failure.code] ?? "Google Calendar could not be updated. Angel Tree scheduling was not changed.";
}

function revalidateIntegrationPages() {
  revalidatePath("/employee/integrations/google-calendar");
  revalidatePath("/admin/settings");
}

function fail(message: string): GoogleCalendarActionState {
  return { message, status: "error" };
}

function ok(message: string): GoogleCalendarActionState {
  return { message, status: "success" };
}
