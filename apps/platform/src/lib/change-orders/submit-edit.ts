import type { ChangeOrderActionState } from "@/lib/action-states/change-orders";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const uncertain = () => Error("The save could not be confirmed. Keep this form and retry with the same details to check safely.");

/** One receipt request. Existing draft-attempt tracking owns every explicit retry. */
export async function submitChangeOrderEdit(form: FormData): Promise<ChangeOrderActionState> {
  const id = form.get("change_order_id"), revision = Number(form.get("expected_revision"));
  if (!uuid(id) || !uuid(form.get("request_id")) || !/^\d+$/.test(String(form.get("expected_revision") ?? "")) || !Number.isSafeInteger(revision) || revision < 0) throw uncertain();
  const response = await fetch(`/api/admin/change-orders/${id}/edit`, { method: "POST", body: form,
    credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw uncertain();
  const result: unknown = await response.json();
  if (!record(result) || typeof result.message !== "string" || [result.saveRejected, result.reviewRequired].some(value => value !== undefined && typeof value !== "boolean")) throw uncertain();
  if (result.status === "error") return { status: "error", message: result.message, saveRejected: result.saveRejected as boolean | undefined, reviewRequired: result.reviewRequired as boolean | undefined };
  const persisted = form.getAll("line_id").map(String), count = form.getAll("line_title").length, ids = result.savedLineIds;
  if (result.status !== "success" || !Number.isSafeInteger(result.savedRevision) || Number(result.savedRevision) <= revision
    || !count || persisted.length !== count || !Array.isArray(ids) || ids.length !== count || !ids.every(uuid)
    || new Set(ids.map(id => id.toLowerCase())).size !== count
    || !persisted.every((id, index) => !id || id.toLowerCase() === ids[index].toLowerCase())) throw uncertain();
  return { status: "success", message: result.message, savedRevision: result.savedRevision as number, savedLineIds: ids,
    reviewRequired: result.reviewRequired as boolean | undefined };
}
