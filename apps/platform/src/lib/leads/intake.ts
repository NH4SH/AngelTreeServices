import "server-only";

import { createHash } from "node:crypto";
import { getServiceRoleClient } from "@/lib/supabase/admin";
import { PUBLIC_LEAD_SOURCE, PUBLIC_LEAD_SOURCE_DETAIL } from "@/lib/leads/config";

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
const likelyDuplicateWindowMs = 30 * 60 * 1000;

type ServiceClient = NonNullable<ReturnType<typeof getServiceRoleClient>>;

type LeadNotificationStatus = "pending" | "sent" | "failed" | "skipped";

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
  const supabase = getServiceRoleClient();

  if (!supabase) {
    return {
      created: false,
      duplicateMode: null,
      error: "Lead intake is not configured.",
      jobId: null,
      submissionId: submission.submissionId,
    };
  }

  const replayedLead = await findLeadBySubmissionId(supabase, submission.submissionId);
  if (replayedLead.error) {
    return {
      created: false,
      duplicateMode: null,
      error: replayedLead.error,
      jobId: null,
      submissionId: submission.submissionId,
    };
  }

  if (replayedLead.jobId) {
    return {
      created: false,
      duplicateMode: "replayed",
      error: null,
      jobId: replayedLead.jobId,
      submissionId: submission.submissionId,
    };
  }

  const leadSource = await getOrCreateWebsiteLeadSource(supabase);
  if (!leadSource.data) {
    return {
      created: false,
      duplicateMode: null,
      error: leadSource.error,
      jobId: null,
      submissionId: submission.submissionId,
    };
  }

  const duplicateLead = await findLikelyDuplicateLead(supabase, submission.requestFingerprint);
  if (duplicateLead.error) {
    return {
      created: false,
      duplicateMode: null,
      error: duplicateLead.error,
      jobId: null,
      submissionId: submission.submissionId,
    };
  }

  const duplicateOfJobId = duplicateLead.jobId;
  const context = shouldCreateOrganizationLead(submission)
    ? await createOrganizationLeadContext(supabase, submission, leadSource.data.id)
    : await createCustomerLeadContext(supabase, submission, leadSource.data.id);

  if (!context.data) {
    return {
      created: false,
      duplicateMode: null,
      error: context.error,
      jobId: null,
      submissionId: submission.submissionId,
    };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: context.data.customerId,
      organization_id: context.data.organizationId,
      property_manager_contact_id: context.data.organizationContactId,
      onsite_contact_id: context.data.organizationContactId,
      service_location_id: context.data.serviceLocationId,
      lead_source_id: leadSource.data.id,
      lead_campaign: submission.utmCampaign,
      website_submission_id: submission.submissionId,
      website_request_fingerprint: submission.requestFingerprint,
      duplicate_of_job_id: duplicateOfJobId,
      source_detail: PUBLIC_LEAD_SOURCE_DETAIL,
      source_page_url: submission.pageUrl,
      source_referrer_url: submission.referrer,
      utm_source: submission.utmSource,
      utm_medium: submission.utmMedium,
      utm_campaign: submission.utmCampaign,
      utm_term: submission.utmTerm,
      utm_content: submission.utmContent,
      preferred_contact_method: submission.preferredContactMethod,
      preferred_appointment_timing: submission.preferredAppointmentTiming,
      submitted_at: submission.submittedAt,
      notification_status: "pending",
      status: "new_lead",
      service_type: submission.serviceType,
      priority: submission.hazardPresent || submission.serviceType === "emergency" ? "urgent" : "normal",
      requested_scope: submission.projectDetails,
      internal_notes: buildInternalSummary(submission, duplicateOfJobId),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    await rollbackLeadContext(supabase, context.data);

    // A simultaneous retry can win the unique submission-ID race after the
    // initial replay lookup. Return that saved lead instead of a false error.
    if (jobError?.code === "23505") {
      const concurrentLead = await findLeadBySubmissionId(supabase, submission.submissionId);
      if (concurrentLead.jobId) {
        return {
          created: false,
          duplicateMode: "replayed",
          error: null,
          jobId: concurrentLead.jobId,
          submissionId: submission.submissionId,
        };
      }
    }

    return {
      created: false,
      duplicateMode: null,
      error: jobError?.message ?? "Could not create the job lead.",
      jobId: null,
      submissionId: submission.submissionId,
    };
  }

  const { error: noteError } = await supabase.from("notes").insert({
    customer_id: context.data.customerId,
    service_location_id: context.data.serviceLocationId,
    job_id: job.id,
    visibility: "internal",
    body: buildLeadNote(submission, duplicateOfJobId),
  });

  const activityMetadata = buildActivityMetadata(submission, duplicateOfJobId, context.data.organizationId);
  await supabase.from("activity_log").insert({
    subject_type: "job",
    subject_id: job.id,
    event_type: "website_lead_received",
    metadata_json: activityMetadata,
  });

  if (noteError) {
    await supabase.from("activity_log").insert({
      subject_type: "job",
      subject_id: job.id,
      event_type: "website_lead_note_failed",
      metadata_json: {
        source: PUBLIC_LEAD_SOURCE,
        source_detail: PUBLIC_LEAD_SOURCE_DETAIL,
      },
    });
  }

  return {
    created: true,
    duplicateMode: duplicateOfJobId ? "likely_duplicate" : null,
    error: noteError?.message ?? null,
    jobId: job.id,
    submissionId: submission.submissionId,
  };
}

