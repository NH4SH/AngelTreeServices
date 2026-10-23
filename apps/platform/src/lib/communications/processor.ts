import "server-only";
import {callDeliveryCommand} from "@/lib/email/delivery-commands";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatProposalNumber } from "../quotes/proposal-number.ts";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { getExistingCommunicationPortalUrl } from "@/lib/communications/portal-links";
import { syncAutomatedCommunications, getCommunicationSettingsFromClient } from "@/lib/communications/queue";
import {
  appointmentCommunicationTemplate,
  appointmentChangeTemplate,
  invoiceReminderTemplate,
  paymentConfirmationTemplate,
  quoteFollowUpTemplate,
} from "@/lib/communications/templates";
import { mapBounded, withDeadline } from "@/lib/runtime/deadline";
import { emailDeliveryContext } from "@/lib/email/delivery-context";
import { sendTransactionalEmail, type SendEmailInput, type SendEmailResult } from "@/lib/email/send";
import type { TransactionalEmailTemplate } from "@/lib/email/templates";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import type {
  CommunicationSettings,
  CustomerCommunication,
} from "@/lib/types/database";

const maxAttempts = 3;

type PreparedCommunication = {
  customerName: string;
  recipientEmail: string;
  template: TransactionalEmailTemplate;
  portalTokens?: {kind: "quote" | "invoice"; id: string}[];
};

type PreparationResult =
  | { action: "cancel" | "skip" | "wait"; reason: string }
  | { action: "send"; data: PreparedCommunication };

export type CommunicationAttemptResult = {
  status: "sent" | "failed" | "pending" | "skipped" | "cancelled" | "processing";
  outcome: "accepted" | "not_sent" | "unknown";
  recorded: boolean;
  message: string;
};
type WorkerOptions = { db?: SupabaseClient; send?: (input: SendEmailInput) => Promise<SendEmailResult>; concurrency?: number; budgetMs?: number };
const reviewMessage = "Delivery may have been accepted, but its CRM status needs review. Check provider history before sending again.";

export async function processDueCommunications(limit = 20, options: WorkerOptions = {}) {
  const supabase = options.db ?? getServiceRoleClient();
  const summary = { claimed: 0, failed: 0, sent: 0, skipped: 0, pending: 0, uncertain: 0, acceptedUnrecorded: 0, error: null as string | null };
  if (!supabase) return { ...summary, error: "Server-side delivery is unavailable." };
  const concurrency = Math.min(5, Math.max(1, Math.floor(options.concurrency ?? 3) || 3));
  const maximum = Math.min(50, Math.max(1, Math.floor(limit) || 1));
  const budget = Math.min(20_000, Math.max(1, options.budgetMs ?? 20_000));
  const started = Date.now();
  try {
    const sync = await syncAutomatedCommunications(supabase);
    if (sync.error) return { ...summary, error: "Reminder synchronization could not be confirmed. No new delivery batch was started." };
    // Claim only the next small wave that can actually start, leaving other rows pending.
    while (summary.claimed < maximum && Date.now() - started < budget - 1_000) {
      const remaining = budget - (Date.now() - started);
      if (summary.claimed > 0 && remaining < 15_000) break;
      const { data, error } = await callDeliveryCommand(supabase,"claim_due_customer_communications", { p_limit: Math.min(concurrency, maximum - summary.claimed) });
      if (error) { summary.error = "The delivery queue could not be claimed safely."; break; }
      const rows = (data ?? []) as CustomerCommunication[];
      if (!rows.length) break;
      summary.claimed += rows.length;
      const results = await mapBounded(rows, concurrency, row => processClaimedCommunication(supabase, row, options.send ?? sendTransactionalEmail));
      for (const result of results) {
        if (result.outcome === "accepted") { summary.sent++; if (!result.recorded) summary.acceptedUnrecorded++; }
        else if (result.outcome === "unknown") summary.uncertain++;
        else if (["cancelled", "skipped"].includes(result.status)) summary.skipped++;
        else if (result.status === "pending") summary.pending++;
        else summary.failed++;
        if (!result.recorded && result.outcome !== "accepted") summary.error = "Some delivery outcomes could not be recorded. Review the queue before retrying.";
      }
    }
  } catch { summary.error = "The delivery queue could not be checked safely. Review its status before retrying."; }
  return summary;
}

