import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getGoogleCalendarConfiguration } from "@/lib/integrations/google-calendar/config";
import { exchangeGoogleAuthorizationCode } from "@/lib/integrations/google-calendar/google-api";
import { googleOAuthStateCookieName, verifyGoogleOAuthState } from "@/lib/integrations/google-calendar/oauth-state";
import { completeGoogleCalendarOAuth, normalizeIntegrationError } from "@/lib/integrations/google-calendar/service";
import { normalizeAppBaseUrl } from "@/lib/security/app-base-url";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const configuration = getGoogleCalendarConfiguration();
  const safeBaseUrl = configuration.appBaseUrl ?? normalizeAppBaseUrl(request.nextUrl.origin);
  const finish = (code: string) => {
    if (!safeBaseUrl) return Response.json({ message: "Google Calendar callback is not configured." }, { status: 503 });
    const response = NextResponse.redirect(new URL(`/employee/integrations/google-calendar?google=${encodeURIComponent(code)}`, safeBaseUrl));
    response.cookies.delete({ name: googleOAuthStateCookieName, path: "/api/integrations/google-calendar" });
    return response;
  };

  const supabase = await createClient();
  if (!supabase) return finish("not_configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return finish("session_required");
  const roles = await getCurrentUserRolesFromClient(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.crewApp)) return finish("not_authorized");

  const stateIsValid = verifyGoogleOAuthState({
    cookieValue: request.cookies.get(googleOAuthStateCookieName)?.value,
    returnedState: request.nextUrl.searchParams.get("state"),
    userId: user.id,
  });
  if (!stateIsValid) return finish("state_invalid");
  if (request.nextUrl.searchParams.get("error")) return finish("cancelled");

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code || code.length > 4096 || !configuration.configured || !configuration.redirectUri) return finish("callback_invalid");

  try {
    const token = await exchangeGoogleAuthorizationCode({
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      code,
      redirectUri: configuration.redirectUri,
    });
    await completeGoogleCalendarOAuth({
      accessToken: token.accessToken,
      authUserId: user.id,
      googleRefreshToken: token.refreshToken,
      grantedScopes: token.scopes,
    });
    return finish("connected");
  } catch (error) {
    const failure = normalizeIntegrationError(error);
    if (failure.code === "different_account_requires_disconnect") return finish("different_account");
    if (failure.code === "refresh_token_unavailable") return finish("refresh_token_missing");
    return finish("connection_failed");
  }
}
