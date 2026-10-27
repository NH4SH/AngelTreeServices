import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { parseMaterialLookupRequest, readMaterialLookupPage } from "@/lib/data/material-lookups";
import { privateNoStoreHeaders } from "@/lib/security/headers";

export const dynamic = "force-dynamic";
const headers = Object.fromEntries(privateNoStoreHeaders.map(({ key, value }) => [key, value]));
export async function GET(request: Request, context: { params: Promise<{ purpose: string }> }) {
  const { purpose } = await context.params;
  const input = parseMaterialLookupRequest(new URL(request.url).searchParams, purpose);
  if (!input) return Response.json({ error: "Invalid lookup request." }, { status: 400, headers });
  try {
    const db = await createClient();
    if (!db) return Response.json({ error: "Lookups are unavailable." }, { status: 503, headers });
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return Response.json({ error: "Sign in again to use lookups." }, { status: 401, headers });
    if (!hasAllowedRole(await getUserRoles(db, user.id), platformRoleGroups.internalStaff)) return Response.json({ error: "This account cannot use materials lookups." }, { status: 403, headers });
    return Response.json(await readMaterialLookupPage(db, input), { headers });
  } catch { return Response.json({ error: "Choices could not load. Please retry." }, { status: 503, headers }); }
}
