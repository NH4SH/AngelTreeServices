import "server-only";
import { getCrewApiContext } from "@/lib/auth/apiContext";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

// Cookie requests and native bearer requests share live effective-access checks.
export async function getFileRequestContext(request?: Request) {
  const bearer = request?.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (request?.headers.has("authorization")) {
    const result = await getCrewApiContext(request);
    return result.context && bearer ? { ...result.context, token: bearer } : null;
  }
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.crewApp)) return null;
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  return token ? { supabase, user, roles, token } : null;
}
export function sameOriginUpload(request: Request) {
  // Native requests use bearer authentication, not ambient browser cookies.
  if (request.headers.has("authorization")) return true;
  // Next's local request URL can use localhost while Host is 127.0.0.1. The
  // configured app origin also supplies HTTPS behind the hosting adapter.
  try {
    const expected = new URL(process.env.APP_BASE_URL ?? request.url);
    if (!process.env.APP_BASE_URL && request.headers.get("host")) expected.host = request.headers.get("host")!;
    return request.headers.get("origin") === expected.origin && request.headers.get("sec-fetch-site") !== "cross-site";
  } catch { return false; }
}
export const fileResponseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "cdn-cache-control": "no-store",
  "netlify-cdn-cache-control": "no-store",
  "pragma": "no-cache", "expires": "0", "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff", "vary": "Cookie, Authorization",
};
