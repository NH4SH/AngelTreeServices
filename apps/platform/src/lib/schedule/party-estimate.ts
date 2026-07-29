export type EstimateContactOption = {
  email: string;
  id: string;
  label: string;
  phone: string;
};

export type EstimateLocationOption = {
  accessNotes: string;
  city: string;
  id: string;
  label: string;
  postalCode: string;
  serviceNotes: string;
  state: string;
  street: string;
};

export type PartyEstimatePrefill = {
  contactName: string;
  contactOptions: EstimateContactOption[];
  email: string;
  eventTitle: string;
  leadSource: string;
  locationOptions: EstimateLocationOption[];
  notes: string;
  organizationId: string;
  partyLabel: string;
  partyType: "customer" | "organization";
  phone: string;
  requestedScope: string;
  selectedContactId: string;
  selectedLocationId: string;
  serviceType: string;
  sourceCustomerId: string;
  sourceRequestKey: string;
};

export function chooseOrganizationContact<T extends { contact_roles?: string[] | null; is_active?: boolean; id: string }>(
  contacts: T[],
) {
  const active = contacts.filter((contact) => contact.is_active !== false);
  const primary = active.filter((contact) => contact.contact_roles?.includes("primary"));
  return primary.length === 1 ? primary[0] : active.length === 1 ? active[0] : null;
}

export function chooseLocation<T extends { id: string }>(locations: T[]) {
  return locations.length === 1 ? locations[0] : null;
}
