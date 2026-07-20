"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getChangeOrderByPortalToken, getChangeOrderDetail } from "@/lib/data/change-orders";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  createNewChangeOrderPortalTokenRecord,
  createOrGetChangeOrderPortalTokenRecord,
} from "@/lib/portal/change-order-links";
import { getPortalUrl } from "@/lib/portal/urls";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import type { ChangeOrderActionState } from "@/lib/action-states/change-orders";

export async function createChangeOrder(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const jobId = text(formData, "job_id", 80);
  const title = text(formData, "title", 180);
  const lineItems = parseLineItems(formData);
  if (!jobId || !title || lineItems.length === 0) {
    return failure("Choose a work order, add a title, and include at least one priced line item.");
  }

  const { data: job, error: jobError } = await auth.supabase.from("jobs")
    .select("id, customer_id, organization_id, service_location_id, source_quote_id")
    .eq("id", jobId).single();
  if (jobError || !job) return failure(jobError?.message ?? "Work order not found or no access.");

  const sourceQuoteId = text(formData, "source_quote_id", 80) || job.source_quote_id || null;
  let originalApprovedAmountCents = 0;
  if (sourceQuoteId) {
    const { data: quote, error } = await auth.supabase.from("quotes").select("id, job_id, total_cents, status").eq("id", sourceQuoteId).single();
    if (error || !quote) return failure(error?.message ?? "Source quote not found.");
    if (quote.job_id && quote.job_id !== jobId) return failure("The selected quote belongs to a different work order.");
    originalApprovedAmountCents = quote.total_cents;
  }

  const approvalContactId = text(formData, "approval_contact_id", 80) || null;
  const requestedByContactId = text(formData, "requested_by_contact_id", 80) || null;
  const contactError = await validateContacts(auth.supabase, job.organization_id, [approvalContactId, requestedByContactId]);
  if (contactError) return failure(contactError);

  const subtotalCents = lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
  const taxCents = cents(formData.get("tax"));
  const feeCents = cents(formData.get("fees"));
  const sourceCloseoutId = text(formData, "source_closeout_id", 80) || null;
  const closeoutNotes = sourceCloseoutId ? await getCloseoutSupportingNotes(auth.supabase, sourceCloseoutId, jobId) : null;
  if (closeoutNotes?.error) return failure(closeoutNotes.error);

  const { data: changeOrder, error } = await auth.supabase.from("change_orders").insert({
    change_order_number: "",
    source_quote_id: sourceQuoteId,
    job_id: jobId,
    source_closeout_id: sourceCloseoutId,
    customer_id: job.customer_id,
    organization_id: job.organization_id,
    service_location_id: job.service_location_id,
    requested_by_contact_id: requestedByContactId,
    approval_contact_id: approvalContactId,
    created_by_user_id: auth.userId,
    title,
    reason: optional(formData, "reason", 1000),
    customer_description: optionalMultiline(formData, "customer_description", 5000),
    customer_notes: optionalMultiline(formData, "customer_notes", 3000),
    internal_notes: combineNotes(optionalMultiline(formData, "internal_notes", 5000), closeoutNotes?.notes ?? null),
    status: formData.get("submit_intent") === "review" ? "pending_internal_review" : "draft",
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    fee_cents: feeCents,
    total_cents: subtotalCents + taxCents + feeCents,
    original_approved_amount_cents: originalApprovedAmountCents,
    expires_at: dateAtEndOfDay(formData.get("expires_on")),
    schedule_impact: parseScheduleImpact(formData),
  }).select("id").single();
  if (error || !changeOrder) return failure(error?.message ?? "Could not create the change order.");

  const { error: linesError } = await auth.supabase.from("change_order_line_items").insert(
    lineItems.map(({ id: _id, ...item }) => ({ ...item, change_order_id: changeOrder.id })),
  );
  if (linesError) {
    await auth.supabase.from("change_orders").delete().eq("id", changeOrder.id);
    return failure(`Change order was not created because line items failed: ${linesError.message}`);
  }

  if (sourceCloseoutId) await auth.supabase.from("job_closeouts").update({ change_order_id: changeOrder.id }).eq("id", sourceCloseoutId).is("change_order_id", null);
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "change_order_created", subjectId: changeOrder.id, subjectType: "change_order", metadata: { job_id: jobId } });
  revalidateChangeOrderPaths(changeOrder.id, jobId, job.organization_id);
  if (formData.get("return_to_job") === "1") redirect(`/admin/jobs/${jobId}?change_added=1#job-scope`);
  redirect(`/admin/change-orders/${changeOrder.id}`);
}

