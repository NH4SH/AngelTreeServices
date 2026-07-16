"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";

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
  const dueDate = String(formData.get("due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const lineItems = getInvoiceLineItems(formData);
  const totalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  if (!jobId || !customerId) {
    return { status: "error", message: "Choose a customer and job before creating an invoice." };
  }

  if (lineItems.length === 0) {
    return { status: "error", message: "Add at least one invoice line before saving." };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id, status")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Could not find the selected job." };
  }

  if (job.customer_id !== customerId) {
    return { status: "error", message: "Selected job does not belong to the selected customer." };
  }

  if (!["completed", "ready_to_invoice"].includes(job.status)) {
    return { status: "error", message: "Complete office closeout review before creating an invoice." };
  }

  const previousJobStatus = job.status;

  const { data: existingInvoice, error: existingInvoiceError } = await supabase
    .from("invoices")
    .select("id")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingInvoiceError) {
    return { status: "error", message: existingInvoiceError.message };
  }

  if (existingInvoice) {
    return { status: "error", message: "An invoice already exists for this work order. Open it or use Duplicate for an additional draft." };
  }

  const { data: claimedJob, error: claimError } = await supabase
    .from("jobs")
    .update({ status: "invoiced" })
    .eq("id", jobId)
    .eq("status", previousJobStatus)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return { status: "error", message: claimError.message };
  }

  if (!claimedJob) {
    return { status: "error", message: "Complete this work order before creating an invoice." };
  }

  const dueAt = dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      job_id: jobId,
      customer_id: customerId,
      status: "draft",
      subtotal_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      balance_due_cents: totalCents,
      due_at: dueAt,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    await restoreInvoiceableJob(supabase, jobId, previousJobStatus);
    return { status: "error", message: invoiceError?.message ?? "Could not create invoice." };
  }

  const { error: lineItemError } = await supabase.from("invoice_line_items").insert(
    lineItems.map((item) => ({
      invoice_id: invoice.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      total_cents: item.totalCents,
      sort_order: item.sortOrder,
    })),
  );

  if (lineItemError) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    await restoreInvoiceableJob(supabase, jobId, previousJobStatus);
    return {
      status: "error",
      message: `Invoice was not created because line items failed: ${lineItemError.message}`,
    };
  }

  let noteWarning = "";
  if (notes) {
    const { error: noteError } = await supabase.from("notes").insert({
      customer_id: customerId,
      job_id: jobId,
      author_user_id: user.id,
      visibility: "internal",
      body: `Invoice note: ${notes}`,
    });

    if (noteError) {
      console.error("Invoice note write failed", noteError);
      noteWarning = " The internal note could not be added.";
    }
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "invoice_generated",
    metadata: { source_quote_id: null },
    subjectId: invoice.id,
    subjectType: "invoice",
  });
  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "work_order_invoiced",
    metadata: { invoice_id: invoice.id },
    subjectId: jobId,
    subjectType: "job",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  return { status: "success", message: `Invoice saved. Review it, then send it to the customer when ready.${noteWarning}` };
}

type InvoiceLineItemInput = {
  id: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number;
};