export async function processCommunicationById(communicationId: string, options: WorkerOptions = {}): Promise<CommunicationAttemptResult> {
  const supabase = options.db ?? getServiceRoleClient();
  if (!supabase) return { status: "failed", outcome: "not_sent", recorded: false, message: "Server-side delivery is unavailable." };
  try {
    const pendingResult = await supabase.from("customer_communications").select("*").eq("id", communicationId).maybeSingle();
    if (pendingResult.error || !pendingResult.data) return { status: "failed", outcome: "not_sent", recorded: false, message: "The reminder could not be checked. No email was sent." };
    const pending = pendingResult.data as CustomerCommunication;
    if (pending.status !== "pending") return { status: pending.status, outcome: pending.status === "sent" ? "accepted" : pending.status === "processing" ? "unknown" : "not_sent", recorded: true,
      message: pending.status === "sent" ? "This reminder was already accepted. It was not sent again." : pending.skip_reason || pending.last_error || "This reminder is already being processed. Review its status before retrying." };
    const claim = await supabase.from("customer_communications").update({ attempt_count: Number(pending.attempt_count) + 1, last_error: null,
      processing_started_at: new Date().toISOString(), skip_reason: null, status: "processing" })
      .eq("id", communicationId).eq("status", "pending").eq("attempt_count", pending.attempt_count).select("*").maybeSingle();
    if (claim.error) return { status: "failed", outcome: "not_sent", recorded: false, message: "The reminder could not be claimed. No email was sent." };
    if (!claim.data) return { status: "processing", outcome: "not_sent", recorded: true, message: "Another worker has this reminder. No additional email was sent." };
    return processClaimedCommunication(supabase, claim.data as CustomerCommunication, options.send ?? sendTransactionalEmail);
  } catch { return { status: "failed", outcome: "unknown", recorded: false, message: "The reminder status could not be confirmed. Review delivery history before retrying." }; }
}

async function updateClaim(supabase: SupabaseClient, row: CustomerCommunication, values: Record<string, unknown>) {
  try {
    const result = await withDeadline(async signal => {
      let query = supabase.from("customer_communications").update(values).eq("id", row.id).eq("status", "processing")
        .eq("attempt_count", row.attempt_count).eq("processing_started_at", row.processing_started_at).select("id");
      if (typeof query.abortSignal === "function") query = query.abortSignal(signal);
      return await query.maybeSingle();
    }, 5_000);
    return !result.error && Boolean(result.data?.id);
  } catch { return false; }
}