export async function updateChangeOrder(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const changeOrderId = text(formData, "change_order_id", 80);
  const title = text(formData, "title", 180);
  const lineItems = parseLineItems(formData);
  if (!changeOrderId || !title || lineItems.length === 0) return failure("Add a title and at least one priced line item.");

  const { data: current, error: lookupError } = await auth.supabase.from("change_orders")
    .select("id, job_id, organization_id, status").eq("id", changeOrderId).single();
  if (lookupError || !current) return failure(lookupError?.message ?? "Change order not found.");
  if (!["draft", "pending_internal_review", "ready_to_send", "sent", "change_requested"].includes(current.status)) {
    return failure("Approved, declined, cancelled, and expired change orders are locked from normal editing.");
  }

  const approvalContactId = text(formData, "approval_contact_id", 80) || null;
  const requestedByContactId = text(formData, "requested_by_contact_id", 80) || null;
  const contactError = await validateContacts(auth.supabase, current.organization_id, [approvalContactId, requestedByContactId]);
  if (contactError) return failure(contactError);
  const subtotalCents = lineItems.reduce((sum, item) => sum + item.amount_cents, 0);
  const taxCents = cents(formData.get("tax"));
  const feeCents = cents(formData.get("fees"));

  const { error } = await auth.supabase.from("change_orders").update({
    title,
    reason: optional(formData, "reason", 1000),
    customer_description: optionalMultiline(formData, "customer_description", 5000),
    customer_notes: optionalMultiline(formData, "customer_notes", 3000),
    internal_notes: optionalMultiline(formData, "internal_notes", 5000),
    requested_by_contact_id: requestedByContactId,
    approval_contact_id: approvalContactId,
    subtotal_cents: subtotalCents,
    tax_cents: taxCents,
    fee_cents: feeCents,
    total_cents: subtotalCents + taxCents + feeCents,
    expires_at: dateAtEndOfDay(formData.get("expires_on")),
    schedule_impact: parseScheduleImpact(formData),
  }).eq("id", changeOrderId);
  if (error) return failure(error.message);

  const lineError = await syncLines(auth.supabase, changeOrderId, lineItems);
  if (lineError) return failure(`Change order details saved, but line items could not be fully updated: ${lineError}`);
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "change_order_edited", subjectId: changeOrderId, subjectType: "change_order" });
  revalidateChangeOrderPaths(changeOrderId, current.job_id, current.organization_id);
  if (formData.get("submit_intent") === "save_close") redirect(`/admin/change-orders/${changeOrderId}?updated=1`);
  return success("Changes saved. Existing customer link remains active.");
}

export async function updateChangeOrderWorkflow(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const intent = text(formData, "workflow_intent", 40);
  const { data: current, error } = await auth.supabase.from("change_orders").select("id, job_id, organization_id, status").eq("id", id).single();
  if (error || !current) return failure(error?.message ?? "Change order not found.");

  const transitions: Record<string, { allowed: string[]; values: Record<string, unknown>; event: string; message: string }> = {
    request_review: { allowed: ["draft", "change_requested"], values: { status: "pending_internal_review" }, event: "change_order_review_requested", message: "Change order sent for internal review." },
    approve_internal: { allowed: ["draft", "pending_internal_review", "change_requested"], values: { status: "ready_to_send", internally_reviewed_at: new Date().toISOString(), internally_reviewed_by_user_id: auth.userId }, event: "change_order_internally_approved", message: "Change order is ready to send." },
    return_clarification: { allowed: ["pending_internal_review", "ready_to_send"], values: { status: "draft", internally_reviewed_at: null, internally_reviewed_by_user_id: null }, event: "change_order_returned_for_clarification", message: "Change order returned to draft for clarification." },
    cancel: { allowed: ["draft", "pending_internal_review", "ready_to_send", "sent", "change_requested"], values: { status: "cancelled", cancelled_at: new Date().toISOString() }, event: "change_order_cancelled", message: "Change order cancelled." },
  };
  const transition = transitions[intent];
  if (!transition || !transition.allowed.includes(current.status)) return failure("That workflow action is not available for this change order.");
  const { data: updated, error: updateError } = await auth.supabase.from("change_orders").update(transition.values)
    .eq("id", id).eq("status", current.status).select("id").maybeSingle();
  if (updateError || !updated) return failure(updateError?.message ?? "The change order changed in another session. Refresh and try again.");
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: transition.event, subjectId: id, subjectType: "change_order" });
  revalidateChangeOrderPaths(id, current.job_id, current.organization_id);
  return success(transition.message);
}

