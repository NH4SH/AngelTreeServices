import type { Appointment, JobDetail, QuoteDetail } from "@/lib/types/database";
import type { EmailDraft } from "@/lib/documents/email-drafts";

const companyName = "Angel Tree Services";

export function generateEstimateScheduledMessage(job: JobDetail, appointment: Appointment): EmailDraft {
  return scheduledMessage(
    job,
    appointment,
    "estimate",
    "Your on-site estimate is scheduled. We look forward to taking a closer look and talking through the work.",
  );
}

export function generateJobScheduledMessage(job: JobDetail, appointment: Appointment): EmailDraft {
  return scheduledMessage(
    job,
    appointment,
    "service visit",
    "Your tree service visit is scheduled. Please let us know if access details or site conditions change before we arrive.",
  );
}

export function generateQuoteFollowUpMessage(quote: QuoteDetail): EmailDraft {
  const customerName = quote.organizations?.name ?? quote.customers?.display_name ?? "there";

  return {
    subject: `${companyName}: following up on your quote`,
    body: [
      `Hi ${customerName},`,
      "",
      "We wanted to check in on your Angel Tree Services quote and see if you have any questions.",
      "",
      "Reply here or call our office when you are ready. We are happy to talk through the scope or make adjustments.",
      "",
      "Thank you,",
      companyName,
    ].join("\n"),
  };
}

export function generatePostJobFollowUpMessage(job: JobDetail): EmailDraft {
  const customerName = job.organizations?.name ?? job.customers?.display_name ?? "there";

  return {
    subject: `${companyName}: checking in after your service`,
    body: [
      `Hi ${customerName},`,
      "",
      "We wanted to check in after your service and make sure everything looks right.",
      "",
      "Reply here or call our office if you have any questions or anything you would like us to review.",
      "",
      "Thank you,",
      companyName,
    ].join("\n"),
  };
}

function scheduledMessage(job: JobDetail, appointment: Appointment, label: string, message: string): EmailDraft {
  const customerName = job.organizations?.name ?? job.customers?.display_name ?? "there";
  const address = job.service_locations
    ? [job.service_locations.street, job.service_locations.city, job.service_locations.state, job.service_locations.postal_code]
        .filter(Boolean)
        .join(", ")
    : "your service location";

  return {
    subject: `${companyName}: your ${label} is scheduled`,
    body: [
      `Hi ${customerName},`,
      "",
      message,
      `When: ${formatDateTime(appointment.starts_at)}.`,
      appointment.ends_at ? `Expected window ends: ${formatDateTime(appointment.ends_at)}.` : "",
      `Location: ${address}.`,
      "",
      "Reply here or call our office with any questions.",
      "",
      "Thank you,",
      companyName,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
