import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "../types/rpc-contracts";
import type { Json } from "../types/database.generated";
import { withDeadline } from "../runtime/deadline.ts";
import { isGenerationRequestId } from "./generation-request.ts";
import { FIREWOOD_TERMS_VERSION } from "../documents/terms/firewood-2026-10-24.ts";

type Header = { customer_id: string | null; organization_id: string | null; service_location_id: string | null; due_at: string; invoice_intent?: "firewood_household"; firewood_domestic_use?: boolean };
type Input = { supabase: SupabaseClient; requestId: string; header: Header; lines: Json[]; notes: string; newCustomer: Json | null };
type Result = { ok: false; message: string } | { ok: true; invoiceId: string; customerId: string | null;
  organizationId: string | null; replayed: boolean; invoiceStatus: string; noteWarning: boolean };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const nullableUuid = (v: unknown) => v === null || uuid(v);
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uncertain = "The invoice result could not be confirmed. Keep this form and retry with the same details to check safely.";
const knownMessages = new Set([
  "Confirm a standalone household-use firewood purchase before saving.",
  "Choose a complete Virginia delivery address for this customer.",
  "Review the firewood products and quantities.",
  "Use full-cord, half-cord or stacking lines with whole quantities from 1 to 100.",
  "Add a full-cord or half-cord line before optional stacking.",
  "Only active office staff may create invoices.",
  "This saved request belongs to different details. Review the invoice already created before starting another request.",
  "The invoice from this saved request was deleted. Review its history before starting another request.",
  "A customer already uses that contact information. Select the existing customer instead.",
  "Enter the customer name, a phone or email, and a complete service address.",
  "The service location belongs to another customer or organization.",
]);

/** One durable request, no client-side retry or compensating deletes. The SQL
 * transaction owns optional customer, location, lines, note and audit together. */
export async function createStandaloneInvoice(input: Input): Promise<Result> {
  if (!isGenerationRequestId(input.requestId)) return { ok: false, message: "Refresh the page to prepare the invoice request. Your unsaved changes have been kept." };
  try {
    const args = { p_request_id: input.requestId, p_header: input.header, p_lines: input.lines,
      p_notes: input.notes, p_new_customer: input.newCustomer } satisfies RpcArgs<"create_standalone_invoice">;
    const response: unknown = await withDeadline(async signal => {
      let query = input.supabase.rpc("create_standalone_invoice", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query;
    }, 5000);
    if (!record(response)) return { ok: false, message: uncertain };
    if (record(response.error) && typeof response.error.message === "string" && knownMessages.has(response.error.message)) {
      return { ok: false, message: response.error.message };
    }
    const row = response.data;
    if (response.error !== null || !record(row) || row.request_id !== input.requestId || !uuid(row.invoice_id)
      || !nullableUuid(row.customer_id) || !nullableUuid(row.organization_id) || !nullableUuid(row.service_location_id)
      || typeof row.replayed !== "boolean" || typeof row.note_warning !== "boolean"
      || typeof row.invoice_status !== "string" || !["draft", "sent", "partially_paid", "paid", "void", "overdue"].includes(row.invoice_status)
      || (!row.replayed && row.invoice_status !== "draft")) return { ok: false, message: uncertain };
    const partyConfirmed = input.newCustomer !== null
      ? uuid(row.customer_id) && row.organization_id === null && uuid(row.service_location_id)
      : row.customer_id === input.header.customer_id && row.organization_id === input.header.organization_id
        && row.service_location_id === input.header.service_location_id
        && (uuid(row.customer_id) && row.organization_id === null || row.customer_id === null && uuid(row.organization_id));
    const firewoodConfirmed = input.header.invoice_intent !== "firewood_household" || row.document_terms_version === FIREWOOD_TERMS_VERSION
      || row.replayed === true && row.legacy_firewood_request === true && row.document_terms_version === "legacy-2026-10-22";
    if (!partyConfirmed || !firewoodConfirmed) return { ok: false, message: uncertain };
    return { ok: true, invoiceId: row.invoice_id, customerId: row.customer_id as string | null,
      organizationId: row.organization_id as string | null, replayed: row.replayed,
      invoiceStatus: row.invoice_status, noteWarning: row.note_warning };
  } catch { return { ok: false, message: uncertain }; }
}
