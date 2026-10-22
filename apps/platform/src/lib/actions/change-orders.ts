"use server";

import { callDeliveryCommand } from "@/lib/email/delivery-commands";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recordActivity } from "@/lib/activity-log";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getChangeOrderByPortalToken, getChangeOrderDetail } from "@/lib/data/change-orders";
import { deliverCustomerSourceEvent } from "@/lib/notifications/source-events";
import { hashPortalToken } from "@/lib/portal/tokens";
import { sendTransactionalEmail } from "@/lib/email/send";
import {
  createNewChangeOrderPortalTokenRecord,
  createOrGetChangeOrderPortalTokenRecord,
} from "@/lib/portal/change-order-links";
import { getPortalUrl } from "@/lib/portal/urls";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import type { ChangeOrderActionState } from "@/lib/action-states/change-orders";
import { checkPortalActionRateLimit } from "@/lib/security/portal-rate-limit";
import { safeStaffMessage } from "@/lib/security/errors";
import type { RpcCommandArgs } from "@/lib/types/rpc-contracts";

export async function createChangeOrder(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  return saveChangeOrderDraft(formData, false);
}

export async function updateChangeOrder(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  return saveChangeOrderDraft(formData, true);
}

async function saveChangeOrderDraft(formData: FormData, editing: boolean): Promise<ChangeOrderActionState> {
  const auth = await requireStaff();
  if (auth.error) return { ...auth.error, saveRejected: true };
  const requestId = text(formData, "request_id", 80), id = editing ? text(formData, "change_order_id", 80) : null;
  const revision = editing ? Number(String(formData.get("expected_revision") ?? "")) : null;
  if (!isUuid(requestId) || (editing && (!isUuid(id) || !/^\d+$/.test(String(formData.get("expected_revision") ?? "")) || !Number.isSafeInteger(revision) || (revision ?? -1) < 0)))
    return { ...failure("Reload this editor before saving. Keep a copy of your unsaved entries."), saveRejected: true };
  const lines = parseLineItems(formData);
  const moneyFields = ["tax", "fees", ...formData.getAll("line_rate").map((_, i) => `line_rate:${i}`)];
  const validMoney = (value: unknown) => /^\d*(?:\.\d{1,2})?$/.test(String(value ?? "").trim()) && Number(value || 0) <= 21474836.47;
  const validQuantity = (value: unknown) => /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(String(value ?? "").trim()) && Number(value) > 0 && Number(value) <= 99999999.99;
  if (!text(formData, "title", 180) || !lines.length || lines.length > 200 || lines.length !== formData.getAll("line_title").length
    || !moneyFields.every(key => validMoney(key.includes(":") ? formData.getAll("line_rate")[Number(key.split(":")[1])] : formData.get(key)))
    || !formData.getAll("line_quantity").every(validQuantity) || !formData.getAll("line_internal_cost").every(validMoney)
    || lines.some(line => !Number.isSafeInteger(line.amount_cents) || line.amount_cents > 2147483647))
    return { ...failure("Review every line title, quantity, price, tax and fee. No changes were saved."), saveRejected: true };
  const costs = hasAllowedRole(auth.roles, platformRoleGroups.financialReporting);
  const commandLines = lines.map(line => {
    const { internal_cost_estimate_cents, ...visible } = line;
    return costs ? { ...visible, internal_cost_estimate_cents } : visible;
  });
  let expiresAt: string | null;
  try { expiresAt = dateAtEndOfDay(formData.get("expires_on")); }
  catch { return { ...failure("Choose a valid approval expiry date."), saveRejected: true }; }
  const header = {
    title: text(formData, "title", 180), reason: optional(formData, "reason", 1000),
    customer_description: optionalMultiline(formData, "customer_description", 5000), customer_notes: optionalMultiline(formData, "customer_notes", 3000),
    internal_notes: optionalMultiline(formData, "internal_notes", 5000), requested_by_contact_id: optional(formData, "requested_by_contact_id", 80),
    approval_contact_id: optional(formData, "approval_contact_id", 80), tax_cents: cents(formData.get("tax")), fee_cents: cents(formData.get("fees")),
    expires_at: expiresAt, schedule_impact: parseScheduleImpact(formData),
    ...(!editing ? { job_id: text(formData, "job_id", 80), source_quote_id: optional(formData, "source_quote_id", 80),
      source_closeout_id: optional(formData, "source_closeout_id", 80), submit_for_review: formData.get("submit_intent") === "review" } : {}),
  };
  const { data, error } = await callDeliveryCommand(auth.supabase, "save_change_order_draft", {
    p_request_id: requestId, p_change_order_id: id, p_expected_revision: revision, p_header: header, p_lines: commandLines,
  });
  if (error) {
    const rejected = ["PT409", "40001", "22023", "22P02", "22003", "23503", "23514", "42501"].includes(error.code ?? "");
    return { ...failure(rejected ? error.message : "The save could not be confirmed. Keep this form and retry with the same details to check safely."), saveRejected: rejected, reviewRequired: error.code === "PT409" || error.code === "40001" || error.code === "23514" };
  }
  if (!data || data.request_id !== requestId || !isUuid(data.id) || (editing && data.id !== id) || !isUuid(data.job_id)
    || !(data.organization_id === null || isUuid(data.organization_id)) || !Number.isSafeInteger(data.edit_revision) || data.edit_revision < 0
    || !Number.isSafeInteger(data.current_revision) || data.current_revision < data.edit_revision || typeof data.replayed !== "boolean" || !Number.isFinite(Date.parse(data.updated_at))
    || !["draft", "pending_internal_review", "ready_to_send", "sent", "approved", "declined", "change_requested", "cancelled", "expired"].includes(data.current_status)
    || !Array.isArray(data.line_ids) || data.line_ids.length !== lines.length || data.line_ids.some((line: unknown) => !isUuid(line)) || new Set(data.line_ids).size !== lines.length)
    return failure("The save could not be confirmed. Keep this form and retry with the same details to check safely.");
  revalidateChangeOrderPaths(data.id, data.job_id, data.organization_id);
  if (!editing) {
    return { ...success("Additional-work draft saved."), savedRevision: data.edit_revision, savedLineIds: data.line_ids,
      saveDestination: formData.get("return_to_job") === "1" ? `/admin/jobs/${data.job_id}?change_added=1#job-scope` : `/admin/change-orders/${data.id}` };
  }
  if (data.replayed || data.current_revision !== data.edit_revision) return { ...success("Your earlier save is confirmed. Review the current record before editing again."), savedRevision: data.edit_revision, savedLineIds: data.line_ids, reviewRequired: true };
  if (formData.get("submit_intent") === "save_close") return { ...success("Changes saved together."), savedRevision: data.edit_revision, savedLineIds: data.line_ids, saveDestination: `/admin/change-orders/${data.id}?updated=1` };
  return { ...success("Changes saved together. The existing customer link remains active."), savedRevision: data.edit_revision, savedLineIds: data.line_ids };
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
    expectedSourceVersions: {[`change_order:${id}`]: order.updated_at},
    deliveryPortalTokens: [{kind:"change_order",id:token.tokenId}],
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

  revalidateChangeOrderPaths(id, order.job_id, order.organization_id);
  return { status: result.sourceReconciled ? "success" : "error", message: result.message, portalUrl };
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
  } satisfies RpcCommandArgs<"approve_change_order">).single();
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
  const requestId = text(formData, "request_id", 80);
  const expectedUpdatedAt = text(formData, "expected_updated_at", 80);
  const reviewHash = text(formData, "review_hash", 80);
  const tokenHash = hashPortalToken(rawToken);
  if (!tokenHash || !isUuid(requestId) || !Number.isFinite(Date.parse(expectedUpdatedAt)) || !/^[a-f0-9]{64}$/.test(reviewHash) || !approverName)
    return { ...failure("Refresh and review this additional work, then enter the name of the person authorizing it."), responseRejected: true };
  const rateLimit = await checkPortalActionRateLimit("change-order-approve", rawToken);
  if (!rateLimit.available) return failure("Change-order responses are temporarily unavailable. Your approval has not been confirmed.");
  if (!rateLimit.allowed) return failure("Please wait before submitting another response.");
  const supabase = getServiceRoleClient();
  if (!supabase) return failure("The approval could not be confirmed. Keep this page open and try again, or call our office.");
  const { data, error } = await callDeliveryCommand(supabase, "approve_change_order_by_portal", {
    p_request_id: requestId, p_token_hash: tokenHash, p_expected_updated_at: expectedUpdatedAt, p_review_hash: reviewHash, p_approver_name: approverName,
  });
  if (error) {
    const rejected = ["22023", "PT409", "40001", "42501", "23514"].includes(error.code ?? "");
    return { ...failure(rejected ? safeStaffMessage(error.message) : "The approval could not be confirmed. Keep this page open and retry the same approval, or call our office."), responseRejected: rejected };
  }
  if (!data || !isUuid(data.change_order_id) || !isUuid(data.job_id) || !isUuid(data.source_event_id) || typeof data.replayed !== "boolean" || typeof data.newly_approved !== "boolean")
    return failure("The approval could not be confirmed. Keep this page open and retry the same approval, or call our office.");
  await deliverCustomerSourceEvent({ id: data.source_event_id });
  revalidatePath(`/portal/change-order/${rawToken}`);
  revalidateChangeOrderPaths(data.change_order_id, data.job_id, null);
  return success(data.replayed ? "Your saved approval is confirmed. No additional scope was added again." : "Additional work approved. Angel Tree Services will confirm any schedule impact.");
}

