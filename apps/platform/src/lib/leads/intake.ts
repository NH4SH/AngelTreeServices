import "server-only";

import { getServiceRoleClient } from "@/lib/supabase/admin";

const serviceTypeMap = {
  "Tree Care": "other",
  Landscaping: "landscaping",
  "Lawn Care": "lawn_care",
  "Storm Cleanup": "emergency",
  "Multiple Services / Not Sure Yet": "other",
} as const;

const customerTypeMap = {
  Homeowner: "residential",
  "Commercial / Property Management": "commercial",
} as const;

const propertyScopeValues = ["", "1 property", "2 to 5 properties", "6+ properties", "Recurring service"] as const;

export type PublicLeadSubmission = {
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
  projectDetails: string;
  updatesOptIn: boolean;
};

export type LeadValidationResult =
  | { data: PublicLeadSubmission; error: null; spam: false }
  | { data: null; error: string; spam: false }
  | { data: null; error: null; spam: true };

export async function parsePublicLeadSubmission(request: Request): Promise<LeadValidationResult> {
  const formData = await request.formData();

  if (cleanText(formData.get("bot-field"), 200)) {
    return { data: null, error: null, spam: true };
  }

  const name = cleanText(formData.get("name"), 120);
  const phone = normalizePhone(cleanText(formData.get("phone"), 40));
  const email = cleanText(formData.get("email"), 254).toLowerCase() || null;
  const serviceLabel = cleanText(formData.get("service"), 80) as keyof typeof serviceTypeMap;
  const customerTypeLabel = cleanText(formData.get("customer_type"), 80) as keyof typeof customerTypeMap;
  const commercialName = cleanText(formData.get("commercial_name"), 160) || null;
  const propertyScope = cleanText(formData.get("property_scope"), 40) as (typeof propertyScopeValues)[number];
  const address = cleanText(formData.get("address"), 300);
  const projectDetails = cleanText(formData.get("message"), 3000);
  const updatesOptIn = cleanText(formData.get("updates_opt_in"), 10) === "yes";

  if (name.length < 2 || phone.length < 10 || address.length < 5 || projectDetails.length < 5) {
    return { data: null, error: "Please complete the required fields and try again.", spam: false };
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { data: null, error: "Please enter a valid email address or leave it blank.", spam: false };
  }

  if (!(serviceLabel in serviceTypeMap)) {
    return { data: null, error: "Please choose a service and try again.", spam: false };
  }

  if (!(customerTypeLabel in customerTypeMap)) {
    return { data: null, error: "Please choose a request type and try again.", spam: false };
  }

  if (!propertyScopeValues.includes(propertyScope)) {
    return { data: null, error: "Please check the property scope and try again.", spam: false };
  }

  return {
    data: {
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
      projectDetails,
      updatesOptIn,
    },
    error: null,
    spam: false,
  };
}

export async function createWebsiteLead(submission: PublicLeadSubmission) {
  const supabase = getServiceRoleClient();

  if (!supabase) {
    return { error: "Lead intake is not configured.", jobId: null };
  }

  const leadSource = await getOrCreateWebsiteLeadSource(supabase);
  if (!leadSource.data) {
    return { error: leadSource.error, jobId: null };
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      display_name: submission.name,
      primary_contact_name: submission.name,
      customer_type: submission.customerType,
      email: submission.email,
      phone: submission.phone,
      lead_source_id: leadSource.data.id,
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    return { error: customerError?.message ?? "Could not create the customer lead.", jobId: null };
  }

  const location = parseAddress(submission.address);
  const { data: serviceLocation, error: locationError } = await supabase
    .from("service_locations")
    .insert({
      customer_id: customer.id,
      label: "Website request",
      street: location.street,
      city: location.city,
      state: location.state,
      postal_code: location.postalCode,
      service_notes: location.needsConfirmation ? "Confirm the submitted address before scheduling." : null,
    })
    .select("id")
    .single();

  if (locationError || !serviceLocation) {
    await supabase.from("customers").delete().eq("id", customer.id);
    return { error: locationError?.message ?? "Could not create the service location.", jobId: null };
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      customer_id: customer.id,
      service_location_id: serviceLocation.id,
      lead_source_id: leadSource.data.id,
      status: "new_lead",
      service_type: submission.serviceType,
      priority: submission.serviceType === "emergency" ? "urgent" : "normal",
      requested_scope: submission.projectDetails,
      internal_notes: buildInternalSummary(submission, location.needsConfirmation),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    await supabase.from("service_locations").delete().eq("id", serviceLocation.id);
    await supabase.from("customers").delete().eq("id", customer.id);
    return { error: jobError?.message ?? "Could not create the job lead.", jobId: null };
  }

  const { error: noteError } = await supabase.from("notes").insert({
    customer_id: customer.id,
    service_location_id: serviceLocation.id,
    job_id: job.id,
    visibility: "internal",
    body: buildLeadNote(submission),
  });

  await supabase.from("activity_log").insert({
    subject_type: "job",
    subject_id: job.id,
    event_type: "website_lead_received",
    metadata_json: { source: "website" },
  });

  return { error: noteError?.message ?? null, jobId: job.id };
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
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

function parseAddress(address: string) {
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

function buildInternalSummary(submission: PublicLeadSubmission, addressNeedsConfirmation: boolean) {
  return [
    "Submitted through the public website.",
    `Requested service: ${submission.serviceLabel}.`,
    submission.commercialName ? `Company / HOA / property: ${submission.commercialName}.` : "",
    submission.propertyScope ? `Property scope: ${submission.propertyScope}.` : "",
    addressNeedsConfirmation ? "Address needs office confirmation before scheduling." : "",
    submission.updatesOptIn ? "Customer opted in to seasonal tips, reminders, and scheduling updates." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildLeadNote(submission: PublicLeadSubmission) {
  return [
    `Website request from ${submission.name}.`,
    `Request type: ${submission.customerTypeLabel}.`,
    `Submitted address: ${submission.address}.`,
    `Project details: ${submission.projectDetails}`,
  ].join("\n");
}

async function getOrCreateWebsiteLeadSource(supabase: NonNullable<ReturnType<typeof getServiceRoleClient>>) {
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
    .insert({ name: "Website", source_type: "website", is_active: true })
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
