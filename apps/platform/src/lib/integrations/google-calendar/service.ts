import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { decryptGoogleRefreshToken, preserveOrEncryptRefreshToken } from "./credentials";
import { reconcileGoogleCalendarEvent, mappingForScheduleEvent } from "./engine";
import { getGoogleCalendarSyncWindow } from "./event";
import {
  fetchGoogleUserIdentity,
  GoogleCalendarApi,
  GoogleCalendarApiError,
  refreshGoogleAccessToken,
  revokeGoogleCredential,
} from "./google-api";
import { canUseCompanyGoogleCalendarSync } from "./policy";
import {
  claimGoogleCalendarSyncTasks,
  completeGoogleCalendarSyncTask,
  deleteGoogleCalendarMappingsForConnection,
  enqueueGoogleCalendarConnectionSync,
  failGoogleCalendarSyncTask,
  getEmployeeIdForAuthUser,
  getGoogleCalendarConnectionById,
  getGoogleCalendarConnectionForUser,
  getGoogleCalendarMappingsForConnection,
  getGoogleCalendarMappingsForEvent,
  getRolesForGoogleCalendarUser,
  getScheduleSyncEvent,
  googleCalendarMappingWriter,
  listActiveGoogleCalendarConnections,
  listScheduleSyncEvents,
  removeGoogleCalendarTaskForConnection,
  updateGoogleCalendarConnection,
  upsertGoogleCalendarConnection,
  type GoogleCalendarOutboxTask,
} from "./repository";
import { getGoogleCalendarConfiguration } from "./config";
import { googleCalendarScopes, type GoogleCalendarConnection } from "./types";

export type GoogleCalendarSyncSummary = {
  created: number;
  deleted: number;
  unchanged: number;
  updated: number;
};

export class GoogleCalendarIntegrationError extends Error {
  constructor(
    readonly code: string,
    readonly retryable = false,
    readonly authorizationRevoked = false,
  ) {
    super(`Google Calendar integration failed (${code}).`);
    this.name = "GoogleCalendarIntegrationError";
  }
}

export async function completeGoogleCalendarOAuth(input: {
  accessToken: string;
  authUserId: string;
  googleRefreshToken: string | null;
  grantedScopes: string[];
}) {
  const supabase = requireServiceRoleClient();
  const identity = await fetchGoogleUserIdentity(input.accessToken);
  const existing = await getGoogleCalendarConnectionForUser(supabase, input.authUserId);

  if (existing && existing.googleAccountId !== identity.id && existing.status !== "disconnected") {
    try {
      await revokeGoogleCredential(input.googleRefreshToken ?? input.accessToken);
    } catch {
      // The credential was never stored; a provider-side revoke failure is non-blocking here.
    }
    throw new GoogleCalendarIntegrationError("different_account_requires_disconnect");
  }

  const encryptedRefreshToken = preserveOrEncryptRefreshToken({
    existingEncryptedToken: existing?.googleAccountId === identity.id ? existing.refreshTokenEncrypted : null,
    newRefreshToken: input.googleRefreshToken,
  });
  if (!encryptedRefreshToken) throw new GoogleCalendarIntegrationError("refresh_token_unavailable");

  const employeeId = await getEmployeeIdForAuthUser(supabase, input.authUserId);
  let selectedCalendarId = existing?.selectedCalendarId ?? "primary";
  let selectedCalendarSummary = existing?.selectedCalendarSummary ?? "Primary";

  try {
    const calendars = await new GoogleCalendarApi(input.accessToken).listWritableCalendars();
    const selected = calendars.find((calendar) => calendar.id === selectedCalendarId)
      ?? calendars.find((calendar) => calendar.primary)
      ?? calendars[0];
    if (selected) {
      selectedCalendarId = selected.id;
      selectedCalendarSummary = selected.summary;
    }
  } catch {
    // Connection still succeeds; Calendar API readiness is reported on settings.
  }

  return upsertGoogleCalendarConnection(supabase, {
    authUserId: input.authUserId,
    employeeId,
    encryptedRefreshToken,
    googleAccountEmail: identity.email,
    googleAccountId: identity.id,
    grantedScopes: input.grantedScopes.length ? input.grantedScopes : [...googleCalendarScopes],
    selectedCalendarId,
    selectedCalendarSummary,
  });
}

