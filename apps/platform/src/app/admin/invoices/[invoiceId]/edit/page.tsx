import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { getServiceCategories } from "@/lib/data/reports";
import { getInvoiceDisplayNumber } from "@/lib/invoices/status";
import { EditInvoiceForm } from "../../InvoiceForm";

type InvoiceEditPageProps = {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ contact_warning?: string; duplicated?: string }>;
};

export default async function InvoiceEditPage({ params, searchParams }: InvoiceEditPageProps) {
  const { invoiceId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/admin/invoices/${invoiceId}/edit`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before editing invoices" />;
  }

  const [detail, serviceCategories] = await Promise.all([getInvoiceDetail(invoiceId), getServiceCategories()]);

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page commerce-editor-page">
        <Link className="crew-back-link" href={`/admin/invoices/${invoiceId}`}>Back to invoice</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {serviceCategories.error ? <DataWarning message={serviceCategories.error} /> : null}
        {!detail.data ? (
          <section className="empty-state">
            <h2>Invoice not found or no access</h2>
            <p>This invoice is unavailable to the current account.</p>
          </section>
        ) : ["paid", "void"].includes(detail.data.status) ? (
          <section className="empty-state">
            <h2>This invoice is locked</h2>
            <p>Paid and void invoices cannot be changed through regular editing.</p>
            <Link className="primary-action" href={`/admin/invoices/${invoiceId}`}>Return to invoice</Link>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <p className="surface-label">
                <ReceiptText aria-hidden="true" size={18} />
                Invoice editor
              </p>
              <h1>Edit {getInvoiceDisplayNumber(detail.data.invoice_number)}</h1>
              <p>Update the due date and billing lines without changing linked payments, customer, job, or quote.</p>
            </section>
            {query.duplicated === "invoice" ? (
              <p className="form-message success" role="status">Invoice duplicated.</p>
            ) : null}
            {query.contact_warning === "1" ? (
              <p className="form-message error" role="alert">One or more selected organization billing contacts were inactive and were not copied. Review recipients before sending.</p>
            ) : null}
            <EditInvoiceForm invoice={detail.data} serviceCategories={serviceCategories.data} />
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
