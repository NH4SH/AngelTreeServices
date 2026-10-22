type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const quoteLinkIntents = ["generate", "regenerate", "revoke"] as const;
export type QuoteLinkIntent = typeof quoteLinkIntents[number];
export type QuoteLinkAttempt = { requestId: string; sourceId: string; version: string; intent: QuoteLinkIntent; tokenId: string | null };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const key = (id: string) => `quote-link:${id}`;
function identity(id: string, value: unknown): QuoteLinkAttempt | undefined {
  if (!uuid(id) || !value || typeof value !== "object") return;
  const v = value as Partial<QuoteLinkAttempt>;
  if (!uuid(v.requestId) || v.sourceId !== id || typeof v.version !== "string" || !/^[a-f0-9]{64}$/.test(v.version)
    || !quoteLinkIntents.includes(v.intent as QuoteLinkIntent) || (v.intent === "revoke" ? !uuid(v.tokenId) : v.tokenId !== null)) return;
  return { requestId: v.requestId, sourceId: id, version: v.version, intent: v.intent as QuoteLinkIntent, tokenId: v.tokenId ?? null };
}
export function readQuoteLinkAttempt(id: string, storage: StorageLike | null) {
  try { return identity(id, JSON.parse(storage?.getItem(key(id)) || "null")); } catch { /* Page-local recovery still works. */ }
}
export function prepareQuoteLinkAttempt(id: string, version: string, intent: QuoteLinkIntent, tokenId: string | null,
  storage: StorageLike | null, previous?: QuoteLinkAttempt) {
  const attempt = identity(id, previous) ?? readQuoteLinkAttempt(id, storage)
    ?? identity(id, { requestId: crypto.randomUUID(), sourceId: id, version, intent, tokenId });
  if (!attempt) throw new Error("Invalid quote-link request identity.");
  if (attempt.intent !== intent || attempt.tokenId !== tokenId) return { attempt, blocked: true };
  try { storage?.setItem(key(id), JSON.stringify(attempt)); } catch { /* Keep the same identity in memory. */ }
  return { attempt, blocked: false };
}
export function forgetQuoteLinkAttempt(id: string, storage: StorageLike | null) {
  try { storage?.removeItem(key(id)); } catch { /* Nothing persisted to clear. */ }
}

export type QuoteLinkSelection = { id: string; version: string }[];
export type QuoteLinkBatchAttempt = { requestId: string; selection: QuoteLinkSelection };
export function parseQuoteLinkSelection(value: unknown): QuoteLinkSelection | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 25) return;
  const result: QuoteLinkSelection = [];
  for (const entry of value) {
    if (!entry || !uuid(entry.id) || typeof entry.version !== "string" || !/^[a-f0-9]{64}$/.test(entry.version)) return;
    result.push({ id: entry.id.toLowerCase(), version: entry.version });
  }
  if (new Set(result.map(entry => entry.id)).size !== result.length) return;
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
const batchKey = (ids: string[]) => `quote-link-batch:${[...new Set(ids.map(id => id.toLowerCase()))].sort().join(",")}`;
function batchIdentity(ids: string[], value: unknown): QuoteLinkBatchAttempt | undefined {
  if (!ids.length || !ids.every(uuid) || !value || typeof value !== "object") return;
  const v = value as Partial<QuoteLinkBatchAttempt>, selection = parseQuoteLinkSelection(v.selection);
  if (!uuid(v.requestId) || !selection || selection.some(entry => !ids.map(id => id.toLowerCase()).includes(entry.id))) return;
  return { requestId: v.requestId, selection };
}
export function readQuoteLinkBatchAttempt(ids: string[], storage: StorageLike | null) {
  try { return batchIdentity(ids, JSON.parse(storage?.getItem(batchKey(ids)) || "null")); } catch { /* Page-local recovery still works. */ }
}
export function prepareQuoteLinkBatchAttempt(ids: string[], selection: QuoteLinkSelection, storage: StorageLike | null, previous?: QuoteLinkBatchAttempt) {
  const attempt = batchIdentity(ids, previous) ?? readQuoteLinkBatchAttempt(ids, storage)
    ?? batchIdentity(ids, { requestId: crypto.randomUUID(), selection });
  if (!attempt) throw new Error("Reload the selected proposal links before replacing them.");
  try { storage?.setItem(batchKey(ids), JSON.stringify(attempt)); } catch { /* Preserve in memory. */ }
  return attempt;
}
export function forgetQuoteLinkBatchAttempt(ids: string[], storage: StorageLike | null) {
  try { storage?.removeItem(batchKey(ids)); } catch { /* Nothing persisted to clear. */ }
}
