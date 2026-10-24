"use server";
import type { RpcArgs } from "@/lib/types/rpc-contracts";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withReturnTo } from "@/lib/drafts/return-context";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { getInvoiceDueAt } from "@/lib/invoices/due-date";
import { saveInvoiceEdit } from "@/lib/invoices/save-confirmation";
import { createStandaloneInvoice } from "@/lib/invoices/standalone-request";
import { existingInvoiceMessage, isGenerationRequestId } from "@/lib/invoices/generation-request";
import { generateInvoiceConfirmed } from "@/lib/invoices/generation-confirmation";
import { safeStaffMessage } from "@/lib/security/errors";

export type InvoiceActionState = {
  status: "idle" | "success" | "error";
  message: string;
  navigateTo?: string;
  existingInvoice?: boolean;
  invoiceId?: string;
  savedUpdatedAt?: string;
  savedLineIds?: Record<string, string>;
};

function toCents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export async function createInvoice(
  _previousState: InvoiceActionState,
  formData: FormData,
  intent: "standard" | "firewood_household" = "standard",
): Promise<InvoiceActionState> {
  if (intent !== "standard" && intent !== "firewood_household") return { status: "error", message: "Review the invoice type before saving." };
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
  if (intent === "firewood_household" && jobId) return { status: "error", message: "Create firewood as a standalone invoice." };
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

  if (!jobId) {
    const result = await createStandaloneInvoice({
      supabase, requestId: String(formData.get("request_id") ?? ""),
      header: { customer_id: party?.customerId ?? null, organization_id: party?.organizationId ?? null,
        service_location_id: newCustomerRequested ? null : serviceLocationId, due_at: getInvoiceDueAt(dueDate),
        ...(intent === "firewood_household" ? { invoice_intent: intent, firewood_domestic_use: formData.get("firewood_domestic_use") === "confirmed" } : {}) },
      lines: lineItems.map(invoiceLineCommand), notes,
      newCustomer: newCustomerRequested ? {
        name: String(formData.get("new_customer_name") ?? "").trim(),
        phone: String(formData.get("new_customer_phone") ?? "").trim() || null,
        email: String(formData.get("new_customer_email") ?? "").trim().toLowerCase() || null,
        street: String(formData.get("new_customer_street") ?? "").trim(),
        city: String(formData.get("new_customer_city") ?? "").trim(),
        state: String(formData.get("new_customer_state") ?? "VA").trim().toUpperCase(),
        postal_code: String(formData.get("new_customer_postal_code") ?? "").trim() || null,
      } : null,
    });
    if (!result.ok) return { status: "error", message: result.message };
    for (const path of ["/admin", "/admin/jobs", "/admin/schedule", "/crew/jobs", "/admin/invoices"]) revalidatePath(path);
    if (result.customerId) revalidatePath(`/admin/customers/${result.customerId}`);
    if (result.organizationId) revalidatePath(`/admin/organizations/${result.organizationId}`);
    if (result.replayed) return { status: "success", existingInvoice: true, invoiceId: result.invoiceId,
      message: "This saved request already created an invoice. Open it to review; no duplicate was created." };
    const destination = withReturnTo(`/admin/invoices/${result.invoiceId}?created=1${result.noteWarning ? "&note_warning=1" : ""}`, formData.get("returnTo"), "/admin/invoices");
    if (formData.get("client_navigation") === "1") return { status: "success", message: "Invoice created.", navigateTo: destination };
    redirect(destination);
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

  const dueAt = getInvoiceDueAt(dueDate);

  if (job) {
    const requestId = String(formData.get("request_id") ?? "");
    if (!isGenerationRequestId(requestId)) return { status: "error", message: "Refresh the page to prepare the invoice request." };
    const confirmation = await generateInvoiceConfirmed(supabase, {
      p_request_id: requestId, p_job_id: job.id,
      p_manual: { customer_id: party.customerId, organization_id: party.organizationId, due_at: dueAt,
        lines: lineItems.map(invoiceLineCommand), notes },
    } satisfies RpcArgs<"generate_job_invoice">);
    if (!confirmation.ok) return { status: "error", message: confirmation.message };
    const result = confirmation.value;
    for (const path of ["/admin", "/admin/jobs", `/admin/jobs/${job.id}`, "/admin/schedule", "/crew/jobs",
      `/crew/jobs/${job.id}`, "/admin/invoices", `/admin/invoices/${result.invoice_id}`]) revalidatePath(path);
    if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
    if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);
    if (result.existing || result.replayed) return {
      invoiceId: result.invoice_id, existingInvoice: true, status: "success", message: existingInvoiceMessage(result.invoice_status),
    };
    const destination = withReturnTo(`/admin/invoices/${result.invoice_id}?created=1`, formData.get("returnTo"), "/admin/invoices");
    if (formData.get("client_navigation") === "1") return { status: "success", message: "Invoice created.", navigateTo: destination };
    redirect(destination);
  }

  return { status: "error", message: "The selected work order is unavailable for invoicing." };
}

