type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ChangeOrderSendAttempt = { requestId: string; sourceId: string; revision: number; additionalCopy: boolean; linkVersion?: string };
const keyFor = (id: string) => `change-order-email:${id}`;
export function readSendAttempt(id: string, storage: StorageLike | null): ChangeOrderSendAttempt | undefined {
  try {
    const v = JSON.parse(storage?.getItem(keyFor(id)) || "null");
    if (/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v?.requestId) && v?.sourceId === id && Number.isSafeInteger(v?.revision) && v.revision >= 0 && typeof v.additionalCopy === "boolean")
      return { requestId: v.requestId, sourceId: id, revision: v.revision, additionalCopy: v.additionalCopy,
        ...(typeof v.linkVersion === "string" && /^[a-f0-9]{64}$/.test(v.linkVersion) ? { linkVersion: v.linkVersion } : {}) };
  } catch { /* Keep recovery in memory if browser storage is unavailable. */ }
}
export function prepareSendAttempt(id: string, revision: number, additionalCopy: boolean, storage: StorageLike | null, previous?: ChangeOrderSendAttempt, linkVersion?: string | null) {
  const attempt = previous ?? readSendAttempt(id, storage) ?? { requestId: crypto.randomUUID(), sourceId: id, revision, additionalCopy, ...(linkVersion ? { linkVersion } : {}) };
  try { storage?.setItem(keyFor(id), JSON.stringify(attempt)); } catch { /* The current page retains this identity. */ }
  return attempt;
}
export function forgetSendAttempt(id: string, storage: StorageLike | null) { try { storage?.removeItem(keyFor(id)); } catch { /* Nothing persisted to clear. */ } }