async function processClaimedCommunication(supabase: SupabaseClient, communication: CustomerCommunication,
  send: (input: SendEmailInput) => Promise<SendEmailResult>): Promise<CommunicationAttemptResult> {
  let providerStarted = false;
  let accepted = false;
  try {
    const settingsResult = await getCommunicationSettingsFromClient(supabase);
    if (!settingsResult.data) throw Error("Settings unavailable");
    if (communication.is_automatic && !settingsResult.data.automated_sending_enabled) {
      const recorded = await returnToPending(supabase, communication, "Automated sending is disabled.");
      return { status: "pending", outcome: "not_sent", recorded, message: "Automated sending is disabled. This reminder was not sent." };
    }
    const sourceInput: SendEmailInput = { to: communication.recipient_email, subject:"Pending reminder",text:"",emailType:communication.communication_type,
      relatedAppointmentId:communication.appointment_id,relatedCommunicationId:communication.id,relatedCustomerId:communication.customer_id,
      relatedInvoiceId:communication.invoice_id,relatedJobId:communication.job_id,relatedOrganizationId:communication.organization_id,
      relatedPaymentId:communication.payment_id,relatedQuoteId:communication.quote_id,relatedScheduleEventId:communication.schedule_event_id };
    const snapshot=await callDeliveryCommand(supabase,"get_outbound_source_snapshot",{p_context:emailDeliveryContext(sourceInput)});
    if(snapshot.error||!snapshot.data)throw Error("Source snapshot unavailable");
    const prepared = await prepareCommunication(supabase, communication, settingsResult.data);
    if (prepared.action === "wait") {
      const recorded = await returnToPending(supabase, communication, prepared.reason);
      return { status: "pending", outcome: "not_sent", recorded, message: prepared.reason };
    }
    if (prepared.action !== "send") {
      const status = prepared.action === "cancel" ? "cancelled" : "skipped";
      const recorded = await updateClaim(supabase, communication, { cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
        last_error: null, processing_started_at: null, skip_reason: prepared.reason, status });
      return { status, outcome: "not_sent", recorded, message: recorded ? prepared.reason : "No email was sent, but the queue update needs review." };
    }
    const recent = await getRecentMatchingDelivery(supabase, communication, settingsResult.data.minimum_send_interval_hours);
    if (recent.kind === "current") {
      const recorded = await updateClaim(supabase, communication, { last_error: null, processing_started_at: null,
        provider_message_id: recent.providerMessageId, sent_at: recent.sentAt, skip_reason: null, status: "sent" });
      return { status: recorded ? "sent" : "processing", outcome: "accepted", recorded, message: recorded ? "Previous provider acceptance was recorded. No email was sent again." : reviewMessage };
    }
    if (recent.kind === "error") throw Error("Delivery history unavailable");
    if (recent.kind === "other") {
      const message = "A matching reminder was already accepted recently. No additional email was sent.";
      const recorded = await updateClaim(supabase, communication, { last_error: null, processing_started_at: null, skip_reason: message, status: "skipped" });
      return { status: "skipped", outcome: "not_sent", recorded, message };
    }
    if (communication.attempt_count>1) {
      const prior=await callDeliveryCommand(supabase,"find_outbound_delivery_request",{p_request_key:`customer-communication/${communication.id}`});
      if(prior.error||!prior.data)return failCommunication(supabase,communication,"An older delivery has no frozen request. Review provider history before another attempt.",false);
    }
    if (prepared.data.recipientEmail !== communication.recipient_email && !await updateClaim(supabase, communication, { recipient_email: prepared.data.recipientEmail }))
      return { status: "processing", outcome: "not_sent", recorded: false, message: "The recipient could not be saved. No email was sent." };
    // Recheck ownership immediately before provider I/O. PR14 owns the full
    // transactional send-time source/recipient lease and immutable payload design.
    const current = await supabase.from("customer_communications").select("id").eq("id", communication.id).eq("status", "processing")
      .eq("attempt_count", communication.attempt_count).eq("processing_started_at", communication.processing_started_at).maybeSingle();
    if (current.error || !current.data) return { status: "processing", outcome: "not_sent", recorded: false, message: "The delivery claim changed. No email was sent." };
    providerStarted = true;
    const result = await send({ expectedSourceSnapshot:snapshot.data, to: prepared.data.recipientEmail, subject: prepared.data.template.subject, text: prepared.data.template.text,
      html: prepared.data.template.html, deliveryPortalTokens: prepared.data.portalTokens, emailType: communication.communication_type, idempotencyKey: `customer-communication/${communication.id}`,
      relatedAppointmentId: communication.appointment_id, relatedCommunicationId: communication.id, relatedCustomerId: communication.customer_id,
      relatedInvoiceId: communication.invoice_id, relatedJobId: communication.job_id, relatedOrganizationId: communication.organization_id,
      relatedPaymentId: communication.payment_id, relatedQuoteId: communication.quote_id, relatedScheduleEventId: communication.schedule_event_id, supabase });
    accepted = result.ok;
    if (accepted && result.deliveryId) {
      if(result.sourceReconciled && result.sourceCommunicationId!==communication.id) {
        const recorded=await updateClaim(supabase,communication,{status:"skipped",processing_started_at:null,skip_reason:"The matching saved delivery was already accepted. No additional email was sent."});
        return{status:recorded?"skipped":"processing",outcome:"accepted",recorded,message:recorded?"Matching delivery recorded without another email.":reviewMessage};
      }
      return {status:result.sourceReconciled?"sent":"processing",outcome:"accepted",recorded:result.sourceReconciled===true,message:result.message};
    }
    if (accepted) {
      const recorded = await updateClaim(supabase, communication, { last_error: result.historyRecorded ? null : "Provider accepted; delivery history needs review.",
        processing_started_at: null, provider_message_id: result.providerMessageId, sent_at: new Date().toISOString(), skip_reason: null, status: "sent" });
      return { status: recorded ? "sent" : "processing", outcome: "accepted", recorded: recorded && result.historyRecorded,
        message: recorded && result.historyRecorded ? "Email accepted and recorded." : reviewMessage };
    }
    if (result.outcome === "unknown") {
      const recorded = await updateClaim(supabase, communication, { status: "failed", processing_started_at: null, last_error: reviewMessage,
        skip_reason: "Delivery outcome needs review; automatic retry was stopped." });
      return { status: recorded ? "failed" : "processing", outcome: "unknown", recorded, message: reviewMessage };
    }
    return failCommunication(supabase, communication, result.message, result.retryable && result.historyRecorded);
  } catch {
    if (providerStarted) {
      const recorded = await updateClaim(supabase, communication, { status: "failed", processing_started_at: null, last_error: reviewMessage });
      return { status: recorded ? "failed" : "processing", outcome: accepted ? "accepted" : "unknown", recorded: false, message: reviewMessage };
    }
    return failCommunication(supabase, communication, "Delivery checks could not be completed safely. No email was sent.", false);
  }
}

