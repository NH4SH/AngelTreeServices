"use client";

import { useActionState } from "react";
import { CircleDollarSign } from "lucide-react";
import { recordManualPayment, type ManualPaymentActionState } from "@/lib/actions/payments";

const initialState: ManualPaymentActionState = { status: "idle", message: "" };

export function ManualPaymentForm({ balanceDueCents, invoiceId }: { balanceDueCents: number; invoiceId: string }) {
  const [state, formAction, pending] = useActionState(recordManualPayment, initialState);

  return (
    <form action={formAction} className="crm-form manual-payment-form">
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <div className="form-grid-two">
        <label>
          Amount
          <input defaultValue={(balanceDueCents / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" />
        </label>
        <label>
          Payment date
          <input defaultValue={new Date().toISOString().slice(0, 10)} name="payment_date" required type="date" />
        </label>
      </div>
      <div className="form-grid-two">
        <label>
          Method
          <select defaultValue="check" name="payment_method">
            <option value="check">Check</option>
            <option value="cash">Cash</option>
            <option value="ach">ACH</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Reference
          <input name="reference" placeholder="Check number or reference" />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" placeholder="Optional internal payment note" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <CircleDollarSign aria-hidden="true" size={17} />
        {pending ? "Recording payment..." : "Record manual payment"}
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}
    </form>
  );
}
