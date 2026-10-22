type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const workflowIntents = ["request_review", "approve_internal", "return_clarification", "cancel"] as const;
export type WorkflowIntent = typeof workflowIntents[number];
export type WorkflowAttempt = { requestId: string; sourceId: string; revision: number; intent: WorkflowIntent };
const keyFor = (id: string) => `change-order-workflow:${id}`;
export function readWorkflowAttempt(id: string, storage: StorageLike | null): WorkflowAttempt | undefined {
  try {
    const v = JSON.parse(storage?.getItem(keyFor(id)) || "null");
    if (/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v?.requestId) && v?.sourceId === id && Number.isSafeInteger(v?.revision) && v.revision >= 0 && workflowIntents.includes(v?.intent))
      return { requestId: v.requestId, sourceId: id, revision: v.revision, intent: v.intent };
  } catch { /* Page-local recovery remains. */ }
}
export function prepareWorkflowAttempt(id: string, revision: number, intent: WorkflowIntent, storage: StorageLike | null, previous?: WorkflowAttempt) {
  const attempt = previous ?? readWorkflowAttempt(id, storage) ?? { requestId: crypto.randomUUID(), sourceId: id, revision, intent };
  if (attempt.intent !== intent) return { attempt, blocked: true };
  try { storage?.setItem(keyFor(id), JSON.stringify(attempt)); } catch { /* Retain identity in memory. */ }
  return { attempt, blocked: false };
}
export function forgetWorkflowAttempt(id: string, storage: StorageLike | null) { try { storage?.removeItem(keyFor(id)); } catch { /* Nothing persisted to clear. */ } }