export async function getWritableGoogleCalendars(connection: GoogleCalendarConnection) {
  const supabase = requireServiceRoleClient();
  try {
    const gateway = await createGoogleCalendarApi(connection);
    return await gateway.listWritableCalendars();
  } catch (error) {
    await recordConnectionFailure(supabase, connection, error);
    throw normalizeIntegrationError(error);
  }
}

export async function updateGoogleCalendarPreferences(input: {
  authUserId: string;
  calendarId: string;
  syncCompanyAll: boolean;
  syncEstimates: boolean;
  syncJobs: boolean;
}) {
  const supabase = requireServiceRoleClient();
  const connection = await getGoogleCalendarConnectionForUser(supabase, input.authUserId);
  if (!connection || !connection.syncEnabled) throw new GoogleCalendarIntegrationError("connection_not_active");
  const roles = await getRolesForGoogleCalendarUser(supabase, input.authUserId);
  if (input.syncCompanyAll && !canUseCompanyGoogleCalendarSync(roles)) {
    throw new GoogleCalendarIntegrationError("company_sync_not_authorized");
  }

  const calendars = await getWritableGoogleCalendars(connection);
  const calendar = calendars.find((item) => item.id === input.calendarId);
  if (!calendar) throw new GoogleCalendarIntegrationError("calendar_not_writable");

  const updated = await updateGoogleCalendarConnection(supabase, connection.id, {
    selected_calendar_id: calendar.id,
    selected_calendar_summary: calendar.summary,
    sync_company_all: input.syncCompanyAll,
    sync_estimates: input.syncEstimates,
    sync_jobs: input.syncJobs,
  });
  await enqueueGoogleCalendarConnectionSync(supabase, connection.id, "preferences_updated");
  return updated;
}

export async function reconcileGoogleCalendarConnection(
  connectionId: string,
  options: { forceUpdate?: boolean } = {},
) {
  const supabase = requireServiceRoleClient();
  const connection = await getGoogleCalendarConnectionById(supabase, connectionId);
  if (!connection || !connection.syncEnabled) return emptySummary();
  await markConnectionAttempt(supabase, connection.id);

  try {
    const [gateway, roles] = await Promise.all([
      createGoogleCalendarApi(connection),
      getRolesForGoogleCalendarUser(supabase, connection.authUserId),
    ]);
    const { windowEnd, windowStart } = getGoogleCalendarSyncWindow();
    const [events, mappings] = await Promise.all([
      listScheduleSyncEvents(supabase, windowStart, windowEnd),
      getGoogleCalendarMappingsForConnection(supabase, connection.id),
    ]);
    const eventsById = new Map(events.map((event) => [event.id, event]));
    const scheduleEventIds = new Set([...eventsById.keys(), ...mappings.map((mapping) => mapping.scheduleEventId)]);
    const summary = emptySummary();
    const appBaseUrl = requireAppBaseUrl();

    for (const scheduleEventId of scheduleEventIds) {
      const operation = await reconcileGoogleCalendarEvent({
        context: {
          appBaseUrl,
          connection,
          event: eventsById.get(scheduleEventId) ?? null,
          forceUpdate: options.forceUpdate,
          mapping: mappingForScheduleEvent(mappings, scheduleEventId),
          roles,
          windowEnd,
          windowStart,
        },
        gateway,
        mappings: googleCalendarMappingWriter(supabase),
      });
      summary[operation] += 1;
    }

    await markConnectionSuccess(supabase, connection.id);
    return summary;
  } catch (error) {
    await recordConnectionFailure(supabase, connection, error);
    throw normalizeIntegrationError(error);
  }
}

