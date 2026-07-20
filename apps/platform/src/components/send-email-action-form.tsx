"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
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
  portalUrl,
  quoteId,
}: {
  disabled?: boolean;
  portalUrl?: string;
  quoteId: string;
}) {
  const [state, formAction, pending] = useReliableActionState(sendQuoteEmail, initialState);

  return (
    <form action={formAction} className="send-email-action-form">
      <input name="quote_id" type="hidden" value={quoteId} />
      {portalUrl ? <input name="portal_url" type="hidden" value={portalUrl} /> : null}
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
  portalUrl,
}: {
  disabled?: boolean;
  invoiceId: string;
  portalUrl?: string;
}) {
  const [state, formAction, pending] = useReliableActionState(sendInvoiceEmail, initialState);

  return (
    <form action={formAction} className="send-email-action-form">
      <input name="invoice_id" type="hidden" value={invoiceId} />
      {portalUrl ? <input name="portal_url" type="hidden" value={portalUrl} /> : null}
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
