export type MobilePartyKind = "customer" | "organization";

export const mobileJobDirectoryScopes = ["upcoming", "active", "unscheduled", "completed"] as const;
export type MobileJobDirectoryScope = (typeof mobileJobDirectoryScopes)[number];

export type MobileJobDirectoryItem = {
  id: string;
  status: string;
  operationalState: string;
  priority: string;
  serviceType: string | null;
  title: string;
  party: {
    id: string;
    kind: MobilePartyKind;
    name: string;
  } | null;
  serviceLocation: {
    id: string;
    fullAddress: string;
    city: string | null;
  } | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  assignedCrewNames: string[];
  workdayCount: number;
};

export type MobileJobDirectoryPage = {
  results: MobileJobDirectoryItem[];
  nextCursor: string | null;
};

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

export type MobilePartyDirectorySourceRow = MobilePartySearchResult & {
  updatedAt: string;
};

export type MobilePartyDirectoryPage = {
  results: MobilePartySearchResult[];
  nextCursor: string | null;
};

export type MobilePartyCreateInput = {
  kind: MobilePartyKind;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  organizationType: string | null;
  serviceLocation: {
    street: string;
    city: string;
    state: string;
    postalCode: string | null;
  } | null;
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

export function normalizeMobileDirectoryLimit(value: string | null, fallback = 25) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 50) : fallback;
}

export function normalizeMobileJobScope(value: string | null): MobileJobDirectoryScope | null {
  return mobileJobDirectoryScopes.includes(value as MobileJobDirectoryScope)
    ? value as MobileJobDirectoryScope
    : null;
}

export function mobileJobOperationalStates(scope: MobileJobDirectoryScope) {
  return {
    upcoming: ["scheduled"],
    active: ["in_progress", "needs_attention"],
    unscheduled: ["to_be_scheduled"],
    completed: ["work_complete", "invoiced", "paid"],
  }[scope];
}

export function canCreateMobileParties(roles: readonly string[]) {
  return roles.some((role) => ["owner", "admin", "payroll_admin", "estimator"].includes(role));
}

export function mergeMobilePartyDirectoryRows(
  customerRows: MobilePartyDirectorySourceRow[],
  organizationRows: MobilePartyDirectorySourceRow[],
  limit: number,
) {
  const rows = [...customerRows, ...organizationRows]
    .sort((left, right) => {
      const dateComparison = right.updatedAt.localeCompare(left.updatedAt);
      if (dateComparison !== 0) return dateComparison;
      const kindComparison = left.kind.localeCompare(right.kind);
      return kindComparison !== 0 ? kindComparison : left.id.localeCompare(right.id);
    })
    .slice(0, limit);
  const selected = new Set(rows.map((row) => `${row.kind}:${row.id}`));

  return {
    rows,
    consumedCustomers: customerRows.filter((row) => selected.has(`customer:${row.id}`)).length,
    consumedOrganizations: organizationRows.filter((row) => selected.has(`organization:${row.id}`)).length,
    hasMore: customerRows.some((row) => !selected.has(`customer:${row.id}`))
      || organizationRows.some((row) => !selected.has(`organization:${row.id}`)),
  };
}

export function validateMobilePartyCreateInput(input: unknown):
  | { value: MobilePartyCreateInput; error: null }
  | { value: null; error: string } {
  if (!input || typeof input !== "object") {
    return { value: null, error: "Enter the customer or organization details." };
  }

  const body = input as Record<string, unknown>;
  const kind = body.kind === "organization" ? "organization" : body.kind === "customer" ? "customer" : null;
  const name = boundedText(body.name, 180);
  const contactName = boundedOptionalText(body.contactName, 180);
  const email = boundedOptionalText(body.email, 180)?.toLowerCase() ?? null;
  const phone = boundedOptionalText(body.phone, 40);
  const organizationType = boundedOptionalText(body.organizationType, 40);
  const allowedOrganizationTypes = new Set([
    "property_manager", "hoa", "commercial", "nonprofit", "church", "municipality",
    "general_contractor", "apartment_community", "real_estate", "other",
  ]);

  if (!kind || !name) return { value: null, error: "Choose a record type and enter a name." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { value: null, error: "Enter a valid email address or leave email blank." };
  }
  if (kind === "organization" && !organizationType) {
    return { value: null, error: "Choose an organization type." };
  }
  if (organizationType && !allowedOrganizationTypes.has(organizationType)) {
    return { value: null, error: "Choose a valid organization type." };
  }

  const rawLocation = body.serviceLocation && typeof body.serviceLocation === "object"
    ? body.serviceLocation as Record<string, unknown>
    : null;
  const street = boundedText(rawLocation?.street, 180);
  const city = boundedText(rawLocation?.city, 100);
  const state = boundedText(rawLocation?.state, 30) || "VA";
  const postalCode = boundedOptionalText(rawLocation?.postalCode, 20);
  const hasLocationValue = Boolean(street || city || postalCode);
  if (hasLocationValue && (!street || !city)) {
    return { value: null, error: "Street and city are required when adding a service location." };
  }

  return {
    value: {
      kind,
      name,
      contactName,
      email,
      phone,
      organizationType: kind === "organization" ? organizationType : null,
      serviceLocation: hasLocationValue ? { street, city, state, postalCode } : null,
    },
    error: null,
  };
}

function boundedText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boundedOptionalText(value: unknown, maxLength: number) {
  return boundedText(value, maxLength) || null;
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}
