import { NextResponse } from "next/server";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createGoogleOAuthState, googleOAuthStateCookieName, googleOAuthStateLifetimeSeconds } from "@/lib/integrations/google-calendar/oauth-state";
import { getGoogleCalendarConfiguration } from "@/lib/integrations/google-calendar/config";
import { buildGoogleAuthorizationUrl } from "@/lib/integrations/google-calendar/google-api";
import { googleCalendarScopes } from "@/lib/integrations/google-calendar/types";
import { normalizeAppBaseUrl } from "@/lib/security/app-base-url";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const configuration = getGoogleCalendarConfiguration();
  const safeBaseUrl = configuration.appBaseUrl ?? normalizeAppBaseUrl(new URL(request.url).origin);
  if (!safeBaseUrl) return Response.json({ message: "Google Calendar integration is not configured." }, { status: 503 });
  const supabase = await createClient();
  if (!supabase) return settingsRedirect(safeBaseUrl, "not_configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/employee/integrations/google-calendar", safeBaseUrl));
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.crewApp)) return settingsRedirect(safeBaseUrl, "not_authorized");

  if (!configuration.configured || !configuration.redirectUri) return settingsRedirect(safeBaseUrl, "not_configured");
  const oauthState = createGoogleOAuthState(user.id);
  if (!oauthState) return settingsRedirect(safeBaseUrl, "not_configured");

  const response = NextResponse.redirect(buildGoogleAuthorizationUrl({
    clientId: configuration.clientId,
    redirectUri: configuration.redirectUri,
    scopes: googleCalendarScopes,
    state: oauthState.state,
  }));
  response.cookies.set(googleOAuthStateCookieName, oauthState.cookieValue, {
    httpOnly: true,
    maxAge: googleOAuthStateLifetimeSeconds,
    path: "/api/integrations/google-calendar",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

function settingsRedirect(safeBaseUrl: string, code: string) {
  return NextResponse.redirect(new URL(`/employee/integrations/google-calendar?google=${encodeURIComponent(code)}`, safeBaseUrl));
}
