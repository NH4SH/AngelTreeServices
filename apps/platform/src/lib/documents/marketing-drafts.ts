import type { EmailDraft } from "@/lib/documents/email-drafts";
import type { JobDetail } from "@/lib/types/database";

const companyName = "Angel Tree Services";
const missingReviewUrl = "[Add Google review link]";

export type ReviewRequestDraft = {
  email: EmailDraft;
  reviewUrl: string | null;
  textMessageBody: string;
};

export type CompletedJobSummaryDrafts = {
  facebookPost: string;
  googleBusinessPost: string;
  websiteGalleryCaption: string;
};

export function getGoogleReviewUrl() {
  return process.env.NEXT_PUBLIC_GOOGLE_REVIEW_URL?.trim() || null;
}

export function generateCompletedJobReviewRequest(
  job: JobDetail,
  reviewUrl: string | null,
): ReviewRequestDraft {
  const customerName = job.customers?.display_name ?? "there";
  const service = formatServiceType(job.service_type);
  const link = reviewUrl || missingReviewUrl;

  return {
    email: {
      subject: `${companyName}: how did your ${service} service go?`,
      body: [
        `Hi ${customerName},`,
        "",
        `Thank you for choosing ${companyName}. We hope the completed ${service} work looks great.`,
        "",
        "If you have a moment, we would appreciate an honest Google review:",
        link,
        "",
        "If anything needs another look, please reply here or call our office first. We are happy to help.",
        "",
        "Thank you,",
        companyName,
      ].join("\n"),
    },
    reviewUrl,
    textMessageBody: [
      `Thank you for choosing ${companyName}. We hope your ${service} work looks great.`,
      `If you have a moment, we would appreciate an honest Google review: ${link}`,
      "If anything needs another look, please reply here first.",
    ].join(" "),
  };
}

export function generateCompletedJobSummaryDrafts({
  completionNotes,
  job,
  selectedPhotoCaptions,
}: {
  completionNotes?: string;
  job: JobDetail;
  selectedPhotoCaptions?: string[];
}): CompletedJobSummaryDrafts {
  const city = publicSafeText(job.service_locations?.city || "the Fredericksburg area");
  const service = formatServiceType(job.service_type);
  const scope = publicSafeText(job.requested_scope || "");
  const notes = publicSafeText(completionNotes || "");
  const captions = (selectedPhotoCaptions ?? [])
    .map(publicSafeText)
    .filter(Boolean)
    .slice(0, 3);
  const details = [scope, notes, ...captions].filter(Boolean);
  const detailSentence = details.length > 0
    ? ` ${sentenceCase(details.join(" "))}`
    : "";

  return {
    googleBusinessPost: [
      `Completed ${service} work in ${city}.`,
      `${detailSentence || " Our crew wrapped up the agreed scope and left the work area clean."}`,
      "",
      "Need help with trees, landscaping, or lawn care around the Fredericksburg region? Contact Angel Tree Services for an estimate.",
    ].join("\n"),
    facebookPost: [
      `Another ${service} project completed in ${city}.`,
      `${detailSentence || " The crew completed the planned work and cleaned up the site before leaving."}`,
      "",
      "Have a property project in mind? Reach out to Angel Tree Services to schedule an estimate.",
    ].join("\n"),
    websiteGalleryCaption: [
      `${sentenceCase(service)} in ${city}.`,
      detailSentence || "Completed with a careful cleanup and a tidy finished work area.",
    ].join(" "),
  };
}

export function publicSafeText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[contact removed]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone removed]")
    .replace(
      /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl|circle|cir|highway|hwy)\b\.?/gi,
      "[address removed]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function formatServiceType(value: string | null) {
  return (value || "property service").replaceAll("_", " ");
}

function sentenceCase(value: string) {
  if (!value) {
    return value;
  }

  const sentence = value.endsWith(".") ? value : `${value}.`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
}
