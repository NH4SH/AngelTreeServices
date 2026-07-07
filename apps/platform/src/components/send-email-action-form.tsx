"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import {
  sendInvoiceEmail,
  sendQuoteEmail,
  type TransactionalEmailActionState,
} from "@/lib/actions/transactional-email";

const initialState: TransactionalEmailActionState = {
  status: "idle",
  message: "",
};

export function SendQuoteEmailForm({
  disabled = false,
  quoteId,
}: {
  disabled?: boolean;
  quoteId: string;
}) {
  const [state, formAction, pending] = useActionState(sendQuoteEmail, initialState);

  return (
    <form action={formAction} className="send-email-action-form">
      <input name="quote_id" type="hidden" value={quoteId} />
      <button disabled={disabled || pending} type="submit">
        <Send aria-hidden="true" size={16} />
        {pending ? "Sending..." : "Send quote email"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

export function SendInvoiceEmailForm({
  disabled = false,
  invoiceId,
}: {
  disabled?: boolean;
  invoiceId: string;
}) {
  const [state, formAction, pending] = useActionState(sendInvoiceEmail, initialState);

  return (
    <form action={formAction} className="send-email-action-form">
      <input name="invoice_id" type="hidden" value={invoiceId} />
      <button disabled={disabled || pending} type="submit">
        <Send aria-hidden="true" size={16} />
        {pending ? "Sending..." : "Send invoice email"}
      </button>
      <FormMessage state={state} />
    </form>
  );
}

function FormMessage({ state }: { state: TransactionalEmailActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p className={state.status === "error" ? "form-message error" : "form-message success"} role="status">
      {state.message}
    </p>
  );
}
