"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { createClient } from "@/lib/supabase/server";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { safeStaffMessage } from "@/lib/security/errors";
import type { QuoteStatus } from "@/lib/types/database";

export type QuoteActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function toCents(value: FormDataEntryValue | null) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

type QuoteLineItemInput = {
  id: string | null;
  name: string;
  description: string | null;
  serviceCategoryId: string | null;
  materialId: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  sortOrder: number;
};

export async function createQuote(
  _previousState: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before adding CRM records." };
  }

  const party = parseContractingParty(formData.get("contracting_party"));
  const serviceLocationIdInput = String(formData.get("service_location_id") ?? "");
  const estimateScheduleEventId = String(formData.get("estimate_schedule_event_id") ?? "") || null;
  const jobId = String(formData.get("job_id") ?? "") || null;
  const customerMessage = String(formData.get("customer_message") ?? "").trim() || null;
  const recipientContactId = String(formData.get("recipient_contact_id") ?? "").trim() || null;
  const approvalContactId = String(formData.get("approval_contact_id") ?? "").trim() || null;
  const onsiteContactId = String(formData.get("onsite_contact_id") ?? "").trim() || null;
  const billingContactId = String(formData.get("billing_contact_id") ?? "").trim() || null;
  const purchaseOrderReference = String(formData.get("purchase_order_reference") ?? "").trim() || null;
  const paymentTerms = String(formData.get("payment_terms") ?? "").trim() || null;
  const debrisHandling = String(formData.get("debris_handling") ?? "").trim() || null;
  const debrisHandlingNotes = String(formData.get("debris_handling_notes") ?? "").trim().slice(0, 1200) || null;
  const expiresAt = getEndOfDayIso(formData.get("expires_at"));
  const submitIntent = String(formData.get("submit_intent") ?? "save");
  const lineItems = getQuoteLineItems(formData);
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  if (!party) {
    return { status: "error", message: "Choose a customer or organization before creating a draft quote." };
  }

  const { data: account, error: accountError } = await supabase
    .from(party.kind === "customer" ? "customers" : "organizations")
    .select("id, status")
    .eq("id", party.customerId ?? party.organizationId)
    .single();

  if (accountError || !account || account.status !== "active") {
    return { status: "error", message: accountError?.message ?? "The selected contracting party is not active." };
  }

  const contactError = await validateOrganizationContacts(supabase, party, [recipientContactId, approvalContactId], [onsiteContactId, billingContactId]);
  if (contactError) return { status: "error", message: contactError };

  let serviceLocationId = serviceLocationIdInput || null;

  if (estimateScheduleEventId) {
    const { data: scheduleEvent, error: scheduleEventError } = await supabase
      .from("schedule_events")
      .select("id, service_location_id")
      .eq("id", estimateScheduleEventId)
      .eq("event_type", "estimate")
      .single();

    if (scheduleEventError || !scheduleEvent) {
      return { status: "error", message: scheduleEventError?.message ?? "Could not find the selected estimate event." };
    }

    if (serviceLocationId && scheduleEvent.service_location_id && serviceLocationId !== scheduleEvent.service_location_id) {
      return { status: "error", message: "Selected estimate event and service location do not match." };
    }

    serviceLocationId ||= scheduleEvent.service_location_id ?? null;
  }

  if (!serviceLocationId && !jobId) {
    return { status: "error", message: "Choose a service location or link an existing job before saving the draft quote." };
  }

  if (serviceLocationId) {
    const { data: location, error: locationError } = await supabase
      .from("service_locations")
      .select("id, customer_id, organization_id")
      .eq("id", serviceLocationId)
      .single();

    if (locationError || !location) {
      return { status: "error", message: locationError?.message ?? "Could not find the selected service location." };
    }

    if (!belongsToContractingParty(location, party)) {
      return { status: "error", message: "Selected service location does not belong to the selected contracting party." };
    }
  }

  if (jobId) {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, customer_id, organization_id, service_location_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return { status: "error", message: jobError?.message ?? "Could not find the selected job." };
    }

    if (!belongsToContractingParty(job, party)) {
      return { status: "error", message: "Selected job does not belong to the selected contracting party." };
    }

    serviceLocationId ||= job.service_location_id;

    if (serviceLocationId !== job.service_location_id) {
      return { status: "error", message: "Selected job and service location do not match." };
    }
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      job_id: jobId,
      customer_id: party.customerId,
      organization_id: party.organizationId,
      service_location_id: serviceLocationId,
      estimate_schedule_event_id: estimateScheduleEventId,
      estimator_user_id: user.id,
      recipient_contact_id: recipientContactId,
      approval_contact_id: approvalContactId,
      onsite_contact_id: onsiteContactId,
      billing_contact_id: billingContactId,
      purchase_order_reference: purchaseOrderReference,
      payment_terms: paymentTerms,
      status: "draft",
      subtotal_cents: subtotalCents,
      tax_cents: 0,
      total_cents: subtotalCents,
      customer_message: customerMessage,
      debris_handling: debrisHandling,
      debris_handling_notes: debrisHandlingNotes,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (quoteError || !quote) {
    return { status: "error", message: quoteError?.message ?? "Could not create quote." };
  }

  if (lineItems.length > 0) {
    const { error: lineItemError } = await supabase.from("quote_line_items").insert(
      lineItems.map((item) => ({
        quote_id: quote.id,
        name: item.name,
        description: item.description,
        service_category_id: item.serviceCategoryId,
        material_id: item.materialId,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
        total_cents: item.totalCents,
        sort_order: item.sortOrder,
      })),
    );

    if (lineItemError) {
      revalidatePath("/admin/quotes");
      redirect(`/admin/quotes/${quote.id}/edit?line_error=1`);
    }
  }

  await recordActivity(supabase, {
    actorUserId: user.id,
    eventType: "quote_created",
    metadata: { service_location_id: serviceLocationId },
    subjectId: quote.id,
    subjectType: "quote",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);
  redirect(submitIntent === "save_close" ? `/admin/quotes/${quote.id}` : `/admin/quotes/${quote.id}/edit?saved=1`);
}

