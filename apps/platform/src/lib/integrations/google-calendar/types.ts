import type { PlatformRoleName } from "@/lib/auth/roles";

export const googleCalendarScopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

export type GoogleCalendarConnection = {
  id: string;
  authUserId: string;
  employeeId: string | null;
  googleAccountId: string;
  googleAccountEmail: string;
  selectedCalendarId: string;
  selectedCalendarSummary: string;
  syncEstimates: boolean;
  syncJobs: boolean;
  syncCompanyAll: boolean;
  syncEnabled: boolean;
  status: "active" | "error" | "revoked" | "cleanup_failed" | "disconnected";
  refreshTokenEncrypted: string | null;
  lastSyncStatus: "never" | "pending" | "success" | "error";
  lastSyncAttemptAt: string | null;
  lastSyncSucceededAt: string | null;
  lastSyncErrorCode: string | null;
  lastSyncErrorAt: string | null;
};

export type PublicGoogleCalendarConnection = Omit<
  GoogleCalendarConnection,
  "authUserId" | "employeeId" | "googleAccountId" | "id" | "refreshTokenEncrypted"
>;

export type ScheduleSyncAssignee = {
  employeeId: string | null;
  authUserId: string | null;
};

export type ScheduleSyncEvent = {
  id: string;
  eventType: string;
  status: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  jobId: string | null;
  partyName: string | null;
  location: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    fallbackLabel: string | null;
  } | null;
  assignees: ScheduleSyncAssignee[];
};

export type GoogleCalendarEventPayload = {
  summary: string;
  description: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone: string };
  end: { date?: string; dateTime?: string; timeZone: string };
  visibility: "private";
  transparency: "opaque";
  extendedProperties: {
    private: {
      angelTreeManaged: "true";
      angelTreeScheduleEventId: string;
    };
  };
};

export type GoogleCalendarEventReference = {
  id: string;
  htmlLink: string | null;
};

export type GoogleCalendarMapping = {
  id: string;
  connectionId: string;
  scheduleEventId: string;
  googleCalendarId: string;
  googleEventId: string;
  googleEventHtmlLink: string | null;
  sourceStartsAt: string | null;
  syncFingerprint: string;
};

export type GoogleCalendarWritableCalendar = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: "writer" | "owner";
};

export type GoogleCalendarUserIdentity = {
  id: string;
  email: string;
};

export type GoogleCalendarSyncContext = {
  connection: GoogleCalendarConnection;
  event: ScheduleSyncEvent | null;
  mapping: GoogleCalendarMapping | null;
  roles: PlatformRoleName[];
  windowStart: Date;
  windowEnd: Date;
  appBaseUrl: string;
  forceUpdate?: boolean;
};