async function prepareCommunication(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  settings: CommunicationSettings,
): Promise<PreparationResult> {
  const recipient = await getCurrentRecipient(supabase, communication);
  if (recipient.error || !recipient.email || !recipient.customerName) {
    return { action: "skip", reason: recipient.error ?? "The customer email address is unavailable." };
  }

  switch (communication.communication_type) {
    case "appointment_changed":
    case "appointment_cancelled":
      return prepareAppointmentChange(supabase, communication, recipient.email, recipient.customerName, settings);
    case "quote_follow_up":
      return prepareQuoteFollowUp(supabase, communication, recipient.email, recipient.customerName);
    case "invoice_payment_reminder":
    case "overdue_invoice_reminder":
      return prepareInvoiceReminder(supabase, communication, recipient.email, recipient.customerName);
    case "estimate_confirmation":
    case "estimate_reminder":
    case "work_confirmation":
    case "work_reminder":
      return prepareAppointmentMessage(supabase, communication, recipient.email, recipient.customerName, settings);
    case "payment_confirmation":
      return preparePaymentConfirmation(supabase, communication, recipient.email, recipient.customerName);
  }
}

async function prepareAppointmentChange(supabase: SupabaseClient, communication: CustomerCommunication,
  recipientEmail: string, customerName: string, settings: CommunicationSettings): Promise<PreparationResult> {
  const result = await callDeliveryCommand(supabase, "get_appointment_change_notice", { p_communication_id: communication.id });
  if (result.error || !result.data) throw Error("Visit update unavailable");
  const notice = result.data as { status: string; kind?: "changed" | "cancelled";
    before?: { starts_at: string; ends_at: string | null; status: string; type: string };
    after?: { starts_at: string; ends_at: string | null; type: string }; location?: LocationRow | null };
  if (notice.status === "held") return { action: "wait", reason: "This visit update is waiting for delivery checks. No email was sent." };
  if (notice.status !== "ready") return { action: "cancel", reason: "A newer visit update replaced this notice, or the visit is no longer eligible." };
  if (!notice.before || !notice.after || !notice.kind) throw Error("Incomplete visit update");
  return { action: "send", data: { recipientEmail, customerName, template: appointmentChangeTemplate({
    customerName, kind: notice.kind, before: notice.before, after: notice.after,
    location: formatLocation(notice.location ?? null), timezone: settings.business_timezone,
  }) } };
}

