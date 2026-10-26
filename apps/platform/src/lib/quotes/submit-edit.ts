import type { QuoteActionState } from "@/app/admin/quotes/actions";
import { quoteUuid } from "./edit-result";

const uncertain = () => Error("The save could not be confirmed. Keep your changes and compare the saved quote before retrying.");
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** One request only: a lost response may follow a committed save. */
export async function submitQuoteEdit(form: FormData): Promise<QuoteActionState> {
  const id = form.get("quote_id");
  if (!quoteUuid(id)) throw uncertain();
  const response = await fetch(`/api/admin/quotes/${id}/edit`, {
    method: "POST", body: form, credentials: "same-origin", cache: "no-store",
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw uncertain();
  const result: unknown = await response.json();
  if (!record(result) || typeof result.message !== "string") throw uncertain();
  if (result.status === "error") {
    const conflict = result.conflict;
    if (conflict !== undefined && (!record(conflict) || !Number.isSafeInteger(conflict.currentRevision) || Number(conflict.currentRevision) < 1
      || !Number.isSafeInteger(conflict.currentTotalCents) || typeof conflict.currentStatus !== "string" || typeof conflict.changedBy !== "string"
      || !(conflict.changedAt === null || typeof conflict.changedAt === "string"))) throw uncertain();
    return { status: "error", message: result.message, ...(conflict ? { conflict: conflict as NonNullable<QuoteActionState["conflict"]> } : {}) };
  }
  const clients = form.getAll("line_item_client_id").map(String), persisted = form.getAll("line_item_id").map(String);
  const saved = result.savedLineIds;
  if (result.status !== "success" || !Number.isSafeInteger(result.savedRevision) || Number(result.savedRevision) <= Number(form.get("expected_revision"))
    || !record(saved) || clients.length === 0 || new Set(clients).size !== clients.length || Object.keys(saved).length !== clients.length
    || !clients.every((client, index) => quoteUuid(saved[client]) && (!persisted[index] || persisted[index].toLowerCase() === String(saved[client]).toLowerCase()))) throw uncertain();
  return { status: "success", message: result.message, savedRevision: Number(result.savedRevision), savedLineIds: saved as Record<string, string> };
}
