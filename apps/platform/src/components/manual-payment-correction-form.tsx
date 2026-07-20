"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { RotateCcw } from "lucide-react";
import { cancelManualPayment, type ManualPaymentActionState } from "@/lib/actions/payments";

const initialState: ManualPaymentActionState = { status: "idle", message: "" };

export function ManualPaymentCorrectionForm({
  amountLabel,
  invoiceId,
  paymentId,
}: {
  amountLabel: string;
  invoiceId: string;
  paymentId: string;
}) {
  const [state, formAction, pending] = useReliableActionState(cancelManualPayment, initialState);

  return (
    <form
      action={formAction}
      className="manual-payment-correction-form"
      onSubmit={(event) => {
        if (!window.confirm(`Undo the ${amountLabel} manual payment? The payment will remain in history as cancelled and the invoice balance will be restored.`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <input name="payment_id" type="hidden" value={paymentId} />
      <button className="secondary-action destructive-soft" disabled={pending} type="submit">
        <RotateCcw aria-hidden="true" size={15} />
        {pending ? "Restoring balance..." : "Undo mistaken payment"}
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}
    </form>
  );
}
