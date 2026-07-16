import { CircleDollarSign, Plus, ReceiptText, X } from "lucide-react";
import Link from "next/link";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { InvoiceStatusActions } from "@/components/workflow-actions";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddInvoiceForm } from "./InvoiceForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateInvoice } from "@/lib/actions/duplicate-records";
import { getCustomerOptions } from "@/lib/data/customers";
import { getInvoices } from "@/lib/data/invoices";
import { getJobOptions } from "@/lib/data/jobs";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";
import type { Customer, InvoiceStatus, InvoiceWithRelations, Job } from "@/lib/types/database";

type InvoicesPageProps = {
  searchParams: Promise<{
    new?: string;
  }>;
};

const summaryOrder: { key: InvoiceStatus; label: string }[] = [
  { key: "draft", label: "Ready" },
  { key: "sent", label: "Sent" },
  { key: "partially_paid", label: "Partially paid" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
  { key: "void", label: "Void" },
];

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const params = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/invoices");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening invoices" />;
  }

  const [invoices, customers, jobs] = await Promise.all([
    getInvoices(),
    getCustomerOptions(),
    getJobOptions(),
  ]);
  const summary = getInvoiceSummary(invoices.data);
  const outstandingCents = invoices.data
    .filter((invoice) => !["paid", "void"].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.balance_due_cents, 0);

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page">
        <section className="page-heading commerce-heading">
          <div>
            <p className="surface-label">
              <ReceiptText aria-hidden="true" size={18} />
              Invoices
            </p>
            <h1>Invoices</h1>
            <p>Track sent invoices, balances, and payment follow-up.</p>
          </div>
          <Link className="primary-action" href="/admin/invoices?new=1">
            <Plus aria-hidden="true" size={18} />
            New invoice
          </Link>
        </section>

        {[invoices.error, customers.error, jobs.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="commerce-summary-strip" aria-label="Invoice workflow summary">
          {summaryOrder.map((item) => (
            <SummaryChip key={item.key} label={item.label} value={summary[item.key]} />
          ))}
          <SummaryChip emphasis label="Outstanding" value={formatCurrency(outstandingCents)} />
        </section>

        {invoices.data.length === 0 ? (
          <EmptyState title="No invoices yet" body="Create an invoice from an accepted quote or a completed job." />
        ) : (
          <section className="commerce-table-shell" aria-label="Invoices">
            <div className="commerce-table-header invoice-grid" aria-hidden="true">
              <span>Invoice</span>
              <span>Customer / job</span>
              <span>Status</span>
              <span>Balance</span>
              <span>Dates</span>
              <span>Actions</span>
            </div>
            <div className="commerce-row-list">
              {invoices.data.map((invoice) => (
                <article className="commerce-row invoice-grid" key={invoice.id}>
                  <div className="commerce-record-title">
                    <Link href={`/admin/invoices/${invoice.id}`}>{getInvoiceDisplayNumber(invoice.invoice_number)}</Link>
                    <span>{invoice.invoice_line_items?.length ?? 0} line items</span>
                  </div>
                  <div className="commerce-cell">
                    <strong>{invoice.customers?.display_name ?? "Unknown customer"}</strong>
                    <span>{formatServiceType(invoice.jobs?.service_type) || invoice.jobs?.requested_scope || "No job scope attached"}</span>
                  </div>
                  <div className="commerce-cell">
                    <span className={`status-pill invoice-status ${invoice.status}`}>
                      {formatInvoiceStatus(invoice.status)}
                    </span>
                  </div>
                  <div className="commerce-money">
                    <strong>{formatCurrency(invoice.balance_due_cents)}</strong>
                    <span>{formatCurrency(invoice.total_cents)} total</span>
                  </div>
                  <div className="commerce-cell">
                    <span>Due {formatDate(invoice.due_at)}</span>
                    <span>{invoice.sent_at ? `Sent ${formatDate(invoice.sent_at)}` : `Created ${formatDate(invoice.created_at)}`}</span>
                  </div>
                  <div className="commerce-actions">
                    <Link className="secondary-action" href={`/admin/invoices/${invoice.id}`}>
                      Open
                    </Link>
                    <DuplicateRecordButton
                      action={duplicateInvoice}
                      hiddenFieldName="invoice_id"
                      hiddenFieldValue={invoice.id}
                      label="Duplicate"
                      pendingLabel="Copying..."
                    />
                    <InvoiceStatusActions invoiceId={invoice.id} status={invoice.status} />
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="notice-panel commerce-boundary-note">
          <strong>
            <CircleDollarSign aria-hidden="true" size={18} />
            Payments
          </strong>
          <p>Eligible sent invoices can be paid through secure Stripe Checkout. Owners and admins can also record check, cash, ACH, or other manual payments.</p>
        </section>

        {params.new === "1" ? <InvoiceCreateDrawer customers={customers.data} jobs={jobs.data} /> : null}
      </div>
    </PlatformFrame>
  );
}

function InvoiceCreateDrawer({
  customers,
  jobs,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
}) {
  return (
    <div aria-labelledby="new-invoice-title" className="commerce-drawer-overlay" role="dialog">
      <Link aria-label="Close new invoice panel" className="commerce-drawer-backdrop" href="/admin/invoices" />
      <aside className="commerce-drawer">
        <div className="commerce-drawer-header">
          <div>
            <p className="surface-label">
              <ReceiptText aria-hidden="true" size={18} />
              Invoice builder
            </p>
            <h2 id="new-invoice-title">New invoice</h2>
            <p>Attach the customer and job first, then add the billing lines.</p>
          </div>
          <Link aria-label="Close new invoice panel" className="secondary-action icon-action" href="/admin/invoices">
            <X aria-hidden="true" size={18} />
          </Link>
        </div>
        <AddInvoiceForm customers={customers} jobs={jobs} />
        <Link className="secondary-action commerce-cancel-link" href="/admin/invoices">
          Cancel
        </Link>
      </aside>
    </div>
  );
}

function SummaryChip({
  emphasis,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: number | string;
}) {
  return (
    <div className={emphasis ? "commerce-summary-chip emphasis" : "commerce-summary-chip"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function getInvoiceSummary(invoices: InvoiceWithRelations[]) {
  return invoices.reduce<Record<InvoiceStatus, number>>(
    (counts, invoice) => {
      counts[invoice.status] += 1;
      return counts;
    },
    {
      draft: 0,
      sent: 0,
      partially_paid: 0,
      paid: 0,
      overdue: 0,
      void: 0,
    },
  );
}

function formatServiceType(serviceType?: string | null) {
  return serviceType ? serviceType.replace("_", " ") : "";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : "not set";
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state commerce-empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
      <Link className="primary-action" href="/admin/invoices?new=1">
        <Plus aria-hidden="true" size={18} />
        New invoice
      </Link>
    </section>
  );
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
