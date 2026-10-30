import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };

// Same-origin session verification also works in local browsers that cannot
// reach a separate Supabase port. No draft contents ever reach this endpoint.
export async function GET() {
  const client = await createClient();
  if (!client) return Response.json({ userId: null }, { status: 503, headers });
  const { data, error } = await client.auth.getUser();
  if (error?.name === "AuthRetryableFetchError") return Response.json({ userId: null }, { status: 503, headers });
  if (!data.user) return Response.json({ userId: null }, { status: 401, headers });
  const access = await client.rpc("has_effective_platform_access");
  if (access.error) return Response.json({ userId: null }, { status: 503, headers });
  if (access.data !== true) return Response.json({ userId: null }, { status: 403, headers });
  return Response.json({ userId: data.user.id }, { headers });
}