async function getCurrentRecipient(supabase: SupabaseClient, communication: CustomerCommunication) {
  if (communication.organization_id) {
    const { data: organization, error } = await supabase
      .from("organizations")
      .select("id, name, billing_email, status")
      .eq("id", communication.organization_id)
      .maybeSingle();
    if (error) throw Error("Organization lookup unavailable");
    if (!organization) return { customerName: null, email: null, error: "Organization not found." };
    if (organization.status === "archived") return { customerName: null, email: null, error: "The organization is archived." };
    const selectedEmail = await getOrganizationWorkflowRecipient(supabase, communication, organization.id);
    const email = (selectedEmail ?? organization.billing_email)?.trim().toLowerCase() ?? "";
    if (!isValidEmail(email)) return { customerName: null, email: null, error: "The selected organization contact email is missing or invalid." };
    return { customerName: organization.name as string, email, error: null };
  }

  if (!communication.customer_id) {
    return { customerName: null, email: null, error: "The contracting party is unavailable." };
  }

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id, display_name, email, organization_id, status")
    .eq("id", communication.customer_id)
    .maybeSingle();

  if (error) throw Error("Customer lookup unavailable");
  if (!customer) return { customerName: null, email: null, error: "Customer not found." };
  if (customer.status === "archived") return { customerName: null, email: null, error: "The customer is archived." };

  const email = customer.email?.trim().toLowerCase() ?? "";

  if (!isValidEmail(email)) {
    return { customerName: null, email: null, error: "The current customer or organization email address is missing or invalid." };
  }

  return { customerName: customer.display_name as string, email, error: null };
}

async function getOrganizationWorkflowRecipient(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  organizationId: string,
) {
  let contactIds: Array<string | null> = [];

  if (communication.quote_id) {
    const { data, error } = await supabase.from("quotes").select("organization_id, approval_contact_id, recipient_contact_id").eq("id", communication.quote_id).maybeSingle();
    if (error) throw Error("Workflow recipient unavailable");
    if (data?.organization_id === organizationId) contactIds = [data.approval_contact_id, data.recipient_contact_id];
  } else if (communication.invoice_id) {
    const { data, error } = await supabase.from("invoices").select("organization_id, accounts_payable_contact_id, billing_contact_id").eq("id", communication.invoice_id).maybeSingle();
    if (error) throw Error("Workflow recipient unavailable");
    if (data?.organization_id === organizationId) contactIds = [data.accounts_payable_contact_id, data.billing_contact_id];
  } else if (communication.payment_id) {
    const { data: payment, error: paymentError } = await supabase.from("payments").select("invoice_id, organization_id").eq("id", communication.payment_id).maybeSingle();
    if (paymentError) throw Error("Payment recipient unavailable");
    if (payment?.organization_id === organizationId) {
      const { data, error } = await supabase.from("invoices").select("accounts_payable_contact_id, billing_contact_id").eq("id", payment.invoice_id).maybeSingle();
      if (error) throw Error("Invoice recipient unavailable");
      contactIds = [data?.accounts_payable_contact_id ?? null, data?.billing_contact_id ?? null];
    }
  } else if (communication.job_id) {
    const { data, error } = await supabase.from("jobs").select("organization_id, onsite_contact_id, property_manager_contact_id").eq("id", communication.job_id).maybeSingle();
    if (error) throw Error("Workflow recipient unavailable");
    if (data?.organization_id === organizationId) contactIds = [data.onsite_contact_id, data.property_manager_contact_id];
  }

  for (const contactId of contactIds) {
    if (!contactId) continue;
    const { data, error } = await supabase.from("organization_contacts").select("email, is_active, organization_id").eq("id", contactId).maybeSingle();
    if (error) throw Error("Contact lookup unavailable");
    if (data?.organization_id === organizationId && data.is_active && isValidEmail(data.email?.trim().toLowerCase() ?? "")) return data.email;
  }
  return null;
}

