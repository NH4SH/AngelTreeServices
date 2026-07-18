export const portalPaymentPreferences = [
  "ach",
  "card",
  "cash_check_pickup",
  "check_mail",
] as const;

export type PortalPaymentPreference = (typeof portalPaymentPreferences)[number];
export type OnlinePortalPaymentMethod = Extract<PortalPaymentPreference, "ach" | "card">;
export type OfflinePortalPaymentMethod = Exclude<PortalPaymentPreference, OnlinePortalPaymentMethod>;

export function isPortalPaymentPreference(value: unknown): value is PortalPaymentPreference {
  return typeof value === "string" && portalPaymentPreferences.includes(value as PortalPaymentPreference);
}

export function isOnlinePortalPaymentMethod(value: unknown): value is OnlinePortalPaymentMethod {
  return value === "ach" || value === "card";
}

export function formatPortalPaymentPreference(value: PortalPaymentPreference) {
  switch (value) {
    case "ach":
      return "Bank account (ACH)";
    case "card":
      return "Debit or credit card";
    case "cash_check_pickup":
      return "Cash or check pickup";
    case "check_mail":
      return "Check by mail";
  }
}
