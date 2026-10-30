"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { Redo2, RotateCcw } from "lucide-react";
import {
  cancelManualPayment,
  restoreCancelledManualPayment,
  type ManualPaymentActionState,
} from "@/lib/actions/payments";

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

export function ManualPaymentRestoreForm({
  amountLabel,
  invoiceId,
  paymentId,
}: {
  amountLabel: string;
  invoiceId: string;
  paymentId: string;
}) {
  const [state, formAction, pending] = useReliableActionState(restoreCancelledManualPayment, initialState);

  return (
    <form
      action={formAction}
      className="manual-payment-correction-form"
      onSubmit={(event) => {
        if (!window.confirm(`Restore the cancelled ${amountLabel} manual payment? It will count toward the invoice balance again.`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <input name="payment_id" type="hidden" value={paymentId} />
      <button className="secondary-action" disabled={pending} type="submit">
        <Redo2 aria-hidden="true" size={15} />
        {pending ? "Restoring payment..." : "Restore payment"}
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>
      ) : null}
    </form>
  );
}
