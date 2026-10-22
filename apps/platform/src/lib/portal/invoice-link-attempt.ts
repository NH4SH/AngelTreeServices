type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const invoiceLinkIntents = ["generate", "regenerate", "revoke"] as const;
export type InvoiceLinkIntent = typeof invoiceLinkIntents[number];
export type InvoiceLinkAttempt = { requestId: string; sourceId: string; version: string; intent: InvoiceLinkIntent; tokenId: string | null };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const key = (id: string) => `invoice-link:${id}`;
function identity(id: string, value: unknown): InvoiceLinkAttempt | undefined {
  if (!uuid(id) || !value || typeof value !== "object") return;
  const v = value as Partial<InvoiceLinkAttempt>;
  if (!uuid(v.requestId) || v.sourceId !== id || typeof v.version !== "string" || !/^[a-f0-9]{64}$/.test(v.version)
    || !invoiceLinkIntents.includes(v.intent as InvoiceLinkIntent) || (v.intent === "revoke" ? !uuid(v.tokenId) : v.tokenId !== null)) return;
  return { requestId: v.requestId, sourceId: id, version: v.version, intent: v.intent as InvoiceLinkIntent, tokenId: v.tokenId ?? null };
}
export function readInvoiceLinkAttempt(id: string, storage: StorageLike | null) {
  try { return identity(id, JSON.parse(storage?.getItem(key(id)) || "null")); } catch { /* Page-local recovery still works. */ }
}
export function prepareInvoiceLinkAttempt(id: string, version: string, intent: InvoiceLinkIntent, tokenId: string | null,
  storage: StorageLike | null, previous?: InvoiceLinkAttempt) {
  const attempt = identity(id, previous) ?? readInvoiceLinkAttempt(id, storage)
    ?? identity(id, { requestId: crypto.randomUUID(), sourceId: id, version, intent, tokenId });
  if (!attempt) throw new Error("Invalid invoice-link request identity.");
  if (attempt.intent !== intent || attempt.tokenId !== tokenId) return { attempt, blocked: true };
  try { storage?.setItem(key(id), JSON.stringify(attempt)); } catch { /* Keep the same identity in memory. */ }
  return { attempt, blocked: false };
}
export function forgetInvoiceLinkAttempt(id: string, storage: StorageLike | null) {
  try { storage?.removeItem(key(id)); } catch { /* Nothing persisted to clear. */ }
}
