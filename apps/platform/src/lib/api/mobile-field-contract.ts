export type MobilePartyKind = "customer" | "organization";

export type MobileServiceLocation = {
  id: string;
  label: string | null;
  fullAddress: string;
  accessNotes: string | null;
  gateCode: string | null;
  serviceNotes: string | null;
};

export type MobilePartySearchResult = {
  id: string;
  kind: MobilePartyKind;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type MobilePartyWorkSummary = {
  id: string;
  status: string;
  serviceType: string | null;
  priority: string;
  scope: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  completedAt: string | null;
  serviceLocationId: string | null;
  serviceLocation: MobileServiceLocation | null;
};

export type MobileRecordSummary = {
  id: string;
  number: string | null;
  status: string;
  date: string | null;
};

export type MobilePartyDetail = {
  id: string;
  kind: MobilePartyKind;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  serviceLocations: MobileServiceLocation[];
  contacts: {
    id: string;
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
  }[];
  jobs: MobilePartyWorkSummary[];
  proposals: MobileRecordSummary[];
  invoices: MobileRecordSummary[];
};

type LocationRow = {
  id: string;
  label?: string | null;
  street: string;
  city: string;
  state: string;
  postal_code?: string | null;
  access_notes?: string | null;
  gate_code?: string | null;
  service_notes?: string | null;
};

export function toMobileServiceLocation(location: LocationRow): MobileServiceLocation {
  return {
    id: location.id,
    label: cleanText(location.label),
    fullAddress: formatAddress(location),
    accessNotes: cleanText(location.access_notes),
    gateCode: cleanText(location.gate_code),
    serviceNotes: cleanText(location.service_notes),
  };
}

export function formatAddress(location: Pick<LocationRow, "street" | "city" | "state" | "postal_code">) {
  const locality = [cleanText(location.city), cleanText(location.state)].filter(Boolean).join(", ");
  return [cleanText(location.street), [locality, cleanText(location.postal_code)].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

export function cleanMobileSearchTerm(value: string | null) {
  return (value ?? "")
    .trim()
    .replace(/[,%_()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function mergeMobilePartyResults(
  direct: MobilePartySearchResult[],
  locationMatches: MobilePartySearchResult[],
  limit = 25,
) {
  const merged = new Map<string, MobilePartySearchResult>();
  [...direct, ...locationMatches].forEach((result) => {
    const key = `${result.kind}:${result.id}`;
    const existing = merged.get(key);
    merged.set(key, existing?.address ? existing : {
      ...result,
      address: result.address ?? existing?.address ?? null,
    });
  });
  return [...merged.values()]
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, limit);
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}
