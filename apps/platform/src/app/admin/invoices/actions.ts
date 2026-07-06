"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/types/database";

export type InvoiceActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function toCents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export async function createInvoice(
  _previousState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding invoice records." };
  }

  const jobId = String(formData.get("job_id") ?? "");
  const customerId = String(formData.get("customer_id") ?? "");
  const status = String(formData.get("status") ?? "draft") as InvoiceStatus;
  const dueDate = String(formData.get("due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const itemDescription = String(formData.get("line_item_description") ?? "").trim();
  const quantity = Number.parseFloat(String(formData.get("line_item_quantity") ?? "1")) || 1;
  const unitPriceCents = toCents(formData.get("line_item_unit_price"));
  const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

  if (!jobId || !customerId) {
    return { status: "error", message: "Choose a customer and job before creating an invoice." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find the selected job." };
  }

  if (job.customer_id !== customerId) {
    return { status: "error", message: "Selected job does not belong to the selected customer." };
  }

  const dueAt = dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      job_id: jobId,
      customer_id: customerId,
      status,
      subtotal_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      balance_due_cents: totalCents,
      due_at: dueAt,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return { status: "error", message: invoiceError?.message ?? "Could not create invoice." };
  }

  if (itemDescription) {
    const { error: lineItemError } = await supabase.from("invoice_line_items").insert({
      invoice_id: invoice.id,
      name: itemDescription.slice(0, 80),
      description: itemDescription,
      quantity,
      unit_price_cents: unitPriceCents,
      total_cents: totalCents,
      sort_order: 0,
    });

    if (lineItemError) {
      return {
        status: "error",
        message: `Invoice saved, but line item failed: ${lineItemError.message}`,
      };
    }
  }

  if (notes) {
    const { error: noteError } = await supabase.from("notes").insert({
      customer_id: customerId,
      job_id: jobId,
      author_user_id: user.id,
      visibility: "internal",
      body: `Invoice note: ${notes}`,
    });

    if (noteError) {
      return { status: "error", message: `Invoice saved, but note failed: ${noteError.message}` };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  return { status: "success", message: "Invoice saved. Payment collection is not connected yet." };
}