export async function sendChangeOrderEmail(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const detail = await getChangeOrderDetail(id);
  const order = detail.data;
  if (detail.error || !order) return failure(detail.error ?? "Change order not found.");
  if (!["ready_to_send", "sent"].includes(order.status)) return failure("Approve the change order internally before sending it.");
  const recipient = order.approval_contact?.email ?? order.customers?.email ?? order.organizations?.billing_email;
  if (!recipient) return failure("Add an email for the selected approval contact before sending.");

  const token = await createOrGetChangeOrderPortalTokenRecord({ changeOrderId: id, supabase: auth.supabase });
  if (token.error) return failure(token.error);
  const portalUrl = await getPortalUrl("change-order", token.rawToken);
  const result = await sendTransactionalEmail({
    to: recipient,
    subject: `${order.change_order_number}: ${order.title}`,
    text: changeOrderEmailText(order, portalUrl),
    emailType: "change_order",
    relatedChangeOrderId: id,
    relatedCustomerId: order.customer_id,
    relatedJobId: order.job_id,
    relatedQuoteId: order.source_quote_id,
    relatedOrganizationId: order.organization_id,
    sentByUserId: auth.userId,
    supabase: auth.supabase,
    idempotencyKey: `change-order:${id}:${order.updated_at}:${recipient}`,
  });
  if (!result.ok) return failure(result.message);

  const sentAt = new Date().toISOString();
  const { error } = await auth.supabase.from("change_orders").update({ status: "sent", sent_at: sentAt }).eq("id", id);
  if (error) return failure(`Email sent, but status update failed: ${error.message}`);
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "change_order_sent", subjectId: id, subjectType: "change_order", metadata: { delivery_method: "crm_email" } });
  revalidateChangeOrderPaths(id, order.job_id, order.organization_id);
  return { status: "success", message: token.created ? "Change order sent with a secure approval link." : "Change order resent using the existing secure link.", portalUrl };
}

export async function manuallyApproveChangeOrder(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const approverName = text(formData, "approver_name", 160);
  const method = text(formData, "approval_method", 30);
  const contactId = text(formData, "approved_by_contact_id", 80) || null;
  const approvalNotes = optionalMultiline(formData, "approval_notes", 2000);
  if (!approverName || !approvalNotes || !["phone", "email", "in_person", "signed_paper", "other"].includes(method)) return failure("Approver name, authorization method, and documentation notes are required.");
  const { data, error } = await auth.supabase.rpc("approve_change_order", {
    p_change_order_id: id,
    p_approved_by_contact_id: contactId,
    p_approved_by_name: approverName,
    p_approval_method: method,
    p_approval_notes: approvalNotes,
    p_recorded_by_user_id: auth.userId,
  }).single();
  if (error || !data) return failure(error?.message ?? "Could not record approval.");
  const result = data as { job_id: string; newly_approved: boolean };
  revalidateChangeOrderPaths(id, result.job_id, null);
  return success(result.newly_approved ? "Manual approval recorded and additional scope added to the work order." : "Approval was already recorded; no scope was duplicated.");
}

export async function createChangeOrderPortalLink(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const token = await createOrGetChangeOrderPortalTokenRecord({ changeOrderId: id, supabase: auth.supabase });
  if (token.error) return failure(token.error);
  const portalUrl = await getPortalUrl("change-order", token.rawToken);
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: token.created ? "change_order_portal_link_created" : "change_order_portal_link_reused", subjectId: id, subjectType: "change_order" });
  revalidatePath(`/admin/change-orders/${id}`);
  return { status: "success", message: token.created ? "Secure customer link generated." : "Existing active customer link reused.", portalUrl };
}

