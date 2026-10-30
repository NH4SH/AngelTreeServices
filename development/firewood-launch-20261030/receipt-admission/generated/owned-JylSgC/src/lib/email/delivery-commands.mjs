import { withDeadline } from "file:///Users/noelsierra/Documents/Codex/2026-10-30/firewood-production-install/receipt-admission/generated/owned-JylSgC/src/lib/runtime/deadline.mjs";
// Aborting a response cannot prove a transaction rolled back. Callers require a
// positive acknowledgement before sending and retain uncertain outcomes.
export async function callDeliveryCommand(db, name, args, timeoutMs = 5000) {
    try {
        return await withDeadline(async (signal) => {
            let query = db.rpc(name, args);
            if (typeof query.abortSignal === 'function')
                query = query.abortSignal(signal);
            return await query;
        }, timeoutMs);
    }
    catch {
        return { data: null, error: { code: 'DELIVERY_UNCONFIRMED', message: 'Delivery storage acknowledgement unavailable.' } };
    }
}
