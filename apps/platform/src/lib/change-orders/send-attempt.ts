type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ChangeOrderSendAttempt = { requestId: string; sourceId: string; revision: number; additionalCopy: boolean };
const keyFor = (id: string) => `change-order-email:${id}`;
export function readSendAttempt(id: string, storage: StorageLike | null): ChangeOrderSendAttempt | undefined {
  try {
    const v = JSON.parse(storage?.getItem(keyFor(id)) || "null");
    if (/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v?.requestId) && v?.sourceId === id && Number.isSafeInteger(v?.revision) && v.revision >= 0 && typeof v.additionalCopy === "boolean")
      return { requestId: v.requestId, sourceId: id, revision: v.revision, additionalCopy: v.additionalCopy };
  } catch { /* Keep recovery in memory if browser storage is unavailable. */ }
}
export function prepareSendAttempt(id: string, revision: number, additionalCopy: boolean, storage: StorageLike | null, previous?: ChangeOrderSendAttempt) {
  const attempt = previous ?? readSendAttempt(id, storage) ?? { requestId: crypto.randomUUID(), sourceId: id, revision, additionalCopy };
  try { storage?.setItem(keyFor(id), JSON.stringify(attempt)); } catch { /* The current page retains this identity. */ }
  return attempt;
}
export function forgetSendAttempt(id: string, storage: StorageLike | null) { try { storage?.removeItem(keyFor(id)); } catch { /* Nothing persisted to clear. */ } }
