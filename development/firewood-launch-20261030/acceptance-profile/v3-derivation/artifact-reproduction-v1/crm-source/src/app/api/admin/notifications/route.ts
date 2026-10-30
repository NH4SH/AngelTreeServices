import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import {
  normalizeNotificationInboxTab,
  systemHealthNotificationDestination,
} from "@/lib/notifications/scope";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const tab = normalizeNotificationInboxTab(url.searchParams.get("tab"));

  const [activityCountResult, systemCountResult] = await Promise.all([
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .is("read_at", null)
      .or(`destination_path.is.null,destination_path.neq.${systemHealthNotificationDestination}`),
    supabase
      .from("admin_notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .is("read_at", null)
      .eq("destination_path", systemHealthNotificationDestination),
  ]);

  if (activityCountResult.error || systemCountResult.error) {
    return NextResponse.json({ error: "Notifications are unavailable." }, { status: 500 });
  }

  const counts = {
    unreadCount: activityCountResult.count ?? 0,
    systemUnreadCount: systemCountResult.count ?? 0,
  };

  if (mode === "count") return NextResponse.json(counts);

  let recent = supabase
    .from("admin_notifications")
    .select("id, category, title, body, destination_path, read_at, created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false });

  recent = tab === "system"
    ? recent.eq("destination_path", systemHealthNotificationDestination)
    : recent.or(`destination_path.is.null,destination_path.neq.${systemHealthNotificationDestination}`);

  const result = await recent.limit(8);
  if (result.error) return NextResponse.json({ error: "Notifications are unavailable." }, { status: 500 });

  return NextResponse.json({ notifications: result.data ?? [], ...counts });
}

export async function PATCH(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as { id?: unknown; read?: unknown } | null;
  if (!body || typeof body.id !== "string" || typeof body.read !== "boolean") {
    return NextResponse.json({ error: "A notification and read state are required." }, { status: 400 });
  }
  const { error } = await auth.supabase
    .from("admin_notifications")
    .update({ read_at: body.read ? new Date().toISOString() : null })
    .eq("id", body.id)
    .eq("recipient_user_id", auth.user.id);
  if (error) return NextResponse.json({ error: "Notification could not be updated." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function requireAdmin() {
  const supabase = await createClient();
  if (!supabase) return { response: NextResponse.json({ error: "Configuration unavailable." }, { status: 503 }) };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { response: NextResponse.json({ error: "Owner or admin access is required." }, { status: 403 }) };
  }
  return { response: null, supabase, user };
}
