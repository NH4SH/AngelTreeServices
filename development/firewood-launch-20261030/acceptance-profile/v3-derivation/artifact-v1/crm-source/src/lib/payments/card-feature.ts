export function cardPaymentFeatureEnabled({
  hasPublishableKey,
  surchargeEnabled,
  unsurchargedCardEnabled,
}: {
  hasPublishableKey: boolean;
  surchargeEnabled: boolean;
  unsurchargedCardEnabled: boolean;
}) {
  return hasPublishableKey && (surchargeEnabled || unsurchargedCardEnabled);
}
