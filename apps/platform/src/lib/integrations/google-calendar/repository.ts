import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { platformRoleNames, type PlatformRoleName } from "@/lib/auth/roles";
import type {
  GoogleCalendarConnection,
  GoogleCalendarEventReference,
  GoogleCalendarMapping,
  ScheduleSyncEvent,
} from "./types";

const scheduleSyncSelect = `
  id,
  title,
  event_type,
  status,
  starts_at,
  ends_at,
  all_day,
  job_id,
  location_label,
  jobs:jobs!schedule_events_job_id_fkey(
    id,
    service_type,
    customers:customers!jobs_customer_id_fkey(id, display_name),
    organizations(id, name)
  ),
  source_customer:customers!schedule_events_source_customer_id_fkey(id, display_name),
  source_organization:organizations!schedule_events_source_organization_id_fkey(id, name),
  service_locations(id, street, city, state, postal_code),
  schedule_event_assignments(employee_id, user_id)
`;

type ConnectionRow = {
  id: string;
  auth_user_id: string;
  employee_id: string | null;
  google_account_id: string;
  google_account_email: string;
  selected_calendar_id: string;
  selected_calendar_summary: string;
  sync_estimates: boolean;
  sync_jobs: boolean;
  sync_company_all: boolean;
  sync_enabled: boolean;
  status: GoogleCalendarConnection["status"];
  refresh_token_encrypted: string | null;
  last_sync_status: GoogleCalendarConnection["lastSyncStatus"];
  last_sync_attempt_at: string | null;
  last_sync_succeeded_at: string | null;
  last_sync_error_code: string | null;
  last_sync_error_at: string | null;
};

type MappingRow = {
  id: string;
  connection_id: string;
  schedule_event_id: string;
  google_calendar_id: string;
  google_event_id: string;
  google_event_html_link: string | null;
  source_starts_at: string | null;
  sync_fingerprint: string;
};

export type GoogleCalendarOutboxTask = {
  attempt_count: number;
  connection_id: string | null;
  dedupe_key: string;
  revision: number;
  schedule_event_id: string | null;
  task_type: "schedule_event" | "connection";
};

export async function getGoogleCalendarConnectionForUser(supabase: SupabaseClient, authUserId: string) {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw databaseError("connection_read_failed");
  return data ? mapConnection(data as ConnectionRow) : null;
}

export async function getGoogleCalendarConnectionById(supabase: SupabaseClient, connectionId: string) {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) throw databaseError("connection_read_failed");
  return data ? mapConnection(data as ConnectionRow) : null;
}

export async function listActiveGoogleCalendarConnections(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .select("*")
    .eq("sync_enabled", true)
    .in("status", ["active", "error"]);
  if (error) throw databaseError("connection_list_failed");
  return ((data ?? []) as ConnectionRow[]).map(mapConnection);
}

