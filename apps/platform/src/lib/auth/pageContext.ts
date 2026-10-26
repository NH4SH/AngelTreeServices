import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUserRolesFromClient } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

// React cache lasts only for this render/request. Mutation commands continue
// calling the live authorization functions directly; nothing persists between users.
export const getPlatformReadContext = cache(async () => {
  const supabase = await createClient();

  if (!supabase) {
    return {
      configured: false as const,
      supabase: null,
      user: null,
      roles: [],
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roles = user ? await getCurrentUserRolesFromClient(supabase, user.id) : [];

  return {
    configured: true as const,
    supabase,
    user,
    roles,
  };
});

export async function getAuthenticatedPlatformContext(nextPath: string) {
  const context = await getPlatformReadContext();

  if (!context.configured) {
    return context;
  }

  const user = context.user;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return { ...context, user };
}
