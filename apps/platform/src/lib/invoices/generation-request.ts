/** Keep the command identity through lost responses, navigation and page reloads. */
export function getInvoiceGenerationRequest(storage: Pick<Storage, "getItem" | "setItem">, actorId: string, source: string, newId: () => string) {
  const key = `ats.invoice-generation.${actorId}.${source}`;
  const saved = storage.getItem(key);
  if (saved !== null) {
    if (!isGenerationRequestId(saved)) throw new Error("Saved invoice request is unavailable. Review the work order invoice before continuing.");
    return saved;
  }
  const id = newId();
  if (!isGenerationRequestId(id)) throw new Error("Could not prepare the invoice request.");
  storage.setItem(key, id); // Persist before any server action is dispatched.
  return id;
}

export function isGenerationRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export type GeneratedInvoice = { invoice_id: string; job_id: string; existing: boolean; replayed: boolean; invoice_status: string; job_completed: boolean; added_change_order_count: number };
export function parseGeneratedInvoice(value: unknown): GeneratedInvoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return isGenerationRequestId(row.invoice_id) && isGenerationRequestId(row.job_id)
    && typeof row.existing === "boolean" && typeof row.replayed === "boolean" && typeof row.job_completed === "boolean"
    && typeof row.invoice_status === "string" && ["draft", "sent", "partially_paid", "paid", "void", "overdue"].includes(row.invoice_status)
    && Number.isSafeInteger(row.added_change_order_count) && Number(row.added_change_order_count) >= 0 ? row as GeneratedInvoice : null;
}

export function existingInvoiceMessage(status: string) {
  return status === "void"
    ? "This work order already has a voided invoice. Open it to review or unvoid it; no replacement was created."
    : "This work order already has an invoice. Open it to review; no duplicate was created.";
}