type InvoiceLineItemInput = {
  clientId: string;
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

  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
    return { status: "error", message: "Only active staff may edit invoices." };
  }

  const invoiceId = String(formData.get("invoice_id") ?? "");
  const dueDate = String(formData.get("due_date") ?? "");
  const submitIntent = String(formData.get("submit_intent") ?? "save");
  const lineItems = getInvoiceLineItems(formData);

  if (!invoiceId) {
    return { status: "error", message: "Invoice is required." };
  }

  if (lineItems.length === 0) {
    return { status: "error", message: "Add at least one invoice line before saving." };
  }

  const { data: invoice, error: lookupError } = await supabase
    .from("invoices")
    .select("id, customer_id, organization_id, status, invoice_number, total_cents, balance_due_cents, due_at")
    .eq("id", invoiceId)
    .single();

  if (lookupError || !invoice) {
    return { status: "error", message: lookupError?.message ?? "Invoice not found or no access." };
  }

  const saved = await saveInvoiceEdit({
    supabase, invoiceId,
    expectedUpdatedAt: String(formData.get("expected_updated_at") ?? ""),
    dueAt: getInvoiceDueAt(dueDate),
    lines: lineItems.map((item) => ({ clientId: item.clientId, id: item.id, ...invoiceLineCommand(item) })),
  });
  if (!saved.ok) {
    return { status: "error", message: saved.message };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  revalidatePath(`/admin/invoices/${invoiceId}/edit`);
  if (invoice.customer_id) revalidatePath(`/admin/customers/${invoice.customer_id}`);
  if (invoice.organization_id) revalidatePath(`/admin/organizations/${invoice.organization_id}`);

  if (submitIntent === "save_close") {
    const destination = withReturnTo(`/admin/invoices/${invoiceId}`, formData.get("returnTo"), "/admin/invoices");
    if (formData.get("client_navigation") === "1") return { status: "success", message: "Invoice saved.", navigateTo: destination };
    redirect(destination);
  }

  return {
    status: "success", message: "Invoice changes saved. Existing customer link remains active.",
    savedUpdatedAt: saved.updatedAt,
    savedLineIds: saved.lineIds,
  };
}

function getInvoiceLineItems(formData: FormData): InvoiceLineItemInput[] {
  const ids = formData.getAll("invoice_line_item_id");
  const clientIds = formData.getAll("invoice_line_item_client_id");
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
      clientId: String(clientIds[index] ?? index),
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

function invoiceLineCommand(item: InvoiceLineItemInput) {
  return {
    name: item.name, description: item.description,
    service_category_id: item.serviceCategoryId,
    quantity: item.quantity, unit_price_cents: item.unitPriceCents,
    total_cents: item.totalCents,
  };
}
