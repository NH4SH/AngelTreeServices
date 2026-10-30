import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "../types/rpc-contracts";
import { withDeadline } from "../runtime/deadline.ts";
import { quoteSaveResult, quoteUuid } from "./edit-result";

export type QuoteRequestStatus = { requestId: string; state: "recorded" | "not_recorded" | "unavailable"; quoteId: string | null };
type Input = { supabase: SupabaseClient; requestId: string; header: Record<string, string | null>; lines: RpcArgs<"create_quote_draft_request">["p_lines"] };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const statuses = ["draft", "sent", "approved", "declined", "expired", "cancelled", "change_requested"];
export const requestStatusUncertain = "The saved request could not be checked. Your draft and original request have been kept. Try checking again before retrying the save.";

/** One bounded read. Never invoke a creation command, retry, or current-party validation. */
export async function resolveQuoteDraftRequest(input: Input): Promise<QuoteRequestStatus | null> {
  if (!quoteUuid(input.requestId)) return null;
  try {
    const args = { p_request_id: input.requestId, p_header: input.header, p_lines: input.lines } satisfies RpcArgs<"resolve_quote_draft_request">;
    const response: unknown = await withDeadline(async signal => {
      let query = input.supabase.rpc("resolve_quote_draft_request", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query;
    }, 5000);
    if (!record(response) || response.error !== null || !record(response.data)) return null;
    const row = response.data;
    if (row.request_id !== input.requestId) return null;
    if (row.state === "not_recorded") return row.receipt === null && row.quote_status === null
      ? { requestId: input.requestId, state: "not_recorded", quoteId: null } : null;
    if (!["recorded", "unavailable"].includes(String(row.state))) return null;
    const receipt = row.receipt;
    const count = Array.isArray(input.lines) ? input.lines.length : -1;
    if (!record(receipt) || !quoteSaveResult(receipt, count) || receipt.request_id !== input.requestId
      || receipt.replayed !== false || receipt.quote_status !== "draft"
      || !["customer_id", "organization_id", "service_location_id", "job_id"].every(key => receipt[key] === (input.header[key] ?? null))
      || !(quoteUuid(receipt.customer_id) && receipt.organization_id === null || receipt.customer_id === null && quoteUuid(receipt.organization_id))
      || !quoteUuid(receipt.service_location_id)) return null;
    if (row.state === "unavailable") return row.quote_status === null
      ? { requestId: input.requestId, state: "unavailable", quoteId: null } : null;
    if (typeof row.quote_status !== "string" || !statuses.includes(row.quote_status)) return null;
    return { requestId: input.requestId, state: "recorded", quoteId: receipt.id as string };
  } catch { return null; }
}
