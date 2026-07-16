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
    .select("id, customer_id, status, balance_due_cents")
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
