import {
  ClipboardCheck,
  FileSignature,
  Files,
  Mail,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import {
  documentTemplates,
  invoicePreviewPlaceholder,
  quotePreviewPlaceholder,
} from "@/lib/documents/templates";

const workOrderChecklist = [
  "Confirm service address and access notes",
  "Review scope and crew notes",
  "Capture before photos",
  "Complete work and cleanup checklist",
  "Capture after photos",
];

export default async function DocumentsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/documents");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening documents" />;
  }

  return (
    <PlatformFrame active="documents" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <Files aria-hidden="true" size={18} />
            Documents
          </p>
          <h1>Documents</h1>
          <p>Preview quote, invoice, email, and work-order templates before sending or printing.</p>
        </section>

        <section className="document-grid" aria-label="Document workflow previews">
          <article className="paper-preview">
            <DocumentLabel icon={<FileSignature aria-hidden="true" size={18} />} label="Quote preview" />
            <header className="document-header">
              <strong>Angel Tree Services</strong>
              <span>Quote preview</span>
            </header>
            <dl className="document-meta">
              <div>
                <dt>Customer</dt>
                <dd>{quotePreviewPlaceholder.customerLabel}</dd>
              </div>
              <div>
                <dt>Job / Location</dt>
                <dd>{quotePreviewPlaceholder.jobLocationLabel}</dd>
              </div>
            </dl>
            <section className="document-section">
              <h2>Scope of work</h2>
              <p>{quotePreviewPlaceholder.scopeOfWork}</p>
            </section>
            <LineItems
              items={quotePreviewPlaceholder.lineItems}
              totalCents={quotePreviewPlaceholder.totalCents}
              totalLabel="Total"
            />
            <section className="document-section">
              <h2>Notes</h2>
              <p>{quotePreviewPlaceholder.notes}</p>
            </section>
            <p className="approval-placeholder">
              <ShieldCheck aria-hidden="true" size={16} />
              {quotePreviewPlaceholder.approvalLabel}
            </p>
          </article>

          <article className="paper-preview">
            <DocumentLabel icon={<ReceiptText aria-hidden="true" size={18} />} label="Invoice preview" />
            <header className="document-header">
              <strong>Angel Tree Services</strong>
              <span>{invoicePreviewPlaceholder.invoiceNumberLabel}</span>
            </header>
            <dl className="document-meta">
              <div>
                <dt>Customer</dt>
                <dd>{invoicePreviewPlaceholder.customerLabel}</dd>
              </div>
              <div>
                <dt>Job / Location</dt>
                <dd>{invoicePreviewPlaceholder.jobLocationLabel}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{invoicePreviewPlaceholder.dueDateLabel}</dd>
              </div>
              <div>
                <dt>Payment status</dt>
                <dd>{invoicePreviewPlaceholder.paymentStatusLabel}</dd>
              </div>
            </dl>
            <LineItems
              items={invoicePreviewPlaceholder.lineItems}
              totalCents={invoicePreviewPlaceholder.totalDueCents}
              totalLabel="Total due"
            />
          </article>

          <article className="paper-preview">
            <DocumentLabel icon={<ClipboardCheck aria-hidden="true" size={18} />} label="Work order preview" />
            <header className="document-header">
              <strong>Crew work order</strong>
              <span>Internal draft</span>
            </header>
            <dl className="document-meta">
              <div>
                <dt>Job address</dt>
                <dd>Service location selected from job</dd>
              </div>
              <div>
                <dt>Equipment</dt>
                <dd>Equipment list placeholder</dd>
              </div>
            </dl>
            <section className="document-section">
              <h2>Scope and crew notes</h2>
              <p>Job scope, internal crew notes, hazards, parking, and access notes will appear here.</p>
            </section>
            <ul className="checklist-preview">
              {workOrderChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="paper-preview">
            <DocumentLabel icon={<Mail aria-hidden="true" size={18} />} label="Email drafts" />
            <div className="template-list">
              {documentTemplates
                .filter((template) => template.purpose !== "work_order")
                .map((template) => (
                  <section className="template-card" key={template.id}>
                    <h2>{template.name}</h2>
                    <strong>{template.subject}</strong>
                    <p>{template.body}</p>
                  </section>
                ))}
            </div>
          </article>
        </section>

        <section className="notice-panel">
          <strong>Document security boundary</strong>
          <p>
            Customer portal share links, quote approval tokens, invoice payment links, generated PDFs,
            and production email sending require a later secure-token design.
          </p>
        </section>
      </div>
    </PlatformFrame>
  );
}

function DocumentLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <p className="document-label">
      {icon}
      {label}
    </p>
  );
}

function LineItems({
  items,
  totalCents,
  totalLabel,
}: {
  items: { description: string; quantity: number; unitPriceCents: number; totalCents: number }[];
  totalCents: number;
  totalLabel: string;
}) {
  return (
    <section className="line-items-preview" aria-label={totalLabel}>
      {items.map((item) => (
        <div className="line-item-row" key={item.description}>
          <span>{item.description}</span>
          <span>{item.quantity}</span>
          <span>{formatCurrency(item.unitPriceCents)}</span>
          <strong>{formatCurrency(item.totalCents)}</strong>
        </div>
      ))}
      <div className="line-item-total">
        <span>{totalLabel}</span>
        <strong>{formatCurrency(totalCents)}</strong>
      </div>
    </section>
  );
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
