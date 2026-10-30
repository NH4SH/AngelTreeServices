import "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/server.stub.mjs";
import { callDeliveryCommand } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/email/delivery-commands.mjs";
import { emailDeliveryContext } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/email/delivery-context.mjs";
import { inspectSavedReceiptBeforeClaim } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/email/firewood-receipt-admission.mjs";
import { createHash } from "node:crypto";
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const unresolved = "Delivery needs review before another email is sent. Open Delivery review to check provider evidence or repair CRM history.";
export function freezeEmailPayload(input, envelope) {
    const to = input.to.trim().toLowerCase();
    const cc = [...new Set((input.cc ?? []).flatMap(v => v.split(/[;,]/)).map(v => v.trim().toLowerCase()).filter(v => v && v !== to))];
    return { from: envelope.from, reply_to: envelope.replyTo, to: [to], cc, subject: input.subject, text: input.text, ...(input.html ? { html: input.html } : {}) };
}
export function deliveryResult(row, extra = {}) {
    const accepted = row?.state === 'accepted';
    const unknown = Boolean(row && ['dispatching', 'unknown'].includes(row.state));
    const complete = accepted && row?.repair_state === 'complete' && row?.history_recorded === true && !row?.followup_sync_pending;
    return { outcome: accepted ? 'accepted' : unknown ? 'unknown' : 'not_attempted', ok: accepted, configured: true, historyRecorded: row?.history_recorded === true,
        providerMessageId: row?.provider_message_id ?? null, retryable: false, deliveryId: row?.id, sourceCommunicationId: row?.context?.communication_id ?? null,
        sourceReconciled: complete, message: complete ? 'Email accepted and CRM history reconciled.' : accepted ? 'Email accepted. CRM history needs review; do not send it again.' : unresolved, ...extra };
}
export async function sendDurableEmail(input, options) {
    if (!options.db)
        return deliveryResult(null, { message: 'Delivery storage is unavailable. No email was sent.', configured: options.configured });
    const context = emailDeliveryContext(input), payload = freezeEmailPayload(input, options.envelope);
    const key = input.idempotencyKey ?? `email/${createHash('sha256').update(JSON.stringify([context, payload])).digest('hex')}`;
    try {
        const prepared = await callDeliveryCommand(options.db, 'prepare_outbound_delivery', { p_request_key: key, p_payload: payload, p_context: context, p_expected_snapshot: input.expectedSourceSnapshot ?? null });
        if (prepared.error || !uuid(prepared.data?.id) || typeof prepared.data.conflict !== 'boolean')
            return deliveryResult(null, { message: 'The email request could not be saved safely. Reload the current record before sending.' });
        const row = prepared.data;
        if (prepared.data.conflict)
            return deliveryResult(row, { ok: false, message: row.state === 'accepted' ? 'An email for this version was already accepted. Review it before choosing to send an additional email.' : 'This saved request differs from the earlier email. Review the original delivery before sending.' });
        if (row.state !== 'prepared' && !(row.state === 'rejected' && row.retry_authorized))
            return deliveryResult(row);
        if (!options.configured)
            return deliveryResult(row, { configured: false, message: 'Email sending is not configured. The request is saved; no email was sent.' });
        return dispatchSavedEmail(row.id, options.db, options.transport, input.signal, input.timeoutMs);
    }
    catch {
        return deliveryResult(null, { message: 'The saved delivery could not be confirmed. Review Delivery review before retrying.' });
    }
}
export async function dispatchSavedEmail(id, db, transport, signal, timeoutMs) {
    let claim = null;
    try {
        const receiptAdmission = await inspectSavedReceiptBeforeClaim(db, id);
        if (!receiptAdmission.ok)
            return deliveryResult(receiptAdmission.row, { deliveryId: id, message: receiptAdmission.message });
        const claimed = await callDeliveryCommand(db, 'claim_outbound_delivery', { p_delivery_id: id });
        if (claimed.error || !uuid(claimed.data?.attempt_id)) {
            const current = await callDeliveryCommand(db, 'get_outbound_delivery', { p_delivery_id: id });
            return deliveryResult(current.error ? null : current.data, { deliveryId: id });
        }
        claim = claimed.data;
        if (!claim?.payload || !claim.context || claim.id !== id || !claim.attempt_id || typeof claim.idempotency_key !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(claim.idempotency_key)
            || !Array.isArray(claim.payload.to) || claim.payload.to.length !== 1 || typeof claim.payload.to[0] !== 'string'
            || !Array.isArray(claim.payload.cc) || typeof claim.payload.from !== 'string' || typeof claim.payload.reply_to !== 'string' || typeof claim.payload.subject !== 'string' || typeof claim.payload.text !== 'string' || typeof claim.context.email_type !== 'string')
            return deliveryResult(null, { outcome: 'unknown', deliveryId: id });
        const p = claim.payload, c = claim.context;
        let sent;
        if (!await receiptAdmission.beforeTransport(claim))
            sent = deliveryResult(null, { outcome: 'not_attempted', deliveryId: id, message: receiptAdmission.message });
        else
            try {
                sent = await transport({ to: p.to[0], cc: p.cc, subject: p.subject, text: p.text, html: p.html, emailType: c.email_type,
                    idempotencyKey: claim.idempotency_key, deliveryId: id, frozenEnvelope: { from: p.from, replyTo: p.reply_to }, skipLegacyHistory: true,
                    relatedCustomerId: c.customer_id, relatedJobId: c.job_id, relatedQuoteId: c.quote_ids?.[0], relatedInvoiceId: c.invoice_id, relatedChangeOrderId: c.change_order_id,
                    relatedOrganizationId: c.organization_id, relatedCommunicationId: c.communication_id, relatedScheduleEventId: c.schedule_event_id, relatedAppointmentId: c.appointment_id,
                    relatedPaymentId: c.payment_id, sentByUserId: c.actor_id, signal, timeoutMs });
            }
            catch {
                sent = deliveryResult(null, { outcome: 'unknown' });
            }
        const finished = await callDeliveryCommand(db, 'finish_outbound_delivery', { p_delivery_id: id, p_attempt_id: claim.attempt_id, p_outcome: sent.outcome === 'rejected' ? (sent.retryable ? 'rejected_retryable' : [400, 401, 403, 404, 405, 413, 422].includes(sent.rejectionStatus ?? 0) ? 'rejected_definite' : 'rejected') : sent.outcome, p_provider_message_id: sent.providerMessageId });
        if (finished.error || !uuid(finished.data?.id))
            return { ...sent, historyRecorded: false, sourceReconciled: false, retryable: false, deliveryId: id, message: sent.ok ? 'Email accepted, but CRM history needs repair. Do not send it again.' : unresolved };
        if (finished.data.state === 'accepted')
            return deliveryResult(finished.data);
        return { ...sent, historyRecorded: finished.data.history_recorded === true, sourceReconciled: false, retryable: finished.data.retry_authorized === true, deliveryId: id, message: sent.outcome === 'unknown' ? unresolved : sent.message };
    }
    catch {
        return deliveryResult(null, { outcome: claim ? 'unknown' : 'not_attempted', deliveryId: id, message: unresolved });
    }
}
