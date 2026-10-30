import "server-only";

import type {
  GoogleCalendarEventPayload,
  GoogleCalendarEventReference,
  GoogleCalendarUserIdentity,
  GoogleCalendarWritableCalendar,
} from "./types";

type Fetcher = typeof fetch;

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
};

type CalendarListResponse = {
  items?: Array<{
    accessRole?: string;
    id?: string;
    primary?: boolean;
    summary?: string;
    summaryOverride?: string;
  }>;
  nextPageToken?: string;
};

type EventListResponse = {
  items?: Array<{ htmlLink?: string; id?: string; status?: string }>;
};

export class GoogleCalendarApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly authorizationRevoked: boolean;
  readonly notFound: boolean;

  constructor(code: string, options: { authorizationRevoked?: boolean; notFound?: boolean; retryable?: boolean } = {}) {
    super(`Google Calendar request failed (${code}).`);
    this.name = "GoogleCalendarApiError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.authorizationRevoked = options.authorizationRevoked ?? false;
    this.notFound = options.notFound ?? false;
  }
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return url;
}

export async function exchangeGoogleAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetcher?: Fetcher;
}) {
  return requestOAuthToken(new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  }), input.fetcher);
}

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetcher?: Fetcher;
}) {
  return requestOAuthToken(new URLSearchParams({
    client_id: input.clientId,
    client_secret: input.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  }), input.fetcher);
}

