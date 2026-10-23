import "server-only";

import { renderCustomerReminderEmailHtml } from "../email/customer-reminder-layout.ts";
import { renderCustomerPaymentReceiptHtml } from "../email/customer-payment-receipt-layout.ts";
import { renderCustomerAppointmentEmail } from "../email/customer-appointment-layout.ts";
import { companyBrand } from "../company-brand.ts";

import type { TransactionalEmailTemplate } from "@/lib/email/templates";
import { formatBusinessDate } from "@/lib/business-time";

const companyName = companyBrand.name;

export function appointmentChangeTemplate(input: {
  customerName: string; kind: "changed" | "cancelled"; timezone: string; location: string;
  before: { starts_at: string; ends_at: string | null; status: string; type: string };
  after: { starts_at: string; ends_at: string | null; type: string };
}): TransactionalEmailTemplate {
  const cancelled = input.kind === "cancelled";
  const label = (cancelled ? input.before.type : input.after.type) === "estimate" ? "estimate appointment" : "work visit";
  const action = cancelled ? "cancelled" : input.before.status === "cancelled" ? "reinstated" : "updated";
  const subject = `${companyName}: your ${label} has been ${action}`;
  const paragraphs = [`Hi ${input.customerName},`, `Your ${label} with ${companyName} has been ${action}.`,
    cancelled ? `Cancelled visit: ${formatAppointmentWindow(input.before.starts_at, input.before.ends_at, input.timezone)}`
      : `Previous date and window: ${formatAppointmentWindow(input.before.starts_at, input.before.ends_at, input.timezone)}\nUpdated date and window: ${formatAppointmentWindow(input.after.starts_at, input.after.ends_at, input.timezone)}`,
    `Service location: ${input.location}`,
    cancelled ? "This notice applies to this visit only. Any other scheduled visits remain unchanged. Contact our office to arrange another time."
      : "Please use the updated details above. Other scheduled visits remain unchanged. Reply if this time does not work for you or if the access plan needs to change.",
  ];
  return renderCustomerAppointmentEmail({ subject, paragraphs, title: cancelled ? "Visit cancelled" : action === "reinstated" ? "Visit reinstated" : "Visit updated" });
}

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
  const paragraphs = [
    `Hi ${input.customerName},`,
    `Your ${input.communicationLabel} with ${companyName} ${action}.`,
    input.workSessions && input.workSessions.length > 1
      ? `Work schedule (${input.workSessions.length} days):\n${input.workSessions.map((session) => formatScheduleLine(session.startsAt, session.endsAt, input.timezone)).join("\n")}`
      : `Date and arrival window: ${formatAppointmentWindow(input.startsAt, input.endsAt, input.timezone)}`,
    `Service location: ${input.location}`,
    "Please reply to this email or call our office if the location or access plan changes.",
  ];

  return renderCustomerAppointmentEmail({ subject, paragraphs, title: input.isConfirmation ? "Appointment confirmed" : "Appointment reminder" });
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
  proposalNumber: string | null;
}): TransactionalEmailTemplate {
  const proposalLabel = input.proposalNumber ? `Proposal #${input.proposalNumber}` : "your proposal";
  const subject = `Following up on ${proposalLabel} from ${companyName}`;
  const greeting = `Hi ${input.customerName},`;
  const intro = `We are following up on ${proposalLabel}. Review the latest version or contact us with any questions about the work.`;
  const scope = input.lineItems.slice(0, 4).map(item => `${item.name}${item.description ? `: ${compactDescription(item.description)}` : ""}`);
  const guidance = "You can respond from the secure proposal. If you would like to talk through the work or request an adjustment, reply to this email or call our office.";
  const text = [greeting, intro, `Review proposal: ${input.portalUrl}`, guidance,
    ...(scope.length ? ["Proposed work:\n" + scope.map(item => `- ${item}`).join("\n")] : []),
    "Need help or a new link? Reply to this email or call (540) 388-8715.", `Thank you,\n${companyName}`,
  ].join("\n\n");
  return { subject, text, html: renderCustomerReminderEmailHtml({
    subject, title: "Questions about your proposal?", greeting, intro,
    details: [], scope, portalUrl: input.portalUrl, ctaLabel: "Review proposal", guidance,
  }) };
}

