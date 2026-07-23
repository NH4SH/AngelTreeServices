"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { completeJobAfterInvoice } from "@/lib/jobs/complete-after-invoice";
import { safeStaffMessage } from "@/lib/security/errors";

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

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { status: "error", message: "Only authorized office staff can create invoices." };
  }

  const jobId = String(formData.get("job_id") ?? "").trim();
  const partyValue = String(formData.get("contracting_party") ?? "");
  const newCustomerRequested = partyValue === "new_customer";
  let party = parseContractingParty(partyValue);
  let serviceLocationId = String(formData.get("service_location_id") ?? "").trim() || null;
  let createdCustomerId: string | null = null;
  const dueDate = String(formData.get("due_date") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const lineItems = getInvoiceLineItems(formData);
  const totalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  if (!party && !newCustomerRequested) {
    return { status: "error", message: "Choose a customer or organization before creating an invoice." };
  }

  if (lineItems.length === 0) {
    return { status: "error", message: "Add at least one invoice line before saving." };
  }

  if (newCustomerRequested) {
    const name = String(formData.get("new_customer_name") ?? "").trim();
    const phone = String(formData.get("new_customer_phone") ?? "").trim() || null;
    const email = String(formData.get("new_customer_email") ?? "").trim().toLowerCase() || null;
    const street = String(formData.get("new_customer_street") ?? "").trim();
    const city = String(formData.get("new_customer_city") ?? "").trim();
    const state = String(formData.get("new_customer_state") ?? "VA").trim().toUpperCase();
    const postalCode = String(formData.get("new_customer_postal_code") ?? "").trim() || null;

    if (!name || (!phone && !email) || !street || !city || state.length !== 2) {
      return { status: "error", message: "Enter the customer name, a phone or email, and a complete service address." };
    }

    const duplicateQueries = [
      email ? supabase.from("customers").select("id, display_name").ilike("email", email).limit(1).maybeSingle() : null,
      phone ? supabase.from("customers").select("id, display_name").eq("phone", phone).limit(1).maybeSingle() : null,
    ].filter(Boolean) as PromiseLike<{ data: { id: string; display_name: string } | null; error: { message: string } | null }>[];
    const duplicateResults = await Promise.all(duplicateQueries);
    const duplicate = duplicateResults.find((result) => result.data)?.data;
    if (duplicate) {
      return { status: "error", message: `${duplicate.display_name} already uses that contact information. Select the existing customer instead.` };
    }

    const billingAddress = [street, city, state, postalCode].filter(Boolean).join(", ");
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ display_name: name, phone, email, billing_address: billingAddress, customer_type: "residential", status: "active" })
      .select("id")
      .single();
    if (customerError || !customer) {
      return { status: "error", message: customerError?.message ?? "Could not create the customer." };
    }
    createdCustomerId = customer.id;
    party = { kind: "customer", customerId: customer.id, organizationId: null };

    const { data: location, error: locationError } = await supabase
      .from("service_locations")
      .insert({ customer_id: customer.id, organization_id: null, label: "Primary service location", street, city, state, postal_code: postalCode })
      .select("id")
      .single();
    if (locationError || !location) {
      await supabase.from("customers").delete().eq("id", customer.id);
      return { status: "error", message: locationError?.message ?? "Could not create the service location." };
    }
    serviceLocationId = location.id;
  }

  if (!party) {
    return { status: "error", message: "Choose a valid contracting party." };
  }

  let job: {
    id: string;
    customer_id: string | null;
    organization_id: string | null;
    service_location_id: string | null;
    property_manager_contact_id: string | null;
    status: string;
    completed_at: string | null;
    completed_by_user_id: string | null;
    recurring_service_plan_id: string | null;
    recurring_occurrence_id: string | null;
  } | null = null;

  if (jobId) {
    const jobResult = await supabase
      .from("jobs")
      .select("id, customer_id, organization_id, service_location_id, property_manager_contact_id, status, completed_at, completed_by_user_id, recurring_service_plan_id, recurring_occurrence_id")
      .eq("id", jobId)
      .single();
    job = jobResult.data;

    if (jobResult.error || !job) {
      return { status: "error", message: jobResult.error?.message ?? "Could not find the selected job." };
    }

    if (!belongsToContractingParty(job, party)) {
      return { status: "error", message: "Selected job does not belong to the selected contracting party." };
    }

    if (!["accepted", "scheduled", "in_progress", "completed", "completed_pending_review", "ready_to_invoice"].includes(job.status)) {
      return { status: "error", message: "This work order is not available for draft invoicing." };
    }

    const { data: existingInvoice, error: existingInvoiceError } = await supabase
      .from("invoices")
      .select("id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingInvoiceError) {
      return { status: "error", message: safeStaffMessage(existingInvoiceError.message) };
    }

    if (existingInvoice) {
      redirect(`/admin/invoices/${existingInvoice.id}`);
    }
    serviceLocationId = job.service_location_id;
  } else if (serviceLocationId) {
    const { data: location, error: locationError } = await supabase
      .from("service_locations")
      .select("id, customer_id, organization_id")
      .eq("id", serviceLocationId)
      .single();
    if (locationError || !location || !belongsToContractingParty(location, party)) {
      if (createdCustomerId) await supabase.from("customers").delete().eq("id", createdCustomerId);
      return { status: "error", message: "Choose a service location belonging to the selected customer or organization." };
    }
  }

  const dueAt = dueDate ? new Date(`${dueDate}T17:00:00`).toISOString() : null;

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      job_id: job?.id ?? null,
      quote_id: null,
      customer_id: party.customerId,
      organization_id: party.organizationId,
      billing_contact_id: job?.property_manager_contact_id ?? null,
      accounts_payable_contact_id: job?.property_manager_contact_id ?? null,
      service_location_id: serviceLocationId,
      recurring_service_plan_id: job?.recurring_service_plan_id ?? null,
      recurring_occurrence_id: job?.recurring_occurrence_id ?? null,
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
    if (createdCustomerId) await supabase.from("customers").delete().eq("id", createdCustomerId);
    return { status: "error", message: invoiceError?.message ?? "Could not create invoice." };
  }

  const { error: lineItemError } = await supabase.from("invoice_line_items").insert(
    lineItems.map((item) => ({
      invoice_id: invoice.id,
      name: item.name,
      description: item.description,
      service_category_id: item.serviceCategoryId,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      total_cents: item.totalCents,
      sort_order: item.sortOrder,
    })),
  );

  if (lineItemError) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    if (createdCustomerId) await supabase.from("customers").delete().eq("id", createdCustomerId);
    return {
      status: "error",
      message: `Invoice was not created because line items failed: ${lineItemError.message}`,
    };
  }

  const { error: changeOrderError } = await supabase
    .rpc("attach_approved_change_orders_to_invoice", { p_invoice_id: invoice.id });
  if (changeOrderError) {
    console.error("Draft invoice created, but approved additions could not be attached", {
      invoiceId: invoice.id,
      jobId,
      error: changeOrderError,
    });
  }

  let noteWarning = "";
  if (notes) {
    if (party.customerId || job || serviceLocationId) {
      const { error: noteError } = await supabase.from("notes").insert({
        customer_id: party.customerId,
        job_id: job?.id ?? null,
        service_location_id: serviceLocationId,
        author_user_id: user.id,
        visibility: "internal",
        body: `Invoice note: ${notes}`,
      });

      if (noteError) {
        console.error("Invoice note write failed", noteError);
        noteWarning = " The internal note could not be added.";
      }
    } else {
      noteWarning = " The note could not be attached without a customer, property, or work order.";
    }
  }

  const jobCompletion = job
    ? await completeJobAfterInvoice({
        actorUserId: user.id,
        invoiceId: invoice.id,
        job,
        supabase,
      })
    : { completed: true as const, warning: null };

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "invoice_draft_created",
    metadata: { source_quote_id: null, standalone: !job },
    subjectId: invoice.id,
    subjectType: "invoice",
  });
  if (job) await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "invoice_draft_created_from_job",
    metadata: {
      invoice_id: invoice.id,
      job_status_after: jobCompletion.completed ? "completed" : job.status,
      job_status_before: job.status,
    },
    subjectId: job.id,
    subjectType: "job",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/jobs");
  if (job) revalidatePath(`/admin/jobs/${job.id}`);
  revalidatePath("/admin/schedule");
  revalidatePath("/crew/jobs");
  if (job) revalidatePath(`/crew/jobs/${job.id}`);
  revalidatePath("/admin/invoices");
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);
  redirect(`/admin/invoices/${invoice.id}?created=1${job && jobCompletion.completed ? "&job_completed=1" : ""}${noteWarning ? "&note_warning=1" : ""}${jobCompletion.warning ? "&job_completion_warning=1" : ""}`);
}

