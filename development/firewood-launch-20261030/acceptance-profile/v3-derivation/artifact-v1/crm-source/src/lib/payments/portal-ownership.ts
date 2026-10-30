type PortalOwnershipRecord = {
  customer_id: string | null;
  id: string;
  organization_id: string | null;
};

export function portalPaymentOwnershipIsValid({
  customerExists,
  invoice,
  organizationExists,
  token,
}: {
  customerExists: boolean;
  invoice: PortalOwnershipRecord;
  organizationExists: boolean;
  token: PortalOwnershipRecord;
}) {
  const invoiceHasExactlyOneParty = (invoice.customer_id === null) !== (invoice.organization_id === null);
  return invoiceHasExactlyOneParty
    && token.id === invoice.id
    && token.customer_id === invoice.customer_id
    && token.organization_id === invoice.organization_id
    && (invoice.customer_id === null || customerExists)
    && (invoice.organization_id === null || organizationExists);
}
