import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoicePaymentPreference } from "./payment-options";
import type { RpcCommandArgs } from "../types/rpc-contracts";
import { withDeadline } from "../runtime/deadline.ts";

type PreferenceInput = {
  supabase: SupabaseClient;
  invoiceId: string;
  tokenHash: string;
  preference: InvoicePaymentPreference;
};
type PreferenceResult = { ok: false } | { ok: true; changed: boolean; sourceEventId: string | null };
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === "object" && !Array.isArray(value);

/** Checkout selection preserves the existing no-dispatch command. It is not a
 * charge, nor authority to prepare a customer notification. */
export function saveCheckoutPaymentPreference(input: PreferenceInput): Promise<PreferenceResult> {
  return savePreference(input, false);
}

/** The explicit preference form retains its transactional source-event handoff. */
export function saveInvoicePaymentPreference(input: PreferenceInput): Promise<PreferenceResult> {
  return savePreference(input, true);
}

async function savePreference(input: PreferenceInput, withEvent: boolean): Promise<PreferenceResult> {
  if (!uuid(input.invoiceId) || !/^[a-f0-9]{64}$/.test(input.tokenHash)) return { ok: false };
  try {
    const receipt: unknown = await withDeadline(async signal => {
      const name = withEvent ? "record_invoice_preference_with_event" : "record_invoice_payment_preference";
      const args = { p_preference: input.preference, p_token_hash: input.tokenHash } satisfies RpcCommandArgs<typeof name>;
      let query = input.supabase.rpc(name, args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query;
    }, 5000);
    // Timeout/transport failure cannot prove rollback. Never replay a write here
    // or allow provider preparation from an absent, foreign or partial receipt.
    if (!record(receipt) || receipt.error !== null) return { ok: false };
    const rows = receipt.data;
    const row = withEvent ? rows : Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!record(row) || row.invoice_id !== input.invoiceId || typeof row.preference_changed !== "boolean") {
      return { ok: false };
    }
    if (withEvent && !(row.source_event_id === null && row.preference_changed === false)
      && !uuid(row.source_event_id)) return { ok: false };
    return { ok: true, changed: row.preference_changed, sourceEventId: withEvent ? row.source_event_id as string | null : null };
  } catch {
    return { ok: false };
  }
}
