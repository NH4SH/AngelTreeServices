import type { GoogleCalendarConnection, PublicGoogleCalendarConnection } from "./types";

export function toPublicGoogleCalendarConnection(connection: GoogleCalendarConnection): PublicGoogleCalendarConnection {
  return {
    googleAccountEmail: connection.googleAccountEmail,
    lastSyncAttemptAt: connection.lastSyncAttemptAt,
    lastSyncErrorAt: connection.lastSyncErrorAt,
    lastSyncErrorCode: connection.lastSyncErrorCode,
    lastSyncStatus: connection.lastSyncStatus,
    lastSyncSucceededAt: connection.lastSyncSucceededAt,
    selectedCalendarId: connection.selectedCalendarId,
    selectedCalendarSummary: connection.selectedCalendarSummary,
    status: connection.status,
    syncCompanyAll: connection.syncCompanyAll,
    syncEnabled: connection.syncEnabled,
    syncEstimates: connection.syncEstimates,
    syncJobs: connection.syncJobs,
  };
}