async function prepareQuoteFollowUp(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  recipientEmail: string,
  customerName: string,
): Promise<PreparationResult> {
  if (!communication.quote_id) return { action: "skip", reason: "The quote reference is missing." };
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, status, quote_number, automatic_follow_ups_enabled, quote_line_items(name, description, sort_order)")
    .eq("id", communication.quote_id)
    .maybeSingle();

  if (error) throw Error("Quote lookup unavailable");
  if (!quote) return { action: "cancel", reason: "The quote no longer exists." };
  if (quote.status !== "sent") return { action: "cancel", reason: `The quote is ${String(quote.status).replaceAll("_", " ")}.` };
  if (communication.is_automatic && !quote.automatic_follow_ups_enabled) {
    return { action: "cancel", reason: "Automatic follow-ups are disabled for this quote." };
  }

  const portal = await getExistingCommunicationPortalUrl(supabase, "quote", quote.id);
  if (!portal.url || !portal.tokenId) return { action: "skip", reason: portal.error ?? "The active quote link is unavailable." };

  const lineItems = ((quote.quote_line_items ?? []) as { name: string; description: string | null; sort_order: number }[])
    .sort((left, right) => left.sort_order - right.sort_order);
  return {
    action: "send",
    data: {
      customerName,
      recipientEmail,
      portalTokens: [{ kind: "quote", id: portal.tokenId }],
      template: quoteFollowUpTemplate({
        customerName,
        lineItems,
        portalUrl: portal.url,
        proposalNumber: formatProposalNumber(quote.quote_number),
      }),
    },
  };
}

async function prepareInvoiceReminder(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  recipientEmail: string,
  customerName: string,
): Promise<PreparationResult> {
  if (!communication.invoice_id) return { action: "skip", reason: "The invoice reference is missing." };
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, status, invoice_number, total_cents, due_at, automatic_reminders_enabled, jobs(service_locations(street, city, state, postal_code))")
    .eq("id", communication.invoice_id)
    .maybeSingle();

  if (error) throw Error("Invoice lookup unavailable");
  if (!invoice) return { action: "cancel", reason: "The invoice no longer exists." };
  if (!["sent", "partially_paid", "overdue"].includes(invoice.status)) return { action: "cancel", reason: `The invoice is ${invoice.status}.` };
  if (communication.is_automatic && !invoice.automatic_reminders_enabled) {
    return { action: "cancel", reason: "Automatic reminders are disabled for this invoice." };
  }

  const balanceDueCents = await getCurrentInvoiceBalance(supabase, invoice.id, Number(invoice.total_cents));
  if (balanceDueCents <= 0) return { action: "cancel", reason: "The invoice no longer has a balance due." };

  const portal = await getExistingCommunicationPortalUrl(supabase, "invoice", invoice.id);
  if (!portal.url || !portal.tokenId) return { action: "skip", reason: portal.error ?? "The active invoice link is unavailable." };

  const job = one<{ service_locations: LocationRow | LocationRow[] | null }>(invoice.jobs);
  const location = one<LocationRow>(job?.service_locations ?? null);
  return {
    action: "send",
    data: {
      customerName,
      recipientEmail,
      portalTokens: [{ kind: "invoice", id: portal.tokenId }],
      template: invoiceReminderTemplate({
        balanceDueCents,
        customerName,
        dueAt: invoice.due_at,
        invoiceNumber: invoice.invoice_number || "Draft",
        isOverdue: communication.communication_type === "overdue_invoice_reminder",
        portalUrl: portal.url,
        serviceLocation: formatLocation(location),
      }),
    },
  };
}

