import "server-only";

import type { RpcArgs } from "@/lib/types/rpc-contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { safeStaffMessage } from "@/lib/security/errors";

type QuoteWorkflowResult =
  | { ok: true; jobId: string; createdJob: boolean; replayed: boolean }
  | { ok: false; message: string; rejected?: boolean };

// The loaded page version is mandatory. Never fetch a newer revision here: it
// would approve a proposal the person did not review. SQL owns all mutations.
export async function approveQuoteAndEnsureWorkOrder(
  supabase: SupabaseClient<any, "public", any>, quoteId: string, expectedRevision: number,
): Promise<QuoteWorkflowResult> {
  return approve(supabase, "approve_quote", { p_quote_id: quoteId, p_expected_revision: expectedRevision });
}

export async function approveQuoteWithPortalToken(
  supabase: SupabaseClient<any, "public", any>, tokenHash: string, expectedRevision: number,
): Promise<QuoteWorkflowResult> {
  return approve(supabase, "approve_quote_by_portal", { p_token_hash: tokenHash, p_expected_revision: expectedRevision });
}

async function approve<Name extends "approve_quote" | "approve_quote_by_portal">(supabase: SupabaseClient<any, "public", any>, command: Name, input: RpcArgs<NoInfer<Name>>): Promise<QuoteWorkflowResult> {
  const revision = input.p_expected_revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 1) return { ok: false, message: "Refresh and review the saved proposal before approving.", rejected: true };
  const { data, error } = await supabase.rpc(command, input);
  if (error) {
    const rejected = ["22023", "PT409", "40001", "42501", "23514"].includes(error.code ?? "");
    return { ok: false, rejected, message: rejected ? safeStaffMessage(error.message) : "Approval could not be confirmed. Refresh the quote to review its saved status before trying again." };
  }
  if (!data || typeof data.job_id !== "string" || typeof data.created_job !== "boolean" || typeof data.replayed !== "boolean"
    || !Number.isSafeInteger(data.edit_revision) || data.edit_revision < 1 || typeof data.approved_at !== "string") {
    return { ok: false, message: "Approval could not be confirmed. Refresh the quote to review its saved status before trying again." };
  }
  return { ok: true, jobId: data.job_id, createdJob: data.created_job, replayed: data.replayed };
}
