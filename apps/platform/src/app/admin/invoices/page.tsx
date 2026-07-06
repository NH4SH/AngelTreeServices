import { CircleDollarSign, ReceiptText } from "lucide-react";
import Link from "next/link";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddInvoiceForm } from "./InvoiceForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCustomerOptions } from "@/lib/data/customers";
import { getInvoices } from "@/lib/data/invoices";
import { getJobOptions } from "@/lib/data/jobs";
import type { InvoiceStatus } from "@/lib/types/database";

const statuses: InvoiceStatus[] = ["draft", "sent", "partially_paid", "paid", "overdue", "void"];

export default async function InvoicesPage() {
  const context = await getAuthenticatedPlatformContext("/admin/invoices");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening invoices" />;
  }

  const [invoices, customers, jobs] = await Promise.all([
    getInvoices(),
    getCustomerOptions(),
    getJobOptions(),
  ]);

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <ReceiptText aria-hidden="true" size={18} />
            Invoices
          </p>
          <h1>Invoice records without payment processing.</h1>
          <p>
            Build invoice rows and line items from the same protected CRM foundation. Stripe, payment
            links, receipts, and automatic paid status changes are intentionally not connected.
          </p>
        </section>

        {[invoices.error, customers.error, jobs.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="filter-pills" aria-label="Invoice statuses">
          {statuses.map((status) => (
            <span key={status}>{status.replace("_", " ")}</span>
          ))}
        </section>

        <section className="crm-layout">
          <div className="crm-main">
            {invoices.data.length === 0 ? (
              <EmptyState title="No invoices yet" body="Create a job first, then add an invoice scaffold." />
            ) : (
              <div className="record-list">
                {invoices.data.map((invoice) => (
                  <article className="record-card" key={invoice.id}>
                    <div className="record-card-header">
                      <div>
                        <h2>{invoice.invoice_number || "Draft invoice"}</h2>
                        <p>{invoice.customers?.display_name ?? "Unknown customer"}</p>
                      </div>
                      <span className="status-pill">{invoice.status.replace("_", " ")}</span>
                    </div>
                    <p>{invoice.jobs?.requested_scope || "No job scope attached."}</p>
                    <dl className="record-details">
                      <div>
                        <dt>Total</dt>
                        <dd>{formatCurrency(invoice.total_cents)}</dd>
                      </div>
                      <div>
                        <dt>Balance due</dt>
                        <dd>{formatCurrency(invoice.balance_due_cents)}</dd>
                      </div>
                      <div>
                        <dt>Due date</dt>
                        <dd>{invoice.due_at ? new Date(invoice.due_at).toLocaleDateString() : "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Line items</dt>
                        <dd>{invoice.invoice_line_items?.length ?? 0}</dd>
                      </div>
                    </dl>
                    <div className="record-actions">
                      <Link href={`/admin/invoices/${invoice.id}`}>Open invoice</Link>
                      <Link href={`/admin/jobs/${invoice.job_id}`}>Open job</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="crm-side">
            <section className="form-panel">
              <h2>Add invoice</h2>
              <AddInvoiceForm customers={customers.data} jobs={jobs.data} />
            </section>
            <section className="notice-panel">
              <strong>
                <CircleDollarSign aria-hidden="true" size={18} />
                Payment boundary
              </strong>
              <p>
                Payment rows may be read for future status context, but this phase does not collect,
                create, or reconcile real payments.
              </p>
            </section>
          </aside>
        </section>
      </div>
    </PlatformFrame>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
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