export async function reconcileGoogleCalendarScheduleEvent(scheduleEventId: string) {
  const supabase = requireServiceRoleClient();
  const [event, connections, mappings] = await Promise.all([
    getScheduleSyncEvent(supabase, scheduleEventId),
    listActiveGoogleCalendarConnections(supabase),
    getGoogleCalendarMappingsForEvent(supabase, scheduleEventId),
  ]);
  const mappingByConnection = new Map(mappings.map((mapping) => [mapping.connectionId, mapping]));
  const { windowEnd, windowStart } = getGoogleCalendarSyncWindow();
  const appBaseUrl = requireAppBaseUrl();
  const summary = emptySummary();
  const failures: GoogleCalendarIntegrationError[] = [];

  for (const connection of connections) {
    const mapping = mappingByConnection.get(connection.id) ?? null;
    if (!event && !mapping) continue;
    await markConnectionAttempt(supabase, connection.id);
    try {
      const [gateway, roles] = await Promise.all([
        createGoogleCalendarApi(connection),
        getRolesForGoogleCalendarUser(supabase, connection.authUserId),
      ]);
      const operation = await reconcileGoogleCalendarEvent({
        context: { appBaseUrl, connection, event, mapping, roles, windowEnd, windowStart },
        gateway,
        mappings: googleCalendarMappingWriter(supabase),
      });
      summary[operation] += 1;
      await markConnectionSuccess(supabase, connection.id);
    } catch (error) {
      await recordConnectionFailure(supabase, connection, error);
      failures.push(normalizeIntegrationError(error));
    }
  }

  if (failures.length) {
    const retryable = failures.some((failure) => failure.retryable);
    throw new GoogleCalendarIntegrationError(
      retryable ? "partial_sync_temporarily_unavailable" : failures[0].code,
      retryable,
      failures.every((failure) => failure.authorizationRevoked),
    );
  }
  return summary;
}

export async function syncGoogleCalendarNow(connectionId: string) {
  const summary = await reconcileGoogleCalendarConnection(connectionId, { forceUpdate: true });
  const supabase = requireServiceRoleClient();
  await removeGoogleCalendarTaskForConnection(supabase, connectionId);
  return summary;
}

export async function disconnectGoogleCalendar(input: {
  connection: GoogleCalendarConnection;
  removeFutureEvents: boolean;
}) {
  const supabase = requireServiceRoleClient();
  await updateGoogleCalendarConnection(supabase, input.connection.id, {
    sync_enabled: false,
  });

  try {
    const rawRefreshToken = decryptGoogleRefreshToken(input.connection.refreshTokenEncrypted);
    if (!rawRefreshToken) throw new GoogleCalendarIntegrationError("credential_unavailable");
    if (input.removeFutureEvents) {
      const gateway = await createGoogleCalendarApi(input.connection, { allowDisabled: true });
      const mappings = await getGoogleCalendarMappingsForConnection(supabase, input.connection.id);
      const now = Date.now();
      for (const mapping of mappings) {
        if (mapping.sourceStartsAt && new Date(mapping.sourceStartsAt).getTime() < now) continue;
        await gateway.deleteEvent(mapping.googleCalendarId, mapping.googleEventId);
      }
    }

    await revokeGoogleCredential(rawRefreshToken);
    await deleteGoogleCalendarMappingsForConnection(supabase, input.connection.id);
    await removeGoogleCalendarTaskForConnection(supabase, input.connection.id);
    await updateGoogleCalendarConnection(supabase, input.connection.id, {
      last_sync_error_at: null,
      last_sync_error_code: null,
      refresh_token_encrypted: null,
      status: "disconnected",
      sync_enabled: false,
    });
  } catch (error) {
    const failure = normalizeIntegrationError(error);
    await updateGoogleCalendarConnection(supabase, input.connection.id, {
      last_sync_error_at: new Date().toISOString(),
      last_sync_error_code: failure.code,
      last_sync_status: "error",
      status: "cleanup_failed",
      sync_enabled: false,
    });
    throw failure;
  }
}

