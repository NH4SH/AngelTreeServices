import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "../types/rpc-contracts";
import { withDeadline } from "../runtime/deadline.ts";
import { quoteSaveResult, quoteUuid } from "./edit-result";

type Input = { supabase: SupabaseClient; requestId: string; header: Record<string, string | null>; lines: RpcArgs<"create_quote_draft_request">["p_lines"] };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const uncertain = "The quote result could not be confirmed. Keep this form and retry with the same details to check safely.";
const statuses = ["draft", "sent", "approved", "declined", "expired", "cancelled", "change_requested"];
const messages = new Set([
  "Only active office staff may create quotes.",
  "This request has already been used with different details. Review the saved quote before starting another draft.",
  "The quote from this request is no longer available. Review its history before starting another draft.",
  "The originating website lead no longer matches this quote.",
]);

/** The request ID survives errors and browser recovery. Never automatically retry. */
export async function createQuoteDraftRequest(input: Input): Promise<
  { ok: false; message: string } | { ok: true; quoteId: string; replayed: boolean }
> {
  if (!quoteUuid(input.requestId)) return { ok: false, message: "Refresh this editor to prepare the quote request. Your unsaved changes have been kept." };
  try {
    const args = { p_request_id: input.requestId, p_header: input.header, p_lines: input.lines } satisfies RpcArgs<"create_quote_draft_request">;
    const response: unknown = await withDeadline(async signal => {
      let query = input.supabase.rpc("create_quote_draft_request", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query;
    }, 5000);
    if (!record(response)) return { ok: false, message: uncertain };
    if (record(response.error) && typeof response.error.message === "string" && messages.has(response.error.message)) return { ok: false, message: response.error.message };
    const row = response.data;
    const count = Array.isArray(input.lines) ? input.lines.length : -1;
    if (response.error !== null || !record(row) || row.request_id !== input.requestId || !quoteSaveResult(row, count)
      || typeof row.replayed !== "boolean" || typeof row.quote_status !== "string" || !statuses.includes(row.quote_status)
      || (!row.replayed && row.quote_status !== "draft")
      || !["customer_id", "organization_id", "service_location_id", "job_id"].every(key => row[key] === (input.header[key] ?? null))
      || !(quoteUuid(row.customer_id) && row.organization_id === null || row.customer_id === null && quoteUuid(row.organization_id))
      || !quoteUuid(row.service_location_id)) return { ok: false, message: uncertain };
    return { ok: true, quoteId: row.id as string, replayed: row.replayed };
  } catch { return { ok: false, message: uncertain }; }
}