export async function regenerateChangeOrderPortalLink(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const { data: order, error } = await auth.supabase.from("change_orders").select("customer_id, organization_id, approval_contact_id").eq("id", id).single();
  if (error || !order) return failure(error?.message ?? "Change order not found.");
  const token = await createNewChangeOrderPortalTokenRecord({ changeOrderId: id, customerId: order.customer_id, organizationId: order.organization_id, intendedContactId: order.approval_contact_id, supabase: auth.supabase, userId: auth.userId });
  if (token.error) return failure(token.error);
  const revokedAt = new Date().toISOString();
  const { error: revokeError } = await auth.supabase.from("change_order_portal_tokens").update({ revoked_at: revokedAt })
    .eq("change_order_id", id).is("revoked_at", null).neq("id", token.tokenId);
  if (revokeError) {
    await auth.supabase.from("change_order_portal_tokens").update({ revoked_at: revokedAt }).eq("id", token.tokenId);
    return failure("Could not safely replace the previous link. The newly created link was disabled.");
  }
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "change_order_portal_link_regenerated", subjectId: id, subjectType: "change_order" });
  revalidatePath(`/admin/change-orders/${id}`);
  return { status: "success", message: "Secure customer link regenerated. The previous link is disabled.", portalUrl: await getPortalUrl("change-order", token.rawToken) };
}

export async function revokeChangeOrderPortalLink(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const { error } = await auth.supabase.from("change_order_portal_tokens").update({ revoked_at: new Date().toISOString() })
    .eq("change_order_id", id).is("revoked_at", null);
  if (error) return failure(error.message);
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "change_order_portal_link_revoked", subjectId: id, subjectType: "change_order" });
  revalidatePath(`/admin/change-orders/${id}`);
  return success("Secure customer link revoked.");
}

export async function duplicateChangeOrder(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const id = text(formData, "change_order_id", 80);
  const detail = await getChangeOrderDetail(id);
  if (detail.error || !detail.data) return failure(detail.error ?? "Change order not found.");
  const source = detail.data;
  const { data, error } = await auth.supabase.from("change_orders").insert({
    change_order_number: "",
    source_quote_id: source.source_quote_id,
    job_id: source.job_id,
    customer_id: source.customer_id,
    organization_id: source.organization_id,
    service_location_id: source.service_location_id,
    requested_by_contact_id: source.requested_by_contact?.is_active === false ? null : source.requested_by_contact_id,
    approval_contact_id: source.approval_contact?.is_active === false ? null : source.approval_contact_id,
    created_by_user_id: auth.userId,
    title: `Copy of ${source.title}`.slice(0, 180),
    reason: source.reason,
    customer_description: source.customer_description,
    customer_notes: source.customer_notes,
    internal_notes: source.internal_notes,
    status: "draft",
    subtotal_cents: source.subtotal_cents,
    tax_cents: source.tax_cents,
    fee_cents: source.fee_cents,
    total_cents: source.total_cents,
    original_approved_amount_cents: source.original_approved_amount_cents,
    schedule_impact: source.schedule_impact,
  }).select("id").single();
  if (error || !data) return failure(error?.message ?? "Could not duplicate the change order.");
  const lines = (source.change_order_line_items ?? []).map(({ id: _id, change_order_id: _co, created_at: _created, updated_at: _updated, ...line }) => ({ ...line, change_order_id: data.id }));
  const { error: linesError } = lines.length ? await auth.supabase.from("change_order_line_items").insert(lines) : { error: null };
  if (linesError) { await auth.supabase.from("change_orders").delete().eq("id", data.id); return failure(linesError.message); }
  await recordActivity(auth.supabase, { actorUserId: auth.userId, eventType: "change_order_duplicated", subjectId: data.id, subjectType: "change_order", metadata: { source_change_order_id: id } });
  redirect(`/admin/change-orders/${data.id}/edit`);
}

