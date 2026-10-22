type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type ChangeOrderDraftAttempt = { requestId: string; payloadHash: string; revision: number | null };
const uuid = (v: unknown) => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);

// Store only opaque identity/digests. An uncertain request cannot silently become
// a new creation or apply edited input to a newer revision after a page reload.
export async function prepareDraftAttempt(scope: string, form: FormData, revision: number | null, storage: StorageLike | null, previous?: ChangeOrderDraftAttempt) {
  const key = `change-order-draft:${scope}`;
  let saved = previous;
  if (!saved) try {
    const v = JSON.parse(storage?.getItem(key) || "null");
    if (uuid(v?.requestId) && /^[a-f0-9]{64}$/.test(v?.payloadHash) && (v?.revision === null || Number.isSafeInteger(v?.revision) && v.revision >= 0)) saved = v;
  } catch { /* Page-local identity remains available. */ }
  const fields = [...form.entries()].filter(([key]) => !["request_id", "expected_revision", "submit_intent", "return_to_job"].includes(key));
  fields.sort(([a], [b]) => a.localeCompare(b));
  const payload = JSON.stringify([fields, revision === null ? form.get("submit_intent") === "review" : null]);
  const payloadHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload))), n => n.toString(16).padStart(2, "0")).join("");
  if (saved && saved.payloadHash !== payloadHash) return { key, blocked: true as const, attempt: saved };
  const attempt = saved ?? { requestId: crypto.randomUUID(), payloadHash, revision };
  try { storage?.setItem(key, JSON.stringify(attempt)); } catch { /* Private browsing can disable storage. */ }
  return { key, blocked: false as const, attempt };
}

export function forgetDraftAttempt(key: string, storage: StorageLike | null) {
  try { storage?.removeItem(key); } catch { /* No stored identity to clear. */ }
}
