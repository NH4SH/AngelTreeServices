"use client";

import { useState, type ReactNode } from "react";
import { Banknote, Building2, CreditCard, Mail } from "lucide-react";

type Preference = "ach" | "card" | "cash_check_pickup" | "check_mail";

export function InvoicePortalPaymentChooser({
  cardEnabled,
  mailingAddress,
  onlinePaymentEnabled,
  selectedPreference,
  token,
}: {
  cardEnabled: boolean;
  mailingAddress: string | null;
  onlinePaymentEnabled: boolean;
  selectedPreference: Preference | null;
  token: string;
}) {
  const [preference, setPreference] = useState<Preference>(selectedPreference ?? "ach");
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState<"error" | "success">("success");
  const [pending, setPending] = useState(false);

  const onlineUnavailable = preference === "ach" ? !onlinePaymentEnabled : !onlinePaymentEnabled || !cardEnabled;

  async function submitChoice() {
    if (pending || onlineUnavailable && (preference === "ach" || preference === "card")) {
      return;
    }

    setPending(true);
    setMessage("");
    try {
      if (preference === "ach" || preference === "card") {
        const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: preference }),
        });
        const body = await response.json().catch(() => null) as { message?: string; ok?: boolean; url?: string } | null;
        if (!response.ok || !body?.ok || !body.url) {
          throw new Error(body?.message ?? "Secure checkout is not available right now. Please try again later.");
        }
        window.location.assign(body.url);
        return;
      }

      const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/payment-preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preference }),
      });
      const body = await response.json().catch(() => null) as { message?: string; notificationFailed?: boolean; ok?: boolean } | null;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.message ?? "Your payment preference could not be saved right now.");
      }

      setMessageStatus("success");
      setMessage(preference === "cash_check_pickup"
        ? body.notificationFailed
          ? "Your pickup preference was saved, but our email notice could not be sent. Please call (540) 388-8715 so we can coordinate."
          : "Thanks. Our office has been notified that you would like to arrange cash or check pickup. We’ll contact you to coordinate."
        : body.notificationFailed
          ? "Your mail preference was saved, but our email notice could not be sent. Please call (540) 388-8715 with any questions."
          : "Thanks. Our office has been notified that you plan to mail a check.");
    } catch (error) {
      setMessageStatus("error");
      setMessage(error instanceof Error ? error.message : "Your payment preference could not be saved right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="invoice-payment-chooser">
      <fieldset disabled={pending}>
        <legend>How would you like to pay?</legend>
        <p className="invoice-payment-intro">Choose one option. Selecting pickup or mail does not mark this invoice paid.</p>
        <div className="invoice-payment-options">
          <PaymentOption
            checked={preference === "ach"}
            description="Pay securely from your bank account with no card surcharge. Bank payments may take several business days to clear."
            icon={<Building2 aria-hidden="true" size={22} />}
            label="Bank account (ACH)"
            name="payment-preference"
            onChange={() => select("ach")}
            recommended
            value="ach"
          />
          <PaymentOption
            checked={preference === "card"}
            description={cardEnabled
              ? "Pay securely by debit or credit card. This approved flow does not add a surcharge."
              : "Card payment is temporarily unavailable while surcharge compliance and Stripe eligibility are finalized."}
            disabled={!cardEnabled}
            icon={<CreditCard aria-hidden="true" size={22} />}
            label="Debit or credit card"
            name="payment-preference"
            onChange={() => select("card")}
            value="card"
          />
          <PaymentOption
            checked={preference === "cash_check_pickup"}
            description="Request that our office coordinate pickup. Selecting this option does not mark the invoice paid."
            icon={<Banknote aria-hidden="true" size={22} />}
            label="Cash or check pickup"
            name="payment-preference"
            onChange={() => select("cash_check_pickup")}
            value="cash_check_pickup"
          />
          <PaymentOption
            checked={preference === "check_mail"}
            description="Let us know that you plan to mail a check."
            icon={<Mail aria-hidden="true" size={22} />}
            label="Mail a check"
            name="payment-preference"
            onChange={() => select("check_mail")}
            value="check_mail"
          />
        </div>
      </fieldset>

      {preference === "card" && cardEnabled ? (
        <p className="invoice-payment-disclosure">No card surcharge is enabled in this Checkout flow. Card details are entered securely on Stripe.</p>
      ) : null}
      {preference === "check_mail" ? (
        <div className="invoice-mailing-instructions">
          <strong>Mailing instructions</strong>
          <p>{mailingAddress ?? "Contact our office at (540) 388-8715 for the current mailing address."}</p>
        </div>
      ) : null}
      {(preference === "ach" || preference === "card") && !onlinePaymentEnabled ? (
        <p className="form-message error">Online payment is not configured. Please choose pickup, mail, or contact our office.</p>
      ) : null}

      <button className="invoice-payment-continue" disabled={pending || onlineUnavailable && (preference === "ach" || preference === "card")} onClick={submitChoice} type="button">
        {pending ? "Please wait..." : preference === "ach" || preference === "card" ? "Continue to secure checkout" : "Confirm payment preference"}
      </button>
      <p className="invoice-payment-stripe-note">Online payment is completed on Stripe Checkout. Angel Tree Services never receives your card or bank-account details.</p>
      {message ? <p className={`form-message ${messageStatus}`} role={messageStatus === "error" ? "alert" : "status"}>{message}</p> : null}
    </div>
  );

  function select(value: Preference) {
    setPreference(value);
    setMessage("");
  }
}

function PaymentOption({ checked, description, disabled = false, icon, label, name, onChange, recommended = false, value }: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  name: string;
  onChange: () => void;
  recommended?: boolean;
  value: Preference;
}) {
  return (
    <label className={`invoice-payment-option${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
      <input checked={checked} disabled={disabled} name={name} onChange={onChange} type="radio" value={value} />
      <span className="invoice-payment-option-icon">{icon}</span>
      <span>
        <strong>{label}{recommended ? <small>Recommended</small> : null}</strong>
        <span>{description}</span>
      </span>
    </label>
  );
}
