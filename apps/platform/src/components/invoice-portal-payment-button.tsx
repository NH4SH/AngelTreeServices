"use client";

import { useState } from "react";
import { Banknote, Building2, CreditCard, Mail, Truck } from "lucide-react";
import {
  type PortalPaymentPreference,
  formatPortalPaymentPreference,
  isOnlinePortalPaymentMethod,
} from "@/lib/payments/portal-methods";
import styles from "./invoice-portal-payment-button.module.css";

const paymentOptions: Array<{
  badge?: string;
  description: string;
  icon: typeof CreditCard;
  value: PortalPaymentPreference;
}> = [
  {
    badge: "Recommended",
    description: "Pay securely from your bank account. No card surcharge; bank payments can take several business days to clear.",
    icon: Building2,
    value: "ach",
  },
  {
    description: "Pay securely with a debit or credit card. Debit cards are not surcharged. Eligible credit cards may include a disclosed surcharge.",
    icon: CreditCard,
    value: "card",
  },
  {
    description: "Ask our office to arrange pickup of cash or a check. Choosing this does not mark the invoice paid.",
    icon: Truck,
    value: "cash_check_pickup",
  },
  {
    description: "Tell us you plan to mail a check. Contact our office if you need the current mailing address.",
    icon: Mail,
    value: "check_mail",
  },
];

export function InvoicePortalPaymentButton({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<PortalPaymentPreference>("ach");

  async function continueWithPayment() {
    if (pending) return;

    setPending(true);
    setMessage("");

    try {
      if (isOnlinePortalPaymentMethod(selected)) {
        const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/checkout`, {
          body: JSON.stringify({ paymentMethod: selected }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        const body = await response.json().catch(() => null) as { message?: string; ok?: boolean; url?: string } | null;

        if (!response.ok || !body?.ok || !body.url) {
          setMessage(body?.message ?? "Online payment is not available right now. Please try again later.");
          setPending(false);
          return;
        }

        window.location.assign(body.url);
        return;
      }

      const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/payment-preference`, {
        body: JSON.stringify({ paymentMethod: selected }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json().catch(() => null) as { message?: string; ok?: boolean } | null;

      if (!response.ok || !body?.ok) {
        setMessage(body?.message ?? "We could not save your payment preference. Please call our office.");
        setPending(false);
        return;
      }

      setMessage(body.message ?? "Thanks. Our office has been notified of your payment preference.");
      setPending(false);
    } catch {
      setMessage("We could not continue with this payment option. Please call our office.");
      setPending(false);
    }
  }

  const selectedOption = paymentOptions.find((option) => option.value === selected) ?? paymentOptions[0];
  const actionLabel = selected === "ach"
    ? "Continue to secure bank payment"
    : selected === "card"
      ? "Continue to secure card payment"
      : "Notify Angel Tree Services";

  return (
    <div className={styles.paymentOptions}>
      <div aria-label="How would you like to pay?" className={styles.optionGrid} role="group">
        {paymentOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              aria-pressed={selected === option.value}
              className={styles.option}
              disabled={pending}
              key={option.value}
              onClick={() => {
                setSelected(option.value);
                setMessage("");
              }}
              type="button"
            >
              <span className={styles.optionHeading}>
                <strong><Icon aria-hidden="true" size={18} /> {formatPortalPaymentPreference(option.value)}</strong>
                {option.badge ? <span className={styles.badge}>{option.badge}</span> : null}
              </span>
              <p>{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className={styles.selectionDetail}>
        <p><strong>{formatPortalPaymentPreference(selectedOption.value)}</strong></p>
        <p>{selectedOption.description}</p>
      </div>

      <button className={styles.primaryAction} disabled={pending} onClick={continueWithPayment} type="button">
        {isOnlinePortalPaymentMethod(selected) ? <CreditCard aria-hidden="true" size={19} /> : <Banknote aria-hidden="true" size={19} />}
        {pending ? "Please wait..." : actionLabel}
      </button>

      <p className={styles.note}>
        Online payments are completed on Stripe Checkout. Choosing pickup or mail only notifies our office; payment is recorded after it is received.
      </p>
      {message ? (
        <p className={`${styles.message} ${message.startsWith("Thanks") ? styles.success : styles.error}`} role="status">{message}</p>
      ) : null}
    </div>
  );
}
