"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Banknote, Building2, CreditCard, Mail } from "lucide-react";

type Preference = "ach" | "card" | "cash_check_pickup" | "check_mail";
type CardReview = {
  cardFundingType: "credit" | "debit" | "prepaid" | "unknown";
  grossChargeCents: number;
  invoicePrincipalCents: number;
  reviewId: string;
  surchargeCents: number;
  surchargeEligible: boolean;
};

export function InvoicePortalPaymentChooser({
  amountDueCents,
  cardEnabled,
  invoiceNumber,
  mailingAddress,
  onlinePaymentEnabled,
  selectedPreference,
  stripePublishableKey,
  surchargeBps,
  surchargeEnabled,
  token,
}: {
  amountDueCents: number;
  cardEnabled: boolean;
  invoiceNumber: string;
  mailingAddress: string | null;
  onlinePaymentEnabled: boolean;
  selectedPreference: Preference | null;
  stripePublishableKey: string | null;
  surchargeBps: number;
  surchargeEnabled: boolean;
  token: string;
}) {
  const [preference, setPreference] = useState<Preference>(selectedPreference ?? "ach");
  const [message, setMessage] = useState("");
  const [messageStatus, setMessageStatus] = useState<"error" | "success">("success");
  const [pending, setPending] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const stripePromise = useMemo(() => stripePublishableKey ? loadStripe(stripePublishableKey) : null, [stripePublishableKey]);
  const onlineUnavailable = preference === "ach" ? !onlinePaymentEnabled : preference === "card" ? !onlinePaymentEnabled || !cardEnabled : false;

  async function submitChoice() {
    if (pending || onlineUnavailable) return;
    setMessage("");

    if (preference === "card") {
      setShowCardForm(true);
      return;
    }

    if (preference === "ach") {
      setPending(true);
      try {
        const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method: "ach" }),
        });
        const body = await response.json().catch(() => null) as { message?: string; ok?: boolean; url?: string } | null;
        if (!response.ok || !body?.ok || !body.url) throw new Error(body?.message ?? "Secure bank checkout is not available right now.");
        window.location.assign(body.url);
      } catch (error) {
        setMessageStatus("error");
        setMessage(error instanceof Error ? error.message : "Secure bank checkout is not available right now.");
      } finally {
        setPending(false);
      }
      return;
    }

    setPending(true);
    try {
      const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/payment-preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preference }),
      });
      const body = await response.json().catch(() => null) as { message?: string; notificationFailed?: boolean; ok?: boolean } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.message ?? "Your check preference could not be saved right now.");
      setMessageStatus("success");
      const isPickup = preference === "cash_check_pickup";
      setMessage(body.notificationFailed
        ? `Your ${isPickup ? "pickup request" : "mail preference"} was saved, but our email notice could not be sent. Please call (540) 388-8715 with any questions.`
        : isPickup
          ? "Thanks. Our office has been notified that you would like us to arrange pickup. No payment has been recorded yet."
          : "Thanks. Our office has been notified that you plan to mail a check.");
    } catch (error) {
      setMessageStatus("error");
      setMessage(error instanceof Error ? error.message : "Your check preference could not be saved right now.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="invoice-payment-chooser">
      <fieldset disabled={pending}>
        <legend>Payment options</legend>
        <p className="invoice-payment-intro">Choose the payment method that works best for you.</p>
        <div className="invoice-payment-options">
          <PaymentOption
            checked={preference === "card"}
            description={`A ${formatRate(surchargeBps)} surcharge applies to eligible credit-card payments. Debit and prepaid cards are not surcharged.`}
            disabled={!cardEnabled}
            icon={<CreditCard aria-hidden="true" size={24} />}
            label="Pay by card"
            name="payment-preference"
            onChange={() => select("card")}
            value="card"
          />
          <PaymentOption
            checked={preference === "ach"}
            description="Securely pay this invoice from your bank account through Stripe. Bank payments may take several business days to settle."
            icon={<Building2 aria-hidden="true" size={24} />}
            label="Pay by bank account"
            name="payment-preference"
            onChange={() => select("ach")}
            recommended
            value="ach"
          />
          <PaymentOption
            checked={preference === "cash_check_pickup"}
            description="Ask our office to arrange pickup of cash or a check. This does not mark the invoice paid until payment is received."
            icon={<Banknote aria-hidden="true" size={24} />}
            label="Cash or check pickup"
            name="payment-preference"
            onChange={() => select("cash_check_pickup")}
            value="cash_check_pickup"
          />
          <PaymentOption
            checked={preference === "check_mail"}
            description="Mail a check using the instructions below. This does not mark the invoice paid until the check is received."
            icon={<Mail aria-hidden="true" size={24} />}
            label="Mail a check"
            name="payment-preference"
            onChange={() => select("check_mail")}
            value="check_mail"
          />
        </div>
      </fieldset>

      {preference === "card" ? (
        <p className="invoice-payment-disclosure">
          A {formatRate(surchargeBps)} credit-card surcharge applies only to eligible US credit cards. Debit, prepaid, unknown-funding, and non-US cards are not surcharged. You will review the exact total before authorizing payment.
        </p>
      ) : null}
      {preference === "check_mail" ? (
        <div className="invoice-mailing-instructions">
          <strong>Mailing instructions</strong>
          <p>{mailingAddress ?? "Contact our office at (540) 388-8715 for the current mailing address."}</p>
          <p>Please include invoice {invoiceNumber} on your check.</p>
        </div>
      ) : null}
      {preference === "cash_check_pickup" ? (
        <div className="invoice-mailing-instructions">
          <strong>Pickup request</strong>
          <p>Confirm this choice and our office will contact you to arrange pickup.</p>
          <p>Please do not send cash through the mail.</p>
        </div>
      ) : null}
      {(preference === "ach" || preference === "card") && !onlinePaymentEnabled ? (
        <p className="form-message error">Online payment is not configured. Please mail a check or contact our office.</p>
      ) : null}

      {preference === "card" && showCardForm && cardEnabled && stripePromise ? (
        <Elements
          options={{
            amount: amountDueCents,
            appearance: { theme: "stripe", variables: { borderRadius: "6px", colorPrimary: "#174b32", fontSizeBase: "17px" } },
            currency: "usd",
            mode: "payment",
            paymentMethodCreation: "manual",
            paymentMethodTypes: ["card"],
          }}
          stripe={stripePromise}
        >
          <CardPaymentFlow amountDueCents={amountDueCents} surchargeEnabled={surchargeEnabled} token={token} />
        </Elements>
      ) : (
        <button className="invoice-payment-continue" disabled={pending || onlineUnavailable} onClick={submitChoice} type="button">
          {pending ? "Please wait..." : preference === "card" ? "Pay by card" : preference === "ach" ? "Pay by bank account" : preference === "cash_check_pickup" ? "Request payment pickup" : "Confirm check payment choice"}
        </button>
      )}

      <p className="invoice-payment-stripe-note">Online payment details are entered securely through Stripe. Angel Tree Services never receives your card or bank-account numbers.</p>
      {message ? <p className={`form-message ${messageStatus}`} role={messageStatus === "error" ? "alert" : "status"}>{message}</p> : null}
    </div>
  );

  function select(value: Preference) {
    setPreference(value);
    setMessage("");
    setShowCardForm(false);
  }
}