export async function recordWebsiteLeadNotificationStatus(
  jobId: string,
  status: LeadNotificationStatus,
  errorMessage: string | null = null,
) {
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return;
  }

  await supabase
    .from("jobs")
    .update({
      notification_status: status,
      notification_error: errorMessage,
    })
    .eq("id", jobId);

  await supabase.from("activity_log").insert({
    subject_type: "job",
    subject_id: jobId,
    event_type: status === "failed" ? "website_lead_notification_failed" : "website_lead_notification_sent",
    metadata_json: {
      source: PUBLIC_LEAD_SOURCE,
      source_detail: PUBLIC_LEAD_SOURCE_DETAIL,
      notification_status: status,
      notification_error: errorMessage,
    },
  });
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

function shouldCreateOrganizationLead(submission: PublicLeadSubmission) {
  return submission.customerType === "commercial" && !!submission.commercialName;
}

async function createCustomerLeadContext(
  supabase: ServiceClient,
  submission: PublicLeadSubmission,
  leadSourceId: string,
) {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      display_name: submission.name,
      primary_contact_name: submission.name,
      customer_type: submission.customerType,
      email: submission.email,
      phone: submission.phone,
      billing_address: submission.address,
      lead_source_id: leadSourceId,
      lead_campaign: submission.utmCampaign,
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    return { data: null, error: customerError?.message ?? "Could not create the customer lead." };
  }

  const { data: serviceLocation, error: locationError } = await supabase
    .from("service_locations")
    .insert({
      customer_id: customer.id,
      organization_id: null,
      label: "Website request",
      street: submission.addressParts.street,
      city: submission.addressParts.city,
      state: submission.addressParts.state,
      postal_code: submission.addressParts.postalCode,
      service_notes: submission.addressParts.needsConfirmation
        ? "Confirm the submitted address before scheduling."
        : null,
    })
    .select("id")
    .single();

  if (locationError || !serviceLocation) {
    await supabase.from("customers").delete().eq("id", customer.id);
    return { data: null, error: locationError?.message ?? "Could not create the service location." };
  }

  return {
    data: {
      customerId: customer.id,
      organizationId: null,
      organizationContactId: null,
      serviceLocationId: serviceLocation.id,
      rollbackIds: {
        customerId: customer.id,
        organizationContactId: null,
        organizationId: null,
        serviceLocationId: serviceLocation.id,
      },
    },
    error: null,
  };
}

async function createOrganizationLeadContext(
  supabase: ServiceClient,
  submission: PublicLeadSubmission,
  leadSourceId: string,
) {
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .insert({
      name: submission.commercialName,
      organization_type: "property_manager",
      billing_email: submission.email,
      billing_phone: submission.phone,
      billing_address: submission.address,
      notes: "Created automatically from the public website lead form.",
    })
    .select("id")
    .single();

  if (organizationError || !organization) {
    return { data: null, error: organizationError?.message ?? "Could not create the organization lead." };
  }

  const { data: contact, error: contactError } = await supabase
    .from("organization_contacts")
    .insert({
      organization_id: organization.id,
      full_name: submission.name,
      email: submission.email,
      phone: submission.phone,
      role_title: "Website contact",
      preferred_contact_method: submission.preferredContactMethod,
      contact_roles: ["website_lead"],
      notes: submission.preferredAppointmentTiming
        ? `Preferred timing: ${submission.preferredAppointmentTiming}`
        : null,
      receives_invoices: false,
      receives_job_updates: true,
    })
    .select("id")
    .single();

  if (contactError || !contact) {
    await supabase.from("organizations").delete().eq("id", organization.id);
    return { data: null, error: contactError?.message ?? "Could not create the organization contact." };
  }

  const { data: serviceLocation, error: locationError } = await supabase
    .from("service_locations")
    .insert({
      customer_id: null,
      organization_id: organization.id,
      label: "Website request",
      street: submission.addressParts.street,
      city: submission.addressParts.city,
      state: submission.addressParts.state,
      postal_code: submission.addressParts.postalCode,
      service_notes: submission.addressParts.needsConfirmation
        ? "Confirm the submitted address before scheduling."
        : null,
    })
    .select("id")
    .single();

  if (locationError || !serviceLocation) {
    await supabase.from("organization_contacts").delete().eq("id", contact.id);
    await supabase.from("organizations").delete().eq("id", organization.id);
    return { data: null, error: locationError?.message ?? "Could not create the service location." };
  }

  return {
    data: {
      customerId: null,
      organizationId: organization.id,
      organizationContactId: contact.id,
      serviceLocationId: serviceLocation.id,
      rollbackIds: {
        customerId: null,
        organizationContactId: contact.id,
        organizationId: organization.id,
        serviceLocationId: serviceLocation.id,
      },
    },
    error: null,
  };
}