export async function getEmployeeIdForAuthUser(supabase: SupabaseClient, authUserId: string) {
  const { data, error } = await supabase
    .from("employee_records")
    .select("id")
    .eq("auth_user_id", authUserId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw databaseError("employee_lookup_failed");
  return data?.id ?? null;
}

export async function getRolesForGoogleCalendarUser(supabase: SupabaseClient, authUserId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", authUserId);
  if (error) throw databaseError("role_lookup_failed");
  return (data ?? [])
    .flatMap((row: any) => row.roles ?? [])
    .map((role: { name?: string }) => role.name)
    .filter((role: string | undefined): role is PlatformRoleName =>
      Boolean(role && platformRoleNames.includes(role as PlatformRoleName)),
    );
}

export async function upsertGoogleCalendarConnection(supabase: SupabaseClient, input: {
  authUserId: string;
  employeeId: string | null;
  encryptedRefreshToken: string;
  googleAccountEmail: string;
  googleAccountId: string;
  grantedScopes: string[];
  selectedCalendarId: string;
  selectedCalendarSummary: string;
}) {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .upsert({
      auth_user_id: input.authUserId,
      employee_id: input.employeeId,
      google_account_email: input.googleAccountEmail,
      google_account_id: input.googleAccountId,
      granted_scopes: input.grantedScopes,
      last_sync_error_at: null,
      last_sync_error_code: null,
      refresh_token_encrypted: input.encryptedRefreshToken,
      selected_calendar_id: input.selectedCalendarId,
      selected_calendar_summary: input.selectedCalendarSummary,
      status: "active",
      sync_enabled: true,
      token_encryption_version: 1,
    }, { onConflict: "auth_user_id" })
    .select("*")
    .single();
  if (error || !data) throw databaseError("connection_save_failed");
  return mapConnection(data as ConnectionRow);
}

export async function updateGoogleCalendarConnection(supabase: SupabaseClient, connectionId: string, values: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("google_calendar_connections")
    .update(values)
    .eq("id", connectionId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw databaseError("connection_update_failed");
  return mapConnection(data as ConnectionRow);
}

export async function getScheduleSyncEvent(supabase: SupabaseClient, scheduleEventId: string) {
  const { data, error } = await supabase
    .from("schedule_events")
    .select(scheduleSyncSelect)
    .eq("id", scheduleEventId)
    .maybeSingle();
  if (error) throw databaseError("schedule_event_read_failed");
  return data ? mapScheduleSyncEvent(data as any) : null;
}

export async function listScheduleSyncEvents(supabase: SupabaseClient, windowStart: Date, windowEnd: Date) {
  const { data, error } = await supabase
    .from("schedule_events")
    .select(scheduleSyncSelect)
    .in("event_type", ["estimate", "job"])
    .gte("starts_at", windowStart.toISOString())
    .lt("starts_at", windowEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (error) throw databaseError("schedule_event_list_failed");
  return (data ?? []).map((row: any) => mapScheduleSyncEvent(row));
}

export async function getGoogleCalendarMappingsForConnection(supabase: SupabaseClient, connectionId: string) {
  const { data, error } = await supabase
    .from("google_calendar_event_mappings")
    .select("*")
    .eq("connection_id", connectionId);
  if (error) throw databaseError("mapping_list_failed");
  return ((data ?? []) as MappingRow[]).map(mapMapping);
}

export async function getGoogleCalendarMappingsForEvent(supabase: SupabaseClient, scheduleEventId: string) {
  const { data, error } = await supabase
    .from("google_calendar_event_mappings")
    .select("*")
    .eq("schedule_event_id", scheduleEventId);
  if (error) throw databaseError("mapping_list_failed");
  return ((data ?? []) as MappingRow[]).map(mapMapping);
}

export function googleCalendarMappingWriter(supabase: SupabaseClient) {
  return {
    async deleteMapping(mappingId: string) {
      const { error } = await supabase.from("google_calendar_event_mappings").delete().eq("id", mappingId);
      if (error) throw databaseError("mapping_delete_failed");
    },
    async saveMapping(input: {
      connectionId: string;
      event: GoogleCalendarEventReference;
      fingerprint: string;
      googleCalendarId: string;
      scheduleEventId: string;
      sourceStartsAt: string;
    }) {
      const { error } = await supabase.from("google_calendar_event_mappings").upsert({
        connection_id: input.connectionId,
        google_calendar_id: input.googleCalendarId,
        google_event_html_link: input.event.htmlLink,
        google_event_id: input.event.id,
        last_sync_error_code: null,
        last_synced_at: new Date().toISOString(),
        schedule_event_id: input.scheduleEventId,
        source_starts_at: input.sourceStartsAt,
        sync_fingerprint: input.fingerprint,
        sync_status: "synced",
      }, { onConflict: "connection_id,schedule_event_id" });
      if (error) throw databaseError("mapping_save_failed");
    },
  };
}

export async function enqueueGoogleCalendarConnectionSync(supabase: SupabaseClient, connectionId: string, reason: string) {
  const { error } = await supabase.rpc("queue_google_calendar_connection_sync", {
    queue_reason: reason.slice(0, 120),
    target_connection_id: connectionId,
  });
  if (error) throw databaseError("sync_enqueue_failed");
}

export async function claimGoogleCalendarSyncTasks(supabase: SupabaseClient, limit: number) {
  const { data, error } = await supabase.rpc("claim_google_calendar_sync_tasks", { p_limit: limit });
  if (error) throw databaseError("sync_claim_failed");
  return (data ?? []) as GoogleCalendarOutboxTask[];
}

export async function completeGoogleCalendarSyncTask(supabase: SupabaseClient, task: GoogleCalendarOutboxTask) {
  const { error } = await supabase
    .from("google_calendar_sync_outbox")
    .delete()
    .eq("dedupe_key", task.dedupe_key)
    .eq("revision", task.revision);
  if (error) throw databaseError("sync_complete_failed");
}

export async function failGoogleCalendarSyncTask(
  supabase: SupabaseClient,
  task: GoogleCalendarOutboxTask,
  errorCode: string,
  retryable: boolean,
) {
  const attemptCount = task.attempt_count + 1;
  const shouldRetry = retryable && attemptCount < 6;
  const delayMinutes = Math.min(15 * (2 ** Math.max(0, attemptCount - 1)), 24 * 60);
  const availableAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const { error } = await supabase
    .from("google_calendar_sync_outbox")
    .update({
      attempt_count: attemptCount,
      available_at: availableAt,
      last_error_code: errorCode.slice(0, 80),
      locked_at: null,
      status: shouldRetry ? "retry" : "exhausted",
    })
    .eq("dedupe_key", task.dedupe_key)
    .eq("revision", task.revision);
  if (error) throw databaseError("sync_failure_record_failed");
}

export async function removeGoogleCalendarTaskForConnection(supabase: SupabaseClient, connectionId: string) {
  await supabase.from("google_calendar_sync_outbox").delete().eq("dedupe_key", `connection:${connectionId}`);
}

export async function deleteGoogleCalendarMappingsForConnection(supabase: SupabaseClient, connectionId: string) {
  const { error } = await supabase
    .from("google_calendar_event_mappings")
    .delete()
    .eq("connection_id", connectionId);
  if (error) throw databaseError("mapping_delete_failed");
}

function mapConnection(row: ConnectionRow): GoogleCalendarConnection {
  return {
    authUserId: row.auth_user_id,
    employeeId: row.employee_id,
    googleAccountEmail: row.google_account_email,
    googleAccountId: row.google_account_id,
    id: row.id,
    lastSyncAttemptAt: row.last_sync_attempt_at,
    lastSyncErrorAt: row.last_sync_error_at,
    lastSyncErrorCode: row.last_sync_error_code,
    lastSyncStatus: row.last_sync_status,
    lastSyncSucceededAt: row.last_sync_succeeded_at,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    selectedCalendarId: row.selected_calendar_id,
    selectedCalendarSummary: row.selected_calendar_summary,
    status: row.status,
    syncCompanyAll: row.sync_company_all,
    syncEnabled: row.sync_enabled,
    syncEstimates: row.sync_estimates,
    syncJobs: row.sync_jobs,
  };
}

function mapMapping(row: MappingRow): GoogleCalendarMapping {
  return {
    connectionId: row.connection_id,
    googleCalendarId: row.google_calendar_id,
    googleEventHtmlLink: row.google_event_html_link,
    googleEventId: row.google_event_id,
    id: row.id,
    scheduleEventId: row.schedule_event_id,
    sourceStartsAt: row.source_starts_at,
    syncFingerprint: row.sync_fingerprint,
  };
}

function mapScheduleSyncEvent(row: any): ScheduleSyncEvent {
  const job = one(row.jobs);
  const customer = one(job?.customers) ?? one(row.source_customer);
  const organization = one(job?.organizations) ?? one(row.source_organization);
  const location = one(row.service_locations);
  return {
    allDay: Boolean(row.all_day),
    assignees: (row.schedule_event_assignments ?? []).map((assignment: any) => ({
      authUserId: assignment.user_id ?? null,
      employeeId: assignment.employee_id ?? null,
    })),
    endsAt: row.ends_at ?? null,
    eventType: row.event_type,
    id: row.id,
    jobId: row.job_id ?? null,
    location: location || row.location_label ? {
      city: location?.city ?? null,
      fallbackLabel: row.location_label ?? null,
      postalCode: location?.postal_code ?? null,
      state: location?.state ?? null,
      street: location?.street ?? null,
    } : null,
    partyName: organization?.name ?? customer?.display_name ?? null,
    startsAt: row.starts_at,
    status: row.status,
    title: row.title || humanize(job?.service_type) || "Angel Tree work",
  };
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function humanize(value: string | null | undefined) {
  if (!value) return "";
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function databaseError(code: string) {
  return Object.assign(new Error(`Google Calendar database operation failed (${code}).`), { code });
}