async function prepareAppointmentMessage(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  recipientEmail: string,
  customerName: string,
  settings: CommunicationSettings,
): Promise<PreparationResult> {
  const isEstimate = communication.communication_type.startsWith("estimate_");
  const isConfirmation = communication.communication_type.endsWith("_confirmation");
  let appointment: {
    ends_at: string | null;
    event_type: string;
    job_id?: string | null;
    starts_at: string;
    status: string;
    updated_at: string;
    service_locations: LocationRow | LocationRow[] | null;
  } | null = null;

  if (communication.schedule_event_id) {
    const { data, error } = await supabase
      .from("schedule_events")
      .select("starts_at, ends_at, event_type, status, updated_at, job_id, service_locations(street, city, state, postal_code)")
      .eq("id", communication.schedule_event_id)
      .maybeSingle();
    if (error) throw Error("Visit lookup unavailable");
    appointment = data ?? null;
  } else if (communication.appointment_id) {
    const { data, error } = await supabase
      .from("appointments")
      .select("starts_at, ends_at, appointment_type, status, updated_at, service_locations(street, city, state, postal_code)")
      .eq("id", communication.appointment_id)
      .maybeSingle();
    if (error) throw Error("Appointment lookup unavailable");
    appointment = data ? { ...data, event_type: data.appointment_type } : null;
  } else if (communication.job_id) {
    const { data, error } = await supabase
      .from("jobs")
      .select("scheduled_start_at, scheduled_end_at, status, updated_at, service_locations(street, city, state, postal_code)")
      .eq("id", communication.job_id)
      .maybeSingle();
    if (error) throw Error("Work order lookup unavailable");
    appointment = data?.scheduled_start_at ? {
      ends_at: data.scheduled_end_at,
      event_type: "job",
      starts_at: data.scheduled_start_at,
      status: data.status,
      updated_at: data.updated_at,
      service_locations: data.service_locations,
    } : null;
  }

  if (!appointment) return { action: "cancel", reason: "The scheduled appointment no longer exists." };
  if (!["scheduled", "confirmed", "accepted"].includes(appointment.status)) {
    return { action: "cancel", reason: `The appointment is ${appointment.status.replaceAll("_", " ")}.` };
  }
  if (communication.source_version && communication.source_version !== appointment.starts_at) {
    return { action: "cancel", reason: "The appointment was rescheduled. This reminder is obsolete." };
  }
  if (new Date(appointment.starts_at).getTime() <= Date.now()) {
    return { action: "cancel", reason: "The appointment time has already passed." };
  }
  if (isEstimate !== (appointment.event_type === "estimate")) {
    return { action: "cancel", reason: "The appointment type changed after this reminder was scheduled." };
  }

  let workSessions: { startsAt: string; endsAt: string | null }[] | undefined;
  if (appointment.event_type === "job" && appointment.job_id) {
    const { data: sessions, error: sessionsError } = await supabase
      .from("schedule_events")
      .select("starts_at, ends_at")
      .eq("job_id", appointment.job_id)
      .eq("event_type", "job")
      .in("status", ["scheduled", "confirmed", "in_progress"])
      .order("starts_at", { ascending: true });
    if (sessionsError) throw Error("Work visits unavailable");
    workSessions = (sessions ?? []).map((session) => ({ startsAt: session.starts_at, endsAt: session.ends_at }));
  }

  return {
    action: "send",
    data: {
      customerName,
      recipientEmail,
      template: appointmentCommunicationTemplate({
        communicationLabel: isEstimate ? "estimate" : "work appointment",
        customerName,
        endsAt: appointment.ends_at,
        isConfirmation,
        location: formatLocation(one<LocationRow>(appointment.service_locations)),
        startsAt: appointment.starts_at,
        timezone: settings.business_timezone,
        workSessions,
      }),
    },
  };
}

async function preparePaymentConfirmation(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  recipientEmail: string,
  customerName: string,
): Promise<PreparationResult> {
  if (!communication.payment_id || !communication.invoice_id) {
    return { action: "skip", reason: "The payment reference is incomplete." };
  }
  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, amount_cents, surcharge_cents, total_collected_cents, paid_at, payment_method, provider, reference, status, invoices(id, invoice_number, total_cents)")
    .eq("id", communication.payment_id)
    .maybeSingle();

  if (error) throw Error("Payment lookup unavailable");
  if (!payment) return { action: "cancel", reason: "The payment no longer exists." };
  if (payment.status !== "succeeded") return { action: "cancel", reason: `The payment is ${payment.status}.` };

  const invoice = one<{ id: string; invoice_number: string | null; total_cents: number }>(payment.invoices);
  if (!invoice) return { action: "cancel", reason: "The related invoice no longer exists." };
  const balanceDueCents = await getCurrentInvoiceBalance(supabase, invoice.id, Number(invoice.total_cents));

  return {
    action: "send",
    data: {
      customerName,
      recipientEmail,
      template: paymentConfirmationTemplate({
        amountCents: Number(payment.amount_cents),
        balanceDueCents,
        customerName,
        invoiceNumber: invoice.invoice_number || "Draft",
        paidAt: payment.paid_at,
        paymentMethod: payment.payment_method,
        reference: payment.provider === "manual" ? payment.reference : null,
        surchargeCents: Number(payment.surcharge_cents ?? 0),
        totalCollectedCents: Number(payment.total_collected_cents ?? payment.amount_cents),
      }),
    },
  };
}

