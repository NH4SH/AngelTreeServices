import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "@/lib/types/rpc-contracts";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uncertain = "We could not confirm your request. Keep your message and try again to check whether it was saved.";
type Receipt = {
  request_id: string; quote_id: string; note_id: string; edit_revision: number;
  requested_at: string; replayed: boolean; customer_id: string | null;
  organization_id: string | null; quote_number: string | null; party_name: string;
};
type Result = { ok: true; receipt: Receipt } | { ok: false; rejected: boolean; message: string };
export async function requestQuoteChanges(supabase: SupabaseClient<any, "public", any>, input: {
  requestId: string; tokenHash: string | null; expectedRevision: number; message: string;
}): Promise<Result> {
  if (!uuid.test(input.requestId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1 || input.expectedRevision > 2147483647
    || input.message.trim().length < 3 || input.message.trim().length > 1000) {
    return { ok: false, rejected: true, message: "Review the proposal and enter a request between 3 and 1,000 characters." };
  }
  if (!input.tokenHash || !/^[0-9a-f]{64}$/.test(input.tokenHash)) return {
    ok: false, rejected: true, message: "This quote link is unavailable or expired. Contact Angel Tree Services.",
  };
  const args: RpcArgs<"request_quote_changes_by_portal"> = {
    p_request_id: input.requestId, p_token_hash: input.tokenHash, p_expected_revision: input.expectedRevision, p_message: input.message.trim(),
  };
  try {
    const { data, error } = await supabase.rpc("request_quote_changes_by_portal", args);
    if (error) {
      // Never display backend diagnostics or claim a transport failure rolled
      // back. Only known transaction rejections retire the retry identity.
      const messages: Record<string, string> = {
        "42501": "This quote link is unavailable or expired. Contact Angel Tree Services.",
        "40001": "This proposal changed. Refresh and review it before requesting changes.",
        "23514": "This request could not be saved. Refresh the proposal or contact the office.",
        "22023": "This request needs a fresh review. Refresh the proposal before trying again.",
      };
      const message = Object.hasOwn(messages, error.code) ? messages[error.code] : null;
      return { ok: false, rejected: Boolean(message), message: message ?? uncertain };
    }
    if (!data || data.request_id !== input.requestId || !uuid.test(data.quote_id) || !uuid.test(data.note_id)
      || !Number.isSafeInteger(data.edit_revision) || data.edit_revision !== input.expectedRevision + 1
      || typeof data.replayed !== "boolean" || typeof data.requested_at !== "string" || !Number.isFinite(Date.parse(data.requested_at))
      || !(data.customer_id === null || typeof data.customer_id === "string" && uuid.test(data.customer_id))
      || !(data.organization_id === null || typeof data.organization_id === "string" && uuid.test(data.organization_id))
      || !(data.quote_number === null || typeof data.quote_number === "string") || typeof data.party_name !== "string") {
      return { ok: false, rejected: false, message: uncertain };
    }
    return { ok: true, receipt: data as Receipt };
  } catch {
    return { ok: false, rejected: false, message: uncertain };
  }
}
