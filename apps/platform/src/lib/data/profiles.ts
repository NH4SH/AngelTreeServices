import { createClient } from "@/lib/supabase/server";

export async function getCurrentCrewViewResetTimestamp() {
  const supabase = await createClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("crew_view_reset_requested_at")
    .eq("id", user.id)
    .maybeSingle();

  return (data?.crew_view_reset_requested_at as string | null | undefined) ?? null;
}
