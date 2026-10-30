"use client";

import { useEffect, useRef, useState } from "react";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CircleDollarSign } from "lucide-react";
import { recordManualPayment, resolveManualPaymentAttempt, type ManualPaymentActionState } from "@/lib/actions/payments";
import { isManualPaymentRequestId } from "@/lib/api/mobile-invoices";
import { getBusinessDateKey } from "@/lib/business-time";

type Attempt = { requestId: string; fields: Record<string, string>; paymentId?: string };
const initialState: ManualPaymentActionState = { status: "idle", message: "" };
const fieldNames = ["invoice_id", "amount", "payment_date", "payment_method", "reference", "notes"];

export function ManualPaymentForm({ balanceDueCents, invoiceId, actorId, isUnsent = false, canRecord = true }: {
  balanceDueCents: number; invoiceId: string; actorId: string; isUnsent?: boolean; canRecord?: boolean;
}) {
  const storageKey = `ats.manual-payment.${actorId}.${invoiceId}`;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [ready, setReady] = useState(false), [storageError, setStorageError] = useState("");
  const submitting = useRef(false);
  useEffect(() => {
    setReady(false); setAttempt(null); setStorageError("");
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved);
        if (!isManualPaymentRequestId(value.requestId) || value.fields?.invoice_id !== invoiceId
          || fieldNames.some(name => typeof value.fields[name] !== "string")) throw new Error("Invalid saved attempt");
        setAttempt(value);
      }
      setReady(true);
    } catch { setStorageError("Saved payment details are unavailable. Check browser storage and the invoice payment history before recording another payment."); }
  }, [storageKey, invoiceId]);

  const [state, dispatch, pending] = useReliableActionState(async (_previous: ManualPaymentActionState, form: FormData) => {
    const result = form.get("intent") === "resolve"
      ? await resolveManualPaymentAttempt(_previous, form) : await recordManualPayment(_previous, form);
    // Keep a confirmed result across navigation as well. Only an explicit second
    // installment starts a new request; a lost result safely replays the old one.
    if (result.paymentId) {
      const confirmed = { requestId: String(form.get("request_id")), fields: fields(form), paymentId: result.paymentId };
      localStorage.setItem(storageKey, JSON.stringify(confirmed)); setAttempt(confirmed);
    } else if (result.released) {
      localStorage.removeItem(storageKey); setAttempt(null);
    }
    return result;
  }, initialState);

  async function submit(form: FormData) {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const saved = attempt ?? { requestId: crypto.randomUUID(), fields: fields(form) };
      // Write before dispatch: no network request is permitted if persistence fails.
      localStorage.setItem(storageKey, JSON.stringify(saved)); setAttempt(saved);
      await dispatch(attemptForm(saved));
    } catch { setStorageError("Keep this payment attempt. Its result could not be confirmed; check browser storage and retry the saved details."); }
    finally { submitting.current = false; }
  }
  async function resolveAttempt() {
    if (submitting.current || !attempt) return;
    submitting.current = true;
    try { await dispatch(attemptForm(attempt, "resolve")); }
    finally { submitting.current = false; }
  }
  function anotherPayment() {
    try { localStorage.removeItem(storageKey); setAttempt(null); }
    catch { setStorageError("The saved payment could not be cleared. Reload before recording another payment."); }
  }
  if (storageError) return <p className="form-message error" role="alert">{storageError}</p>;
  if (!ready || (!canRecord && !attempt)) return null;
  if (attempt?.paymentId) return <div className="manual-payment-form">
    <p className="form-message success" role="status">{state.status === "success" ? state.message : "The previous payment is confirmed."}</p>
    <details><summary>Payment reference</summary><p><code>{attempt.paymentId}</code></p></details>
    {canRecord ? <button type="button" className="secondary-action" onClick={anotherPayment}>Record another payment</button> : null}
  </div>;
  return (
    <form action={submit} className="crm-form manual-payment-form" aria-busy={pending}>
      <input name="invoice_id" type="hidden" value={invoiceId} />
      {attempt ? <>
        <p>A saved payment attempt needs confirmation. Retrying uses the same details and cannot create a second payment.</p>
        <p><strong>${Number(attempt.fields.amount).toFixed(2)}</strong> · {attempt.fields.payment_method} · {attempt.fields.payment_date}</p>
        <details><summary>Saved payment details</summary><p>Reference: {attempt.fields.reference || "None"}</p><p>Notes: {attempt.fields.notes || "None"}</p></details>
      </> : <>
        {isUnsent ? <p className="inline-empty">Record a payment received before delivery. A partial payment keeps this invoice in draft; payment in full marks it paid without marking it sent.</p> : null}
        <fieldset className="manual-payment-fields" aria-label="Payment details" disabled={pending}>
          <div className="form-grid-two">
            <label>Amount<input defaultValue={(balanceDueCents / 100).toFixed(2)} max={(balanceDueCents / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" /></label>
            <label>Payment date<input defaultValue={getBusinessDateKey(new Date())} name="payment_date" required type="date" /></label>
          </div>
          <div className="form-grid-two">
            <label>Method<select defaultValue="check" name="payment_method"><option value="check">Check</option><option value="cash">Cash</option><option value="ach">ACH</option><option value="other">Other</option></select></label>
            <label>Reference<input name="reference" maxLength={160} placeholder="Check number or reference" /></label>
          </div>
          <label>Notes<textarea name="notes" maxLength={1000} placeholder="Optional internal payment note" rows={3} /></label>
        </fieldset>
      </>}
      <button disabled={pending} type="submit"><CircleDollarSign aria-hidden="true" size={17} />{pending ? "Checking payment…" : attempt ? "Retry saved payment" : "Record manual payment"}</button>
      {attempt ? <button disabled={pending} type="button" className="secondary-action" onClick={() => void resolveAttempt()}>Check before changing details</button> : null}
      {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
function fields(form: FormData) { return Object.fromEntries(fieldNames.map(name => [name, String(form.get(name) ?? "")])); }
function attemptForm(attempt: Attempt, intent?: string) {
  const form = new FormData(); for (const [name, value] of Object.entries(attempt.fields)) form.set(name, value);
  form.set("request_id", attempt.requestId); if (intent) form.set("intent", intent); return form;
}
