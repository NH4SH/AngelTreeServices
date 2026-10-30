import 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/server.stub.mjs';
import { callDeliveryCommand } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/email/delivery-commands.mjs';
import { withDeadline } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/runtime/deadline.mjs';
import { readReleasedContext } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/context.stub.mjs';
import { isLiveFirewoodInvoice } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/firewood/handoff/live-collector.mjs';
import { createFirewoodReceiptSourceGate } from 'file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-zDiLgz/src/lib/firewood/handoff/receipt-source-gate.mjs';
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const held = 'This saved receipt is held for review. No new email was sent.';
const sameIdentity = (a, b) => Boolean(a && b
    && a.email_type === b.email_type && (a.payment_id ?? null) === (b.payment_id ?? null)
    && (a.invoice_id ?? null) === (b.invoice_id ?? null));
function receiptReader(db) {
    const readSource = async (id) => {
        const result = await withDeadline(signal => db.rpc('get_firewood_live_collector_context', { p_invoice: id }).abortSignal(signal), 5000);
        if (result.error || !result.data || typeof result.data.managed !== 'boolean')
            throw Error('receipt_source_unconfirmed');
        return result.data;
    };
    const readPayment = async (id) => {
        if (!uuid(id))
            throw Error('receipt_payment_unconfirmed');
        const result = await withDeadline(signal => db.from('payments').select('id,invoice_id,status').eq('id', id).abortSignal(signal).maybeSingle(), 5000);
        if (result.error || result.data?.id !== id || !uuid(result.data.invoice_id))
            throw Error('receipt_payment_unconfirmed');
        return result.data;
    };
    const readInvoice = async (id) => {
        if (!uuid(id))
            throw Error('receipt_invoice_unconfirmed');
        const result = await withDeadline(signal => db.from('invoices').select('id,invoice_number,document_terms_version').eq('id', id).abortSignal(signal).maybeSingle(), 5000);
        if (result.error || result.data?.id !== id)
            throw Error('receipt_invoice_unconfirmed');
        // A registered handoff cannot disguise itself as an ordinary invoice by losing a marker.
        // Only a positive native unmanaged classification preserves the ordinary receipt path.
        const source = await readSource(id);
        if (!isLiveFirewoodInvoice(result.data) && source.managed !== false)
            throw Error('receipt_live_marker_unconfirmed');
        return result.data;
    };
    const gate = createFirewoodReceiptSourceGate({ readSendingContext: readReleasedContext,
        readPayment, readInvoice, readCollectorContext: readSource });
    return { gate, readPayment, readInvoice };
}
async function savedDelivery(db, id) {
    if (!uuid(id))
        return null;
    const result = await callDeliveryCommand(db, 'get_outbound_delivery', { p_delivery_id: id });
    return !result.error && result.data?.id === id && typeof result.data.context?.email_type === 'string' ? result.data : null;
}
// Called before the actual claim. Inputs are read from the saved row, never trusted from a caller.
export async function inspectSavedReceiptBeforeClaim(db, id) {
    let row = null;
    try {
        row = await savedDelivery(db, id);
        if (!row)
            return { ok: false, row, message: held, beforeTransport: async () => false };
        // Already accepted/uncertain rows keep the existing no-resend/repair path without a source gate.
        if (row.state !== 'prepared' && !(row.state === 'rejected' && row.retry_authorized))
            return { ok: true, row, message: held, beforeTransport: async () => false };
        const context = row.context, reader = receiptReader(db);
        const before = await reader.gate.beforeClaim(id, context);
        return { ok: before.ok, row, message: held, beforeTransport: async (claim) => {
                try {
                    if (claim.id !== id || !sameIdentity(context, claim.context))
                        return false;
                    if (before.managed)
                        return (await reader.gate.beforeTransport(id, claim.context, before.ticket)).ok;
                    const after = await reader.gate.beforeClaim(id, claim.context);
                    return after.ok && !after.managed;
                }
                catch {
                    return false;
                }
            } };
    }
    catch {
        return { ok: false, row, message: held, beforeTransport: async () => false };
    }
}
// A second independent check at the actual provider boundary protects direct internal transport
// callers too. No provider call, claim, reset, history write or outcome classification occurs here.
export async function allowReceiptAtProviderBoundary(input, db) {
    if (input.emailType !== 'payment_confirmation')
        return true;
    if (!db)
        return false;
    try {
        const reader = receiptReader(db);
        if (!uuid(input.deliveryId)) {
            // Retain legacy direct transport for positively identified ordinary payments only.
            const payment = await reader.readPayment(input.relatedPaymentId);
            if (input.relatedInvoiceId != null && input.relatedInvoiceId !== payment.invoice_id)
                return false;
            const invoice = await reader.readInvoice(payment.invoice_id);
            return !isLiveFirewoodInvoice(invoice);
        }
        const row = await savedDelivery(db, input.deliveryId);
        const context = { kind: 'receipt', email_type: input.emailType,
            payment_id: input.relatedPaymentId, invoice_id: input.relatedInvoiceId };
        if (!row || !sameIdentity(row.context, context))
            return false;
        const before = await reader.gate.beforeClaim(input.deliveryId, row.context);
        if (!before.ok)
            return false;
        if (!before.managed)
            return true;
        const p = row.payload;
        if (row.state !== 'dispatching' || !uuid(row.attempt_id) || !p || input.skipLegacyHistory !== true
            || row.provider_key !== input.idempotencyKey || input.to !== p.to?.[0]
            || JSON.stringify(input.cc ?? []) !== JSON.stringify(p.cc) || input.subject !== p.subject
            || input.text !== p.text || (input.html ?? null) !== (p.html ?? null)
            || input.frozenEnvelope?.from !== p.from || input.frozenEnvelope?.replyTo !== p.reply_to)
            return false;
        return (await reader.gate.beforeTransport(input.deliveryId, row.context, before.ticket)).ok;
    }
    catch {
        return false;
    }
}