export async function approveChangeOrderByPortal(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const rawToken = text(formData, "token", 300);
  const approverName = text(formData, "approver_name", 160);
  const lookup = await getChangeOrderByPortalToken(rawToken);
  const supabase = getServiceRoleClient();
  if (!supabase || lookup.status !== "ready" || !lookup.changeOrder || !lookup.tokenId) return failure(lookup.message || "This change order link is unavailable.");
  if (!approverName) return failure("Enter the name of the person authorizing this additional work.");
  if (!["sent", "change_requested", "approved"].includes(lookup.changeOrder.status)) return failure("This change order is not open for approval.");
  const { data, error } = await supabase.rpc("approve_change_order", {
    p_change_order_id: lookup.changeOrder.id,
    p_approved_by_contact_id: lookup.changeOrder.approval_contact_id,
    p_approved_by_name: approverName,
    p_approval_method: "portal",
    p_approval_notes: null,
    p_recorded_by_user_id: null,
  }).single();
  if (error || !data) return failure(error?.message ?? "Could not approve the change order.");
  await supabase.from("change_order_portal_tokens").update({ used_at: new Date().toISOString() }).eq("id", lookup.tokenId);
  await notifyOfficeOfChangeOrderResponse({
    changeOrder: lookup.changeOrder,
    response: `Approved by ${approverName}`,
    supabase,
  });
  revalidatePath(`/portal/change-order/${rawToken}`);
  revalidateChangeOrderPaths(lookup.changeOrder.id, lookup.changeOrder.job_id, lookup.changeOrder.organization_id);
  const result = data as { newly_approved: boolean };
  return success(result.newly_approved ? "Additional work approved. Angel Tree Services will confirm any schedule impact." : "This additional work was already approved. No scope was duplicated.");
}

export async function respondToChangeOrderByPortal(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const rawToken = text(formData, "token", 300);
  const intent = text(formData, "response_intent", 30);
  const message = text(formData, "message", 1000);
  const lookup = await getChangeOrderByPortalToken(rawToken);
  const supabase = getServiceRoleClient();
  if (!supabase || lookup.status !== "ready" || !lookup.changeOrder || !lookup.tokenId) return failure(lookup.message || "This change order link is unavailable.");
  if (!["sent", "change_requested"].includes(lookup.changeOrder.status)) return failure("This change order is no longer open for a response.");
  if (intent === "request_changes" && message.length < 3) return failure("Please include a short note about the requested change.");
  if (!['request_changes', 'decline'].includes(intent)) return failure("Choose a valid response.");
  const eventAt = new Date().toISOString();
  const status = intent === "decline" ? "declined" : "change_requested";
  const { error } = await supabase.from("change_orders").update({ status, declined_at: intent === "decline" ? eventAt : null }).eq("id", lookup.changeOrder.id);
  if (error) return failure(error.message);
  if (message) await supabase.from("notes").insert({ customer_id: lookup.changeOrder.customer_id, service_location_id: lookup.changeOrder.service_location_id, job_id: lookup.changeOrder.job_id, visibility: "internal", body: `Change order customer response: ${message}` });
  await supabase.from("activity_log").insert({ subject_type: "change_order", subject_id: lookup.changeOrder.id, event_type: intent === "decline" ? "change_order_declined" : "change_order_changes_requested", metadata_json: { source: "customer_portal" } });
  await supabase.from("change_order_portal_tokens").update({ used_at: eventAt }).eq("id", lookup.tokenId);
  await notifyOfficeOfChangeOrderResponse({
    changeOrder: lookup.changeOrder,
    response: intent === "decline" ? "Declined by customer" : "Customer requested changes",
    message,
    supabase,
  });
  revalidatePath(`/portal/change-order/${rawToken}`);
  revalidateChangeOrderPaths(lookup.changeOrder.id, lookup.changeOrder.job_id, lookup.changeOrder.organization_id);
  return success(intent === "decline" ? "The additional work was declined. Angel Tree Services will follow up if needed." : "Your requested changes were sent to Angel Tree Services.");
}

export async function attachApprovedChangeOrdersToInvoice(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  const invoiceId = text(formData, "invoice_id", 80);
  const { data, error } = await auth.supabase.rpc("attach_approved_change_orders_to_invoice", { p_invoice_id: invoiceId }).single();
  if (error || !data) return failure(error?.message ?? "Could not add approved change orders to the invoice.");
  revalidatePath(`/admin/invoices/${invoiceId}`);
  const result = data as { added_line_count: number };
  return success(result.added_line_count ? `${result.added_line_count} approved change-order line item${result.added_line_count === 1 ? "" : "s"} added.` : "No uninvoiced approved change-order items were found.");
}

