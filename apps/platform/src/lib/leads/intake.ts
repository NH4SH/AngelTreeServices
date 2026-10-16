import "server-only";

import { createHash } from "node:crypto";
import { getServiceRoleClient } from "@/lib/supabase/admin";

const serviceTypeMap = {
  "Tree Care": "other",
  Landscaping: "landscaping",
  "Lawn Care": "lawn_care",
  "Storm Cleanup": "emergency",
  "Multiple Services / Not Sure Yet": "other",
} as const;

const serviceLabelAliases: Record<string, keyof typeof serviceTypeMap> = {
  "tree care": "Tree Care",
  "tree services": "Tree Care",
  landscaping: "Landscaping",
  "landscaping (green only)": "Landscaping",
  "lawn care": "Lawn Care",
  "storm cleanup": "Storm Cleanup",
  "multiple services / not sure yet": "Multiple Services / Not Sure Yet",
};

const customerTypeMap = {
  Homeowner: "residential",
  "Commercial / Property Management": "commercial",
} as const;

const propertyScopeValues = ["", "1 property", "2 to 5 properties", "6+ properties", "Recurring service"] as const;
const preferredContactMethodValues = ["", "phone", "email", "text"] as const;
const minimumSubmissionAgeMs = 800;

type AddressParts = {
  street: string;
  city: string;
  state: string;
  postalCode: string | null;
  needsConfirmation: boolean;
};

export type PublicLeadSubmission = {
  submissionId: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  phone: string;
  email: string | null;
  serviceLabel: keyof typeof serviceTypeMap;
  serviceType: (typeof serviceTypeMap)[keyof typeof serviceTypeMap];
  customerTypeLabel: keyof typeof customerTypeMap;
  customerType: (typeof customerTypeMap)[keyof typeof customerTypeMap];
  commercialName: string | null;
  propertyScope: (typeof propertyScopeValues)[number];
  address: string;
  addressParts: AddressParts;
  projectDetails: string;
  hazardPresent: boolean;
  updatesOptIn: boolean;
  preferredContactMethod: (typeof preferredContactMethodValues)[number] | null;
  preferredAppointmentTiming: string | null;
  pageUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  requestFingerprint: string;
  submittedAt: string;
};

export type LeadValidationResult =
  | { data: PublicLeadSubmission; error: null; spam: false }
  | { data: null; error: string; spam: false }
  | { data: null; error: null; spam: true };

export type CreateWebsiteLeadResult = {
  created: boolean;
  duplicateMode: "replayed" | "likely_duplicate" | null;
  error: string | null;
  jobId: string | null;
  submissionId: string;
};

