import {getFirewoodCollectorPolicy} from "../firewood/handoff/collector-policy";
import "server-only";

import type Stripe from "stripe";
import { withDeadline } from "../runtime/deadline.ts";
import { isCheckoutContractingParty } from "@/lib/payments/checkout-closure";
import { getInvoiceByPortalToken } from "@/lib/data/portal-invoice";
import { getSuccessfulPaymentTotal } from "@/lib/payments/reconciliation";
import { portalPaymentOwnershipIsValid } from "@/lib/payments/portal-ownership";
import { hashPortalToken } from "@/lib/portal/tokens";
import { releaseStaleCardReservations } from "@/lib/stripe/card-payment";
import { getServiceRoleClient } from "@/lib/supabase/admin";

export async function getPortalPaymentContext(rawToken: string, stripe: Stripe, livemode: boolean) {
  try {
    const lookup = await withDeadline(() => getInvoiceByPortalToken(rawToken), 5000);
    if (lookup.status !== "ready" || !lookup.invoice) {
      return failure("This invoice link is not available.", 404);
    }

    const expectedInvoiceId = lookup.invoice.id;
    const supabase = getServiceRoleClient();
    if (!supabase) return failure("Online payment is not available for this invoice.", 503);

    const invoiceResult = await withDeadline(signal => supabase
      .from("invoices")
      .select("id, customer_id, organization_id, invoice_number, document_terms_version, status, total_cents, customers:customers!invoices_customer_id_fkey(id, email), organizations(id, billing_email), billing_contact:organization_contacts!invoices_billing_contact_id_fkey(email), accounts_payable_contact:organization_contacts!invoices_accounts_payable_contact_id_fkey(email), jobs(service_location_id)")
      .eq("id", expectedInvoiceId)
      .abortSignal(signal)
      .single(), 5000);
    const invoice = readPaymentInvoice(invoiceResult?.data, expectedInvoiceId);
    if (invoiceResult?.error !== null || !invoice) {
      console.error("Portal payment lookup failed", { applicationErrorCode: "invoice_lookup_failed", route: "invoice_portal_payment" });
      return failure("This invoice is not available.", 404);
    }
    const firewood=await getFirewoodCollectorPolicy(supabase,invoice,livemode);
    if(!firewood.ok)return failure(firewood.message,firewood.status);
    if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
      return failure("This invoice is not available for online payment.", 409);
    }

    const tokenHash = hashPortalToken(rawToken);
    if (!tokenHash) return failure("This invoice link is not available.", 404);
    const tokenResult = await withDeadline(signal => supabase
      .from("invoice_portal_tokens")
      .select("invoice_id, customer_id, organization_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .abortSignal(signal)
      .maybeSingle(), 5000);
    const customer = asOne(invoice.customers);
    const organization = asOne(invoice.organizations);
    if (
      tokenResult?.error !== null
      || !isRecord(tokenResult.data)
      || !uuid(tokenResult.data.invoice_id)
      || !isCheckoutContractingParty(tokenResult.data)
      || tokenResult.data.revoked_at !== null
      || !hasUsableExpiry(tokenResult.data.expires_at)
      || !portalPaymentOwnershipIsValid({
        customerExists: Boolean(customer),
        invoice: { id: invoice.id, customer_id: invoice.customer_id, organization_id: invoice.organization_id },
        organizationExists: Boolean(organization),
        token: {
          id: tokenResult.data.invoice_id,
          customer_id: tokenResult.data.customer_id,
          organization_id: tokenResult.data.organization_id,
        },
      })
    ) {
      return failure("This invoice is not available for online payment.", 404);
    }

    const payments = await getSuccessfulPaymentTotal(supabase, invoice.id);
    if (payments?.error !== null || typeof payments.totalCents !== "number"
      || !Number.isSafeInteger(payments.totalCents) || payments.totalCents < 0) {
      console.error("Portal payment lookup failed", { applicationErrorCode: "balance_lookup_failed", route: "invoice_portal_payment" });
      return failure("Online payment is not available right now. Please try again later.", 503);
    }
    const invoicePrincipalCents = invoice.total_cents - payments.totalCents;
    if (!Number.isSafeInteger(invoicePrincipalCents) || invoicePrincipalCents <= 0) {
      return failure("This invoice no longer has a balance due.", 409);
    }
    if (invoicePrincipalCents > 99_999_999) {
      return failure("This invoice amount cannot be paid online. Please contact Angel Tree Services.", 409);
    }

    const cleanup = await releaseStaleCardReservations({ invoiceId: invoice.id, stripe, supabase, livemode, firewoodPolicy: firewood.policy });
    if (cleanup?.ok !== true) return failure("Online payment is not available right now. Please try again later.", 503);

    const processingResult = await withDeadline(signal => supabase
      .from("invoice_checkout_sessions")
      .select("id, invoice_id, status")
      .eq("invoice_id", invoice.id)
      .in("status", ["creating", "processing"])
      .limit(1)
      .abortSignal(signal)
      .maybeSingle(), 5000);
    if (processingResult?.error !== null) return failure("Online payment is not available right now. Please try again later.", 503);
    const processingPayment = processingResult.data;
    if (processingPayment !== null) {
      if (!isRecord(processingPayment) || !uuid(processingPayment.id) || processingPayment.invoice_id !== invoice.id
        || !["creating", "processing"].includes(processingPayment.status as string)) {
        return failure("Online payment is not available right now. Please try again later.", 503);
      }
      return failure("A payment is already processing for this invoice.", 409);
    }

    return {
      ok: true as const,
      billingEmail: getBillingEmail(invoice),
      invoice,
      firewoodPolicy:firewood.policy,
      invoicePrincipalCents,
      supabase,
    };
  } catch {
    return failure("Online payment is not available right now. Please try again later.", 503);
  }
}

