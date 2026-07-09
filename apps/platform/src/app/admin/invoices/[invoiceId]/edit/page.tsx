import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getInvoiceDetail } from "@/lib/data/invoices";
import { EditInvoiceForm } from "../../InvoiceForm";

type InvoiceEditPageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoiceEditPage({ params }: InvoiceEditPageProps) {
  const { invoiceId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/invoices/${invoiceId}/edit`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before editing invoices" />;
  }

  const detail = await getInvoiceDetail(invoiceId);

  return (
    <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page commerce-editor-page">
        <Link className="crew-back-link" href={`/admin/invoices/${invoiceId}`}>Back to invoice</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
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
              <h1>Edit {detail.data.invoice_number || "draft invoice"}</h1>
              <p>Update the due date and billing lines without changing linked payments, customer, job, or quote.</p>
            </section>
            <EditInvoiceForm invoice={detail.data} />
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
