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
  const { data, error } = await supabase.rpc("reconcile_invoice_balance", { p_invoice_id: invoiceId });
  if (error || !data) {
    return { ok: false, message: error?.message ?? "Invoice could not be reconciled." };
  }
  const balanceDueCents = Number(data.balance_due_cents);
  const paidCents = Number(data.paid_cents);
  const status = data.status as InvoiceStatus;

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

  return { ok: true, balanceDueCents, paidCents, status };
}
