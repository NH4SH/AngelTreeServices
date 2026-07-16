"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceLineItem, JobPriority, QuoteLineItem } from "@/lib/types/database";

export type DuplicateRecordActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function duplicateQuote(
  _previousState: DuplicateRecordActionState,
  formData: FormData,
): Promise<DuplicateRecordActionState> {
  const auth = await requireInternalStaff();

  if (auth.error) {
    return auth.error;
  }

  const quoteId = getString(formData, "quote_id");

  if (!quoteId) {
    return { status: "error", message: "Choose a quote to duplicate." };
  }

  const { data: quote, error: quoteError } = await auth.supabase
    .from("quotes")
    .select("*, jobs:jobs!quotes_job_id_fkey(id, service_location_id), quote_line_items(*)")
    .eq("id", quoteId)
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Quote not found or no access." };
  }

  const typedQuote = quote as typeof quote & {
    jobs?: { service_location_id: string | null } | null;
    quote_line_items?: QuoteLineItem[];
  };
  const serviceLocationId = typedQuote.service_location_id ?? typedQuote.jobs?.service_location_id ?? null;

  if (!serviceLocationId) {
    return {
      status: "error",
      message: "This quote needs a service location before it can be duplicated as a draft.",
    };
  }

  const { data: newQuote, error: createError } = await auth.supabase
    .from("quotes")
    .insert({
      job_id: null,
      customer_id: typedQuote.customer_id,
      service_location_id: serviceLocationId,
      estimate_schedule_event_id: null,
      status: "draft",
      quote_number: await getNextRecordNumber(auth.supabase, "quotes", "quote_number", "Q", typedQuote.quote_number),
      subtotal_cents: typedQuote.subtotal_cents,
      tax_cents: typedQuote.tax_cents,
      total_cents: typedQuote.total_cents,
      customer_message: typedQuote.customer_message,
      sent_at: null,
      sent_method: null,
      sent_by_user_id: null,
      approved_at: null,
      expires_at: getFreshFutureDate(typedQuote.expires_at),
    })
    .select("id")
    .single();

  if (createError || !newQuote) {
    return { status: "error", message: createError?.message ?? "Could not duplicate quote." };
  }

  const lineItemError = await copyQuoteLineItems(auth.supabase, newQuote.id, typedQuote.quote_line_items ?? []);

  if (lineItemError) {
    await auth.supabase.from("quotes").delete().eq("id", newQuote.id);
    return { status: "error", message: `Quote copy was not saved because line items failed: ${lineItemError}` };
  }

  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "quote_duplicated",
    metadata: { source_quote_id: quoteId },
    subjectId: newQuote.id,
    subjectType: "quote",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath(`/admin/customers/${typedQuote.customer_id}`);
  redirect(`/admin/quotes/${newQuote.id}/edit?duplicated=quote`);
}

