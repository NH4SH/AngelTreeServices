import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
// Sign at click time, so a long-open list does not leave expired download links.
// Both metadata and Storage reads use the staff session and their current RLS.
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const context = await getAuthenticatedPlatformContext("/admin/documents");
  const unavailable = () => new Response("This file cannot be opened. Return to Documents and try Check file, or ask an administrator for help.",
    { status: 404, headers: { "cache-control": "private, no-store", "content-type": "text/plain; charset=utf-8" } });
  if (!context.configured || !hasAllowedRole(context.roles, platformRoleGroups.internalStaff)
    || !/^[0-9a-f-]{36}$/i.test(documentId)) return unavailable();
  const record = await context.supabase.from("documents").select("storage_path").eq("id", documentId).is("archived_at", null).maybeSingle();
  if (record.error || !record.data) return unavailable();
  const signed = await context.supabase.storage.from("platform-documents").createSignedUrl(record.data.storage_path, 60, { download: true });
  if (signed.error || !signed.data?.signedUrl) return unavailable();
  return new Response(null, { status: 303, headers: { location: signed.data.signedUrl, "cache-control": "private, no-store", "referrer-policy": "no-referrer" } });
}
