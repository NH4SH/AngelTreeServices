import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailProviderConfig } from "@/lib/email/config";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import type { EmailEvent, EmailEventType } from "@/lib/types/database";

export type SendEmailInput = {
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  emailType: EmailEventType;
  relatedCustomerId?: string | null;
  relatedJobId?: string | null;
  relatedQuoteId?: string | null;
  relatedInvoiceId?: string | null;
  relatedChangeOrderId?: string | null;
  relatedOrganizationId?: string | null;
  relatedScheduleEventId?: string | null;
  relatedAppointmentId?: string | null;
  relatedPaymentId?: string | null;
  relatedCommunicationId?: string | null;
  idempotencyKey?: string;
  sentByUserId?: string | null;
  supabase?: SupabaseClient<any, "public", any> | null;
};

export type SendEmailResult = {
  ok: boolean;
  configured: boolean;
  historyRecorded: boolean;
  message: string;
  providerMessageId: string | null;
  retryable: boolean;
};

export type RecordEmailEventInput = {
  to: string;
  subject: string;
  emailType: EmailEventType;
  status: EmailEvent["status"];
  providerMessageId?: string | null;
  errorMessage?: string | null;
  relatedCustomerId?: string | null;
  relatedJobId?: string | null;
  relatedQuoteId?: string | null;
  relatedInvoiceId?: string | null;
  relatedChangeOrderId?: string | null;
  relatedOrganizationId?: string | null;
  relatedScheduleEventId?: string | null;
  relatedAppointmentId?: string | null;
  relatedPaymentId?: string | null;
  relatedCommunicationId?: string | null;
  sentByUserId?: string | null;
  supabase?: SupabaseClient<any, "public", any> | null;
};

export async function sendTransactionalEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipient = input.to.trim().toLowerCase();

  if (!isValidEmail(recipient)) {
    const message = "Recipient email address is missing or invalid.";
    const historyRecorded = await logEmailEvent(input, "failed", null, message);
    return { ok: false, configured: true, historyRecorded, message, providerMessageId: null, retryable: false };
  }

  const ccRecipients = normalizeCcRecipients(input.cc ?? [], recipient);
  const invalidCc = ccRecipients.find((email) => !isValidEmail(email));
  if (invalidCc) {
    const message = "One or more CC email addresses are invalid.";
    const historyRecorded = await logEmailEvent(input, "failed", null, message, recipient);
    return { ok: false, configured: true, historyRecorded, message, providerMessageId: null, retryable: false };
  }

  const config = getEmailProviderConfig();

  if (!config) {
    const message = "Email sending is not configured. Drafts are still available.";
    const historyRecorded = await logEmailEvent(input, "failed", null, message);
    return { ok: false, configured: false, historyRecorded, message, providerMessageId: null, retryable: false };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({
        from: config.from,
        to: [recipient],
        ...(ccRecipients.length ? { cc: ccRecipients } : {}),
        reply_to: config.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = getProviderErrorMessage(response.status);
      const historyRecorded = await logEmailEvent(input, "failed", null, getProviderDiagnostic(payload, response.status), recipient);
      return {
        ok: false,
        configured: true,
        historyRecorded,
        message,
        providerMessageId: null,
        retryable: response.status === 429 || response.status >= 500 || isConcurrentIdempotencyError(payload),
      };
    }

    const providerMessageId = typeof payload.id === "string" ? payload.id : null;
    const historyRecorded = await logEmailEvent(input, "sent", providerMessageId, null, recipient);
    return {
      ok: true,
      configured: true,
      historyRecorded,
      message: historyRecorded
        ? "Email accepted by the email provider and recorded in delivery history."
        : "Email accepted by the email provider, but its CRM delivery history could not be recorded.",
      providerMessageId,
      retryable: false,
    };
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : "Email provider request failed.";
    const message = "Email delivery could not reach the provider. Your draft is still here; please try again.";
    const historyRecorded = await logEmailEvent(input, "failed", null, diagnostic, recipient);
    return { ok: false, configured: true, historyRecorded, message, providerMessageId: null, retryable: true };
  }
}

export async function recordEmailEvent(input: RecordEmailEventInput) {
  await logEmailEvent(
    {
      to: input.to,
      subject: input.subject,
      text: "",
      emailType: input.emailType,
      relatedCustomerId: input.relatedCustomerId,
      relatedJobId: input.relatedJobId,
      relatedQuoteId: input.relatedQuoteId,
      relatedInvoiceId: input.relatedInvoiceId,
      relatedChangeOrderId: input.relatedChangeOrderId,
      relatedOrganizationId: input.relatedOrganizationId,
      relatedScheduleEventId: input.relatedScheduleEventId,
      relatedAppointmentId: input.relatedAppointmentId,
      relatedPaymentId: input.relatedPaymentId,
      relatedCommunicationId: input.relatedCommunicationId,
      sentByUserId: input.sentByUserId,
      supabase: input.supabase,
    },
    input.status,
    input.providerMessageId ?? null,
    input.errorMessage ?? null,
  );
}

async function logEmailEvent(
  input: SendEmailInput,
  status: EmailEvent["status"],
  providerMessageId: string | null,
  errorMessage: string | null,
  recipientOverride?: string,
) {
  const supabase = input.supabase ?? getServiceRoleClient();

  if (!supabase) {
    return false;
  }

  const recipientEmail = (recipientOverride ?? input.to.trim().toLowerCase()) || "unknown";

  const { error } = await supabase.from("email_events").insert({
    related_customer_id: input.relatedCustomerId ?? null,
    related_job_id: input.relatedJobId ?? null,
    related_quote_id: input.relatedQuoteId ?? null,
    related_invoice_id: input.relatedInvoiceId ?? null,
    related_change_order_id: input.relatedChangeOrderId ?? null,
    related_organization_id: input.relatedOrganizationId ?? null,
    related_schedule_event_id: input.relatedScheduleEventId ?? null,
    related_appointment_id: input.relatedAppointmentId ?? null,
    related_payment_id: input.relatedPaymentId ?? null,
    related_communication_id: input.relatedCommunicationId ?? null,
    recipient_email: recipientEmail,
    subject: input.subject,
    email_type: input.emailType,
    status,
    provider_message_id: providerMessageId,
    error_message: errorMessage,
    sent_by_user_id: input.sentByUserId ?? null,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  });
  return !error;
}

function normalizeCcRecipients(values: string[], primaryRecipient: string) {
  const seen = new Set<string>();
  return values.flatMap((value) => value.split(/[;,]/)).map((value) => value.trim().toLowerCase()).filter((value) => {
    if (!value || value === primaryRecipient || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isConcurrentIdempotencyError(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const name = "name" in payload ? payload.name : "error" in payload ? payload.error : null;
  return name === "concurrent_idempotent_requests";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getProviderDiagnostic(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const maybeMessage = "message" in payload ? payload.message : null;
    const maybeError = "error" in payload ? payload.error : null;

    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }

    if (typeof maybeError === "string") {
      return maybeError;
    }
  }

  return `Email provider returned HTTP ${status}.`;
}

function getProviderErrorMessage(status: number) {
  if (status === 401 || status === 403) return "Email delivery was rejected by the configured provider account. Check the email configuration before retrying.";
  if (status === 429) return "Email delivery is temporarily rate-limited. Your draft is still here; wait a moment and try again.";
  if (status >= 500) return "The email provider is temporarily unavailable. Your draft is still here; please try again.";
  return "The email provider rejected this message. Check the recipient and draft, then try again.";
}
