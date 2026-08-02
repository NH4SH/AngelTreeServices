export type QuoteLeadSourceRecord = {
  id: string;
  customer_id: string | null;
  organization_id: string | null;
  service_location_id: string;
  onsite_contact_id: string | null;
  property_manager_contact_id: string | null;
  service_type: string | null;
  requested_scope: string | null;
  website_submission_id: string | null;
  customers?: {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  organizations?: {
    id: string;
    name: string;
    billing_email: string | null;
    billing_phone: string | null;
  } | null;
  onsite_contact?: {
    id: string;
    organization_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_active: boolean;
  } | null;
  property_contact?: {
    id: string;
    organization_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_active: boolean;
  } | null;
  service_locations?: {
    id: string;
    customer_id: string | null;
    organization_id: string | null;
    label: string | null;
    street: string;
    city: string;
    state: string;
    postal_code: string | null;
    access_notes: string | null;
    service_notes: string | null;
  } | null;
};

export type QuoteLeadPrefill = {
  sourceJobId: string;
  sourceLabel: string;
  partyValue: string;
  partyName: string;
  email: string;
  phone: string;
  serviceLocationId: string;
  serviceLocation: string;
  requestedService: string;
  projectDetails: string;
  propertyNotes: string;
  recipientContactId: string;
  approvalContactId: string;
  onsiteContactId: string;
};

export function buildQuoteLeadPrefill(record: QuoteLeadSourceRecord): QuoteLeadPrefill | null {
  const isCustomerLead = Boolean(record.customer_id) && !record.organization_id;
  const isOrganizationLead = Boolean(record.organization_id) && !record.customer_id;
  const location = record.service_locations;

  if ((!isCustomerLead && !isOrganizationLead) || !location || location.id !== record.service_location_id) {
    return null;
  }

  if (isCustomerLead && (record.customers?.id !== record.customer_id || location.customer_id !== record.customer_id || location.organization_id)) {
    return null;
  }

  if (isOrganizationLead && (record.organizations?.id !== record.organization_id || location.organization_id !== record.organization_id || location.customer_id)) {
    return null;
  }

  const organizationContact = isOrganizationLead
    ? firstValidOrganizationContact(record.onsite_contact, record.property_contact, record.organization_id as string)
    : null;
  const partyName = record.customers?.display_name ?? record.organizations?.name ?? "Website lead";

  return {
    sourceJobId: record.id,
    sourceLabel: record.website_submission_id ? "From website lead" : "From CRM lead",
    partyValue: isCustomerLead ? `customer:${record.customer_id}` : `organization:${record.organization_id}`,
    partyName,
    email: record.customers?.email ?? organizationContact?.email ?? record.organizations?.billing_email ?? "",
    phone: record.customers?.phone ?? organizationContact?.phone ?? record.organizations?.billing_phone ?? "",
    serviceLocationId: location.id,
    serviceLocation: formatServiceLocation(location),
    requestedService: formatServiceType(record.service_type),
    projectDetails: record.requested_scope?.trim() ?? "",
    propertyNotes: [
      location.access_notes ? `Access: ${location.access_notes.trim()}` : "",
      location.service_notes ? `Property notes: ${location.service_notes.trim()}` : "",
    ].filter(Boolean).join("\n"),
    recipientContactId: organizationContact?.id ?? "",
    approvalContactId: organizationContact?.id ?? "",
    onsiteContactId: organizationContact?.id ?? "",
  };
}

function firstValidOrganizationContact(
  onsiteContact: QuoteLeadSourceRecord["onsite_contact"],
  propertyContact: QuoteLeadSourceRecord["property_contact"],
  organizationId: string,
) {
  return [onsiteContact, propertyContact].find(
    (contact) => contact?.is_active && contact.organization_id === organizationId,
  ) ?? null;
}

function formatServiceLocation(location: NonNullable<QuoteLeadSourceRecord["service_locations"]>) {
  const address = [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
  return location.label ? `${location.label} - ${address}` : address;
}

function formatServiceType(serviceType: string | null) {
  if (!serviceType) return "Not specified";
  return serviceType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
