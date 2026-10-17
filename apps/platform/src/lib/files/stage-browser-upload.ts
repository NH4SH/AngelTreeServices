"use client";
import { createClient } from "@/lib/supabase/client";
import { maxTransferBytes } from "./upload-reference";

export async function stageFormUploads(input: FormData): Promise<FormData> {
  const files = [...input.values()].filter((value): value is File => value instanceof File);
  if (files.reduce((size, value) => size + value.size, 0) > 26 * 1024 * 1024) throw new Error("The selected files are too large for one form. Submit fewer files at a time.");
  const output = new FormData(); const client = createClient();
  // Sequential transfer avoids multiplying memory/network load for multi-file forms.
  for (const [key, value] of input.entries()) {
    if (!(value instanceof File) || value.size === 0) { output.append(key, value); continue; }
    if (!client || value.size > maxTransferBytes) throw new Error("Choose a supported file up to 25 MB.");
    const response = await fetch("/api/uploads", { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ name: value.name, type: value.type, size: value.size }) });
    if (!response.ok) throw new Error("The file transfer could not start. Sign in again and retry.");
    const ticket = await response.json();
    const result = await client.storage.from(ticket.bucket).upload(ticket.path, value,
      { contentType: value.type || "application/octet-stream", cacheControl: "0", upsert: false });
    if (result.error) throw new Error("The file transfer did not finish. Check your connection and try again.");
    output.append(key, ticket.reference);
  }
  return output;
}