export const getPortalCardPaymentContext = getPortalPaymentContext;

function getBillingEmail(invoice: {
  customers?: { email?: string | null } | { email?: string | null }[] | null;
  organizations?: { billing_email?: string | null } | { billing_email?: string | null }[] | null;
  billing_contact?: { email?: string | null } | { email?: string | null }[] | null;
  accounts_payable_contact?: { email?: string | null } | { email?: string | null }[] | null;
}) {
  return asOne(invoice.accounts_payable_contact)?.email
    ?? asOne(invoice.billing_contact)?.email
    ?? asOne(invoice.customers)?.email
    ?? asOne(invoice.organizations)?.billing_email
    ?? null;
}

function asOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function failure(message: string, status: number) {
  return { ok: false as const, message, status };
}

const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
function hasUsableExpiry(value: unknown) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)) && Date.parse(value) > Date.now());
}
// Supabase can return to-one relationships as an object or a one-item array.
// Never silently choose the first of several possible billing identities.
function relation(value: unknown): Record<string, unknown> | null | false {
  if (Array.isArray(value)) {
    if (value.length > 1) return false;
    value = value[0] ?? null;
  }
  return value === null ? null : isRecord(value) ? value : false;
}
type PaymentInvoice = {
  id: string; customer_id: string | null; organization_id: string | null;
  invoice_number: string | null;
  document_terms_version?:string|null; status: string; total_cents: number;
  customers: { id: string; email: string | null } | null;
  organizations: { id: string; billing_email: string | null } | null;
  billing_contact: { email: string | null } | null;
  accounts_payable_contact: { email: string | null } | null;
  jobs: { service_location_id: string | null } | null;
};
function readPaymentInvoice(value: unknown, expectedId: string): PaymentInvoice | null {
  if (!isRecord(value) || !uuid(value.id) || value.id !== expectedId || !isCheckoutContractingParty({ customer_id: value.customer_id, organization_id: value.organization_id })
    || !(value.customer_id === null || uuid(value.customer_id)) || !(value.organization_id === null || uuid(value.organization_id))
    || typeof value.status !== "string" || !["draft", "sent", "partially_paid", "paid", "void", "overdue"].includes(value.status)
    || !nullableText(value.invoice_number) || typeof value.total_cents !== "number"
    || !Number.isSafeInteger(value.total_cents) || value.total_cents < 0 || value.total_cents > 2147483647) return null;
  const customer = relation(value.customers), organization = relation(value.organizations);
  const billing = relation(value.billing_contact), payable = relation(value.accounts_payable_contact), job = relation(value.jobs);
  if (customer === false || organization === false || billing === false || payable === false || job === false
    || (value.customer_id !== null && customer?.id !== value.customer_id)
    || (value.organization_id !== null && organization?.id !== value.organization_id)
    || (value.customer_id === null && customer !== null) || (value.organization_id === null && organization !== null)
    || (customer !== null && !nullableText(customer.email)) || (organization !== null && !nullableText(organization.billing_email))
    || (billing !== null && !nullableText(billing.email)) || (payable !== null && !nullableText(payable.email))
    || (job !== null && job.service_location_id !== null && !uuid(job.service_location_id))) return null;
  return { ...value, customers: customer, organizations: organization,
    billing_contact: billing, accounts_payable_contact: payable, jobs: job } as PaymentInvoice;
}
