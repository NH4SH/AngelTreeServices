"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withReturnTo } from "@/lib/drafts/return-context";
import { parseBusinessDateTime } from "@/lib/business-time";
import { getCurrentUserRolesFromClient, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { archiveWebsiteLead } from "@/lib/leads/archive";
import { isMatchingQuoteLeadSource } from "@/lib/quotes/lead-prefill";
import { safeStaffMessage } from "@/lib/security/errors";
import { quoteSaveResult, type QuoteEditConflict } from "@/lib/quotes/edit-result";
import { saveQuoteEdit } from "@/lib/quotes/save-confirmation";
import type { QuoteStatus } from "@/lib/types/database";

export type QuoteActionState = {
  status: "idle" | "success" | "error";
  message: string;
  navigateTo?: string;
  savedRevision?: number;
  savedLineIds?: Record<string, string>;
  conflict?: QuoteEditConflict;
};

function toCents(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})?$/.test(text)) throw new Error("Invalid money");
  return text ? Math.round(Number(text) * 100) : 0;
}

type QuoteLineItemInput = {
  id: string | null;
  clientId: string;
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
  const sourceLeadJobId = String(formData.get("source_lead_job_id") ?? "").trim() || null;
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
  let lineItems: QuoteLineItemInput[];
  try { lineItems = getQuoteLineItems(formData); } catch { return { status: "error", message: "Check each line quantity and price. Use positive quantities with up to two decimal places and prices in dollars and cents." }; }

  let sourceActorType: "owner" | "admin" | "staff" = "staff";
  if (sourceLeadJobId) {
    if (!isUuid(sourceLeadJobId)) {
      return { status: "error", message: "The originating website lead is invalid. Return to Leads and Communications and try again." };
    }
    const roles = await getCurrentUserRolesFromClient(supabase, user.id);
    if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
      return { status: "error", message: "Only authorized office staff can create a quote from a website lead." };
    }
    sourceActorType = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "staff";
  }

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
      .select("id, customer_id, organization_id, service_location_id, website_submission_id")
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

    if (sourceLeadJobId && !isMatchingQuoteLeadSource(job, {
      customerId: party.customerId,
      jobId,
      organizationId: party.organizationId,
      serviceLocationId,
      sourceLeadJobId,
    })) {
      return { status: "error", message: "The originating website lead no longer matches this quote. Return to Leads and Communications and try again." };
    }
  } else if (sourceLeadJobId) {
    return { status: "error", message: "Keep the originating website lead linked before creating this quote." };
  }

  const { data: quote, error: quoteError } = await supabase.rpc("create_quote_draft", {
    p_header: { job_id: jobId, customer_id: party.customerId, organization_id: party.organizationId, service_location_id: serviceLocationId,
      estimate_schedule_event_id: estimateScheduleEventId, source_lead_job_id: sourceLeadJobId, recipient_contact_id: recipientContactId, approval_contact_id: approvalContactId,
      onsite_contact_id: onsiteContactId, billing_contact_id: billingContactId, purchase_order_reference: purchaseOrderReference,
      payment_terms: paymentTerms, customer_message: customerMessage, debris_handling: debrisHandling, debris_handling_notes: debrisHandlingNotes, expires_at: expiresAt },
    p_lines: lineItems.map(quoteLineCommand),
  });
  if (quoteError || !quoteSaveResult(quote, lineItems.length)) return { status: "error", message: safeStaffMessage(quoteError?.message ?? "The saved quote could not be confirmed. Review the quote directory before starting another draft.") };

  const leadArchiveResult = sourceLeadJobId
    ? await archiveWebsiteLead(supabase, {
        actorType: sourceActorType,
        actorUserId: user.id,
        eventType: "website_lead_archived_after_quote",
        idempotencyKey: `website-lead:${sourceLeadJobId}:quote:${quote.id}:archive`,
        jobId: sourceLeadJobId,
        metadata: { quote_id: quote.id },
        reason: "Lead completed by quote creation.",
        summary: "Website lead archived automatically after its quote was created.",
      })
    : null;
  const leadArchiveWarning = leadArchiveResult?.status === "error";
  if (leadArchiveWarning) {
    console.error("Website lead could not be archived after quote creation", {
      jobId: sourceLeadJobId,
      quoteId: quote.id,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/communications");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/reports");
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);
  const warningQuery = leadArchiveWarning ? "lead_archive_warning=1" : "";
  const destination = withReturnTo(submitIntent === "save_close"
    ? `/admin/quotes/${quote.id}${warningQuery ? `?${warningQuery}` : ""}`
    : `/admin/quotes/${quote.id}/edit?saved=1${warningQuery ? `&${warningQuery}` : ""}`, formData.get("returnTo"));
  if (formData.get("client_navigation") === "1") return { status: "success", message: "Quote saved.", navigateTo: destination };
  redirect(destination);
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
  const sourceLeadJobId = String(formData.get("source_lead_job_id") ?? "").trim() || null;
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
  let lineItems: QuoteLineItemInput[];
  try { lineItems = getQuoteLineItems(formData); } catch { return { status: "error", message: "Check each line quantity and price. Use positive quantities with up to two decimal places and prices in dollars and cents." }; }

  let sourceActorType: "owner" | "admin" | "staff" = "staff";
  if (sourceLeadJobId) {
    if (!isUuid(sourceLeadJobId)) {
      return { status: "error", message: "The originating website lead is invalid. Return to Leads and Communications and try again." };
    }
    const roles = await getCurrentUserRolesFromClient(supabase, user.id);
    if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) {
      return { status: "error", message: "Only authorized office staff can complete a quote from a website lead." };
    }
    sourceActorType = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "staff";
  }

  if (!quoteId || !party) {
    return { status: "error", message: "Quote and contracting party are required." };
  }

  const { data: existingQuote, error: quoteLookupError } = await supabase
    .from("quotes")
    .select("id, customer_id, organization_id, job_id, status, recurring_occurrence_id, total_cents, service_location_id, customer_message, expires_at")
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
      .select("id, customer_id, organization_id, service_location_id, website_submission_id")
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

    if (sourceLeadJobId && (existingQuote.job_id !== sourceLeadJobId || !isMatchingQuoteLeadSource(job, {
      customerId: party.customerId,
      jobId,
      organizationId: party.organizationId,
      serviceLocationId,
      sourceLeadJobId,
    }))) {
      return { status: "error", message: "The originating website lead no longer matches this quote. Return to Leads and Communications and try again." };
    }
  } else if (sourceLeadJobId) {
    return { status: "error", message: "Keep the originating website lead linked before saving this quote." };
  }

  const expectedRevision = Number(formData.get("expected_revision"));
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return { status: "error", message: "Reload the saved quote before editing so its version can be checked." };
  const confirmation = await saveQuoteEdit({ supabase, clientIds: lineItems.map(line => line.clientId), args: {
    p_quote_id: quoteId, p_expected_revision: expectedRevision, p_confirm_party_change: formData.get("confirm_contracting_party_change") === "on",
    p_header: { job_id: jobId, customer_id: party.customerId, organization_id: party.organizationId, service_location_id: serviceLocationId,
      estimate_schedule_event_id: estimateScheduleEventId, recipient_contact_id: recipientContactId, approval_contact_id: approvalContactId,
      onsite_contact_id: onsiteContactId, billing_contact_id: billingContactId, purchase_order_reference: purchaseOrderReference,
      payment_terms: paymentTerms, customer_message: customerMessage, debris_handling: debrisHandling, debris_handling_notes: debrisHandlingNotes, expires_at: expiresAt },
    p_lines: lineItems.map(quoteLineCommand),
  } });
  if (!confirmation.ok) return { status: "error", message: confirmation.message, conflict: confirmation.conflict };
  const { saved } = confirmation;

  const leadArchiveResult = sourceLeadJobId
    ? await archiveWebsiteLead(supabase, {
        actorType: sourceActorType,
        actorUserId: user.id,
        eventType: "website_lead_archived_after_quote",
        idempotencyKey: `website-lead:${sourceLeadJobId}:quote:${quoteId}:archive`,
        jobId: sourceLeadJobId,
        metadata: { quote_id: quoteId },
        reason: "Lead completed by quote creation.",
        summary: "Website lead archived automatically after its quote was created.",
      })
    : null;
  const leadArchiveWarning = leadArchiveResult?.status === "error";
  if (leadArchiveWarning) {
    console.error("Website lead could not be archived after quote recovery", {
      jobId: sourceLeadJobId,
      quoteId,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/communications");
  revalidatePath("/admin/quotes");
  revalidatePath("/admin/reports");
  revalidatePath(`/admin/quotes/${quoteId}`);
  revalidatePath(`/admin/quotes/${quoteId}/edit`);
  if (party.customerId) revalidatePath(`/admin/customers/${party.customerId}`);
  if (party.organizationId) revalidatePath(`/admin/organizations/${party.organizationId}`);

  if (submitIntent === "save_close") {
    const destination = withReturnTo(`/admin/quotes/${quoteId}${leadArchiveWarning ? "?lead_archive_warning=1" : ""}`, formData.get("returnTo"));
    if (formData.get("client_navigation") === "1") return { status: "success", message: "Quote saved.", navigateTo: destination };
    redirect(destination);
  }

  return {
    status: "success",
    savedRevision: saved.edit_revision,
    savedLineIds: Object.fromEntries(lineItems.map((line, index) => [line.clientId, saved.line_ids[index]])),
    message: leadArchiveWarning
      ? "Changes saved, but the website lead could not be archived automatically. Archive it manually from Leads and Communications."
      : "Changes saved. The current quote status and existing customer link remain active.",
  };
}

function getQuoteLineItems(formData: FormData): QuoteLineItemInput[] {
  const ids = formData.getAll("line_item_id");
  const clientIds = formData.getAll("line_item_client_id");
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
    const quantityText = String(quantities[index] ?? "1").trim();
    if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(quantityText) || Number(quantityText) <= 0) throw new Error("Invalid quantity");
    const quantity = Number(quantityText);
    const unitPriceCents = toCents(unitPrices[index] ?? null);
    const totalCents = Math.max(0, Math.round(quantity * unitPriceCents));

    if (!hasContent && totalCents === 0) {
      continue;
    }

    items.push({
      id: String(ids[index] ?? "").trim() || null,
      clientId: String(clientIds[index] ?? index),
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
  return date ? parseBusinessDateTime(`${date}T23:59:59`)?.toISOString() ?? null : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function quoteLineCommand(item: QuoteLineItemInput) {
  return { id: item.id, name: item.name, description: item.description, service_category_id: item.serviceCategoryId,
    material_id: item.materialId, quantity: item.quantity, unit_price_cents: item.unitPriceCents, total_cents: item.totalCents };
}