export async function fetchGoogleUserIdentity(accessToken: string, fetcher: Fetcher = fetch): Promise<GoogleCalendarUserIdentity> {
  const response = await safeFetch(fetcher, "https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw responseError(response.status, "identity_request_failed");
  const payload = await safeJson<{ email?: string; email_verified?: boolean; sub?: string }>(response);
  if (!payload?.sub || !payload.email || payload.email_verified === false) {
    throw new GoogleCalendarApiError("identity_unavailable");
  }
  return { email: payload.email.toLowerCase(), id: payload.sub };
}

export async function revokeGoogleCredential(token: string, fetcher: Fetcher = fetch) {
  const response = await safeFetch(fetcher, "https://oauth2.googleapis.com/revoke", {
    body: new URLSearchParams({ token }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok && response.status !== 400) throw responseError(response.status, "credential_revoke_failed");
}

export class GoogleCalendarApi {
  private readonly accessToken: string;
  private readonly fetcher: Fetcher;

  constructor(accessToken: string, fetcher: Fetcher = fetch) {
    this.accessToken = accessToken;
    this.fetcher = fetcher;
  }

  async listWritableCalendars(): Promise<GoogleCalendarWritableCalendar[]> {
    const calendars: GoogleCalendarWritableCalendar[] = [];
    let pageToken: string | null = null;
    let pageCount = 0;

    do {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      url.searchParams.set("maxResults", "250");
      url.searchParams.set("showDeleted", "false");
      url.searchParams.set("showHidden", "false");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await this.request(url, { method: "GET" });
      const payload = await safeJson<CalendarListResponse>(response);

      for (const item of payload?.items ?? []) {
        if (!item.id || (item.accessRole !== "writer" && item.accessRole !== "owner")) continue;
        calendars.push({
          accessRole: item.accessRole,
          id: item.id,
          primary: Boolean(item.primary),
          summary: item.summaryOverride || item.summary || (item.primary ? "Primary" : "Google Calendar"),
        });
      }

      pageToken = payload?.nextPageToken ?? null;
      pageCount += 1;
    } while (pageToken && pageCount < 10);

    return calendars.sort((left, right) => Number(right.primary) - Number(left.primary) || left.summary.localeCompare(right.summary));
  }

  async findManagedEvent(calendarId: string, scheduleEventId: string): Promise<GoogleCalendarEventReference | null> {
    const url = this.calendarUrl(calendarId, "/events");
    url.searchParams.set("maxResults", "10");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("privateExtendedProperty", `angelTreeScheduleEventId=${scheduleEventId}`);
    const response = await this.request(url, { method: "GET" });
    const payload = await safeJson<EventListResponse>(response);
    const item = (payload?.items ?? []).find((event) => event.id && event.status !== "cancelled");
    return item?.id ? { htmlLink: item.htmlLink ?? null, id: item.id } : null;
  }

  async createEvent(calendarId: string, event: GoogleCalendarEventPayload, eventId: string): Promise<GoogleCalendarEventReference> {
    const url = this.calendarUrl(calendarId, "/events");
    url.searchParams.set("sendUpdates", "none");
    try {
      const response = await this.request(url, {
        body: JSON.stringify({ ...event, id: eventId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return requiredEventReference(response);
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || error.code !== "event_conflict") throw error;
      const existing = await this.updateEvent(calendarId, eventId, event);
      if (existing) return existing;
      throw error;
    }
  }

  async updateEvent(calendarId: string, eventId: string, event: GoogleCalendarEventPayload) {
    const url = this.calendarUrl(calendarId, `/events/${encodeURIComponent(eventId)}`);
    url.searchParams.set("sendUpdates", "none");
    try {
      const response = await this.request(url, {
        body: JSON.stringify(event),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      return await requiredEventReference(response);
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.notFound) return null;
      throw error;
    }
  }

  async deleteEvent(calendarId: string, eventId: string) {
    const url = this.calendarUrl(calendarId, `/events/${encodeURIComponent(eventId)}`);
    url.searchParams.set("sendUpdates", "none");
    try {
      await this.request(url, { method: "DELETE" });
    } catch (error) {
      if (error instanceof GoogleCalendarApiError && error.notFound) return;
      throw error;
    }
  }

  private calendarUrl(calendarId: string, suffix: string) {
    return new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}${suffix}`);
  }

  private async request(url: URL, init: RequestInit) {
    const response = await safeFetch(this.fetcher, url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.accessToken}`,
      },
    });
    if (!response.ok) throw responseError(response.status, "calendar_api_failed");
    return response;
  }
}

async function requestOAuthToken(body: URLSearchParams, fetcher: Fetcher = fetch) {
  const response = await safeFetch(fetcher, "https://oauth2.googleapis.com/token", {
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const payload = await safeJson<OAuthTokenResponse>(response);
  if (!response.ok || !payload?.access_token) {
    const revoked = payload?.error === "invalid_grant";
    throw new GoogleCalendarApiError(revoked ? "authorization_revoked" : "token_exchange_failed", {
      authorizationRevoked: revoked,
      retryable: response.status >= 500 || response.status === 429,
    });
  }
  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in ?? 3600,
    refreshToken: payload.refresh_token ?? null,
    scopes: payload.scope?.split(/\s+/).filter(Boolean) ?? [],
  };
}

async function requiredEventReference(response: Response) {
  const payload = await safeJson<{ htmlLink?: string; id?: string }>(response);
  if (!payload?.id) throw new GoogleCalendarApiError("event_response_invalid");
  return { htmlLink: payload.htmlLink ?? null, id: payload.id };
}

async function safeFetch(fetcher: Fetcher, input: string | URL, init: RequestInit) {
  try {
    return await fetcher(input, {
      ...init,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });
  } catch {
    throw new GoogleCalendarApiError("network_unavailable", { retryable: true });
  }
}

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

function responseError(status: number, fallback: string) {
  if (status === 404 || status === 410) {
    return new GoogleCalendarApiError("not_found", { notFound: true });
  }
  if (status === 401) {
    return new GoogleCalendarApiError("authorization_revoked", { authorizationRevoked: true });
  }
  if (status === 429 || status >= 500) {
    return new GoogleCalendarApiError("temporarily_unavailable", { retryable: true });
  }
  if (status === 409) return new GoogleCalendarApiError("event_conflict", { retryable: true });
  if (status === 403) return new GoogleCalendarApiError("calendar_not_writable");
  return new GoogleCalendarApiError(fallback);
}