export async function duplicateInvoice(
  _previousState: DuplicateRecordActionState,
  formData: FormData,
): Promise<DuplicateRecordActionState> {
  const auth = await requireInternalStaff();

  if (auth.error) {
    return auth.error;
  }

  const invoiceId = getString(formData, "invoice_id");

  if (!invoiceId) {
    return { status: "error", message: "Choose an invoice to duplicate." };
  }

  const { data: invoice, error: invoiceError } = await auth.supabase
    .from("invoices")
    .select("*, invoice_line_items(*)")
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return { status: "error", message: invoiceError?.message ?? "Invoice not found or no access." };
  }

  const typedInvoice = invoice as typeof invoice & {
    invoice_line_items?: InvoiceLineItem[];
  };

  const { data: newInvoice, error: createError } = await auth.supabase
    .from("invoices")
    .insert({
      job_id: typedInvoice.job_id,
      quote_id: null,
      customer_id: typedInvoice.customer_id,
      status: "draft",
      invoice_number: await getNextRecordNumber(
        auth.supabase,
        "invoices",
        "invoice_number",
        "INV",
        typedInvoice.invoice_number,
      ),
      subtotal_cents: typedInvoice.subtotal_cents,
      tax_cents: typedInvoice.tax_cents,
      total_cents: typedInvoice.total_cents,
      balance_due_cents: typedInvoice.total_cents,
      due_at: null,
      sent_at: null,
      paid_at: null,
    })
    .select("id")
    .single();

  if (createError || !newInvoice) {
    return { status: "error", message: createError?.message ?? "Could not duplicate invoice." };
  }

  const lineItemError = await copyInvoiceLineItems(auth.supabase, newInvoice.id, typedInvoice.invoice_line_items ?? []);

  if (lineItemError) {
    await auth.supabase.from("invoices").delete().eq("id", newInvoice.id);
    return { status: "error", message: `Invoice copy was not saved because line items failed: ${lineItemError}` };
  }

  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "invoice_duplicated",
    metadata: { source_invoice_id: invoiceId },
    subjectId: newInvoice.id,
    subjectType: "invoice",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/customers/${typedInvoice.customer_id}`);
  redirect(`/admin/invoices/${newInvoice.id}/edit?duplicated=invoice`);
}

export async function duplicateJob(
  _previousState: DuplicateRecordActionState,
  formData: FormData,
): Promise<DuplicateRecordActionState> {
  const auth = await requireInternalStaff();

  if (auth.error) {
    return auth.error;
  }

  const jobId = getString(formData, "job_id");

  if (!jobId) {
    return { status: "error", message: "Choose a work order to duplicate." };
  }

  const { data: job, error: jobError } = await auth.supabase
    .from("jobs")
    .select("id, customer_id, service_location_id, service_type, priority, requested_scope")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { status: "error", message: jobError?.message ?? "Work order not found or no access." };
  }

  const { data: newJob, error: createError } = await auth.supabase
    .from("jobs")
    .insert({
      customer_id: job.customer_id,
      service_location_id: job.service_location_id,
      source_quote_id: null,
      lead_source_id: null,
      assigned_crew_user_id: null,
      status: "new_lead",
      service_type: job.service_type,
      priority: (job.priority ?? "normal") as JobPriority,
      requested_scope: job.requested_scope,
      internal_notes: null,
      scheduled_start_at: null,
      scheduled_end_at: null,
      completed_at: null,
      lost_reason: null,
    })
    .select("id")
    .single();

  if (createError || !newJob) {
    return { status: "error", message: createError?.message ?? "Could not duplicate work order." };
  }

  await recordActivity(auth.supabase, {
    actorUserId: auth.userId,
    eventType: "work_order_duplicated",
    metadata: { source_job_id: jobId },
    subjectId: newJob.id,
    subjectType: "job",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/schedule");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/admin/customers/${job.customer_id}`);
  redirect(`/admin/jobs/${newJob.id}?duplicated=job`);
}

async function requireInternalStaff() {
  const supabase = await createClient();

  if (!supabase) {
    return { error: { status: "error" as const, message: "Supabase is not configured." } };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: { status: "error" as const, message: "Sign in before duplicating CRM records." } };
  }

  const roles = await getUserRoles(supabase, user.id);

  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { error: { status: "error" as const, message: "Only internal staff can duplicate CRM records." } };
  }

  return { error: null, supabase, userId: user.id };
}

async function copyQuoteLineItems(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  quoteId: string,
  items: QuoteLineItem[],
) {
  const copiedItems = [...items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, index) => ({
      quote_id: quoteId,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_cents: item.total_cents,
      sort_order: index,
    }));

  if (copiedItems.length === 0) {
    return null;
  }

  const { error } = await supabase.from("quote_line_items").insert(copiedItems);
  return error?.message ?? null;
}

async function copyInvoiceLineItems(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  invoiceId: string,
  items: InvoiceLineItem[],
) {
  const copiedItems = [...items]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, index) => ({
      invoice_id: invoiceId,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      total_cents: item.total_cents,
      sort_order: index,
    }));

  if (copiedItems.length === 0) {
    return null;
  }

  const { error } = await supabase.from("invoice_line_items").insert(copiedItems);
  return error?.message ?? null;
}

function getFreshFutureDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).getTime() > Date.now() ? value : null;
}

async function getNextRecordNumber(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  table: "quotes" | "invoices",
  column: "quote_number" | "invoice_number",
  fallbackPrefix: "Q" | "INV",
  currentNumber: string | null,
) {
  const existingPattern = currentNumber?.match(/^(.*?)(\d+)$/);
  const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const prefix = existingPattern ? existingPattern[1] : `${fallbackPrefix}-${dateStamp}-`;
  const width = existingPattern ? existingPattern[2].length : 3;
  const matcher = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

  const { data } = await supabase
    .from(table)
    .select(column)
    .like(column, `${prefix}%`);
  const maxNumber = ((data ?? []) as Array<Record<string, string | null>>).reduce((max, row) => {
    const value = row[column];
    const match = value?.match(matcher);
    const parsed = match ? Number.parseInt(match[1], 10) : 0;
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, 0);

  return `${prefix}${String(maxNumber + 1).padStart(width, "0")}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