export async function processGoogleCalendarSyncQueue(limit = 20) {
  const supabase = requireServiceRoleClient();
  const tasks = await claimGoogleCalendarSyncTasks(supabase, limit);
  let completed = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      await processTask(task);
      await completeGoogleCalendarSyncTask(supabase, task);
      completed += 1;
    } catch (error) {
      const failure = normalizeIntegrationError(error);
      await failGoogleCalendarSyncTask(supabase, task, failure.code, failure.retryable);
      failed += 1;
    }
  }

  return { claimed: tasks.length, completed, failed };
}

async function processTask(task: GoogleCalendarOutboxTask) {
  if (task.task_type === "connection" && task.connection_id) {
    await reconcileGoogleCalendarConnection(task.connection_id);
    return;
  }
  if (task.task_type === "schedule_event" && task.schedule_event_id) {
    await reconcileGoogleCalendarScheduleEvent(task.schedule_event_id);
    return;
  }
  throw new GoogleCalendarIntegrationError("invalid_sync_task");
}

async function createGoogleCalendarApi(
  connection: GoogleCalendarConnection,
  options: { allowDisabled?: boolean } = {},
) {
  if (!options.allowDisabled && !connection.syncEnabled) throw new GoogleCalendarIntegrationError("connection_disabled");
  const configuration = getGoogleCalendarConfiguration();
  if (!configuration.configured) throw new GoogleCalendarIntegrationError("integration_not_configured");
  const refreshToken = decryptGoogleRefreshToken(connection.refreshTokenEncrypted);
  if (!refreshToken) throw new GoogleCalendarIntegrationError("credential_unavailable");
  const token = await refreshGoogleAccessToken({
    clientId: configuration.clientId,
    clientSecret: configuration.clientSecret,
    refreshToken,
  });
  return new GoogleCalendarApi(token.accessToken);
}

async function markConnectionAttempt(supabase: SupabaseClient, connectionId: string) {
  await updateGoogleCalendarConnection(supabase, connectionId, {
    last_sync_attempt_at: new Date().toISOString(),
    last_sync_status: "pending",
  });
}

async function markConnectionSuccess(supabase: SupabaseClient, connectionId: string) {
  await updateGoogleCalendarConnection(supabase, connectionId, {
    last_sync_error_at: null,
    last_sync_error_code: null,
    last_sync_status: "success",
    last_sync_succeeded_at: new Date().toISOString(),
    status: "active",
  });
}

async function recordConnectionFailure(
  supabase: SupabaseClient,
  connection: GoogleCalendarConnection,
  error: unknown,
) {
  const failure = normalizeIntegrationError(error);
  await updateGoogleCalendarConnection(supabase, connection.id, {
    last_sync_error_at: new Date().toISOString(),
    last_sync_error_code: failure.code,
    last_sync_status: "error",
    status: failure.authorizationRevoked ? "revoked" : "error",
    sync_enabled: failure.authorizationRevoked ? false : connection.syncEnabled,
  });
}

export function normalizeIntegrationError(error: unknown) {
  if (error instanceof GoogleCalendarIntegrationError) return error;
  if (error instanceof GoogleCalendarApiError) {
    return new GoogleCalendarIntegrationError(error.code, error.retryable, error.authorizationRevoked);
  }
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code).slice(0, 80)
    : "integration_failed";
  return new GoogleCalendarIntegrationError(code, true);
}

function requireServiceRoleClient() {
  const supabase = getServiceRoleClient();
  if (!supabase) throw new GoogleCalendarIntegrationError("server_database_not_configured");
  return supabase;
}

function requireAppBaseUrl() {
  const appBaseUrl = getGoogleCalendarConfiguration().appBaseUrl;
  if (!appBaseUrl) throw new GoogleCalendarIntegrationError("app_base_url_invalid");
  return appBaseUrl;
}

function emptySummary(): GoogleCalendarSyncSummary {
  return { created: 0, deleted: 0, unchanged: 0, updated: 0 };
}