type InvoiceLineItemInput = {
  id: string | null;
  name: string;
  description: string | null;
  serviceCategoryId: string | null;
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
    .select("id, customer_id, organization_id, status, total_cents, balance_due_cents")
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
    return { status: "error", message: safeStaffMessage(invoiceError.message) };
  }

  const lineItemError = await syncInvoiceLineItems(supabase, invoiceId, lineItems);
  if (lineItemError) {
    return { status: "error", message: `Invoice details saved, but line items could not be fully updated: ${lineItemError}` };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/invoices/${invoiceId}/edit`);
  if (invoice.customer_id) revalidatePath(`/admin/customers/${invoice.customer_id}`);
  if (invoice.organization_id) revalidatePath(`/admin/organizations/${invoice.organization_id}`);

  if (submitIntent === "save_close") {
    redirect(`/admin/invoices/${invoiceId}`);
  }

  return { status: "success", message: "Invoice changes saved. Existing customer link remains active." };
}

function getInvoiceLineItems(formData: FormData): InvoiceLineItemInput[] {
  const ids = formData.getAll("invoice_line_item_id");
  const names = formData.getAll("invoice_line_item_name");
  const descriptions = formData.getAll("invoice_line_item_description");
  const serviceCategoryIds = formData.getAll("invoice_line_item_service_category_id");
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
      serviceCategoryId: String(serviceCategoryIds[index] ?? "").trim() || null,
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
    service_category_id: string | null;
    quantity: number;
    unit_price_cents: number;
    total_cents: number;
    sort_order: number;
  }> = [];

  for (const item of lineItems) {
    const values = {
      name: item.name,
      description: item.description,
      service_category_id: item.serviceCategoryId,
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
