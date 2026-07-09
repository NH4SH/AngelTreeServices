export type DocumentTerm = {
  label: string;
  text: string;
};

export const quoteTerms: readonly DocumentTerm[] = [
  {
    label: "Validity",
    text: "This estimate is valid for 30 days.",
  },
  {
    label: "Debris",
    text: "All debris from the described work will be removed from the property unless otherwise specified.",
  },
  {
    label: "Ground Disturbance",
    text: "Removing trees and stumps can cause ground disturbance.",
  },
  {
    label: "Payment",
    text: "Full payment is due upon completion of the work.",
  },
  {
    label: "Authorization",
    text: "By approving this proposal, you agree to the scope of work, total cost, and terms of this proposal.",
  },
] as const;

export const invoiceTerms: readonly DocumentTerm[] = [
  {
    label: "Payment Due Date",
    text: "Payment in full is due within 15 days of the invoice date.",
  },
  {
    label: "Accepted Forms of Payment",
    text: "Checks, ACH transfers, major credit/debit cards, and approved digital wallets are accepted. A 3% processing fee applies to card transactions.",
  },
  {
    label: "Late Fees & Interest",
    text: "Balances unpaid after 15 days accrue interest at 1.5% per month, 18% APR, or $25, whichever is greater. Interest compounds monthly until paid.",
  },
  {
    label: "Returned / Declined Payments",
    text: "A $35 fee, or the maximum allowed by law, is charged for any returned check or declined electronic payment.",
  },
  {
    label: "Collection & Legal Costs",
    text: "Customer is responsible for reasonable costs of collection, including third-party agency fees, attorney's fees, and court costs, incurred in recovering unpaid balances.",
  },
  {
    label: "Disputes & Adjustments",
    text: "Invoice questions or disputes must be submitted in writing within 7 days of the invoice date. Absent written notice, the invoice is deemed accurate and accepted.",
  },
  {
    label: "Scope Confirmation",
    text: "Charges reflect only the services, materials, and quantities described in the accompanying work order, estimate, or invoice. Additional or unforeseen work will be invoiced separately.",
  },
  {
    label: "Satisfaction & Warranty",
    text: "Labor is warranted for 12 months against defects in workmanship. Warranty is void if recommended follow-up care, such as watering schedules or site care, is not followed.",
  },
  {
    label: "Site Access & Safety",
    text: "Customer agrees to provide clear access to the work area during the scheduled service window and to keep pets, children, and bystanders at a safe distance.",
  },
  {
    label: "Force Majeure",
    text: "Angel Tree Services is not liable for delays or damages caused by events beyond its control, including extreme weather, utility interruptions, or government actions.",
  },
  {
    label: "Limitation of Liability",
    text: "Angel Tree Services' liability is limited to the invoice amount for the specific service performed. Angel Tree Services is not liable for consequential or incidental damages.",
  },
  {
    label: "Governing Law & Venue",
    text: "These terms are governed by the laws of the Commonwealth of Virginia. Venue for any dispute will be the courts of the county where Angel Tree Services LLC is headquartered.",
  },
  {
    label: "Acceptance",
    text: "Payment of any part of this invoice constitutes acceptance of these invoice terms and conditions.",
  },
] as const;

export function getQuoteTerms(expiresAt?: string | null): readonly DocumentTerm[] {
  if (!expiresAt) {
    return quoteTerms;
  }

  return [
    {
      label: "Validity",
      text: `This estimate is valid through ${formatDate(expiresAt)}.`,
    },
    ...quoteTerms.slice(1),
  ];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
