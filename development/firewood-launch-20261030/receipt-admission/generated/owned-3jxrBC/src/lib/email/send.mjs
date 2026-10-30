import "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/server.stub.mjs";
import { getEmailProviderConfig, getEmailSetupState } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/config.stub.mjs";
import { getServiceRoleClient } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/admin.stub.mjs";
import { withDeadline } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/src/lib/runtime/deadline.mjs";
import { completeDeliveryFollowups } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/followups.stub.mjs";
import { sendDurableEmail } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/src/lib/email/delivery.mjs";
import { allowReceiptAtProviderBoundary } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-3jxrBC/src/lib/email/firewood-receipt-admission.mjs";
export async function sendTransactionalEmail(input) {
    const setup = getEmailSetupState();
    const db = getServiceRoleClient();
    const result = await sendDurableEmail(input, { db, envelope: { from: setup.from, replyTo: setup.replyTo }, configured: setup.configured, transport: sendEmailTransport });
    return result.ok && result.deliveryId && db ? completeDeliveryFollowups(db, result.deliveryId, result) : result;
}
// Transport alone is used by the durable dispatcher; callers use the outbox.
export async function sendEmailTransport(input) {
    const recipient = input.to.trim().toLowerCase();
    if (!isValidEmail(recipient)) {
        const message = "Recipient email address is missing or invalid.";
        const historyRecorded = await logEmailEvent(input, "failed", null, message);
        return { outcome: "not_attempted", ok: false, configured: true, historyRecorded, message, providerMessageId: null, retryable: false };
    }
    if (input.idempotencyKey && (input.idempotencyKey.length > 256 || !/^[\x21-\x7e]+$/.test(input.idempotencyKey))) {
        return { outcome: "not_attempted", ok: false, configured: true, historyRecorded: false, providerMessageId: null, retryable: false, message: "The saved email request is invalid. Review this draft before sending." };
    }
    const ccRecipients = normalizeCcRecipients(input.cc ?? [], recipient);
    const invalidCc = ccRecipients.find((email) => !isValidEmail(email));
    if (invalidCc) {
        const message = "One or more CC email addresses are invalid.";
        const historyRecorded = await logEmailEvent(input, "failed", null, message, recipient);
        return { outcome: "not_attempted", ok: false, configured: true, historyRecorded, message, providerMessageId: null, retryable: false };
    }
    const config = getEmailProviderConfig();
    if (!config) {
        const message = "Email sending is not configured. Drafts are still available.";
        const historyRecorded = await logEmailEvent(input, "failed", null, message);
        return { outcome: "not_attempted", ok: false, configured: false, historyRecorded, message, providerMessageId: null, retryable: false };
    }
    if (!await allowReceiptAtProviderBoundary(input, input.emailType === 'payment_confirmation' || input.deliveryId != null ? getServiceRoleClient() : null)) {
        return { outcome: 'not_attempted', ok: false, configured: true, historyRecorded: false,
            providerMessageId: null, retryable: false, message: 'This saved receipt is held for review. No new email was sent.' };
    }
    let delivery;
    let attempted = false;
    try {
        delivery = await withDeadline(async (signal) => {
            attempted = true;
            const response = await fetch("https://api.resend.com/emails", {
                method: "POST", signal, redirect: "error",
                headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json",
                    ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}) },
                body: JSON.stringify({ from: input.frozenEnvelope?.from ?? config.from, to: [recipient], ...(ccRecipients.length ? { cc: ccRecipients } : {}),
                    reply_to: input.frozenEnvelope?.replyTo ?? config.replyTo, ...(input.deliveryId ? { tags: [{ name: "crm_delivery_id", value: input.deliveryId }] } : {}), subject: input.subject, text: input.text, html: input.html }),
            });
            const parsed = await response.json().catch(() => null);
            return { status: response.status, ok: response.ok, payload: parsed && typeof parsed === "object" ? parsed : {} };
        }, Math.min(10_000, Math.max(1, input.timeoutMs ?? 10_000)), input.signal);
    }
    catch {
        const message = attempted
            ? "Delivery could not be confirmed. The email may have been accepted. Review provider history before sending again."
            : "The send was cancelled before contacting the email provider.";
        const historyRecorded = await logEmailEvent(input, "failed", null, attempted ? "provider_outcome_unknown" : "cancelled_before_send", recipient);
        return { outcome: attempted ? "unknown" : "not_attempted", ok: false, configured: true, historyRecorded, message, providerMessageId: null, retryable: false };
    }
    if (!delivery.ok) {
        const historyRecorded = await logEmailEvent(input, "failed", null, `provider_http_${delivery.status}`, recipient);
        return { outcome: "rejected", rejectionStatus: delivery.status, ok: false, configured: true, historyRecorded,
            message: getProviderErrorMessage(delivery.status), providerMessageId: null,
            retryable: delivery.status === 429 || delivery.status >= 500 || isConcurrentIdempotencyError(delivery.payload) };
    }
    const providerMessageId = typeof delivery.payload.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(delivery.payload.id) ? delivery.payload.id : null;
    if (!providerMessageId) {
        const historyRecorded = await logEmailEvent(input, "failed", null, "provider_outcome_unknown", recipient);
        return { outcome: "unknown", ok: false, configured: true, historyRecorded, providerMessageId: null, retryable: false,
            message: "The provider response could not confirm delivery. Review provider history before sending again." };
    }
    // Recording history is separate from transport: its failure never turns an accepted email into a retryable send.
    const historyRecorded = await logEmailEvent(input, "sent", providerMessageId, null, recipient);
    return { outcome: "accepted", ok: true, configured: true, historyRecorded, providerMessageId, retryable: false,
        message: historyRecorded ? "Email accepted by the provider and recorded in delivery history."
            : "Email accepted by the provider, but CRM delivery history needs review. Do not send it again." };
}
export async function recordEmailEvent(input) {
    return logEmailEvent({
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
    }, input.status, input.providerMessageId ?? null, input.errorMessage ?? null);
}
async function logEmailEvent(input, status, providerMessageId, errorMessage, recipientOverride) {
    if (input.skipLegacyHistory)
        return false;
    try {
        const supabase = input.supabase ?? getServiceRoleClient();
        if (!supabase) {
            return false;
        }
        const recipientEmail = (recipientOverride ?? input.to.trim().toLowerCase()) || "unknown";
        const result = await withDeadline(async (signal) => {
            let query = supabase.from("email_events").insert({
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
            if (typeof query.abortSignal === "function")
                query = query.abortSignal(signal);
            return await query;
        }, 5_000);
        return !result.error;
    }
    catch {
        return false;
    }
}
function normalizeCcRecipients(values, primaryRecipient) {
    const seen = new Set();
    return values.flatMap((value) => value.split(/[;,]/)).map((value) => value.trim().toLowerCase()).filter((value) => {
        if (!value || value === primaryRecipient || seen.has(value))
            return false;
        seen.add(value);
        return true;
    });
}
function isConcurrentIdempotencyError(payload) {
    if (!payload || typeof payload !== "object")
        return false;
    const name = "name" in payload ? payload.name : "error" in payload ? payload.error : null;
    return name === "concurrent_idempotent_requests";
}
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function getProviderErrorMessage(status) {
    if (status === 401 || status === 403)
        return "Email delivery was rejected by the configured provider account. Check the email configuration before retrying.";
    if (status === 429)
        return "Email delivery is temporarily rate-limited. Your draft is still here; wait a moment and try again.";
    if (status >= 500)
        return "The email provider is temporarily unavailable. Your draft is still here; please try again.";
    return "The email provider rejected this message. Check the recipient and draft, then try again.";
}
