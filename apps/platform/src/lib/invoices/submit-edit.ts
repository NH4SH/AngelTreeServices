import type { InvoiceActionState } from "@/app/admin/invoices/actions";

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const uncertain = () => Error("The save could not be confirmed. Keep your changes and review the saved invoice before retrying.");

// Compare timestamp identities without dropping PostgreSQL's revision microseconds.
export function invoiceRevisionIdentity(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const fraction = value.match(/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? "";
  return BigInt(Date.parse(value.replace(/\.\d{1,6}(?=Z|[+-]\d{2}:\d{2}$)/, ""))) * BigInt(1000) + BigInt(fraction.padEnd(6, "0"));
}

/** One receipt request to the existing command; uncertainty never triggers a retry. */
export async function submitInvoiceEdit(form: FormData): Promise<InvoiceActionState> {
  const id = form.get("invoice_id"), expected = invoiceRevisionIdentity(form.get("expected_updated_at"));
  if (!uuid(id) || expected === null) throw uncertain();
  const response = await fetch(`/api/admin/invoices/${id}/edit`, { method: "POST", body: form,
    credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw uncertain();
  const result: unknown = await response.json();
  if (!record(result) || typeof result.message !== "string") throw uncertain();
  if (result.status === "error") return { status: "error", message: result.message };
  const clients = form.getAll("invoice_line_item_client_id").map(String), persisted = form.getAll("invoice_line_item_id").map(String), ids = result.savedLineIds;
  const revision = invoiceRevisionIdentity(result.savedUpdatedAt);
  if (result.status !== "success" || revision === null || revision === expected || !record(ids) || !clients.length || new Set(clients).size !== clients.length
    || Object.keys(ids).length !== clients.length || new Set(Object.values(ids).map(id => String(id).toLowerCase())).size !== clients.length
    || !clients.every((client, index) => uuid(ids[client]) && (!persisted[index] || persisted[index].toLowerCase() === String(ids[client]).toLowerCase()))) throw uncertain();
  return { status: "success", message: result.message, savedUpdatedAt: result.savedUpdatedAt as string, savedLineIds: ids as Record<string, string> };
}
