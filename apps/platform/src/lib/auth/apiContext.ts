import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  getUserRoles,
  hasAllowedRole,
  platformRoleGroups,
  type PlatformRoleName,
} from "@/lib/auth/roles";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export type CrewApiContext = {
  roles: PlatformRoleName[];
  supabase: SupabaseClient<any, "public", any>;
  user: User;
};

export type CrewApiContextResult =
  | { context: CrewApiContext; error: null }
  | { context: null; error: { code: string; message: string; status: number } };

export async function getCrewApiContext(request: Request): Promise<CrewApiContextResult> {
  const config = getSupabasePublicConfig();

  if (!config) {
    return apiContextError("configuration_missing", "Supabase is not configured.", 503);
  }

  const token = getBearerToken(request);

  if (!token) {
    return apiContextError("authentication_required", "Provide a Supabase access token.", 401);
  }

  const supabase = createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return apiContextError("invalid_access_token", "Sign in again and provide a current access token.", 401);
  }

  const roles = await getUserRoles(supabase, user.id);

  if (!hasAllowedRole(roles, platformRoleGroups.crewApp)) {
    return apiContextError("crew_access_required", "This account does not have crew app access.", 403);
  }

  return {
    context: {
      roles,
      supabase,
      user,
    },
    error: null,
  };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function apiContextError(code: string, message: string, status: number): CrewApiContextResult {
  return {
    context: null,
    error: {
      code,
      message,
      status,
    },
  };
}
