import { CircleDollarSign, Plus, ReceiptText, X } from "lucide-react";
import Link from "next/link";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { InvoiceStatusActions } from "@/components/workflow-actions";
import { PortalViewStatus } from "@/components/portal-engagement";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddInvoiceForm } from "./InvoiceForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateInvoice } from "@/lib/actions/duplicate-records";
import { getCustomerOptions } from "@/lib/data/customers";
import { getServiceLocations } from "@/lib/data/customers";
import { getInvoices } from "@/lib/data/invoices";
import { getJobOptions } from "@/lib/data/jobs";
import { getOrganizations } from "@/lib/data/organizations";
import { getServiceCategories } from "@/lib/data/reports";
import { formatInvoiceStatus, getInvoiceDisplayNumber } from "@/lib/invoices/status";
import type { Customer, InvoiceStatus, InvoiceWithRelations, Job, Organization, ServiceCategory, ServiceLocation } from "@/lib/types/database";

type InvoicesPageProps = {
  searchParams: Promise<{
    new?: string;
    customer_id?: string;
    job_id?: string;
    status?: string;
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

  const [invoices, customers, organizations, jobs, serviceCategories, serviceLocations] = await Promise.all([
    getInvoices(),
    getCustomerOptions(),
    getOrganizations(),
    getJobOptions(),
    getServiceCategories(),
    getServiceLocations(),
  ]);
  const summary = getInvoiceSummary(invoices.data);
  const selectedStatus = summaryOrder.some((item) => item.key === params.status) ? params.status as InvoiceStatus : null;
  const visibleInvoices = selectedStatus ? invoices.data.filter((invoice) => invoice.status === selectedStatus) : invoices.data;
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

        {[invoices.error, customers.error, organizations.error, jobs.error, serviceCategories.error, serviceLocations.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="commerce-summary-strip" aria-label="Invoice workflow summary">
          {summaryOrder.map((item) => (
            <SummaryChip active={selectedStatus === item.key} href={`/admin/invoices?status=${item.key}`} key={item.key} label={item.label} value={summary[item.key]} />
          ))}
          <SummaryChip emphasis label="Outstanding" value={formatCurrency(outstandingCents)} />
        </section>

        {visibleInvoices.length === 0 ? (
          <EmptyState title={selectedStatus ? `No ${selectedStatus.replaceAll("_", " ")} invoices` : "No invoices yet"} body={selectedStatus ? "Choose another invoice status to continue." : "Create an invoice from an accepted quote or a completed job."} />
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
              {visibleInvoices.map((invoice) => (
                <article className="commerce-row invoice-grid" key={invoice.id}>
                  <div className="commerce-record-title">
                    <Link href={`/admin/invoices/${invoice.id}`}>{getInvoiceDisplayNumber(invoice.invoice_number)}</Link>
                    <span>{invoice.invoice_line_items?.length ?? 0} line items</span>
                  </div>
                  <div className="commerce-cell">
                    <strong>{invoice.organizations?.name ?? invoice.customers?.display_name ?? "Unknown contracting party"}</strong>
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
                    <PortalViewStatus engagement={invoice} />
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

        {params.new === "1" ? <InvoiceCreateDrawer customers={customers.data} initialCustomerId={params.customer_id} initialJobId={params.job_id} jobs={jobs.data} organizations={organizations.data} serviceCategories={serviceCategories.data} serviceLocations={serviceLocations.data} /> : null}
      </div>
    </PlatformFrame>
  );
}

function InvoiceCreateDrawer({
  customers,
  initialCustomerId,
  initialJobId,
  jobs,
  organizations,
  serviceCategories,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name" | "email" | "phone" | "billing_address">[];
  initialCustomerId?: string;
  initialJobId?: string;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "organization_id" | "service_location_id">[];
  organizations: Pick<Organization, "id" | "name">[];
  serviceCategories: ServiceCategory[];
  serviceLocations: ServiceLocation[];
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
            <p>Choose a customer, then optionally attach a property or completed work order.</p>
          </div>
          <Link aria-label="Close new invoice panel" className="secondary-action icon-action" href="/admin/invoices">
            <X aria-hidden="true" size={18} />
          </Link>
        </div>
        <AddInvoiceForm customers={customers} initialCustomerId={initialCustomerId} initialJobId={initialJobId} jobs={jobs} organizations={organizations} serviceCategories={serviceCategories} serviceLocations={serviceLocations} />
        <Link className="secondary-action commerce-cancel-link" href="/admin/invoices">
          Cancel
        </Link>
      </aside>
    </div>
  );
}

function SummaryChip({
  active,
  emphasis,
  href,
  label,
  value,
}: {
  active?: boolean;
  emphasis?: boolean;
  href?: string;
  label: string;
  value: number | string;
}) {
  const content = <><span>{label}</span><strong>{value}</strong></>;
  return href ? (
    <Link aria-current={active ? "page" : undefined} className={emphasis ? "commerce-summary-chip emphasis" : "commerce-summary-chip"} href={href}>{content}</Link>
  ) : (
    <div className={emphasis ? "commerce-summary-chip emphasis" : "commerce-summary-chip"}>
      {content}
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
