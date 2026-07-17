import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getExistingCommunicationPortalUrl } from "@/lib/communications/portal-links";
import { syncAutomatedCommunications, getCommunicationSettingsFromClient } from "@/lib/communications/queue";
import {
  appointmentCommunicationTemplate,
  invoiceReminderTemplate,
  paymentConfirmationTemplate,
  quoteFollowUpTemplate,
} from "@/lib/communications/templates";
import { sendTransactionalEmail } from "@/lib/email/send";
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
};

type PreparationResult =
  | { action: "cancel" | "skip"; reason: string }
  | { action: "send"; data: PreparedCommunication };

export async function processDueCommunications(limit = 20) {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return { claimed: 0, failed: 0, sent: 0, skipped: 0, error: "Server-side Supabase is not configured." };
  }

  const sync = await syncAutomatedCommunications(supabase);
  if (sync.error) {
    console.error("Communication queue synchronization failed", sync.error);
  }

  const { data, error } = await supabase.rpc("claim_due_customer_communications", {
    p_limit: Math.min(Math.max(limit, 1), 50),
  });

  if (error) {
    return { claimed: 0, failed: 0, sent: 0, skipped: 0, error: error.message };
  }

  const rows = (data ?? []) as CustomerCommunication[];
  const results = await Promise.all(rows.map((row) => processClaimedCommunication(supabase, row)));

  return {
    claimed: rows.length,
    failed: results.filter((result) => result === "failed").length,
    sent: results.filter((result) => result === "sent").length,
    skipped: results.filter((result) => result === "skipped" || result === "cancelled").length,
    error: sync.error,
  };
}

