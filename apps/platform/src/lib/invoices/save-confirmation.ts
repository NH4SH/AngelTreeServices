import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "../types/rpc-contracts";
import { withDeadline } from "../runtime/deadline.ts";

type EditLine = {
  clientId: string;
  id: string | null;
  name: string;
  description: string | null;
  service_category_id: string | null;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};
type EditInput = {
  supabase: SupabaseClient;
  invoiceId: string;
  expectedUpdatedAt: string;
  dueAt: string | null;
  lines: EditLine[];
};
type EditResult = { ok: true; updatedAt: string; lineIds: Record<string, string> }
  | { ok: false; message: string };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === "object" && !Array.isArray(value);
const uncertain = "The save could not be confirmed. Your unsaved changes have been kept. Reload and review the invoice before saving again.";

// Keep the original PostgreSQL text: converting to Date loses revision microseconds.
function revision(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value.slice(0, 10);
}

/** Confirm one existing atomic save before advancing the editor or clearing its
 * recovery copy. An uncertain response is never retried or treated as rollback. */
export async function saveInvoiceEdit(input: EditInput): Promise<EditResult> {
  const { invoiceId, expectedUpdatedAt, lines } = input;
  if (!uuid(invoiceId) || !revision(expectedUpdatedAt) || lines.length === 0
    || lines.some(line => !line.clientId || (line.id !== null && !uuid(line.id)))
    || new Set(lines.map(line => line.clientId)).size !== lines.length
    || new Set(lines.flatMap(line => line.id === null ? [] : [line.id.toLowerCase()])).size !== lines.filter(line => line.id !== null).length) {
    return { ok: false, message: "Reload this invoice before saving. Your unsaved changes have been kept." };
  }
  try {
    // SQL explicitly accepts a null due date; generated metadata omits nullability.
    const args = {
      p_invoice_id: invoiceId, p_expected_updated_at: expectedUpdatedAt, p_due_at: input.dueAt,
      p_lines: lines.map(({ clientId: _clientId, ...line }) => line),
    } satisfies Omit<RpcArgs<"save_invoice_details">, "p_due_at"> & { p_due_at: string | null };
    const response: unknown = await withDeadline(async signal => {
      let query = input.supabase.rpc("save_invoice_details", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query;
    }, 5000);
    if (!record(response)) return { ok: false, message: uncertain };
    if (record(response.error)) {
      const message = (response.error.code === "PT409" || response.error.code === "40001") ? "This invoice changed since you opened it. Reload before saving."
        : response.error.code === "42501" ? "Only active office staff can edit invoices."
          : response.error.code === "23514" ? "This invoice cannot be edited with its current payment status or line items. Reload and review it before saving."
            : uncertain;
      return { ok: false, message };
    }
    const saved = response.data;
    if (response.error !== null || !record(saved) || saved.id !== invoiceId || !revision(saved.updated_at)) {
      return { ok: false, message: uncertain };
    }
    const lineIds = saved.line_ids;
    if (!Array.isArray(lineIds) || lineIds.length !== lines.length
      || !lineIds.every(uuid) || new Set(lineIds.map(id => id.toLowerCase())).size !== lines.length
      || !lines.every((line, index) => line.id === null || line.id.toLowerCase() === lineIds[index].toLowerCase())) {
      return { ok: false, message: uncertain };
    }
    return { ok: true, updatedAt: saved.updated_at,
      lineIds: Object.fromEntries(lines.map((line, index) => [line.clientId, lineIds[index]])) };
  } catch {
    return { ok: false, message: uncertain };
  }
}
