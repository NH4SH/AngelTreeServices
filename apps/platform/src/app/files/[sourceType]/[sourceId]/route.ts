import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
export async function GET(_request:Request,{params}:{params:Promise<{sourceType:string;sourceId:string}>}) {
  const context = await getAuthenticatedPlatformContext("/files");
  const unavailable = () => new Response("This file is unavailable. Return to File checks for its status.",{status:404,headers:{"cache-control":"private, no-store","content-type":"text/plain; charset=utf-8"}});
  if (!context.configured) return unavailable();
  const {sourceType,sourceId} = await params;
  if (!/^[a-z_]{1,40}$/.test(sourceType) || !/^[0-9a-f-]{36}$/i.test(sourceId)) return unavailable();
  const visible = await context.supabase.from("attachment_file_sources").select("bucket_id,storage_path").eq("source_type",sourceType).eq("source_id",sourceId).maybeSingle();
  if (visible.error || !visible.data?.storage_path) return unavailable();
  const signed = await context.supabase.storage.from(visible.data.bucket_id).createSignedUrl(visible.data.storage_path,60,{download:true});
  if (signed.error || !signed.data?.signedUrl) return unavailable();
  return new Response(null,{status:303,headers:{location:signed.data.signedUrl,"cache-control":"private, no-store","referrer-policy":"no-referrer"}});
}