export function invoiceReminderTemplate(input: {
  balanceDueCents: number;
  customerName: string;
  dueAt: string | null;
  invoiceNumber: string;
  isOverdue: boolean;
  portalUrl: string;
  serviceLocation: string;
}): TransactionalEmailTemplate {
  const subject = `${companyName}: Invoice #${input.invoiceNumber} reminder`;
  const greeting = `Hi ${input.customerName},`;
  const intro = input.isOverdue
    ? `Our records show a remaining balance for Invoice #${input.invoiceNumber}.`
    : `This is a friendly reminder about Invoice #${input.invoiceNumber}.`;
  const guidance = "The secure invoice shows the latest balance and payment status. If you have already paid or started a payment, check there before paying again. Reply to this email or call our office with any billing questions.";
  const dueDate = input.dueAt ? formatDate(input.dueAt) : "See the invoice for payment terms";
  const details = [
    { label: "Remaining balance", value: money(input.balanceDueCents), emphasis: true },
    { label: "Due date", value: dueDate === "Invalid date" ? "See the invoice for payment terms" : dueDate },
    ...(input.serviceLocation.trim() ? [{ label: "Service location", value: input.serviceLocation }] : []),
  ];
  const text = [greeting, intro, details.map(item => `${item.label}: ${item.value}`).join("\n"),
    `View invoice: ${input.portalUrl}`, guidance,
    "Need help or a new link? Reply to this email or call (540) 388-8715.", `Thank you,\n${companyName}`,
  ].join("\n\n");
  return { subject, text, html: renderCustomerReminderEmailHtml({
    subject, title: input.isOverdue ? "Invoice balance reminder" : "Your invoice reminder", greeting, intro,
    details, scope: [], portalUrl: input.portalUrl, ctaLabel: "View invoice", guidance,
  }) };
}

export function paymentConfirmationTemplate(input: {
  amountCents: number;
  balanceDueCents: number;
  customerName: string;
  invoiceNumber: string;
  paidAt: string | null;
  paymentMethod?: string | null;
  reference: string | null;
  surchargeCents: number;
  totalCollectedCents: number;
}) {
  const subject = `${companyName}: payment received for Invoice #${input.invoiceNumber}`;
  const greeting = `Hi ${input.customerName},`;
  const intro = `We received your payment for Invoice #${input.invoiceNumber}.`;
  const date = input.paidAt ? formatDate(input.paidAt) : "Invalid date";
  const methods = new Map([ ["card", "Card"], ["ach", "Bank payment (ACH)"], ["check", "Check"], ["cash", "Cash"], ["other", "Other"] ]);
  const details = [
    { label: "Invoice", value: `#${input.invoiceNumber}` },
    { label: "Payment method", value: methods.get(input.paymentMethod ?? "") ?? "Not recorded" },
    { label: "Payment date", value: date === "Invalid date" ? "Not recorded" : date },
    { label: "Applied to invoice", value: money(input.amountCents) },
    ...(input.surchargeCents > 0 ? [{ label: "Credit-card surcharge", value: money(input.surchargeCents) }] : []),
    { label: "Total received", value: money(input.totalCollectedCents) },
    ...(input.reference?.trim() ? [{ label: "Reference", value: input.reference.trim() }] : []),
    { label: "Remaining invoice balance", value: money(input.balanceDueCents) },
  ];
  const text = [greeting, intro, details.map(item => `${item.label}: ${item.value}`).join("\n"),
    "Keep this receipt for your records. The remaining invoice balance reflects our records when this receipt was prepared.",
    "Billing questions? Reply to this email or call (540) 388-8715.", `Thank you,\n${companyName}`,
  ].join("\n\n");
  return { subject, text, html: renderCustomerPaymentReceiptHtml({ subject, greeting, intro, details }) };
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
  return formatBusinessDate(value, { dateStyle: "long" });
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function compactDescription(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}
