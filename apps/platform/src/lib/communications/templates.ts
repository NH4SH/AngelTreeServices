import "server-only";

import type { TransactionalEmailTemplate } from "@/lib/email/templates";

const companyName = "Angel Tree Services";

export function appointmentCommunicationTemplate(input: {
  communicationLabel: "estimate" | "work appointment";
  customerName: string;
  endsAt: string | null;
  isConfirmation: boolean;
  location: string;
  startsAt: string;
  timezone: string;
  workSessions?: { endsAt: string | null; startsAt: string }[];
}) {
  const action = input.isConfirmation ? "is scheduled" : "is coming up";
  const subject = `${companyName}: your ${input.communicationLabel} ${action}`;
  const text = [
    `Hi ${input.customerName},`,
    "",
    `Your ${input.communicationLabel} with ${companyName} ${action}.`,
    input.workSessions && input.workSessions.length > 1
      ? `Work schedule (${input.workSessions.length} days):\n${input.workSessions.map((session) => formatScheduleLine(session.startsAt, session.endsAt, input.timezone)).join("\n")}`
      : `Date and arrival window: ${formatAppointmentWindow(input.startsAt, input.endsAt, input.timezone)}`,
    `Service location: ${input.location}`,
    "",
    "Please reply to this email or call our office if the location or access plan changes.",
    "",
    "Thank you,",
    companyName,
  ].join("\n");

  return brandedTemplate(subject, text, input.isConfirmation ? "Appointment confirmed" : "Appointment reminder");
}

function formatScheduleLine(startsAt: string, endsAt: string | null, timezone: string) {
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: timezone }).format(new Date(startsAt));
  const start = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(startsAt));
  const end = endsAt ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(endsAt)) : "arrival time may vary";
  return `${date}: ${start} to ${end}`;
}

export function quoteFollowUpTemplate(input: {
  customerName: string;
  lineItems: { description: string | null; name: string }[];
  portalUrl: string;
  quoteNumber: string;
}) {
  const subject = `Following up on Quote #${input.quoteNumber} from ${companyName}`;
  const scope = input.lineItems
    .slice(0, 4)
    .map((item) => `- ${item.name}${item.description ? `: ${compactDescription(item.description)}` : ""}`);
  const text = [
    `Hi ${input.customerName},`,
    "",
    `We are following up on Quote #${input.quoteNumber} and wanted to see if you have any questions.`,
    scope.length ? "Current scope:" : "",
    ...scope,
    "",
    `Review the latest quote securely: ${input.portalUrl}`,
    "",
    "Reply to this email or call our office if you would like to talk through the work or request an adjustment.",
    "",
    "Thank you,",
    companyName,
  ].filter(Boolean).join("\n");

  return brandedTemplate(subject, text, "Quote follow-up");
}

export function invoiceReminderTemplate(input: {
  balanceDueCents: number;
  customerName: string;
  dueAt: string | null;
  invoiceNumber: string;
  isOverdue: boolean;
  portalUrl: string;
  serviceLocation: string;
}) {
  const subject = `${companyName}: Invoice #${input.invoiceNumber} reminder`;
  const opening = input.isOverdue
    ? `Our records show that Invoice #${input.invoiceNumber} has an outstanding balance of ${money(input.balanceDueCents)}.`
    : `This is a friendly reminder that Invoice #${input.invoiceNumber} has a remaining balance of ${money(input.balanceDueCents)}.`;
  const text = [
    `Hi ${input.customerName},`,
    "",
    opening,
    input.dueAt ? `Due date: ${formatDate(input.dueAt)}` : "",
    `Service location: ${input.serviceLocation}`,
    "",
    `Review and pay the current invoice securely: ${input.portalUrl}`,
    "",
    "If payment is already on the way or you have a billing question, please reply to this email or call our office.",
    "",
    "Thank you,",
    companyName,
  ].filter(Boolean).join("\n");

  return brandedTemplate(subject, text, input.isOverdue ? "Outstanding invoice" : "Invoice reminder");
}

export function paymentConfirmationTemplate(input: {
  amountCents: number;
  balanceDueCents: number;
  customerName: string;
  invoiceNumber: string;
  paidAt: string;
  reference: string | null;
  surchargeCents: number;
  totalCollectedCents: number;
}) {
  const subject = `${companyName}: payment received for Invoice #${input.invoiceNumber}`;
  const text = [
    `Hi ${input.customerName},`,
    "",
    `We received your payment for Invoice #${input.invoiceNumber}.`,
    `Invoice principal: ${money(input.amountCents)}`,
    input.surchargeCents > 0 ? `Credit-card surcharge: ${money(input.surchargeCents)}` : "",
    `Total charged: ${money(input.totalCollectedCents)}`,
    `Payment date: ${formatDate(input.paidAt)}`,
    input.reference ? `Reference: ${input.reference}` : "",
    `Remaining balance: ${money(input.balanceDueCents)}`,
    "",
    "Thank you for choosing Angel Tree Services. Please reply to this email if you have any billing questions.",
    "",
    "Thank you,",
    companyName,
  ].filter(Boolean).join("\n");

  return brandedTemplate(subject, text, "Payment received");
}

function brandedTemplate(subject: string, text: string, eyebrow: string): TransactionalEmailTemplate {
  const paragraphs = text.split("\n\n").map((paragraph) => (
    `<p style="margin:0 0 16px;color:#28312c;font-size:16px;line-height:1.6;white-space:pre-wrap">${escapeHtml(paragraph)}</p>`
  )).join("");

  return {
    subject,
    text,
    html: `<!doctype html><html><body style="margin:0;background:#f3f7f4;font-family:Arial,sans-serif"><div style="padding:24px 12px"><div style="max-width:640px;margin:0 auto;border:1px solid #d8e4dc;background:#ffffff"><div style="padding:20px 24px;background:#174b32;color:#ffffff"><div style="font-size:13px;font-weight:700;text-transform:uppercase">${escapeHtml(eyebrow)}</div><div style="margin-top:5px;font-size:24px;font-weight:800">${companyName}</div></div><div style="padding:24px">${paragraphs}</div><div style="padding:16px 24px;border-top:1px solid #d8e4dc;color:#5b665f;font-size:13px">Professional tree service, landscaping, and lawn care.</div></div></div></body></html>`,
  };
}

function formatAppointmentWindow(startsAt: string, endsAt: string | null, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  });
  const start = formatter.format(new Date(startsAt));
  if (!endsAt) return `${start} (arrival time may vary)`;

  const end = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(endsAt));
  return `${start} to ${end}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(value));
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function compactDescription(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
