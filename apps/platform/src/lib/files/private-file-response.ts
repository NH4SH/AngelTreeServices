import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getFileRequestContext, fileResponseHeaders } from "./request-auth";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export const privateFileChunkBytes = 1024 * 1024;
const unavailable = () => new Response("This file cannot be opened. Return to File checks or ask an administrator for help.",
  { status: 404, headers: { ...fileResponseHeaders, "content-type": "text/plain; charset=utf-8" } });
type Descriptor = { bucket_id: string; storage_path: string; label: string; object_id: string; object_version: string;
  size_bytes: number; mime_type: string; etag: string | null };
function version(row: Descriptor) {
  return '"' + createHash("sha256").update(JSON.stringify([row.object_id, row.object_version, row.size_bytes, row.etag])).digest("hex") + '"';
}
export async function privateFileResponse(request: Request, sourceType: string, sourceId: string) {
  if (!/^[a-z_]{1,40}$/.test(sourceType) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sourceId)) return unavailable();
  const context = await getFileRequestContext(request);
  if (!context) return unavailable();
  const descriptor = () => context.supabase.rpc("private_file_descriptor", { p_source_type: sourceType, p_source_id: sourceId });
  const selected = await descriptor(); const row = selected.data?.[0] as Descriptor | undefined;
  if (selected.error || !row || row.size_bytes < 1 || row.size_bytes > 25 * 1024 * 1024) return unavailable();
  const tag = version(row); const url = new URL(request.url);
  const safeMime = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain",
    "application/msword", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(row.mime_type) ? row.mime_type : "application/octet-stream";
  if (url.searchParams.get("info") === "1") return Response.json({ name: row.storage_path.split("/").pop() || "attachment",
    label: row.label || "Attachment", size: row.size_bytes,
    mimeType: safeMime, version: tag, chunkBytes: privateFileChunkBytes }, { headers: fileResponseHeaders });
  const range = request.headers.get("range");
  if (!range) return new Response(null, { status: 303, headers: { ...fileResponseHeaders,
    location: `/files/open/${sourceType}/${sourceId}` } });
  const match = /^bytes=(\d+)-(\d+)$/.exec(range);
  const start = Number(match?.[1]); const end = Number(match?.[2]);
  if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start
    || end >= row.size_bytes || end - start + 1 > privateFileChunkBytes) return new Response("Choose a smaller file range.",
      { status: 416, headers: fileResponseHeaders });
  if (request.headers.get("if-match") !== tag) return new Response("The file changed. Open it again.", { status: 412, headers: fileResponseHeaders });
  const config = getSupabasePublicConfig(); if (!config) return unavailable();
  const storageUrl = new URL(`${config.url}/storage/v1/object/authenticated/${encodeURIComponent(row.bucket_id)}/${row.storage_path.split("/").map(encodeURIComponent).join("/")}`);
  storageUrl.searchParams.set("cacheNonce", randomUUID());
  try {
    // Actual user JWT rechecks Storage RLS/gates; never deliver with service access.
    const response = await fetch(storageUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${context.token}`, apikey: config.anonKey, Range: range,
        "cache-control": "no-cache, no-store", ...(row.etag ? { "if-match": `"${row.etag.replaceAll('"', '')}"` } : {}) } });
    const expected = `bytes ${start}-${end}/${row.size_bytes}`;
    if (response.status !== 206 || response.headers.get("content-range") !== expected) { await response.body?.cancel(); return unavailable(); }
    const reader = response.body?.getReader(); if (!reader) return unavailable();
    const parts: Uint8Array[] = []; let length = 0;
    while (true) { const next = await reader.read(); if (next.done) break; length += next.value.length;
      if (length > end - start + 1) { await reader.cancel(); return unavailable(); } parts.push(next.value); }
    if (length !== end - start + 1) return unavailable();
    const after = await descriptor();
    if (after.error || !after.data?.[0] || version(after.data[0]) !== tag) return unavailable();
    return new Response(Buffer.concat(parts), { status: 206, headers: { ...fileResponseHeaders,
      "content-type": "application/octet-stream", "content-range": expected, "content-length": String(length),
      "accept-ranges": "bytes", etag: tag, "content-disposition": "attachment" } });
  } catch { return unavailable(); }
}
