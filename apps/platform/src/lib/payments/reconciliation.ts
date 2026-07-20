import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceStatus } from "@/lib/types/database";
import { cancelPendingCommunications, syncAutomatedCommunications } from "@/lib/communications/queue";
import { netSuccessfulPaymentPrincipal } from "@/lib/payments/payment-accounting";
import { getServiceRoleClient } from "@/lib/supabase/admin";

type ReconcileResult =
  | { ok: true; balanceDueCents: number; paidCents: number; status: InvoiceStatus }
  | { ok: false; message: string };

export async function getSuccessfulPaymentTotal(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
) {
  const { data, error } = await supabase
    .from("payments")
    .select("amount_cents, refunded_principal_cents, disputed_principal_cents, dispute_status")
    .eq("invoice_id", invoiceId)
    .eq("status", "succeeded");

  if (error) {
    return { error: error.message, totalCents: 0 };
  }

  return {
    error: null,
    totalCents: (data ?? []).reduce(
      (sum, payment) => sum + netSuccessfulPaymentPrincipal(payment),
      0,
    ),
  };
}

export async function reconcileInvoiceBalance(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
): Promise<ReconcileResult> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, status, total_cents, paid_at, due_at")
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
  const status = resolveInvoicePaymentStatus({
    balanceDueCents,
    currentStatus: invoice.status as InvoiceStatus,
    dueAt: invoice.due_at,
    paidCents: payments.totalCents,
  });
  const paidAt = balanceDueCents === 0 ? invoice.paid_at ?? new Date().toISOString() : null;

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ balance_due_cents: balanceDueCents, paid_at: paidAt, status })
    .eq("id", invoiceId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  const communicationSupabase = getServiceRoleClient();
  if (communicationSupabase) {
    try {
      if (balanceDueCents === 0) {
        await cancelPendingCommunications(communicationSupabase, { invoiceId }, "Invoice was paid in full.");
      }
      await syncAutomatedCommunications(communicationSupabase);
    } catch (error) {
      // Notification scheduling must not invalidate a successfully reconciled balance.
      console.error("Invoice balance reconciled, but communication sync failed.", { error, invoiceId });
    }
  }

  return { ok: true, balanceDueCents, paidCents: payments.totalCents, status };
}

function resolveInvoicePaymentStatus({
  balanceDueCents,
  currentStatus,
  dueAt,
  paidCents,
}: {
  balanceDueCents: number;
  currentStatus: InvoiceStatus;
  dueAt: string | null;
  paidCents: number;
}): InvoiceStatus {
  if (currentStatus === "void") {
    return "void";
  }

  if (balanceDueCents === 0) {
    return "paid";
  }

  if (paidCents > 0) {
    return "partially_paid";
  }

  if (currentStatus === "draft") {
    return "draft";
  }

  if (currentStatus === "overdue" || (dueAt && new Date(dueAt).getTime() < Date.now())) {
    return "overdue";
  }

  return "sent";
}
