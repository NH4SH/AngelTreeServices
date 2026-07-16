"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

export function InvoicePortalPaymentButton({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function startCheckout() {
    if (pending) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/checkout`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null) as { message?: string; ok?: boolean; url?: string } | null;

      if (!response.ok || !body?.ok || !body.url) {
        setMessage(body?.message ?? "Online payment is not available right now. Please try again later.");
        setPending(false);
        return;
      }

      window.location.assign(body.url);
    } catch {
      setMessage("Online payment is not available right now. Please try again later.");
      setPending(false);
    }
  }

  return (
    <div className="invoice-portal-payment-action">
      <button disabled={pending} onClick={startCheckout} type="button">
        <CreditCard aria-hidden="true" size={19} />
        {pending ? "Opening secure checkout..." : "Pay invoice"}
      </button>
      <p>Secure payment is completed on Stripe Checkout.</p>
      {message ? <p className="form-message error" role="alert">{message}</p> : null}
    </div>
  );
}
