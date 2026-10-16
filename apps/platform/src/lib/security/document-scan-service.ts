import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { scanDocumentBytes } from './document-scanner';
export function getDocumentScanClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
  });
}
// Caller establishes a live staff session; SQL rechecks the actor at claim AND
// finish, including deactivation during the external check. Service key is server-only.
async function checkStoredDocumentInternal(client: SupabaseClient<any, 'public', any>, documentId: string, actorId: string, expectedHash?: string) {
  const claim = await client.rpc('claim_document_scan', { p_document: documentId, p_actor: actorId, p_expected_sha256: expectedHash ?? null });
  if (claim.error || !claim.data) return 'unavailable' as const;
  if (claim.data.status === 'clean' || claim.data.status === 'quarantined') return claim.data.status as 'clean' | 'quarantined';
  if (typeof claim.data.token !== 'string' || typeof claim.data.path !== 'string') return 'unavailable' as const;
  let verdict: 'clean' | 'quarantined' | 'unavailable' = 'unavailable'; let sha256: string | null = null;
  try {
    // A replacement is impossible through authenticated Storage (no UPDATE policy).
    // Read actual stored bytes instead of trusting an earlier browser payload.
    const object = await client.storage.from('platform-documents').download(claim.data.path);
    if (!object.error && object.data && object.data.size > 0 && object.data.size <= 25 * 1024 * 1024
        && (claim.data.size === null || Number(claim.data.size) === object.data.size)) {
      const bytes = new Uint8Array(await object.data.arrayBuffer());
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (!expectedHash || digest === expectedHash) {
        const result = await scanDocumentBytes(bytes); verdict = result.status; sha256 = result.sha256 ?? null;
      }
    }
  } catch { /* A timeout or missing object is held for explicit retry. */ }
  const finished = await client.rpc('finish_document_scan', {
    p_document: documentId, p_actor: actorId, p_token: claim.data.token, p_verdict: verdict, p_sha256: sha256,
  });
  return !finished.error && finished.data === true ? verdict : 'unavailable' as const;
}

export async function checkStoredDocument(client: SupabaseClient<any, 'public', any>, documentId: string, actorId: string, expectedHash?: string) {
  try { return await checkStoredDocumentInternal(client, documentId, actorId, expectedHash); }
  catch { return 'unavailable' as const; }
}