export async function updateQuote(
  _previousState: QuoteActionState,
  formData: FormData,
): Promise<QuoteActionState> {
  const supabase = await createClient();

  if (!supabase) {
    return { status: "error", message: "Supabase is not configured." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "error", message: "Sign in before editing quote records." };
  }

  const quoteId = String(formData.get("quote_id") ?? "");
  const party = parseContractingParty(formData.get("contracting_party"));
  const serviceLocationIdInput = String(formData.get("service_location_id") ?? "");
  const estimateScheduleEventId = String(formData.get("estimate_schedule_event_id") ?? "") || null;
  const jobId = String(formData.get("job_id") ?? "") || null;
  const customerMessage = String(formData.get("customer_message") ?? "").trim() || null;
  const recipientContactId = String(formData.get("recipient_contact_id") ?? "").trim() || null;
  const approvalContactId = String(formData.get("approval_contact_id") ?? "").trim() || null;
  const onsiteContactId = String(formData.get("onsite_contact_id") ?? "").trim() || null;
  const billingContactId = String(formData.get("billing_contact_id") ?? "").trim() || null;
  const purchaseOrderReference = String(formData.get("purchase_order_reference") ?? "").trim() || null;
  const paymentTerms = String(formData.get("payment_terms") ?? "").trim() || null;
  const debrisHandling = String(formData.get("debris_handling") ?? "").trim() || null;
  const debrisHandlingNotes = String(formData.get("debris_handling_notes") ?? "").trim().slice(0, 1200) || null;
  const expiresAt = getEndOfDayIso(formData.get("expires_at"));
  const submitIntent = String(formData.get("submit_intent") ?? "save");
  const lineItems = getQuoteLineItems(formData);
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.totalCents, 0);

  if (!quoteId || !party) {
    return { status: "error", message: "Quote and contracting party are required." };
  }

  const { data: existingQuote, error: quoteLookupError } = await supabase
    .from("quotes")
    .select("id, customer_id, organization_id, status, recurring_occurrence_id")
    .eq("id", quoteId)
    .single();

  if (quoteLookupError || !existingQuote) {
    return { status: "error", message: quoteLookupError?.message ?? "Quote not found or no access." };
  }

  const ownerChanged = existingQuote.customer_id !== party.customerId || existingQuote.organization_id !== party.organizationId;
  if (ownerChanged && formData.get("confirm_contracting_party_change") !== "on") {
    return { status: "error", message: "Confirm the contracting-party change before saving this quote." };
  }

  const editableStatuses: QuoteStatus[] = ["draft", "sent", "change_requested"];
  if (!editableStatuses.includes(existingQuote.status as QuoteStatus)) {
    return { status: "error", message: "Approved, declined, expired, or cancelled quotes are locked from regular editing." };
  }

  const { data: account, error: accountError } = await supabase
    .from(party.kind === "customer" ? "customers" : "organizations")
    .select("id, status")
    .eq("id", party.customerId ?? party.organizationId)
    .single();

  if (accountError || !account || account.status !== "active") {
    return { status: "error", message: accountError?.message ?? "The selected contracting party is not active." };
  }

  const contactError = await validateOrganizationContacts(supabase, party, [recipientContactId, approvalContactId], [onsiteContactId, billingContactId]);
  if (contactError) return { status: "error", message: contactError };

  let serviceLocationId = serviceLocationIdInput || null;

  if (estimateScheduleEventId) {
    const { data: scheduleEvent, error: scheduleEventError } = await supabase
      .from("schedule_events")
      .select("id, service_location_id")
      .eq("id", estimateScheduleEventId)
      .eq("event_type", "estimate")
      .single();

    if (scheduleEventError || !scheduleEvent) {
      return { status: "error", message: scheduleEventError?.message ?? "Could not find the selected estimate event." };
    }

    if (serviceLocationId && scheduleEvent.service_location_id && serviceLocationId !== scheduleEvent.service_location_id) {
      return { status: "error", message: "Selected estimate event and service location do not match." };
    }

    serviceLocationId ||= scheduleEvent.service_location_id ?? null;
  }

  if (!serviceLocationId && !jobId) {
    return { status: "error", message: "Choose a service location or link an existing job before saving the quote." };
  }

  if (serviceLocationId) {
    const { data: location, error: locationError } = await supabase
      .from("service_locations")
      .select("id, customer_id, organization_id")
      .eq("id", serviceLocationId)
      .single();

    if (locationError || !location) {
      return { status: "error", message: locationError?.message ?? "Could not find the selected service location." };
    }

    if (!belongsToContractingParty(location, party)) {
      return { status: "error", message: "Selected service location does not belong to the selected contracting party." };
    }
  }

  if (jobId) {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, customer_id, organization_id, service_location_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return { status: "error", message: jobError?.message ?? "Could not find the selected job." };
    }

    if (!belongsToContractingParty(job, party)) {
      return { status: "error", message: "Selected job does not belong to the selected contracting party." };
    }

    serviceLocationId ||= job.service_location_id;

    if (serviceLocationId !== job.service_location_id) {
      return { status: "error", message: "Selected job and service location do not match." };
    }
  }

  const { error: quoteError } = await supabase
    .from("quotes")
    .update({
      job_id: jobId,
      customer_id: party.customerId,
      organization_id: party.organizationId,
      recipient_contact_id: recipientContactId,
      approval_contact_id: approvalContactId,
      onsite_contact_id: onsiteContactId,
      billing_contact_id: billingContactId,
      purchase_order_reference: purchaseOrderReference,
      payment_terms: paymentTerms,
      service_location_id: serviceLocationId,
      estimate_schedule_event_id: estimateScheduleEventId,
      status: existingQuote.status,
      subtotal_cents: subtotalCents,
      tax_cents: 0,
      total_cents: subtotalCents,
      customer_message: customerMessage,
      debris_handling: debrisHandling,
      debris_handling_notes: debrisHandlingNotes,
      expires_at: expiresAt,
      pricing_reviewed_at: existingQuote.recurring_occurrence_id ? new Date().toISOString() : undefined,
      pricing_reviewed_by_user_id: existingQuote.recurring_occurrence_id ? user.id : undefined,
    })
    .eq("id", quoteId);

  if (quoteError) {
    return { status: "error", message: safeStaffMessage(quoteError.message) };
  }

  const lineItemError = await syncQuoteLineItems(supabase, quoteId, lineItems);
  if (lineItemError) {
    return { status: "error", message: `Quote details saved, but line items could not be fully updated: ${lineItemError}` };
  }

  if (existingQuote.recurring_occurrence_id) {
    await supabase.from("recurring_service_occurrences").update({ pricing_review_status: "reviewed" }).eq("id", existingQuote.recurring_occurrence_id);
  }

  if (ownerChanged) {
    await recordActivity(supabase, {
      actorUserId: user.id,
      eventType: "quote_contracting_party_changed",
      metadata: {
        previous_customer_id: existingQuote.customer_id,
        previous_organization_id: existingQuote.organization_id,
        customer_id: party.customerId,
        organization_id: party.organizationId,
      },
      subjectId: quoteId,
      subjectType: "quote",
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath(`/admin/quotes/${quoteId}/edit`);
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);

  if (submitIntent === "save_close") {
    redirect(`/admin/quotes/${quoteId}`);
  }

  return {
    status: "success",
    message: "Changes saved. The current quote status and existing customer link remain active.",
  };
}

function getQuoteLineItems(formData: FormData): QuoteLineItemInput[] {
  const ids = formData.getAll("line_item_id");
  const names = formData.getAll("line_item_name");
  const descriptions = formData.getAll("line_item_description");
  const serviceCategoryIds = formData.getAll("line_item_service_category_id");
  const materialIds = formData.getAll("line_item_material_id");
  const quantities = formData.getAll("line_item_quantity");
  const unitPrices = formData.getAll("line_item_unit_price");
  const itemCount = Math.max(names.length, descriptions.length, quantities.length, unitPrices.length);
  const items: QuoteLineItemInput[] = [];

  for (let index = 0; index < itemCount; index += 1) {
    const name = String(names[index] ?? "").trim();
    const description = normalizeMultilineText(descriptions[index]);
    const hasContent = Boolean(name || description?.trim());
    const quantity = Math.max(0, Number.parseFloat(String(quantities[index] ?? "1")) || 1);
    const unitPriceCents = toCents(unitPrices[index] ?? null);
    const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

    if (!hasContent && totalCents === 0) {
      continue;
    }

    items.push({
      id: String(ids[index] ?? "").trim() || null,
      name: getLineItemName(name, description, index),
      description,
      serviceCategoryId: String(serviceCategoryIds[index] ?? "").trim() || null,
      materialId: String(materialIds[index] ?? "").trim() || null,
      quantity,
      unitPriceCents,
      totalCents,
      sortOrder: items.length,
    });
  }

  return items;
}

async function validateOrganizationContacts(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  party: NonNullable<ReturnType<typeof parseContractingParty>>,
  requiredContactIds: Array<string | null>,
  optionalContactIds: Array<string | null>,
) {
  const ids = [...requiredContactIds, ...optionalContactIds].filter((id): id is string => Boolean(id));
  if (party.kind === "customer") {
    return ids.length ? "Organization contacts cannot be attached to an individual customer quote." : null;
  }
  if (requiredContactIds.some((id) => !id)) {
    return "Choose both a quote recipient and an approval contact for organization quotes.";
  }
  const { data, error } = await supabase
    .from("organization_contacts")
    .select("id, organization_id, is_active")
    .in("id", ids);
  if (error) return error.message;
  if ((data ?? []).length !== new Set(ids).size || (data ?? []).some((contact) => contact.organization_id !== party.organizationId || !contact.is_active)) {
    return "Choose active contacts belonging to the selected organization.";
  }
  return null;
}

async function syncQuoteLineItems(
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  quoteId: string,
  lineItems: QuoteLineItemInput[],
) {
  const { data: existingItems, error: existingItemsError } = await supabase
    .from("quote_line_items")
    .select("id")
    .eq("quote_id", quoteId);

  if (existingItemsError) {
    return existingItemsError.message;
  }

  const existingIds = new Set((existingItems ?? []).map((item) => item.id));
  const retainedIds = new Set<string>();
  const newItems: Array<{
    quote_id: string;
    name: string;
    description: string | null;
    service_category_id: string | null;
    material_id: string | null;
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
      material_id: item.materialId,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      total_cents: item.totalCents,
      sort_order: item.sortOrder,
    };

    if (item.id && existingIds.has(item.id)) {
      const { error } = await supabase
        .from("quote_line_items")
        .update(values)
        .eq("id", item.id)
        .eq("quote_id", quoteId);

      if (error) {
        return error.message;
      }
      retainedIds.add(item.id);
    } else {
      newItems.push({ quote_id: quoteId, ...values });
    }
  }

  if (newItems.length > 0) {
    const { error } = await supabase.from("quote_line_items").insert(newItems);
    if (error) {
      return error.message;
    }
  }

  const removedIds = [...existingIds].filter((id) => !retainedIds.has(id));
  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("quote_line_items")
      .delete()
      .eq("quote_id", quoteId)
      .in("id", removedIds);

    if (error) {
      return error.message;
    }
  }

  return null;
}

function normalizeMultilineText(value: FormDataEntryValue | undefined) {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trimEnd();
  return text.trim() ? text : null;
}

function getLineItemName(name: string, description: string | null, index: number) {
  if (name) {
    return name.slice(0, 120);
  }

  const firstDescriptionLine = description?.split("\n").find((line) => line.trim())?.trim();
  return (firstDescriptionLine || `Line item ${index + 1}`).slice(0, 120);
}

function getEndOfDayIso(value: FormDataEntryValue | null) {
  const date = String(value ?? "").trim();
  return date ? new Date(`${date}T23:59:59.999Z`).toISOString() : null;
}
