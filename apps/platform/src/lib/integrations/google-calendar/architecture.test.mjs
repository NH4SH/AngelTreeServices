import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const platformRoot = process.cwd();
const repositoryRoot = resolve(platformRoot, "../..");
const migration = read("supabase/migrations/20260813020719_google_calendar_one_way_sync.sql");

test("normal schedule mutations do not synchronously call Google", () => {
  for (const path of [
    "apps/platform/src/app/admin/schedule/actions.ts",
    "apps/platform/src/app/admin/jobs/actions.ts",
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /google-calendar|GoogleCalendar|googleapis/i);
  }
});

test("database outbox triggers isolate integration failures from CRM writes", () => {
  assert.match(migration, /exception\s+when\s+others\s+then/gi);
  assert.match(migration, /Google mirroring must never make an Angel Tree schedule write fail/);
  assert.match(migration, /after insert or update or delete on public\.schedule_events/i);
});

test("integration tables are RLS-enabled and service-role only", () => {
  for (const table of [
    "google_calendar_connections",
    "google_calendar_event_mappings",
    "google_calendar_sync_outbox",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    assert.match(migration, new RegExp(`grant all on table public\\.${table} to service_role`, "i"));
  }
});

test("event mappings survive a hard schedule deletion long enough to clean up Google", () => {
  const mappingTable = migration.slice(
    migration.indexOf("create table public.google_calendar_event_mappings"),
    migration.indexOf("create table public.google_calendar_sync_outbox"),
  );
  assert.match(mappingTable, /schedule_event_id uuid not null/);
  assert.doesNotMatch(mappingTable, /schedule_event_id[^,]+references public\.schedule_events/i);
});

test("OAuth callback binds state to the authenticated platform user", () => {
  const callback = read("apps/platform/src/app/api/integrations/google-calendar/callback/route.ts");
  assert.match(callback, /supabase\.auth\.getUser/);
  assert.match(callback, /getCurrentUserRolesFromClient/);
  assert.match(callback, /verifyGoogleOAuthState/);
  assert.match(callback, /userId:\s*user\.id/);
  assert.match(callback, /completeGoogleCalendarOAuth/);
  assert.match(callback, /normalizeAppBaseUrl/);
  assert.doesNotMatch(callback, /searchParams\.get\(["']user[_-]?id/i);
  assert.doesNotMatch(callback, /new URL\([^\n]+request\.url/);
});

test("disconnect disables synchronization before optional provider cleanup", () => {
  const service = read("apps/platform/src/lib/integrations/google-calendar/service.ts");
  const disconnect = service.slice(service.indexOf("export async function disconnectGoogleCalendar"), service.indexOf("export async function processGoogleCalendarSyncQueue"));
  assert.ok(disconnect.indexOf("sync_enabled: false") < disconnect.indexOf("if (input.removeFutureEvents)"));
  assert.match(disconnect, /deleteGoogleCalendarMappingsForConnection/);
  assert.match(disconnect, /removeGoogleCalendarTaskForConnection/);
  assert.match(disconnect, /revokeGoogleCredential/);
});

test("connection actions derive ownership from the signed-in user, never submitted form identity", () => {
  const actions = read("apps/platform/src/lib/actions/google-calendar.ts");
  const repository = read("apps/platform/src/lib/integrations/google-calendar/repository.ts");
  assert.match(actions, /supabase\.auth\.getUser/);
  assert.match(actions, /getGoogleCalendarConnectionForUser\(serviceRole, context\.userId\)/);
  assert.doesNotMatch(actions, /formData\.get\(["'](?:auth_)?user_id/);
  assert.match(repository, /\.eq\("auth_user_id", authUserId\)/);
});

test("the client imports no non-action values from the use-server module", () => {
  const actions = read("apps/platform/src/lib/actions/google-calendar.ts");
  const component = read("apps/platform/src/components/google-calendar-settings.tsx");
  assert.doesNotMatch(actions, /export\s+(?:const|let|var|class)\s+/);
  assert.match(component, /google-calendar\/action-state/);
  assert.doesNotMatch(component, /initialGoogleCalendarActionState,[\s\S]*from\s+["']@\/lib\/actions\/google-calendar/);
});

test("the worker route authenticates with its own secret and never sends a browser credential", () => {
  const route = read("apps/platform/src/app/api/internal/integrations/google-calendar/process/route.ts");
  assert.match(route, /GOOGLE_CALENDAR_WORKER_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_|SUPABASE_SERVICE_ROLE_KEY/);
});

test("the native iOS target contains no Google Calendar OAuth implementation", () => {
  const nativeFiles = [
    "apps/ios/AngelTree/AngelTree/App/AngelTreeApp.swift",
    "apps/ios/AngelTree/AngelTree/Features/Schedule/ScheduleView.swift",
  ].filter((path) => {
    try { read(path); return true; } catch { return false; }
  });
  for (const path of nativeFiles) {
    assert.doesNotMatch(read(path), /GoogleSignIn|calendar\.events|accounts\.google\.com/i);
  }
});

function read(path) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}