export async function respondToChangeOrderByPortal(_state: ChangeOrderActionState, formData: FormData): Promise<ChangeOrderActionState> {
  const rawToken = text(formData, "token", 300);
  const intent = text(formData, "response_intent", 30);
  const message = text(formData, "message", 1000);
  const rateLimit = await checkPortalActionRateLimit("change-order-response", rawToken);
  if (!rateLimit.available) return failure("Change-order responses are temporarily unavailable. Please try again shortly.");
  if (!rateLimit.allowed) return failure("Please wait before submitting another response.");
  const lookup = await getChangeOrderByPortalToken(rawToken);
  const supabase = getServiceRoleClient();
  if (!supabase || lookup.status !== "ready" || !lookup.changeOrder) return failure(lookup.message || "This change order link is unavailable.");
  const tokenHash=hashPortalToken(rawToken);
  const requestId=text(formData,"request_id",80),expectedUpdatedAt=text(formData,"expected_updated_at",80);
  if(!tokenHash||!isUuid(requestId)||!expectedUpdatedAt)return failure("Refresh and review this addition before responding.");
  const {data,error}=await supabase.rpc("respond_to_change_order_by_portal",{
    p_request_id:requestId,p_token_hash:tokenHash,p_expected_updated_at:expectedUpdatedAt,p_intent:intent,p_message:message,
  } satisfies RpcCommandArgs<"respond_to_change_order_by_portal">);
  if(error)return {...failure(safeStaffMessage(error.message,"The response could not be confirmed. Review its saved status before trying again.")),responseRejected:["22023","PT409","40001","42501","23514"].includes(error.code??"")};
  if(!data||!isUuid(data.source_event_id)||data.change_order_id!==lookup.changeOrder.id||typeof data.replayed!=="boolean")return failure("The response could not be confirmed. Review its saved status before trying again.");
  await deliverCustomerSourceEvent({id:data.source_event_id});
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
  return { supabase, userId: user.id, roles, error: null };
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
      amount_cents: Math.max(0, Math.round(Math.round(quantity * 100) * unitPrice / 100)),
      service_category_id: String(categories[index] ?? "").trim() || null,
      material_id: String(materials[index] ?? "").trim() || null,
      internal_cost_estimate_cents: String(costs[index] ?? "").trim() ? cents(costs[index]) : null,
      sort_order: index,
    };
  }).filter((item) => item.title && item.quantity > 0);
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

