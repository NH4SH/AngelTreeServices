import type { RpcArgs } from "@/lib/types/rpc-contracts";
import "server-only";
import { withDeadline } from "../runtime/deadline.ts";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoiceStatus } from "@/lib/types/database";
import { cancelPendingCommunications, syncAutomatedCommunications, syncInvoicePaymentCommunications } from "@/lib/communications/queue";
import { getServiceRoleClient } from "@/lib/supabase/admin";

type ReconcileResult =
  | { ok: true; balanceDueCents: number; paidCents: number; status: InvoiceStatus }
  | { ok: false; message: string };

type InvoiceBalanceReceipt = {
  balance_due_cents: number;
  paid_cents: number;
  status: InvoiceStatus;
};
const invoiceStatuses = new Set<string>(["draft", "sent", "partially_paid", "paid", "void", "overdue"]);
const unconfirmedBalance = "The invoice balance could not be confirmed. Refresh the invoice and review its payment history before trying again.";

function isInvoiceBalanceReceipt(value: unknown): value is InvoiceBalanceReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.balance_due_cents === "number" && Number.isSafeInteger(receipt.balance_due_cents)
    && receipt.balance_due_cents >= 0 && receipt.balance_due_cents <= 2147483647
    && typeof receipt.paid_cents === "number" && Number.isSafeInteger(receipt.paid_cents) && receipt.paid_cents >= 0
    && typeof receipt.status === "string" && invoiceStatuses.has(receipt.status);
}

export async function syncReconciledPaymentCommunications(invoiceId: string) {
  const supabase = getServiceRoleClient();
  if (!supabase) return false;
  try {
    const result = await syncInvoicePaymentCommunications(supabase, invoiceId);
    if (result.error) console.error("Payment saved; follow-up planning needs review.", { invoiceId });
    return !result.error;
  } catch {
    console.error("Payment saved; follow-up planning needs review.", { invoiceId });
    return false;
  }
}

export async function getSuccessfulPaymentTotal(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
) {
  const unavailable = { error: "Successful payment history could not be confirmed.", totalCents: 0 };
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(invoiceId)) return unavailable;
  try {
    const receipt = await withDeadline(signal => supabase
      .rpc("get_invoice_payment_principal", { p_invoice_id: invoiceId } satisfies RpcArgs<"get_invoice_payment_principal">)
      .abortSignal(signal), 5000);
    const row = receipt?.data;
    if (receipt?.error !== null || !row || typeof row !== "object" || Array.isArray(row)
      || row.invoice_id !== invoiceId
      || typeof row.successful_payment_count !== "number" || !Number.isSafeInteger(row.successful_payment_count) || row.successful_payment_count < 0
      || typeof row.paid_principal_cents !== "number" || !Number.isSafeInteger(row.paid_principal_cents) || row.paid_principal_cents < 0
      || (BigInt(row.paid_principal_cents) > BigInt(row.successful_payment_count) * BigInt(2147483647))) return unavailable;
    // The database aggregates all matching rows in one statement snapshot.
    // No client paging, row-cap bypass, balance write or fallback to guessed zero.
    return { error: null, totalCents: row.paid_principal_cents };
  } catch {
    return unavailable;
  }
}

export async function reconcileInvoiceBalance(
  supabase: SupabaseClient<any, "public", any>,
  invoiceId: string,
): Promise<ReconcileResult> {
  let receipt: unknown;
  try {
    const { data, error } = await supabase.rpc("reconcile_invoice_balance", { p_invoice_id: invoiceId } satisfies RpcArgs<"reconcile_invoice_balance">);
    if (error) return { ok: false, message: unconfirmedBalance };
    receipt = data;
  } catch {
    // The transaction may already have committed. Never imply rollback, start
    // another payment or run follow-ups on an unconfirmed acknowledgement.
    return { ok: false, message: unconfirmedBalance };
  }
  if (!isInvoiceBalanceReceipt(receipt)) return { ok: false, message: unconfirmedBalance };
  const balanceDueCents = receipt.balance_due_cents;
  const paidCents = receipt.paid_cents;
  const status = receipt.status;

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
