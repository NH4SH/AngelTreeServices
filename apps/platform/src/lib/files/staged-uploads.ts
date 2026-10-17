import "server-only";
import { getDocumentScanClient } from "@/lib/security/document-scan-service";
import { getFileRequestContext } from "./request-auth";
import { isUploadReference, parseUploadReference, stagingBucket, maxTransferBytes } from "./upload-reference";

type Actor = { user: { id: string } };
export async function withStagedUploads<State>(input: FormData, run: (form: FormData) => Promise<State>, actor?: Actor): Promise<State> {
  if (![...input.values()].some(isUploadReference)) return run(input);
  const context = actor ?? await getFileRequestContext();
  const service = getDocumentScanClient();
  const fail = () => ({ status: "error", message: "The file transfer is unavailable or expired. Select the file again and retry." }) as State;
  if (!context || !service) return fail();
  const output = new FormData(); const paths: string[] = []; let total = 0;
  try {
    // Preserve the old 26 MB aggregate form budget while moving bytes off the
    // server-action request. Individual area validation still runs in run().
    for (const [key, value] of input.entries()) {
      if (!isUploadReference(value)) { if (value instanceof File) total += value.size; output.append(key, value); continue; }
      const ref = parseUploadReference(value); const path = `${context.user.id}/${ref.id}`;
      const info = await service.rpc("staged_upload_info", { p_actor: context.user.id, p_upload: ref.id });
      const size = Number(info.data?.size);
      if (info.error || !Number.isSafeInteger(size) || size < 1 || size > maxTransferBytes || (total += size) > 26 * 1024 * 1024) return fail();
      const object = await service.storage.from(stagingBucket).download(path, { cacheNonce: crypto.randomUUID() }, { cache: "no-store" });
      if (object.error || !object.data || object.data.size !== size) return fail();
      const after = await service.rpc("staged_upload_info", { p_actor: context.user.id, p_upload: ref.id });
      if (after.error || !after.data || after.data.version !== info.data.version) return fail();
      output.append(key, new File([object.data], ref.name, { type: ref.type })); paths.push(path);
    }
    if (total > 26 * 1024 * 1024) return fail();
  } catch { return fail(); }
  const cleanup = async () => { try { await service.storage.from(stagingBucket).remove([...new Set(paths)]); } catch { /* Private transport buffers may be reviewed later. Never retry a saved business action for cleanup. */ } };
  try {
    const result = await run(output);
    if (result && typeof result === "object" && "status" in result && result.status === "success") await cleanup();
    return result;
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) await cleanup();
    throw error;
  }
}