function changeOrderEmailText(order: NonNullable<Awaited<ReturnType<typeof getChangeOrderDetail>>["data"]>, portalUrl: string) {
  const party = order.organizations?.name ?? order.customers?.display_name ?? "Customer";
  return [`Hello ${order.approval_contact?.full_name ?? party},`, "", `Angel Tree Services prepared ${order.change_order_number} for additional or changed work.`, `Additional amount: ${money(order.total_cents)}`, `Revised combined amount: ${money(order.original_approved_amount_cents + order.total_cents)}`, "", "Review and respond through your secure link:", portalUrl, "", "This email does not alter the original approved quote."].join("\n");
}

function parseScheduleImpact(formData: FormData) {
  const keys = ["scheduled_date", "estimated_duration", "assigned_crew", "equipment", "materials", "permits", "subcontractors"];
  return Object.fromEntries(keys.map((key) => [key, formData.get(`impact_${key}`) === "on"]));
}
function cents(value: FormDataEntryValue | null) { const parsed = Number.parseFloat(String(value ?? "0")); return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0; }
function text(formData: FormData, key: string, max: number) { return String(formData.get(key) ?? "").trim().slice(0, max); }
function optional(formData: FormData, key: string, max: number) { return text(formData, key, max) || null; }
function normalizeMultiline(value: FormDataEntryValue | null | undefined, max: number) { const normalized = String(value ?? "").replaceAll("\r\n", "\n").trimEnd().slice(0, max); return normalized.trim() ? normalized : null; }
function optionalMultiline(formData: FormData, key: string, max: number) { return normalizeMultiline(formData.get(key), max); }
function dateAtEndOfDay(value: FormDataEntryValue | null) { const date = String(value ?? "").trim(); return date ? new Date(`${date}T23:59:59`).toISOString() : null; }
function money(centsValue: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsValue / 100); }
function failure(message: string): ChangeOrderActionState { return { status: "error", message: safeStaffMessage(message) }; }
function success(message: string): ChangeOrderActionState { return { status: "success", message }; }
function revalidateChangeOrderPaths(id: string, jobId: string | null, organizationId: string | null) { revalidatePath("/admin/change-orders"); revalidatePath(`/admin/change-orders/${id}`); if (jobId) { revalidatePath(`/admin/jobs/${jobId}`); revalidatePath(`/crew/jobs/${jobId}`); } if (organizationId) revalidatePath(`/admin/organizations/${organizationId}`); }

function isUuid(value:unknown):value is string{return typeof value==="string"&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);}