async function rollbackLeadContext(
  supabase: ServiceClient,
  context: {
    rollbackIds: {
      customerId: string | null;
      organizationContactId: string | null;
      organizationId: string | null;
      serviceLocationId: string | null;
    };
  },
) {
  const { customerId, organizationContactId, organizationId, serviceLocationId } = context.rollbackIds;

  if (serviceLocationId) {
    await supabase.from("service_locations").delete().eq("id", serviceLocationId);
  }

  if (organizationContactId) {
    await supabase.from("organization_contacts").delete().eq("id", organizationContactId);
  }

  if (organizationId) {
    await supabase.from("organizations").delete().eq("id", organizationId);
  }

  if (customerId) {
    await supabase.from("customers").delete().eq("id", customerId);
  }
}

async function findLeadBySubmissionId(supabase: ServiceClient, submissionId: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("website_submission_id", submissionId)
    .maybeSingle();

  return {
    jobId: data?.id ?? null,
    error: error?.message ?? null,
  };
}

async function findLikelyDuplicateLead(supabase: ServiceClient, fingerprint: string) {
  const windowStart = new Date(Date.now() - likelyDuplicateWindowMs).toISOString();
  const { data, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("website_request_fingerprint", fingerprint)
    .gte("submitted_at", windowStart)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    jobId: data?.id ?? null,
    error: error?.message ?? null,
  };
}

function buildInternalSummary(submission: PublicLeadSubmission, duplicateOfJobId: string | null) {
  return [
    "Submitted through the public website.",
    `Requested service: ${submission.serviceLabel}.`,
    duplicateOfJobId ? `Likely duplicate of website lead ${duplicateOfJobId}; review before creating duplicate work.` : "",
    submission.commercialName ? `Company / HOA / property: ${submission.commercialName}.` : "",
    submission.propertyScope ? `Property scope: ${submission.propertyScope}.` : "",
    submission.preferredContactMethod ? `Preferred contact method: ${submission.preferredContactMethod}.` : "",
    submission.preferredAppointmentTiming ? `Preferred timing: ${submission.preferredAppointmentTiming}.` : "",
    submission.hazardPresent ? "Customer indicated an immediate hazard or blocked access." : "",
    submission.addressParts.needsConfirmation ? "Address needs office confirmation before scheduling." : "",
    submission.updatesOptIn ? "Customer opted in to seasonal tips, reminders, and scheduling updates." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLeadNote(submission: PublicLeadSubmission, duplicateOfJobId: string | null) {
  return [
    `Website request from ${submission.name}.`,
    `Request type: ${submission.customerTypeLabel}.`,
    duplicateOfJobId ? `Potential duplicate of lead ${duplicateOfJobId}.` : "",
    submission.hazardPresent ? "Customer indicated an immediate hazard or blocked access." : "",
    `Submitted address: ${submission.address}.`,
    `Project details: ${submission.projectDetails}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildActivityMetadata(
  submission: PublicLeadSubmission,
  duplicateOfJobId: string | null,
  organizationId: string | null,
) {
  return {
    source: PUBLIC_LEAD_SOURCE,
    source_detail: PUBLIC_LEAD_SOURCE_DETAIL,
    submission_id: submission.submissionId,
    first_name: submission.firstName,
    last_name: submission.lastName,
    duplicate_of_job_id: duplicateOfJobId,
    page_url: submission.pageUrl,
    referrer: submission.referrer,
    service_requested: submission.serviceLabel,
    request_type: submission.customerTypeLabel,
    organization_name: submission.commercialName,
    organization_id: organizationId,
    preferred_contact_method: submission.preferredContactMethod,
    preferred_appointment_timing: submission.preferredAppointmentTiming,
    hazard_present: submission.hazardPresent,
    updates_opt_in: submission.updatesOptIn,
    utm_source: submission.utmSource,
    utm_medium: submission.utmMedium,
    utm_campaign: submission.utmCampaign,
    utm_term: submission.utmTerm,
    utm_content: submission.utmContent,
  };
}

async function getOrCreateWebsiteLeadSource(supabase: ServiceClient) {
  const { data: existing, error: selectError } = await supabase
    .from("lead_sources")
    .select("id")
    .eq("name", "Website")
    .maybeSingle();

  if (selectError) {
    return { data: null, error: selectError.message };
  }

  if (existing) {
    return { data: existing, error: null };
  }

  const { data, error } = await supabase
    .from("lead_sources")
    .insert({ name: "Website", source_type: PUBLIC_LEAD_SOURCE, is_active: true })
    .select("id")
    .single();

  if (!error && data) {
    return { data, error: null };
  }

  const { data: concurrentInsert, error: retryError } = await supabase
    .from("lead_sources")
    .select("id")
    .eq("name", "Website")
    .maybeSingle();

  return {
    data: concurrentInsert,
    error: concurrentInsert ? null : retryError?.message ?? error?.message ?? "Could not create website lead source.",
  };
}
