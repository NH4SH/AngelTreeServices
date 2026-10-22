type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const linkIntents = ["generate", "regenerate", "revoke"] as const;
export type LinkIntent = typeof linkIntents[number];
export type ChangeOrderLinkAttempt = {
  requestId: string;
  sourceId: string;
  revision: number;
  linkVersion: string;
  intent: LinkIntent;
};

const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const keyFor = (id: string) => `change-order-link:${id}`;

function readIdentity(id: string, value: unknown): ChangeOrderLinkAttempt | undefined {
  if (!uuid.test(id) || !value || typeof value !== "object") return;
  const v = value as Partial<ChangeOrderLinkAttempt>;
  if (typeof v.requestId !== "string" || !uuid.test(v.requestId) || v.sourceId !== id
    || !Number.isSafeInteger(v.revision) || (v.revision as number) < 0
    || typeof v.linkVersion !== "string" || !/^[a-f0-9]{64}$/.test(v.linkVersion)
    || !linkIntents.includes(v.intent as LinkIntent)) return;
  return { requestId: v.requestId, sourceId: id, revision: v.revision as number,
    linkVersion: v.linkVersion, intent: v.intent as LinkIntent };
}

export function readLinkAttempt(id: string, storage: StorageLike | null): ChangeOrderLinkAttempt | undefined {
  try {
    return readIdentity(id, JSON.parse(storage?.getItem(keyFor(id)) || "null"));
  } catch { /* Page-local recovery remains available when browser storage fails. */ }
}

export function prepareLinkAttempt(id: string, revision: number, linkVersion: string, intent: LinkIntent,
  storage: StorageLike | null, previous?: ChangeOrderLinkAttempt) {
  const attempt = readIdentity(id, previous) ?? readLinkAttempt(id, storage)
    ?? readIdentity(id, { requestId: crypto.randomUUID(), sourceId: id, revision, linkVersion, intent });
  if (!attempt) throw new Error("Invalid customer-link request identity.");
  if (attempt.intent !== intent) return { attempt, blocked: true };
  try { storage?.setItem(keyFor(id), JSON.stringify(attempt)); } catch { /* The current page retains this identity. */ }
  return { attempt, blocked: false };
}

export function forgetLinkAttempt(id: string, storage: StorageLike | null) {
  try { storage?.removeItem(keyFor(id)); } catch { /* Nothing persisted to clear. */ }
}