function CardPaymentFlow({ amountDueCents, surchargeEnabled, token }: { amountDueCents: number; surchargeEnabled: boolean; token: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [review, setReview] = useState<CardReview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function reviewPayment() {
    if (!stripe || !elements || pending) return;
    setPending(true);
    setError("");
    try {
      const submitted = await elements.submit();
      if (submitted.error) throw new Error(submitted.error.message ?? "Check your card details and try again.");
      const tokenResult = await stripe.createConfirmationToken({ elements });
      if (tokenResult.error || !tokenResult.confirmationToken) throw new Error(tokenResult.error?.message ?? "Your card could not be reviewed.");
      const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/card/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationTokenId: tokenResult.confirmationToken.id }),
      });
      const body = await response.json().catch(() => null) as { message?: string; ok?: boolean; review?: CardReview } | null;
      if (!response.ok || !body?.ok || !body.review) throw new Error(body?.message ?? "Your card payment could not be reviewed.");
      setReview(body.review);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your card payment could not be reviewed.");
    } finally {
      setPending(false);
    }
  }

  async function authorizePayment() {
    if (!stripe || !review || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/portal/invoice/${encodeURIComponent(token)}/card/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.reviewId }),
      });
      const body = await response.json().catch(() => null) as { clientSecret?: string | null; message?: string; ok?: boolean; status?: string } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.message ?? "Your card payment could not be completed.");
      if (body.status === "requires_action" && body.clientSecret) {
        const nextAction = await stripe.handleNextAction({ clientSecret: body.clientSecret });
        if (nextAction.error) throw new Error(nextAction.error.message ?? "Card verification could not be completed.");
      }
      window.location.assign(`${window.location.pathname}?payment=processing`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your card payment could not be completed. Please try again.");
      setReview(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="invoice-card-payment-flow" aria-labelledby="card-payment-heading">
      <h3 id="card-payment-heading">Secure card details</h3>
      {!review ? (
        <>
          <PaymentElement options={{ layout: "tabs", wallets: { applePay: "never", googlePay: "never" } }} />
          <button className="invoice-payment-continue" disabled={!stripe || pending} onClick={reviewPayment} type="button">
            {pending ? "Reviewing card..." : "Review card payment"}
          </button>
        </>
      ) : (
        <div className="invoice-card-review" aria-live="polite">
          <div>
            <p className="surface-label">Final payment review</p>
            <h3>Review the amount before authorizing</h3>
            <p>{fundingMessage(review.cardFundingType, review.surchargeEligible, surchargeEnabled)}</p>
          </div>
          <dl>
            <div><dt>Invoice balance</dt><dd>{money(review.invoicePrincipalCents)}</dd></div>
            <div><dt>{review.surchargeEligible ? "Credit-card surcharge" : "Card surcharge"}</dt><dd>{money(review.surchargeCents)}</dd></div>
            <div className="invoice-card-review-total"><dt>Total charged</dt><dd>{money(review.grossChargeCents)}</dd></div>
          </dl>
          <button className="invoice-payment-continue" disabled={pending} onClick={authorizePayment} type="button">
            {pending ? "Authorizing payment..." : `Authorize ${money(review.grossChargeCents)}`}
          </button>
          <button className="invoice-card-change" disabled={pending} onClick={() => setReview(null)} type="button">Use a different card</button>
        </div>
      )}
      {error ? <p className="form-message error" role="alert">{error}</p> : null}
      <p className="invoice-card-security-note">The final amount shown above is calculated from the current invoice balance on our server.</p>
    </section>
  );
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

function fundingMessage(funding: CardReview["cardFundingType"], surchargeEligible: boolean, surchargeEnabled: boolean) {
  if (surchargeEligible) return "Stripe identified an eligible credit card. The credit-card surcharge is itemized below.";
  if (funding === "debit") return "Stripe identified a debit card. No card surcharge applies.";
  if (funding === "prepaid") return "Stripe identified a prepaid card. No card surcharge applies.";
  if (funding === "unknown") return "Stripe could not confirm the funding type. No card surcharge applies.";
  return surchargeEnabled ? "This card is not eligible for a surcharge." : "Card surcharging is disabled. No card surcharge applies.";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(cents / 100);
}

function formatRate(bps: number) {
  return `${bps / 100}%`;
}
