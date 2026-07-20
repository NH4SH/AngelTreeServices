import "server-only";

export type InvoicePaymentPreference = "ach" | "card" | "cash_check_pickup" | "check_mail";
export type OnlinePaymentChannel = Extract<InvoicePaymentPreference, "ach" | "card">;

const preferences = new Set<InvoicePaymentPreference>(["ach", "card", "cash_check_pickup", "check_mail"]);

export function isInvoicePaymentPreference(value: unknown): value is InvoicePaymentPreference {
  return typeof value === "string" && preferences.has(value as InvoicePaymentPreference);
}

export function isOnlinePaymentChannel(value: unknown): value is OnlinePaymentChannel {
  return value === "ach" || value === "card";
}

export function getInvoicePaymentConfiguration() {
  const surchargeBps = parseSurchargeBps(process.env.STRIPE_CREDIT_SURCHARGE_BPS);
  const surchargeEnabled = process.env.STRIPE_SURCHARGE_ENABLED === "true";
  const unsurchargedCardEnabled = process.env.STRIPE_UNSURCHARGED_CARD_ENABLED === "true";
  const configuredPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim()
    || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
    || null;
  const stripePublishableKey = configuredPublishableKey && /^pk_(test|live)_/.test(configuredPublishableKey)
    ? configuredPublishableKey
    : null;

  return {
    achEnabled: true,
    businessCheckMailingAddress: process.env.BUSINESS_CHECK_MAILING_ADDRESS?.trim() || null,
    cardEnabled: Boolean(stripePublishableKey) && (surchargeEnabled || unsurchargedCardEnabled),
    stripePublishableKey,
    surchargeBps,
    surchargeEnabled,
    surchargeRequested: surchargeEnabled,
    unsurchargedCardEnabled,
  };
}

function parseSurchargeBps(value?: string) {
  if (!value) {
    return 300;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 300 ? parsed : 300;
}

export function paymentPreferenceLabel(preference: InvoicePaymentPreference) {
  return {
    ach: "Bank account (ACH)",
    card: "Debit or credit card",
    cash_check_pickup: "Cash or check pickup",
    check_mail: "Mail a check",
  }[preference];
}
