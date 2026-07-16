import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceStatus } from "@/lib/types/database";

type ReconcileResult =
  | { ok: true; balanceDueCents: number; paidCents: number; status: InvoiceStatus }
  | { ok: false; message: string };

export async function getSuccessfulPaymentTotal(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
) {
  const { data, error } = await supabase
    .from("payments")
    .select("amount_cents")
    .eq("invoice_id", invoiceId)
    .eq("status", "succeeded");

  if (error) {
    return { error: error.message, totalCents: 0 };
  }

  return {
    error: null,
    totalCents: (data ?? []).reduce((sum, payment) => sum + Number(payment.amount_cents ?? 0), 0),
  };
}

export async function reconcileInvoiceBalance(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
): Promise<ReconcileResult> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, total_cents, paid_at")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { ok: false, message: invoiceError?.message ?? "Invoice not found." };
  }

  const payments = await getSuccessfulPaymentTotal(supabase, invoiceId);
  if (payments.error) {
    return { ok: false, message: payments.error };
  }

  const balanceDueCents = Math.max(0, Number(invoice.total_cents) - payments.totalCents);
  const status: InvoiceStatus = balanceDueCents === 0
    ? "paid"
    : payments.totalCents > 0
      ? "partially_paid"
      : (invoice.status as InvoiceStatus);
  const paidAt = balanceDueCents === 0 ? invoice.paid_at ?? new Date().toISOString() : null;

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ balance_due_cents: balanceDueCents, paid_at: paidAt, status })
    .eq("id", invoiceId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  return { ok: true, balanceDueCents, paidCents: payments.totalCents, status };
}
