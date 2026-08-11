"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { CircleDollarSign } from "lucide-react";
import { recordManualPayment, type ManualPaymentActionState } from "@/lib/actions/payments";
import { getBusinessDateKey } from "@/lib/business-time";

const initialState: ManualPaymentActionState = { status: "idle", message: "" };

export function ManualPaymentForm({
  balanceDueCents,
  invoiceId,
  isUnsent = false,
}: {
  balanceDueCents: number;
  invoiceId: string;
  isUnsent?: boolean;
}) {
  const [state, formAction, pending] = useReliableActionState(recordManualPayment, initialState);

  return (
    <form action={formAction} className="crm-form manual-payment-form">
      <input name="invoice_id" type="hidden" value={invoiceId} />
      {isUnsent ? (
        <p className="inline-empty">
          Record a payment received before delivery. A partial payment keeps this invoice in draft; payment in full marks it paid without marking it sent.
        </p>
      ) : null}
      <div className="form-grid-two">
        <label>
          Amount
          <input defaultValue={(balanceDueCents / 100).toFixed(2)} max={(balanceDueCents / 100).toFixed(2)} min="0.01" name="amount" required step="0.01" type="number" />
        </label>
        <label>
          Payment date
          <input defaultValue={getBusinessDateKey(new Date())} name="payment_date" required type="date" />
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
