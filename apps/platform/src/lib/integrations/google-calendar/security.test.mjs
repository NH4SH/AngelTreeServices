import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptGoogleRefreshToken,
  encryptGoogleRefreshToken,
  preserveOrEncryptRefreshToken,
} from "./credential-codec.ts";
import {
  buildGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
  GoogleCalendarApi,
  refreshGoogleAccessToken,
} from "./google-api.ts";
import { createGoogleOAuthState, verifyGoogleOAuthState } from "./oauth-state-codec.ts";
import { toPublicGoogleCalendarConnection } from "./public-connection.ts";
import { googleCalendarScopes } from "./types.ts";

const encryptionKey = Buffer.alloc(32, 17).toString("base64");

test("OAuth state accepts the original user, cookie, and nonce", () => {
  const created = createGoogleOAuthState("user-one", 1_000, encryptionKey);
  assert.ok(created);
  assert.equal(verifyGoogleOAuthState({
    configuredKey: encryptionKey,
    cookieValue: created.cookieValue,
    now: 2_000,
    returnedState: created.state,
    userId: "user-one",
  }), true);
});

test("OAuth state rejects tampering, another user, and expiration", () => {
  const created = createGoogleOAuthState("user-one", 1_000, encryptionKey);
  assert.ok(created);
  const common = { configuredKey: encryptionKey, cookieValue: created.cookieValue, returnedState: created.state };
  assert.equal(verifyGoogleOAuthState({ ...common, userId: "user-two", now: 2_000 }), false);
  assert.equal(verifyGoogleOAuthState({ ...common, returnedState: `${created.state}x`, userId: "user-one", now: 2_000 }), false);
  assert.equal(verifyGoogleOAuthState({ ...common, cookieValue: `${created.cookieValue}x`, userId: "user-one", now: 2_000 }), false);
  assert.equal(verifyGoogleOAuthState({ ...common, userId: "user-one", now: 1_000 + 601_000 }), false);
});

test("refresh credentials use authenticated encryption and reject tampering", () => {
  const encrypted = encryptGoogleRefreshToken("refresh-secret", encryptionKey);
  assert.ok(encrypted);
  assert.doesNotMatch(encrypted, /refresh-secret/);
  assert.equal(decryptGoogleRefreshToken(encrypted, encryptionKey), "refresh-secret");
  assert.equal(decryptGoogleRefreshToken(`${encrypted}x`, encryptionKey), null);
});

test("an omitted refresh token preserves the existing encrypted credential", () => {
  const existing = encryptGoogleRefreshToken("existing-refresh", encryptionKey);
  assert.equal(preserveOrEncryptRefreshToken({
    configuredKey: encryptionKey,
    existingEncryptedToken: existing,
    newRefreshToken: null,
  }), existing);
  const replacement = preserveOrEncryptRefreshToken({
    configuredKey: encryptionKey,
    existingEncryptedToken: existing,
    newRefreshToken: "new-refresh",
  });
  assert.equal(decryptGoogleRefreshToken(replacement, encryptionKey), "new-refresh");
});

test("the authorization URL requests only offline event, calendar-list, and identity access", () => {
  const url = buildGoogleAuthorizationUrl({
    clientId: "client-id",
    redirectUri: "https://admin.angeltreeservices.org/api/integrations/google-calendar/callback",
    scopes: googleCalendarScopes,
    state: "opaque-state",
  });
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("state"), "opaque-state");
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), [...googleCalendarScopes]);
  assert.doesNotMatch(url.searchParams.get("scope") ?? "", /calendar\.readonly|drive|gmail/);
});