export async function parsePublicLeadSubmission(request: Request): Promise<LeadValidationResult> {
  const formData = await request.formData();

  if (cleanText(formData.get("bot-field"), 200)) {
    return { data: null, error: null, spam: true };
  }

  const startedAt = cleanText(formData.get("form_started_at"), 40);
  if (isSubmissionSuspiciouslyFast(startedAt)) {
    return { data: null, error: null, spam: true };
  }

  const name = cleanText(formData.get("name"), 120);
  const { firstName, lastName } = splitName(name);
  const phone = normalizePhone(cleanText(formData.get("phone"), 40));
  const email = cleanText(formData.get("email"), 254).toLowerCase() || null;
  const serviceLabel = normalizeServiceLabel(cleanText(formData.get("service"), 80));
  const customerTypeLabel = normalizeCustomerType(cleanText(formData.get("customer_type"), 80));
  const commercialName = cleanText(formData.get("commercial_name"), 160) || null;
  const propertyScope = cleanText(formData.get("property_scope"), 40) as (typeof propertyScopeValues)[number];
  const address = cleanText(formData.get("address"), 300);
  const addressParts = parseAddress(address);
  const projectDetails = cleanText(formData.get("message") ?? formData.get("details"), 3000);
  const hazardPresent = cleanText(formData.get("hazard_present"), 10) === "yes";
  const updatesOptIn = cleanText(formData.get("updates_opt_in"), 10) === "yes";
  const preferredContactMethod = normalizePreferredContactMethod(
    cleanText(formData.get("preferred_contact_method"), 20),
  );
  const preferredAppointmentTiming = cleanText(formData.get("preferred_appointment_timing"), 160) || null;
  const pageUrl = cleanUrl(formData.get("page_url"));
  const referrer = cleanUrl(formData.get("referrer"));
  const utmSource = cleanText(formData.get("utm_source"), 120) || null;
  const utmMedium = cleanText(formData.get("utm_medium"), 120) || null;
  const utmCampaign = cleanText(formData.get("utm_campaign"), 160) || null;
  const utmTerm = cleanText(formData.get("utm_term"), 160) || null;
  const utmContent = cleanText(formData.get("utm_content"), 160) || null;
  const submissionId =
    cleanText(formData.get("submission_id"), 120)
    || `website-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (name.length < 2) {
    return { data: null, error: "Please enter your full name.", spam: false };
  }

  if (phone.length < 10) {
    return { data: null, error: "Please enter a valid phone number.", spam: false };
  }

  if (address.length < 5) {
    return { data: null, error: "Please enter the property address.", spam: false };
  }

  if (projectDetails.length < 5) {
    return { data: null, error: "Please tell us a little about the project.", spam: false };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { data: null, error: "Please enter a valid email address or leave it blank.", spam: false };
  }

  if (!serviceLabel) {
    return { data: null, error: "Please choose a service and try again.", spam: false };
  }

  if (!customerTypeLabel) {
    return { data: null, error: "Please choose a request type and try again.", spam: false };
  }

  if (!propertyScopeValues.includes(propertyScope)) {
    return { data: null, error: "Please check the property scope and try again.", spam: false };
  }

  return {
    data: {
      submissionId,
      firstName,
      lastName,
      name,
      phone,
      email,
      serviceLabel,
      serviceType: serviceTypeMap[serviceLabel],
      customerTypeLabel,
      customerType: customerTypeMap[customerTypeLabel],
      commercialName,
      propertyScope,
      address,
      addressParts,
      projectDetails,
      hazardPresent,
      updatesOptIn,
      preferredContactMethod,
      preferredAppointmentTiming,
      pageUrl,
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      requestFingerprint: buildFingerprint({ address, email, phone, projectDetails, serviceLabel }),
      submittedAt: new Date().toISOString(),
    },
    error: null,
    spam: false,
  };
}

export async function createWebsiteLead(submission: PublicLeadSubmission): Promise<CreateWebsiteLeadResult> {
  const failure = (error: string): CreateWebsiteLeadResult => ({
    created: false, duplicateMode: null, error, jobId: null, submissionId: submission.submissionId,
  });
  const supabase = getServiceRoleClient();
  if (!supabase) return failure("Lead intake is not configured.");
  try {
    const { data, error } = await supabase.rpc("submit_website_lead", { p_submission: submission });
    if (error) return failure("The website request could not be saved.");
    // A missing/partial acknowledgement must never authorize an email attempt.
    if (!data || !isUuid(data.job_id) || typeof data.created !== "boolean"
      || data.submission_id !== submission.submissionId
      || (data.created ? ![null, "likely_duplicate"].includes(data.duplicate_mode) : data.duplicate_mode !== "replayed")) {
      return failure("The website request save could not be confirmed.");
    }
    return { created: data.created, duplicateMode: data.duplicate_mode, error: null, jobId: data.job_id, submissionId: data.submission_id };
  } catch {
    return failure("The website request save could not be confirmed.");
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function cleanUrl(value: FormDataEntryValue | null) {
  const url = cleanText(value, 500);
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return "";
}

function normalizePreferredContactMethod(
  value: string,
): Exclude<(typeof preferredContactMethodValues)[number], ""> | null {
  if (preferredContactMethodValues.includes(value as (typeof preferredContactMethodValues)[number])) {
    return value ? value as Exclude<(typeof preferredContactMethodValues)[number], ""> : null;
  }

  return null;
}

function normalizeServiceLabel(value: string) {
  return serviceLabelAliases[normalizeWhitespace(value.toLowerCase())] ?? null;
}

function normalizeCustomerType(value: string): keyof typeof customerTypeMap | null {
  if (!value) {
    return "Homeowner";
  }

  const normalized = normalizeWhitespace(value.toLowerCase());
  if (normalized === "homeowner") return "Homeowner";
  if (normalized === "commercial / property management") return "Commercial / Property Management";
  return null;
}

function splitName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }

  return {
    firstName: parts[0] || null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

function parseAddress(address: string): AddressParts {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const statePostal = parts.length >= 3 ? parts.slice(2).join(" ") : "";
  const stateMatch = statePostal.match(/\b([A-Za-z]{2})\b/);
  const postalMatch = statePostal.match(/\b(\d{5}(?:-\d{4})?)\b/);

  return {
    street: parts[0] || address,
    city: parts[1] || "Needs confirmation",
    state: stateMatch?.[1]?.toUpperCase() || "VA",
    postalCode: postalMatch?.[1] ?? null,
    needsConfirmation: parts.length < 2,
  };
}

function buildFingerprint(input: {
  address: string;
  email: string | null;
  phone: string;
  projectDetails: string;
  serviceLabel: string;
}) {
  const normalized = [
    input.email || "",
    input.phone,
    normalizeWhitespace(input.address.toLowerCase()),
    normalizeWhitespace(input.projectDetails.toLowerCase()),
    normalizeWhitespace(input.serviceLabel.toLowerCase()),
  ].join("|");

  return createHash("sha256").update(normalized).digest("hex");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isSubmissionSuspiciouslyFast(startedAt: string) {
  if (!startedAt) {
    return false;
  }

  const started = Number(startedAt);
  if (!Number.isFinite(started)) {
    return false;
  }

  return Date.now() - started < minimumSubmissionAgeMs;
}