async function requireStaff() {
  const supabase = await createClient();
  if (!supabase) return { error: failure("Supabase is not configured.") };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: failure("Sign in before managing change orders.") };
  const roles = await getUserRoles(supabase, user.id);
  if (!hasAllowedRole(roles, platformRoleGroups.internalStaff)) return { error: failure("Only authorized office staff can manage change orders.") };
  return { supabase, userId: user.id, error: null };
}

async function notifyOfficeOfChangeOrderResponse({
  changeOrder,
  response,
  message,
  supabase,
}: {
  changeOrder: NonNullable<Awaited<ReturnType<typeof getChangeOrderByPortalToken>>["changeOrder"]>;
  response: string;
  message?: string;
  supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>;
}) {
  const officeEmail = process.env.INTERNAL_LEAD_NOTIFICATION_EMAIL?.trim();
  if (!officeEmail) return;

  await sendTransactionalEmail({
    to: officeEmail,
    subject: `${changeOrder.change_order_number}: ${response}`,
    text: [
      `${changeOrder.change_order_number}: ${changeOrder.title}`,
      response,
      message ? `Customer message: ${message}` : null,
      "",
      "Review this response in the Angel Tree Services admin platform.",
    ].filter((line): line is string => line !== null).join("\n"),
    emailType: "change_order",
    relatedChangeOrderId: changeOrder.id,
    relatedCustomerId: changeOrder.customer_id,
    relatedJobId: changeOrder.job_id,
    relatedQuoteId: changeOrder.source_quote_id,
    relatedOrganizationId: changeOrder.organization_id,
    sentByUserId: null,
    supabase,
    idempotencyKey: `change-order-response:${changeOrder.id}:${response}:${changeOrder.updated_at}`,
  });
}

type LineInput = { id: string | null; title: string; description: string | null; quantity: number; unit: string | null; unit_price_cents: number; amount_cents: number; service_category_id: string | null; material_id: string | null; internal_cost_estimate_cents: number | null; sort_order: number };

function parseLineItems(formData: FormData): LineInput[] {
  const ids = formData.getAll("line_id");
  const titles = formData.getAll("line_title");
  const descriptions = formData.getAll("line_description");
  const quantities = formData.getAll("line_quantity");
  const units = formData.getAll("line_unit");
  const rates = formData.getAll("line_rate");
  const categories = formData.getAll("line_service_category_id");
  const materials = formData.getAll("line_material_id");
  const costs = formData.getAll("line_internal_cost");
  return titles.map((entry, index) => {
    const title = String(entry).trim();
    const quantity = Math.max(0, Number.parseFloat(String(quantities[index] ?? "1")) || 0);
    const unitPrice = cents(rates[index] ?? null);
    return {
      id: String(ids[index] ?? "").trim() || null,
      title: title.slice(0, 180),
      description: normalizeMultiline(descriptions[index], 5000),
      quantity,
      unit: String(units[index] ?? "").trim().slice(0, 40) || null,
      unit_price_cents: unitPrice,
      amount_cents: Math.max(0, Math.round(quantity * unitPrice)),
      service_category_id: String(categories[index] ?? "").trim() || null,
      material_id: String(materials[index] ?? "").trim() || null,
      internal_cost_estimate_cents: String(costs[index] ?? "").trim() ? cents(costs[index]) : null,
      sort_order: index,
    };
  }).filter((item) => item.title && item.quantity > 0);
}

async function syncLines(supabase: any, changeOrderId: string, lines: LineInput[]) {
  const { data: existing, error } = await supabase.from("change_order_line_items").select("id").eq("change_order_id", changeOrderId);
  if (error) return error.message;
  const existingIds = new Set<string>(((existing ?? []) as { id: string }[]).map((row) => row.id));
  const retained = new Set<string>();
  for (const line of lines) {
    const { id, ...values } = line;
    if (id && existingIds.has(id)) {
      const result = await supabase.from("change_order_line_items").update(values).eq("id", id).eq("change_order_id", changeOrderId);
      if (result.error) return result.error.message;
      retained.add(id);
    } else {
      const result = await supabase.from("change_order_line_items").insert({ ...values, change_order_id: changeOrderId });
      if (result.error) return result.error.message;
    }
  }
  const removed = [...existingIds].filter((id) => !retained.has(id));
  if (removed.length) {
    const result = await supabase.from("change_order_line_items").delete().eq("change_order_id", changeOrderId).in("id", removed);
    if (result.error) return "Approved or invoiced line items cannot be removed. Cancel this edit and create a correcting change order instead.";
  }
  return null;
}