async function getCurrentInvoiceBalance(supabase: SupabaseClient, invoiceId: string, totalCents: number) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || totalCents > 2147483647) throw Error("Invoice total unavailable");
  const principal = await getSuccessfulPaymentTotal(supabase, invoiceId);
  if (principal.error) throw Error("Payment lookup unavailable");
  return Math.max(0, totalCents - principal.totalCents);
}

async function getRecentMatchingDelivery(supabase: SupabaseClient, communication: CustomerCommunication, intervalHours: number) {
  const own = await supabase.from("email_events").select("provider_message_id,sent_at").eq("related_communication_id", communication.id)
    .eq("status", "sent").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (own.error) return { kind: "error" as const };
  if (own.data) return { kind: "current" as const, providerMessageId: own.data.provider_message_id, sentAt: own.data.sent_at };
  // Each immutable visit revision has its own durable identity. A second genuine
  // change/cancellation must reach the customer even inside the reminder interval.
  if (["appointment_changed", "appointment_cancelled"].includes(communication.communication_type)) return { kind: "none" as const };
  const since = new Date(Date.now() - intervalHours * 60 * 60_000).toISOString();
  const matchingTypes = communication.communication_type === "invoice_payment_reminder" || communication.communication_type === "overdue_invoice_reminder"
    ? ["invoice", "invoice_payment_reminder", "overdue_invoice_reminder"]
    : communication.communication_type === "quote_follow_up" ? ["quote", "quote_follow_up"] : [communication.communication_type];
  let query = supabase.from("email_events").select("id").in("email_type", matchingTypes).eq("status", "sent").gte("sent_at", since);
  if (communication.quote_id) query = query.eq("related_quote_id", communication.quote_id);
  else if (communication.invoice_id) query = query.eq("related_invoice_id", communication.invoice_id);
  else if (communication.schedule_event_id) query = query.eq("related_schedule_event_id", communication.schedule_event_id);
  else if (communication.appointment_id) query = query.eq("related_appointment_id", communication.appointment_id);
  else if (communication.payment_id) query = query.eq("related_payment_id", communication.payment_id);
  else if (communication.job_id) query = query.eq("related_job_id", communication.job_id);
  else return { kind: "error" as const };
  const result = await query.limit(1);
  return result.error ? { kind: "error" as const } : result.data?.length ? { kind: "other" as const } : { kind: "none" as const };
}
async function failCommunication(supabase: SupabaseClient, communication: CustomerCommunication, message: string, retryable: boolean): Promise<CommunicationAttemptResult> {
  const retry = retryable && communication.attempt_count < maxAttempts;
  const recorded = await updateClaim(supabase, communication, { last_error: message.slice(0, 2000), processing_started_at: null,
    scheduled_for: retry ? new Date(Date.now() + Math.max(communication.attempt_count, 1) * 15 * 60_000).toISOString() : communication.scheduled_for,
    status: retry ? "pending" : "failed" });
  return { status: retry ? "pending" : "failed", outcome: "not_sent", recorded,
    message: recorded ? (retry ? "The provider did not accept this attempt. The saved reminder will retry later." : message) : "No acceptance was confirmed, and the queue update needs review. Check delivery history before retrying." };
}
async function returnToPending(supabase: SupabaseClient, communication: CustomerCommunication, reason: string) {
  return updateClaim(supabase, communication, { attempt_count: Math.max(0, communication.attempt_count - 1), last_error: null,
    processing_started_at: null, scheduled_for: new Date(Date.now() + 60 * 60_000).toISOString(), skip_reason: reason, status: "pending" });
}

type LocationRow = {
  street: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

function formatLocation(location: LocationRow | null) {
  return location
    ? [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ")
    : "Please contact our office to confirm the service location.";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
