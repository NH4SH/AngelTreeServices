import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "../types/rpc-contracts";
import { withDeadline } from "../runtime/deadline.ts";
import { quoteEditConflict, quoteSaveResult, quoteUuid, type QuoteEditConflict, type QuoteSaveResult } from "./edit-result";

type SaveResult = { ok: true; saved: QuoteSaveResult }
  | { ok: false; message: string; status: number; conflict?: QuoteEditConflict };
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const uncertain = "The save could not be confirmed. Keep your changes and compare the saved quote before retrying.";

/** Confirm the existing atomic command once. A transport failure may follow a committed save. */
export async function saveQuoteEdit(input: {
  supabase: SupabaseClient;
  args: RpcArgs<"save_quote_details">;
  clientIds?: string[];
}): Promise<SaveResult> {
  const { args } = input;
  const lines = args.p_lines;
  if (!quoteUuid(args.p_quote_id) || !Number.isSafeInteger(args.p_expected_revision) || args.p_expected_revision < 1
    || !Array.isArray(lines) || !lines.length || !lines.every(line => record(line) && (line.id == null || quoteUuid(line.id)))
    || (input.clientIds !== undefined && (input.clientIds.length !== lines.length || input.clientIds.some(id => !id.trim())
      || new Set(input.clientIds).size !== lines.length))) {
    return { ok: false, status: 409, message: "Reload this quote before saving. Your unsaved changes have been kept." };
  }
  const retained = lines.flatMap(line => record(line) && typeof line.id === "string" ? [line.id.toLowerCase()] : []);
  if (new Set(retained).size !== retained.length) {
    return { ok: false, status: 409, message: "Reload this quote before saving. Your unsaved changes have been kept." };
  }
  try {
    const response: unknown = await withDeadline(async signal => {
      let query = input.supabase.rpc("save_quote_details", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query;
    }, 5000);
    if (!record(response)) return { ok: false, status: 503, message: uncertain };
    if (record(response.error)) {
      const code = response.error.code;
      const message = code === "40001" ? "This quote changed while you were editing. Keep your changes and reload the saved quote before retrying."
        : code === "42501" ? "Only active office staff can edit quotes."
          : code === "23514" ? "This quote or one of its linked records cannot be edited this way. Keep your changes and review the saved quote."
            : uncertain;
      return { ok: false, status: code === "42501" ? 403 : code === "40001" || code === "23514" ? 409 : 503, message };
    }
    if (response.error !== null) return { ok: false, status: 503, message: uncertain };
    const conflict = quoteEditConflict(response.data);
    if (conflict) return { ok: false, status: 409, conflict,
      message: "This quote changed while you were editing. Your changes are still here and have not overwritten the saved quote." };
    const saved = quoteSaveResult(response.data, lines.length);
    // SQL advances revisions for each changed line/header; it is not a single +1 counter.
    if (!saved || saved.id.toLowerCase() !== args.p_quote_id.toLowerCase() || saved.edit_revision <= args.p_expected_revision
      || !lines.every((line, index) => record(line) && (line.id == null || String(line.id).toLowerCase() === saved.line_ids[index].toLowerCase()))) {
      return { ok: false, status: 503, message: uncertain };
    }
    return { ok: true, saved };
  } catch {
    return { ok: false, status: 503, message: uncertain };
  }
}
