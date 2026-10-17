import { randomUUID } from "node:crypto";
import { getFileRequestContext, sameOriginUpload, fileResponseHeaders } from "@/lib/files/request-auth";
import { encodeUploadReference, maxTransferBytes, stagingBucket } from "@/lib/files/upload-reference";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const fail = (status: number, message: string) => Response.json({ error: { message } }, { status, headers: fileResponseHeaders });
  if (!sameOriginUpload(request)) return fail(403, "Refresh this page before uploading.");
  const context = await getFileRequestContext(request);
  if (!context) return fail(401, "Sign in before uploading a file.");
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return fail(413, "Upload details are too large.");
  let input: { name?: unknown; type?: unknown; size?: unknown };
  try {
    // Bound streamed/chunked JSON too; Content-Length is only an early check.
    const reader = request.body?.getReader(); let bytes = 0; const parts: Uint8Array[] = [];
    if (!reader) return fail(400, "Choose a file to upload.");
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length;
      if (bytes > 4096) { await reader.cancel(); return fail(413, "Upload details are too large."); } parts.push(part.value); }
    input = JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch { return fail(400, "The file details could not be read."); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "Choose a file to upload.");
  if (typeof input.name !== "string" || !input.name || input.name.length > 255 || /[\\/\u0000-\u001f]/.test(input.name)
    || typeof input.type !== "string" || input.type.length > 150 || !Number.isSafeInteger(input.size)
    || Number(input.size) < 1 || Number(input.size) > maxTransferBytes) return fail(400, "Choose a supported file up to 25 MB.");
  const id = randomUUID(); const config = getSupabasePublicConfig()!;
  return Response.json({ reference: encodeUploadReference({ id, name: input.name, type: input.type }),
    bucket: stagingBucket, path: `${context.user.id}/${id}`, storageUrl: config.url, publicKey: config.anonKey },
    { headers: fileResponseHeaders });
}