export async function updateInvoice(
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
    return { status: "error", message: "Sign in before editing invoice records." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");
  const submitIntent = String(formData.get("submit_intent") ?? "save");
  const lineItems = getInvoiceLineItems(formData);
  const totalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  if (!invoiceId) {
    return { status: "error", message: "Invoice is required." };
  }

  if (lineItems.length === 0) {
    return { status: "error", message: "Add at least one invoice line before saving." };
  }

  const { data: invoice, error: lookupError } = await supabase
    .from("invoices")
    .select("id, customer_id, status, total_cents, balance_due_cents")
    .eq("id", invoiceId)
    .single();

  if (lookupError || !invoice) {
    return { status: "error", message: lookupError?.message ?? "Invoice not found or no access." };
  }

  if (["paid", "void"].includes(invoice.status)) {
    return { status: "error", message: "Paid and void invoices are locked from regular editing." };
  }

  const recordedPaymentsCents = Math.max(0, invoice.total_cents - invoice.balance_due_cents);
  if (totalCents < recordedPaymentsCents) {
    return {
      status: "error",
      message: `Invoice total cannot be less than ${formatCurrency(recordedPaymentsCents)} in recorded payments.`,
    };
  }

  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({
      subtotal_cents: totalCents,
      tax_cents: 0,
      total_cents: totalCents,
      balance_due_cents: totalCents - recordedPaymentsCents,
      due_at: dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null,
    })
    .eq("id", invoiceId);

  if (invoiceError) {
    return { status: "error", message: invoiceError.message };
  }

  const lineItemError = await syncInvoiceLineItems(supabase, invoiceId, lineItems);
  if (lineItemError) {
    return { status: "error", message: `Invoice details saved, but line items could not be fully updated: ${lineItemError}` };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/invoices/${invoiceId}/edit`);
  revalidatePath(`/admin/customers/${invoice.customer_id}`);

  if (submitIntent === "save_close") {
    redirect(`/admin/invoices/${invoiceId}`);
  }

  return { status: "success", message: "Invoice changes saved. Existing customer link remains active." };
}

function getInvoiceLineItems(formData: FormData): InvoiceLineItemInput[] {
  const ids = formData.getAll("invoice_line_item_id");
  const names = formData.getAll("invoice_line_item_name");
  const descriptions = formData.getAll("invoice_line_item_description");
  const quantities = formData.getAll("invoice_line_item_quantity");
  const unitPrices = formData.getAll("invoice_line_item_unit_price");
  const itemCount = Math.max(names.length, descriptions.length, quantities.length, unitPrices.length);
  const items: InvoiceLineItemInput[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const name = String(names[index] ?? "").trim();
    const descriptionText = String(descriptions[index] ?? "").replaceAll("\r\n", "\n").trimEnd();
    const description = descriptionText.trim() ? descriptionText : null;
    const quantity = Math.max(0, Number.parseFloat(String(quantities[index] ?? "1")) || 1);
    const unitPriceCents = toCents(unitPrices[index] ?? null);
    const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

    if (!name && !description && totalCents === 0) {
      continue;
    }

    items.push({
      id: String(ids[index] ?? "").trim() || null,
      name: (name || description?.split("\n").find((line) => line.trim()) || `Line item ${index + 1}`).slice(0, 120),
      description,
      quantity,
      unitPriceCents,
      totalCents,
      sortOrder: items.length,
    });
  }

  return items;
}

async function syncInvoiceLineItems(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  invoiceId: string,
  lineItems: InvoiceLineItemInput[],
) {
  const { data: existingItems, error: existingItemsError } = await supabase
    .from("invoice_line_items")
    .select("id")
    .eq("invoice_id", invoiceId);

  if (existingItemsError) {
    return existingItemsError.message;
  }

  const existingIds = new Set((existingItems ?? []).map((item) => item.id));
  const retainedIds = new Set<string>();
  const newItems: Array<{
    invoice_id: string;
    name: string;
    description: string | null;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
    sort_order: number;
  }> = [];

  for (const item of lineItems) {
    const values = {
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      total_cents: item.totalCents,
      sort_order: item.sortOrder,
    };

    if (item.id && existingIds.has(item.id)) {
      const { error } = await supabase
        .from("invoice_line_items")
        .update(values)
        .eq("id", item.id)
        .eq("invoice_id", invoiceId);
      if (error) {
        return error.message;
      }
      retainedIds.add(item.id);
    } else {
      newItems.push({ invoice_id: invoiceId, ...values });
    }
  }

  if (newItems.length > 0) {
    const { error } = await supabase.from("invoice_line_items").insert(newItems);
    if (error) {
      return error.message;
    }
  }

  const removedIds = [...existingIds].filter((id) => !retainedIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("invoice_line_items")
      .delete()
      .eq("invoice_id", invoiceId)
      .in("id", removedIds);
    if (error) {
      return error.message;
    }
  }

  return null;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function restoreInvoiceableJob(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  jobId: string,
  status: string,
) {
  await supabase.from("jobs").update({ status }).eq("id", jobId).eq("status", "invoiced");
}
