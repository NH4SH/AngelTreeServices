"use server";

import { revalidatePath } from "next/cache";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { reconcileInvoiceBalance } from "@/lib/payments/reconciliation";
import { createClient } from "@/lib/supabase/server";

export type ManualPaymentActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const manualMethods = ["check", "cash", "ach", "other"] as const;

export async function recordManualPayment(
  _previousState: ManualPaymentActionState,
  formData: FormData,
): Promise<ManualPaymentActionState> {
  const supabase = await createClient();
  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sign in before recording payments." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can record manual payments." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const amountCents = toCents(formData.get("amount"));
  const paymentDate = parsePaymentDate(formData.get("payment_date"));
  const method = String(formData.get("payment_method") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim().slice(0, 160) || null;
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000) || null;

  if (!invoiceId || amountCents <= 0 || !paymentDate || !manualMethods.includes(method as (typeof manualMethods)[number])) {
    return { status: "error", message: "Enter a valid payment amount, date, and method." };
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, customer_id, organization_id, status, balance_due_cents")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { status: "error", message: invoiceError?.message ?? "Invoice not found or no access." };
  }

  if (["paid", "void"].includes(invoice.status) || Number(invoice.balance_due_cents) <= 0) {
    return { status: "error", message: "This invoice does not have an amount available for payment." };
  }

  if (amountCents > Number(invoice.balance_due_cents)) {
    return { status: "error", message: "Manual payment cannot be greater than the remaining balance." };
  }

  const { error: paymentError } = await supabase.from("payments").insert({
    amount_cents: amountCents,
    customer_id: invoice.customer_id,
    organization_id: invoice.organization_id,
    currency: "usd",
    invoice_id: invoice.id,
    notes,
    paid_at: paymentDate,
    payment_method: method,
    provider: "manual",
    reference,
    status: "succeeded",
  });

  if (paymentError) {
    return { status: "error", message: paymentError.message };
  }

  const reconciliation = await reconcileInvoiceBalance(supabase, invoice.id);
  if (!reconciliation.ok) {
    return { status: "error", message: `Payment was recorded, but the invoice balance could not be updated: ${reconciliation.message}` };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "manual_payment_recorded",
    metadata: { amount_cents: amountCents, method, reference },
    subjectId: invoice.id,
    subjectType: "invoice",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoice.id}`);
  return { status: "success", message: "Manual payment recorded and invoice balance updated." };
}

export async function cancelManualPayment(
  _previousState: ManualPaymentActionState,
  formData: FormData,
): Promise<ManualPaymentActionState> {
  const supabase = await createClient();
  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sign in before correcting payments." };
  }

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.accessApproval)) {
    return { status: "error", message: "Only owners and admins can correct manual payments." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  if (!invoiceId || !paymentId) {
    return { status: "error", message: "Payment details are missing. Reload the invoice and try again." };
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, invoice_id, customer_id, organization_id, amount_cents, provider, status, reference")
    .eq("id", paymentId)
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (paymentError || !payment) {
    return { status: "error", message: paymentError?.message ?? "Payment not found or no access." };
  }

  if (payment.provider !== "manual") {
    return { status: "error", message: "Stripe payments must be corrected through the Stripe refund workflow." };
  }

  if (payment.status !== "succeeded") {
    return { status: "error", message: "This payment has already been changed. Reload the invoice to see its current balance." };
  }

  const { data: cancelledPayment, error: cancellationError } = await supabase
    .from("payments")
    .update({ status: "cancelled" })
    .eq("id", payment.id)
    .eq("invoice_id", invoiceId)
    .eq("provider", "manual")
    .eq("status", "succeeded")
    .select("id")
    .maybeSingle();

  if (cancellationError || !cancelledPayment) {
    return {
      status: "error",
      message: cancellationError?.message ?? "This payment was already corrected. Reload the invoice to see the latest balance.",
    };
  }

  let reconciliation;
  try {
    reconciliation = await reconcileInvoiceBalance(supabase, invoiceId);
  } catch (error) {
    console.error("Manual payment was cancelled, but invoice reconciliation threw an error.", { error, invoiceId, paymentId });
    reconciliation = { ok: false as const, message: "Unexpected invoice reconciliation error." };
  }

  if (!reconciliation.ok) {
    const { error: rollbackError } = await supabase
      .from("payments")
      .update({ status: "succeeded" })
      .eq("id", payment.id)
      .eq("status", "cancelled");

    if (rollbackError) {
      console.error("Could not restore a manual payment after reconciliation failed.", {
        invoiceId,
        paymentId,
        rollbackError,
      });
    }

    return { status: "error", message: `The payment was not changed because the balance could not be restored: ${reconciliation.message}` };
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "manual_payment_cancelled",
    metadata: {
      amount_cents: payment.amount_cents,
      payment_id: payment.id,
      reference: payment.reference,
    },
    subjectId: invoiceId,
    subjectType: "invoice",
  });

  revalidatePaymentPaths({
    customerId: payment.customer_id,
    invoiceId,
    organizationId: payment.organization_id,
  });

  return {
    status: "success",
    message: "Mistaken manual payment undone. The invoice balance is restored and can now be edited.",
  };
}

function revalidatePaymentPaths({
  customerId,
  invoiceId,
  organizationId,
}: {
  customerId: string | null;
  invoiceId: string;
  organizationId: string | null;
}) {
  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/invoices/${invoiceId}/edit`);
  if (customerId) {
    revalidatePath(`/admin/customers/${customerId}`);
  }
  if (organizationId) {
    revalidatePath(`/admin/organizations/${organizationId}`);
  }
}

function toCents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function parsePaymentDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }

  const date = new Date(`${text}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date.toISOString();
}
