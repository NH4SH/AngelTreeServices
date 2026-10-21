import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcArgs } from "../types/rpc-contracts";
import type { Json } from "../types/database.generated";
import { withDeadline } from "../runtime/deadline.ts";
import { isGenerationRequestId, parseGeneratedInvoice, type GeneratedInvoice } from "./generation-request.ts";
import { parseCompletionContext, type JobCompletionContext } from "../jobs/completion-request.ts";

type Result<T> = { ok: true; value: T } | { ok: false; message: string };
type GenerationArgs = Omit<RpcArgs<"generate_job_invoice">, "p_job_id" | "p_quote_id" | "p_manual"> & {
  p_job_id?: string | null; p_quote_id?: string | null; p_manual?: Json | null;
};
type CompletionArgs = Omit<RpcArgs<"complete_job_work">, "p_reason"> & { p_reason?: string | null };
const record = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uncertain = "The result could not be confirmed. Keep this saved request and review the work order before retrying.";
const failure = (): { ok: false; message: string } => ({ ok: false, message: uncertain });
function rejection(response: unknown): { ok: false; message: string } | null {
  if (!record(response) || response.error !== null) {
    const code = record(response) && record(response.error) ? response.error.code : null;
    return { ok: false, message: code === "42501" ? "Only active office staff can complete work or generate invoices."
      : code === "40001" ? "This work order changed. Keep your entries and review the latest work before retrying."
        : code === "23514" || code === "22023" ? "Review this work order, its saved request and billing history before continuing. Your entries have been kept."
          : uncertain };
  }
  return null;
}
async function read(client: SupabaseClient, table: "invoices" | "quotes" | "jobs", id: string, columns: string, signal: AbortSignal) {
  let query = client.from(table).select(columns).eq("id", id);
  if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
  const response: unknown = await query.single();
  return record(response) && response.error === null && record(response.data) && same(response.data.id, id) ? response.data : null;
}
/** Use the caller's RLS-scoped client. A receipt alone cannot bind an invoice to its source. */
async function confirmInvoice(client: SupabaseClient, value: unknown, source: { jobId?: string | null; quoteId?: string | null }, signal: AbortSignal) {
  const invoice = parseGeneratedInvoice(value);
  if (!invoice || source.jobId && !same(invoice.job_id, source.jobId)) return null;
  const saved = await read(client, "invoices", invoice.invoice_id, "id, job_id", signal);
  if (!saved || !same(saved.job_id, invoice.job_id)) return null;
  if (source.quoteId) {
    const quote = await read(client, "quotes", source.quoteId, "id, job_id", signal);
    if (!quote) return null;
    if (quote.job_id !== null) {
      if (!same(quote.job_id, invoice.job_id)) return null;
    } else {
      // Preserve the existing legacy link through jobs.source_quote_id.
      const job = await read(client, "jobs", invoice.job_id, "id, source_quote_id", signal);
      if (!job || !same(job.source_quote_id, source.quoteId)) return null;
    }
  }
  return invoice;
}

export async function generateInvoiceConfirmed(client: SupabaseClient, args: GenerationArgs): Promise<Result<GeneratedInvoice>> {
  if (!isGenerationRequestId(args.p_request_id) || Boolean(args.p_job_id) === Boolean(args.p_quote_id)
    || !isGenerationRequestId(args.p_job_id ?? args.p_quote_id)) return failure();
  try {
    return await withDeadline(async signal => {
      let query = client.rpc("generate_job_invoice", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      const response: unknown = await query, rejected = rejection(response);
      if (rejected || !record(response)) return rejected ?? failure();
      const invoice = await confirmInvoice(client, response.data, { jobId: args.p_job_id, quoteId: args.p_quote_id }, signal);
      // Pre-PR09 receipts can retain job_completed=true. They remain review-only
      // replays; new paperwork must never claim that it completed field work.
      if (!invoice || invoice.job_completed && !invoice.replayed || !invoice.existing && !invoice.replayed && invoice.invoice_status !== "draft") return failure();
      return { ok: true, value: invoice };
    }, 5000);
  } catch { return failure(); }
}

export async function completeWorkConfirmed(client: SupabaseClient, args: CompletionArgs): Promise<Result<{ context: JobCompletionContext; invoice: GeneratedInvoice | null }>> {
  if (!isGenerationRequestId(args.p_request_id) || !isGenerationRequestId(args.p_job_id)
    || !["complete", "complete_and_invoice"].includes(args.p_mode ?? "complete")) return failure();
  try {
    return await withDeadline(async signal => {
      let query = client.rpc("complete_job_work", args);
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      const response: unknown = await query, rejected = rejection(response);
      if (rejected || !record(response) || !record(response.data)) return rejected ?? failure();
      const data = response.data, context = parseCompletionContext(data.context);
      if (!context || !same(data.job_id, args.p_job_id) || !same(context.job_id, args.p_job_id) || data.job_completed !== true
        || !context.completed_at || context.revision < args.p_expected_revision || context.future_count !== 0
        || !["completed", "completed_pending_review", "ready_to_invoice", "invoiced", "paid"].includes(context.status)
        || typeof data.replayed !== "boolean" || typeof data.already_completed !== "boolean"
        || !Number.isSafeInteger(data.closed_visit_count) || Number(data.closed_visit_count) < 0) return failure();
      if (args.p_mode === "complete_and_invoice") {
        const invoice = await confirmInvoice(client, data, { jobId: args.p_job_id }, signal);
        return invoice?.job_completed && context.has_invoice === true ? { ok: true, value: { context, invoice } } : failure();
      }
      return data.invoice_id === undefined ? { ok: true, value: { context, invoice: null } } : failure();
    }, 5000);
  } catch { return failure(); }
}