async function validateContacts(supabase: any, organizationId: string | null, contactIds: (string | null)[]) {
  const ids = [...new Set(contactIds.filter(Boolean))] as string[];
  if (!ids.length) return null;
  if (!organizationId) return "Organization contacts can only be selected for an organization-owned work order.";
  const { data, error } = await supabase.from("organization_contacts").select("id, organization_id, is_active").in("id", ids);
  if (error) return error.message;
  if ((data ?? []).length !== ids.length || data?.some((contact: any) => contact.organization_id !== organizationId)) return "One selected contact does not belong to this organization.";
  if (data?.some((contact: any) => !contact.is_active)) return "An inactive organization contact cannot be selected for a new workflow step.";
  return null;
}

async function getCloseoutSupportingNotes(supabase: any, closeoutId: string, jobId: string) {
  const { data, error } = await supabase.from("job_closeouts").select("id, job_id, additional_work_description, crew_internal_notes, incident_description").eq("id", closeoutId).single();
  if (error || !data) return { error: error?.message ?? "Closeout not found.", notes: null };
  if (data.job_id !== jobId) return { error: "The closeout belongs to a different work order.", notes: null };
  return { error: null, notes: [data.additional_work_description && `Crew additional-work request:\n${data.additional_work_description}`, data.crew_internal_notes && `Crew internal notes:\n${data.crew_internal_notes}`, data.incident_description && `Related exception:\n${data.incident_description}`].filter(Boolean).join("\n\n") || null };
}

function changeOrderEmailText(order: NonNullable<Awaited<ReturnType<typeof getChangeOrderDetail>>["data"]>, portalUrl: string) {
  const party = order.organizations?.name ?? order.customers?.display_name ?? "Customer";
  return [`Hello ${order.approval_contact?.full_name ?? party},`, "", `Angel Tree Services prepared ${order.change_order_number} for additional or changed work.`, `Additional amount: ${money(order.total_cents)}`, `Revised combined amount: ${money(order.original_approved_amount_cents + order.total_cents)}`, "", "Review and respond through your secure link:", portalUrl, "", "This email does not alter the original approved quote."].join("\n");
}

function parseScheduleImpact(formData: FormData) {
  const keys = ["scheduled_date", "estimated_duration", "assigned_crew", "equipment", "materials", "permits", "subcontractors"];
  return Object.fromEntries(keys.map((key) => [key, formData.get(`impact_${key}`) === "on"]));
}
function combineNotes(...notes: (string | null)[]) { return notes.filter(Boolean).join("\n\n") || null; }
function cents(value: FormDataEntryValue | null) { const parsed = Number.parseFloat(String(value ?? "0")); return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0; }
function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function normalizeMultiline(value: FormDataEntryValue | null | undefined, max: number) { const normalized = String(value ?? "").replaceAll("\r\n", "\n").trimEnd().slice(0, max); return normalized.trim() ? normalized : null; }
function optionalMultiline(formData: FormData, key: string, max: number) { return normalizeMultiline(formData.get(key), max); }
function dateAtEndOfDay(value: FormDataEntryValue | null) { const date = String(value ?? "").trim(); return date ? new Date(`${date}T23:59:59`).toISOString() : null; }
function money(centsValue: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsValue / 100); }
function failure(message: string): ChangeOrderActionState { return { status: "error", message }; }
function success(message: string): ChangeOrderActionState { return { status: "success", message }; }
function revalidateChangeOrderPaths(id: string, jobId: string | null, organizationId: string | null) { revalidatePath("/admin/change-orders"); revalidatePath(`/admin/change-orders/${id}`); if (jobId) { revalidatePath(`/admin/jobs/${jobId}`); revalidatePath(`/crew/jobs/${jobId}`); } if (organizationId) revalidatePath(`/admin/organizations/${organizationId}`); }
