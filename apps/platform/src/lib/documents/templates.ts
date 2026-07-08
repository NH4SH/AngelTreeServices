import type { DocumentTemplate, InvoiceDocumentPreview, QuoteDocumentPreview } from "@/lib/types/database";

type EmailTemplateInput = {
  customerName?: string;
  companyName?: string;
  actionLabel?: string;
};

const defaultCompanyName = "Angel Tree Services";

export const documentTemplates: DocumentTemplate[] = [
  getQuoteEmailTemplate(),
  getInvoiceEmailTemplate(),
  getFollowUpEmailTemplate(),
  getCompletedJobReviewTemplate(),
  {
    id: "crew-work-order",
    name: "Crew work order",
    purpose: "work_order",
    subject: "Work order for scheduled tree service",
    body: "Crew-facing work order with job address, scope, notes, equipment, photos, and completion checklist.",
  },
];

export const quotePreviewPlaceholder: QuoteDocumentPreview = {
  customerLabel: "Customer selected from CRM",
  jobLocationLabel: "Service location selected for the quote",
  scopeOfWork: "Scope of work will populate from quote notes and line items.",
  lineItems: [
    {
      description: "Tree service line item",
      quantity: 1,
      unitPriceCents: 0,
      totalCents: 0,
    },
  ],
  totalCents: 0,
  notes: "Customer-facing quote notes will appear here before approval.",
  approvalLabel: "Approval action placeholder",
};

export const invoicePreviewPlaceholder: InvoiceDocumentPreview = {
  customerLabel: "Customer selected from CRM",
  invoiceNumberLabel: "Invoice number pending",
  jobLocationLabel: "Service location selected from work order",
  lineItems: [
    {
      description: "Invoice line item",
      quantity: 1,
      unitPriceCents: 0,
      totalCents: 0,
    },
  ],
  totalDueCents: 0,
  paymentStatusLabel: "Payment status pending",
  dueDateLabel: "Due date pending",
};

export function getQuoteEmailTemplate(input: EmailTemplateInput = {}): DocumentTemplate {
  const companyName = input.companyName ?? defaultCompanyName;
  const customerName = input.customerName ?? "{{ customer_name }}";

  return {
    id: "quote-email",
    name: "Quote email",
    purpose: "quote_email",
    subject: `Your ${companyName} quote is ready`,
    body: `Hi ${customerName}, your quote is ready for review. Please open the secure portal link when customer-token access is implemented.`,
  };
}

export function getInvoiceEmailTemplate(input: EmailTemplateInput = {}): DocumentTemplate {
  const companyName = input.companyName ?? defaultCompanyName;
  const customerName = input.customerName ?? "{{ customer_name }}";

  return {
    id: "invoice-email",
    name: "Invoice email",
    purpose: "invoice_email",
    subject: `Your invoice from ${companyName}`,
    body: `Hi ${customerName}, your invoice is ready. Online payment links will be added after payment security is designed.`,
  };
}

export function getFollowUpEmailTemplate(input: EmailTemplateInput = {}): DocumentTemplate {
  const customerName = input.customerName ?? "{{ customer_name }}";
  const actionLabel = input.actionLabel ?? "next step";

  return {
    id: "follow-up-email",
    name: "Follow-up email",
    purpose: "follow_up_email",
    subject: "Following up on your tree service request",
    body: `Hi ${customerName}, we are checking in about your ${actionLabel}. Reply here or call the office when you are ready.`,
  };
}

export function getCompletedJobReviewTemplate(input: EmailTemplateInput = {}): DocumentTemplate {
  const customerName = input.customerName ?? "{{ customer_name }}";

  return {
    id: "completed-job-review",
    name: "Completed job review request",
    purpose: "review_request",
    subject: "How did your Angel Tree Services job go?",
    body: `Hi ${customerName}, thank you for choosing Angel Tree Services. A review link can be added here after the completion workflow is ready.`,
  };
}