test("authorization-code exchange is server-side and accepts a valid token response", async () => {
  let submittedBody = "";
  const token = await exchangeGoogleAuthorizationCode({
    clientId: "client-id",
    clientSecret: "client-secret",
    code: "authorization-code",
    redirectUri: "https://admin.angeltreeservices.org/api/integrations/google-calendar/callback",
    fetcher: async (_url, init) => {
      submittedBody = String(init?.body);
      return Response.json({ access_token: "access", refresh_token: "refresh", scope: googleCalendarScopes.join(" ") });
    },
  });
  assert.equal(token.accessToken, "access");
  assert.equal(token.refreshToken, "refresh");
  assert.match(submittedBody, /grant_type=authorization_code/);
  assert.match(submittedBody, /client_secret=client-secret/);
});

test("revoked Google authorization is classified without returning provider details", async () => {
  await assert.rejects(
    refreshGoogleAccessToken({
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "revoked",
      fetcher: async () => Response.json({ error: "invalid_grant", error_description: "sensitive provider detail" }, { status: 400 }),
    }),
    (error) => error.authorizationRevoked === true
      && error.code === "authorization_revoked"
      && !error.message.includes("sensitive provider detail"),
  );
});

test("calendar selection exposes only writable calendars", async () => {
  const api = new GoogleCalendarApi("access", async () => Response.json({ items: [
    { id: "read", summary: "Read only", accessRole: "reader" },
    { id: "write", summary: "Work", accessRole: "writer" },
    { id: "primary", summary: "Primary", accessRole: "owner", primary: true },
  ] }));
  const calendars = await api.listWritableCalendars();
  assert.deepEqual(calendars.map((calendar) => calendar.id), ["primary", "write"]);
});

test("provider create conflicts converge on the deterministic managed event", async () => {
  const requests = [];
  const api = new GoogleCalendarApi("access", async (url, init) => {
    requests.push({ body: String(init?.body ?? ""), method: init?.method, url: String(url) });
    if (requests.length === 1) return new Response(null, { status: 409 });
    return Response.json({ htmlLink: "https://calendar.google.com/event", id: "atsstable" });
  });
  const result = await api.createEvent("primary", eventPayloadFixture(), "atsstable");

  assert.equal(result.id, "atsstable");
  assert.equal(requests[0].method, "POST");
  assert.equal(JSON.parse(requests[0].body).id, "atsstable");
  assert.equal(requests[1].method, "PATCH");
  assert.match(requests[1].url, /events\/atsstable/);
});

test("the browser-facing connection DTO never includes credential or ownership internals", () => {
  const publicConnection = toPublicGoogleCalendarConnection(connectionFixture());
  assert.equal("refreshTokenEncrypted" in publicConnection, false);
  assert.equal("googleAccountId" in publicConnection, false);
  assert.equal("authUserId" in publicConnection, false);
  assert.equal("employeeId" in publicConnection, false);
  assert.equal("id" in publicConnection, false);
  assert.equal(publicConnection.googleAccountEmail, "employee@example.com");
});

function connectionFixture() {
  return {
    id: "connection-one",
    authUserId: "user-one",
    employeeId: "employee-one",
    googleAccountId: "google-one",
    googleAccountEmail: "employee@example.com",
    selectedCalendarId: "primary",
    selectedCalendarSummary: "Primary",
    syncEstimates: true,
    syncJobs: true,
    syncCompanyAll: false,
    syncEnabled: true,
    status: "active",
    refreshTokenEncrypted: "encrypted",
    lastSyncStatus: "never",
    lastSyncAttemptAt: null,
    lastSyncSucceededAt: null,
    lastSyncErrorCode: null,
    lastSyncErrorAt: null,
  };
}

function eventPayloadFixture() {
  return {
    summary: "Estimate - Rose",
    description: "Managed by Angel Tree Services.",
    start: { dateTime: "2026-08-14T13:00:00.000Z", timeZone: "America/New_York" },
    end: { dateTime: "2026-08-14T14:00:00.000Z", timeZone: "America/New_York" },
    visibility: "private",
    transparency: "opaque",
    extendedProperties: { private: { angelTreeManaged: "true", angelTreeScheduleEventId: "schedule-one" } },
  };
}
