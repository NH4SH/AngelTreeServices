import { redirect } from "next/navigation";
import { getCurrentUserRoles } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedPlatformContext(nextPath: string) {
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

  if (!user) {
    redirect(`/login?next=${nextPath}`);
  }

  const roles = await getCurrentUserRoles();

  return {
    configured: true as const,
    supabase,
    user,
    roles,
  };
}
