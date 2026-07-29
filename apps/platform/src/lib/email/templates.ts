import "server-only";

import type {
  EmployeeAccessAssignedRole,
  EmployeeAccessRequest,
  InvoiceDetail,
  QuoteDetail,
} from "@/lib/types/database";
import type { PublicLeadSubmission } from "@/lib/leads/intake";
import {
  applyCustomerDocumentEmailEdits,
  generateInvoiceEmailDraft,
  generateQuoteEmailDraft,
  type CustomerDocumentEmailEdits,
} from "@/lib/documents/email-drafts";
import { renderCustomerDocumentEmailHtml } from "@/lib/email/customer-document-layout";
import { buildCanonicalAppUrl } from "@/lib/security/app-base-url";

export type TransactionalEmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

const companyName = "Angel Tree Services";
const adminUrl = "https://admin.angeltreeservices.org";

export function employeeAccessRequestAdminTemplate(request: EmployeeAccessRequest): TransactionalEmailTemplate {
  const subject = `Employee access request: ${request.full_name}`;
  const text = [
    `${request.full_name} requested Angel Tree Platform access.`,
    "",
    `Email: ${request.email}`,
    request.phone ? `Phone: ${request.phone}` : "",
    `Requested role: ${request.requested_role?.replace("_", " ") || "General access"}`,
    request.note ? `Note: ${request.note}` : "",
    "",
    `Review in admin: ${adminUrl}/admin/access`,
  ].filter(Boolean).join("\n");

  return buildTemplate(subject, text);
}

export function employeeAccessApprovedTemplate(input: {
  fullName: string;
  assignedRole: EmployeeAccessAssignedRole;
}): TransactionalEmailTemplate {
  const subject = "Angel Tree Platform access approved";
  const text = [
    `Hi ${input.fullName},`,
    "",
    `Your Angel Tree Platform access has been approved as ${input.assignedRole.replace("_", " ")}.`,
    `Sign in here: ${adminUrl}/login`,
    "",
    "If you need a password reset, ask an owner or admin to send a secure reset link.",
    "",
    `Thank you,`,
    companyName,
  ].join("\n");

  return buildTemplate(subject, text);
}

export function employeeAccessRejectedTemplate(input: {
  fullName: string;
  reason: string | null;
}): TransactionalEmailTemplate {
  const subject = "Angel Tree Platform access request update";
  const text = [
    `Hi ${input.fullName},`,
    "",
    "Your Angel Tree Platform access request was not approved.",
    input.reason ? `Reason: ${input.reason}` : "",
    "",
    "If this looks incorrect, contact an owner or admin.",
    "",
    `Thank you,`,
    companyName,
  ].filter(Boolean).join("\n");

  return buildTemplate(subject, text);
}

export function leadInternalNoticeTemplate(input: {
  jobId: string;
  submission: PublicLeadSubmission;
}): TransactionalEmailTemplate {
  const subject = `New website lead: ${input.submission.name}`;
  const text = [
    "A new website lead was saved in the CRM.",
    "",
    `Name: ${input.submission.name}`,
    `Phone: ${input.submission.phone}`,
    input.submission.email ? `Email: ${input.submission.email}` : "",
    `Service: ${input.submission.serviceLabel}`,
    `Request type: ${input.submission.customerTypeLabel}`,
    input.submission.commercialName ? `Company: ${input.submission.commercialName}` : "",
    input.submission.propertyScope ? `Property scope: ${input.submission.propertyScope}` : "",
    `Address: ${input.submission.address}`,
    "",
    "Project details:",
    input.submission.projectDetails,
    "",
    `Open job: ${adminUrl}/admin/jobs/${input.jobId}`,
  ].filter(Boolean).join("\n");

  return buildTemplate(subject, text);
}

export function quoteEmailTemplate(
  quote: QuoteDetail,
  options: { edits?: CustomerDocumentEmailEdits; portalUrl?: string } = {},
): TransactionalEmailTemplate {
  const generated = generateQuoteEmailDraft(quote, { portalUrl: options.portalUrl });
  const draft = options.edits ? applyCustomerDocumentEmailEdits(generated, options.edits) : generated;
  return {
    subject: draft.subject,
    text: draft.body,
    html: renderCustomerDocumentEmailHtml(draft, { logoUrl: buildCanonicalAppUrl("/angel-tree-services-logo.jpg") }),
  };
}

export function invoiceEmailTemplate(
  invoice: InvoiceDetail,
  options: { edits?: CustomerDocumentEmailEdits; portalUrl?: string } = {},
): TransactionalEmailTemplate {
  const generated = generateInvoiceEmailDraft(invoice, { portalUrl: options.portalUrl });
  const draft = options.edits ? applyCustomerDocumentEmailEdits(generated, options.edits) : generated;
  return {
    subject: draft.subject,
    text: draft.body,
    html: renderCustomerDocumentEmailHtml(draft, { logoUrl: buildCanonicalAppUrl("/angel-tree-services-logo.jpg") }),
  };
}

function buildTemplate(subject: string, text: string): TransactionalEmailTemplate {
  return {
    subject,
    text,
    html: textToHtml(text),
  };
}

function textToHtml(text: string) {
  return text
    .split("\n\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
