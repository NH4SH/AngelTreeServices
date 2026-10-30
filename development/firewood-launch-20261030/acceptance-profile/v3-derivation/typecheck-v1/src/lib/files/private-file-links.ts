import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Legacy signed_url fields now carry authenticated CRM routes, never bearer URLs.
export async function privateFileLinks(client: SupabaseClient<any, "public", any>, sourceType: string,
  rows: { id: string; storage_path: string | null }[]) {
  const data: { path: string; signedUrl: string }[] = [];
  let error: { message: string } | null = null;
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100).filter(row => row.storage_path);
    if (!batch.length) continue;
    const visible = await client.from("attachment_file_checks").select("source_id").eq("source_type", sourceType)
      .eq("can_open", true).in("source_id", batch.map(row => row.id));
    if (visible.error) { error = visible.error; continue; }
    const allowed = new Set((visible.data ?? []).map((row: { source_id: string }) => row.source_id));
    for (const row of batch) if (allowed.has(row.id)) data.push({ path: row.storage_path!, signedUrl: `/files/${sourceType}/${row.id}` });
  }
  return { data, error };
}