export async function processCommunicationById(communicationId: string) {
  const supabase = getServiceRoleClient();
  if (!supabase) return { status: "failed" as const, message: "Server-side Supabase is not configured." };

  const { data: pending } = await supabase
    .from("customer_communications")
    .select("*")
    .eq("id", communicationId)
    .eq("status", "pending")
    .maybeSingle();

  if (!pending) {
    const { data: existing } = await supabase
      .from("customer_communications")
      .select("status, last_error, skip_reason")
      .eq("id", communicationId)
      .maybeSingle();
    return {
      status: (existing?.status ?? "failed") as CustomerCommunication["status"],
      message: existing?.skip_reason || existing?.last_error || "This communication was already processed.",
    };
  }

  const { data: claimed } = await supabase
    .from("customer_communications")
    .update({
      attempt_count: Number(pending.attempt_count ?? 0) + 1,
      last_error: null,
      processing_started_at: new Date().toISOString(),
      skip_reason: null,
      status: "processing",
    })
    .eq("id", communicationId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (!claimed) {
    return { status: "processing" as const, message: "This communication is already being processed." };
  }

  const status = await processClaimedCommunication(supabase, claimed as CustomerCommunication);
  return {
    status,
    message: status === "sent" ? "Reminder sent." : "The reminder was not sent. Review its status for details.",
  };
}

async function processClaimedCommunication(supabase: SupabaseClient, communication: CustomerCommunication) {
  const settingsResult = await getCommunicationSettingsFromClient(supabase);
  if (!settingsResult.data) {
    await failCommunication(supabase, communication, settingsResult.error ?? "Communication settings are unavailable.", false);
    return "failed" as const;
  }

  if (communication.is_automatic && !settingsResult.data.automated_sending_enabled) {
    await returnToPending(supabase, communication, "Automated sending is disabled.");
    return "skipped" as const;
  }

  const prepared = await prepareCommunication(supabase, communication, settingsResult.data);
  if (prepared.action !== "send") {
    await supabase
      .from("customer_communications")
      .update({
        cancelled_at: prepared.action === "cancel" ? new Date().toISOString() : null,
        last_error: null,
        processing_started_at: null,
        skip_reason: prepared.reason,
        status: prepared.action === "cancel" ? "cancelled" : "skipped",
      })
      .eq("id", communication.id)
      .eq("status", "processing");
    return prepared.action === "cancel" ? "cancelled" as const : "skipped" as const;
  }

  if (prepared.data.recipientEmail !== communication.recipient_email) {
    await supabase
      .from("customer_communications")
      .update({ recipient_email: prepared.data.recipientEmail })
      .eq("id", communication.id)
      .eq("status", "processing");
  }

  const recentDelivery = await getRecentMatchingDelivery(supabase, communication, settingsResult.data.minimum_send_interval_hours);
  if (recentDelivery.kind === "current") {
    await supabase
      .from("customer_communications")
      .update({
        last_error: null,
        processing_started_at: null,
        provider_message_id: recentDelivery.providerMessageId,
        sent_at: recentDelivery.sentAt,
        skip_reason: null,
        status: "sent",
      })
      .eq("id", communication.id)
      .eq("status", "processing");
    return "sent" as const;
  }
  if (recentDelivery.kind === "other" || recentDelivery.kind === "error") {
    await supabase
      .from("customer_communications")
      .update({
        last_error: null,
        processing_started_at: null,
        skip_reason: recentDelivery.kind === "error"
          ? "The duplicate-delivery check could not be completed safely. No email was sent."
          : `A matching reminder was already sent within ${settingsResult.data.minimum_send_interval_hours} hours.`,
        status: "skipped",
      })
      .eq("id", communication.id)
      .eq("status", "processing");
    return "skipped" as const;
  }

  const result = await sendTransactionalEmail({
    to: prepared.data.recipientEmail,
    subject: prepared.data.template.subject,
    text: prepared.data.template.text,
    html: prepared.data.template.html,
    emailType: communication.communication_type,
    idempotencyKey: `customer-communication/${communication.id}`,
    relatedAppointmentId: communication.appointment_id,
    relatedCommunicationId: communication.id,
    relatedCustomerId: communication.customer_id,
    relatedInvoiceId: communication.invoice_id,
    relatedJobId: communication.job_id,
    relatedOrganizationId: communication.organization_id,
    relatedPaymentId: communication.payment_id,
    relatedQuoteId: communication.quote_id,
    relatedScheduleEventId: communication.schedule_event_id,
    supabase,
  });

  if (result.ok) {
    await supabase
      .from("customer_communications")
      .update({
        last_error: null,
        processing_started_at: null,
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
        skip_reason: null,
        status: "sent",
      })
      .eq("id", communication.id)
      .eq("status", "processing");
    return "sent" as const;
  }

  await failCommunication(supabase, communication, result.message, result.retryable);
  return "failed" as const;
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

async function getCurrentRecipient(supabase: SupabaseClient, communication: CustomerCommunication) {
  if (communication.organization_id) {
    const { data: organization, error } = await supabase
      .from("organizations")
      .select("id, name, billing_email, status")
      .eq("id", communication.organization_id)
      .maybeSingle();
    if (error || !organization) return { customerName: null, email: null, error: error?.message ?? "Organization not found." };
    if (organization.status === "archived") return { customerName: null, email: null, error: "The organization is archived." };
    const email = organization.billing_email?.trim().toLowerCase() ?? "";
    if (!isValidEmail(email)) return { customerName: null, email: null, error: "The organization billing email is missing or invalid." };
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

  if (error || !customer) return { customerName: null, email: null, error: error?.message ?? "Customer not found." };
  if (customer.status === "archived") return { customerName: null, email: null, error: "The customer is archived." };

  const email = customer.email?.trim().toLowerCase() ?? "";

  if (!isValidEmail(email)) {
    return { customerName: null, email: null, error: "The current customer or organization email address is missing or invalid." };
  }

  return { customerName: customer.display_name as string, email, error: null };
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

  if (error || !quote) return { action: "cancel", reason: error?.message ?? "The quote no longer exists." };
  if (quote.status !== "sent") return { action: "cancel", reason: `The quote is ${String(quote.status).replaceAll("_", " ")}.` };
  if (communication.is_automatic && !quote.automatic_follow_ups_enabled) {
    return { action: "cancel", reason: "Automatic follow-ups are disabled for this quote." };
  }

  const portal = await getExistingCommunicationPortalUrl(supabase, "quote", quote.id);
  if (!portal.url) return { action: "skip", reason: portal.error ?? "The active quote link is unavailable." };

  const lineItems = ((quote.quote_line_items ?? []) as { name: string; description: string | null; sort_order: number }[])
    .sort((left, right) => left.sort_order - right.sort_order);
  return {
    action: "send",
    data: {
      customerName,
      recipientEmail,
      template: quoteFollowUpTemplate({
        customerName,
        lineItems,
        portalUrl: portal.url,
        quoteNumber: quote.quote_number || "Draft",
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

  if (error || !invoice) return { action: "cancel", reason: error?.message ?? "The invoice no longer exists." };
  if (["paid", "void"].includes(invoice.status)) return { action: "cancel", reason: `The invoice is ${invoice.status}.` };
  if (communication.is_automatic && !invoice.automatic_reminders_enabled) {
    return { action: "cancel", reason: "Automatic reminders are disabled for this invoice." };
  }

  const balanceDueCents = await getCurrentInvoiceBalance(supabase, invoice.id, Number(invoice.total_cents));
  if (balanceDueCents <= 0) return { action: "cancel", reason: "The invoice no longer has a balance due." };

  const portal = await getExistingCommunicationPortalUrl(supabase, "invoice", invoice.id);
  if (!portal.url) return { action: "skip", reason: portal.error ?? "The active invoice link is unavailable." };

  const job = one<{ service_locations: LocationRow | LocationRow[] | null }>(invoice.jobs);
  const location = one<LocationRow>(job?.service_locations ?? null);
  return {
    action: "send",
    data: {
      customerName,
      recipientEmail,
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
    starts_at: string;
    status: string;
    updated_at: string;
    service_locations: LocationRow | LocationRow[] | null;
  } | null = null;

  if (communication.schedule_event_id) {
    const { data } = await supabase
      .from("schedule_events")
      .select("starts_at, ends_at, event_type, status, updated_at, service_locations(street, city, state, postal_code)")
      .eq("id", communication.schedule_event_id)
      .maybeSingle();
    appointment = data ?? null;
  } else if (communication.appointment_id) {
    const { data } = await supabase
      .from("appointments")
      .select("starts_at, ends_at, appointment_type, status, updated_at, service_locations(street, city, state, postal_code)")
      .eq("id", communication.appointment_id)
      .maybeSingle();
    appointment = data ? { ...data, event_type: data.appointment_type } : null;
  } else if (communication.job_id) {
    const { data } = await supabase
      .from("jobs")
      .select("scheduled_start_at, scheduled_end_at, status, updated_at, service_locations(street, city, state, postal_code)")
      .eq("id", communication.job_id)
      .maybeSingle();
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
    .select("id, amount_cents, paid_at, provider, reference, status, invoices(id, invoice_number, total_cents)")
    .eq("id", communication.payment_id)
    .maybeSingle();

  if (error || !payment) return { action: "cancel", reason: error?.message ?? "The payment no longer exists." };
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
        paidAt: payment.paid_at || new Date().toISOString(),
        reference: payment.provider === "manual" ? payment.reference : null,
      }),
    },
  };
}

async function getCurrentInvoiceBalance(supabase: SupabaseClient, invoiceId: string, totalCents: number) {
  const { data } = await supabase
    .from("payments")
    .select("amount_cents")
    .eq("invoice_id", invoiceId)
    .eq("status", "succeeded");
  const paidCents = (data ?? []).reduce((sum, payment) => sum + Number(payment.amount_cents ?? 0), 0);
  return Math.max(0, totalCents - paidCents);
}

async function getRecentMatchingDelivery(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  intervalHours: number,
) {
  const since = new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from("email_events")
    .select("related_communication_id, provider_message_id, sent_at")
    .eq("email_type", communication.communication_type)
    .eq("status", "sent")
    .gte("sent_at", since);

  if (communication.quote_id) query = query.eq("related_quote_id", communication.quote_id);
  else if (communication.invoice_id) query = query.eq("related_invoice_id", communication.invoice_id);
  else if (communication.schedule_event_id) query = query.eq("related_schedule_event_id", communication.schedule_event_id);
  else if (communication.appointment_id) query = query.eq("related_appointment_id", communication.appointment_id);
  else if (communication.payment_id) query = query.eq("related_payment_id", communication.payment_id);
  else if (communication.job_id) query = query.eq("related_job_id", communication.job_id);

  const { data, error } = await query.limit(20);
  if (error) {
    console.error("Communication duplicate-delivery check failed", { communicationId: communication.id, error: error.message });
    return { kind: "error" as const };
  }
  const current = (data ?? []).find((event) => event.related_communication_id === communication.id);
  if (current) {
    return {
      kind: "current" as const,
      providerMessageId: current.provider_message_id ?? null,
      sentAt: current.sent_at ?? new Date().toISOString(),
    };
  }
  return (data ?? []).length > 0 ? { kind: "other" as const } : { kind: "none" as const };
}

async function failCommunication(
  supabase: SupabaseClient,
  communication: CustomerCommunication,
  message: string,
  retryable: boolean,
) {
  const shouldRetry = retryable && communication.attempt_count < maxAttempts;
  await supabase
    .from("customer_communications")
    .update({
      last_error: message.slice(0, 2000),
      processing_started_at: null,
      scheduled_for: shouldRetry
        ? new Date(Date.now() + Math.max(communication.attempt_count, 1) * 15 * 60 * 1000).toISOString()
        : communication.scheduled_for,
      status: shouldRetry ? "pending" : "failed",
    })
    .eq("id", communication.id)
    .eq("status", "processing");
}

async function returnToPending(supabase: SupabaseClient, communication: CustomerCommunication, reason: string) {
  await supabase
    .from("customer_communications")
    .update({
      attempt_count: Math.max(0, communication.attempt_count - 1),
      last_error: null,
      processing_started_at: null,
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      skip_reason: reason,
      status: "pending",
    })
    .eq("id", communication.id)
    .eq("status", "processing");
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
