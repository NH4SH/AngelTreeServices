import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PreparedUpload } from './upload-validation';
import { getDocumentScanClient } from './document-scan-service';
import { scanDocumentBytes } from './document-scanner';
export const attachmentBuckets = ['employee-files','employee-program-files','equipment-files','material-files','job-cost-receipts','job-photos'] as const;
export type AttachmentBucket = typeof attachmentBuckets[number];
export type AttachmentScanStatus = 'unscanned' | 'checking' | 'clean' | 'quarantined' | 'unavailable';
type Client = SupabaseClient<any, 'public', any>;
export async function checkStoredAttachment(client: Client, bucket: AttachmentBucket, path: string, actorId: string, expectedHash?: string): Promise<AttachmentScanStatus> {
  try {
    const claim = await client.rpc('claim_attachment_scan', { p_bucket: bucket, p_path: path, p_actor: actorId, p_expected_sha256: expectedHash ?? null });
    if (claim.error || !claim.data) return 'unavailable';
    if (claim.data.status === 'clean' || claim.data.status === 'quarantined') return claim.data.status;
    if (typeof claim.data.token !== 'string' || claim.data.path !== path) return 'unavailable';
    let verdict: AttachmentScanStatus = 'unavailable'; let sha256: string | null = null;
    try {
      const object = await client.storage.from(bucket).download(path);
      if (!object.error && object.data && object.data.size > 0 && object.data.size <= 25 * 1024 * 1024
        && (claim.data.size == null || Number(claim.data.size) === object.data.size)) {
        const bytes = new Uint8Array(await object.data.arrayBuffer());
        const digest = createHash('sha256').update(bytes).digest('hex');
        if (!expectedHash || expectedHash === digest) {
          const checked = await scanDocumentBytes(bytes); verdict = checked.status; sha256 = checked.sha256 ?? null;
        }
      }
    } catch { /* Retain the file and lease history for explicit recovery. */ }
    const finished = await client.rpc('finish_attachment_scan', { p_bucket: bucket, p_path: path, p_actor: actorId,
      p_token: claim.data.token, p_verdict: verdict, p_sha256: sha256 });
    return !finished.error && finished.data === true ? verdict : 'unavailable';
  } catch { return 'unavailable'; }
}

// Every caller keeps its existing validation, metadata, financial and audit work.
// Storage INSERT still uses the original authenticated client and its policies.
export async function uploadCheckedAttachment(client: Client, bucket: AttachmentBucket, path: string, upload: PreparedUpload,
  actorId?: string, options: { cacheControl?: string } = {}) {
  const mode = await client.rpc('attachment_scan_enabled', { p_bucket: bucket });
  if (mode.error || typeof mode.data !== 'boolean') return { error: { message: 'File checks could not be loaded. Refresh and try again.' }, scanStatus: 'unavailable' as const };
  const uploaded = await client.storage.from(bucket).upload(path, upload.bytes,
    { ...options, contentType: upload.contentType, upsert: false, cacheControl: "0" });
  if (uploaded.error) return { error: uploaded.error, scanStatus: 'unavailable' as const };
  if (!mode.data) return { error: null, scanStatus: 'unscanned' as const };
  const actor = actorId ?? (await client.auth.getUser()).data.user?.id;
  const scanner = getDocumentScanClient();
  const scanStatus = scanner && actor ? await checkStoredAttachment(scanner, bucket, path, actor,
    createHash('sha256').update(upload.bytes).digest('hex')) : 'unavailable';
  // A held attachment does not roll back a cost, credential, safety report or its
  // metadata. Download/signing protection is authoritative in Storage.
  return { error: null, scanStatus };
}
