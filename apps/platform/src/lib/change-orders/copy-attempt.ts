type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ChangeOrderCopyAttempt = { requestId: string; sourceId: string; revision: number };
const uuid = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);

// Only opaque request identity is stored, never customer details or line prices.
// A reload must retry the original source revision, even if the source changed.
export function prepareCopyAttempt(sourceId: string, revision: number, storage: StorageLike | null, previous?: ChangeOrderCopyAttempt) {
  const key = `change-order-copy:${sourceId}`;
  let attempt = previous;
  if (!attempt) try {
    const saved = JSON.parse(storage?.getItem(key) || "null");
    if (uuid(saved?.requestId) && saved?.sourceId === sourceId && Number.isSafeInteger(saved?.revision) && saved.revision >= 0) attempt = saved;
  } catch { /* Keep page-local recovery if storage is unavailable. */ }
  attempt ??= { requestId: crypto.randomUUID(), sourceId, revision };
  try { storage?.setItem(key, JSON.stringify(attempt)); } catch { /* Page-local identity remains. */ }
  return { key, attempt };
}

export function forgetCopyAttempt(key: string, storage: StorageLike | null) {
  try { storage?.removeItem(key); } catch { /* Nothing persisted to clear. */ }
}
