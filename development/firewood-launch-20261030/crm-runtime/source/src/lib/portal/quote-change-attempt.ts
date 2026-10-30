// Persist only opaque identity/revision and a digest, never the link or message.
// Retaining the reviewed revision across uncertain retries prevents a refreshed
// page from turning a lost acknowledgement into a second customer request.
export type QuoteChangeAttempt = { requestId: string; revision: number; messageHash: string };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export async function prepareQuoteChangeAttempt(rawToken: string, message: string, revision: number, storage: StorageLike | null, previous?: QuoteChangeAttempt) {
  const key = `quote-change:${await digest(rawToken)}`;
  let saved = previous;
  if (!saved && storage) {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      if (value && uuid.test(value.requestId) && Number.isSafeInteger(value.revision) && value.revision > 0 && /^[0-9a-f]{64}$/.test(value.messageHash)) saved = value;
    } catch { /* Private browsing can disable storage; the page retains identity. */ }
  }
  const messageHash = await digest(message.trim());
  const attempt = saved?.messageHash === messageHash ? saved : {
    requestId: crypto.randomUUID(), revision: saved?.revision ?? revision, messageHash,
  };
  try { storage?.setItem(key, JSON.stringify(attempt)); } catch { /* In-memory retry still works. */ }
  return { key, attempt };
}
export function forgetQuoteChangeAttempt(key: string, storage: StorageLike | null) {
  try { storage?.removeItem(key); } catch { /* No stored identity to clear. */ }
}
