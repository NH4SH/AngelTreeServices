import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InvoiceDocument } from "@/components/documents/invoice-document";
import { PrintButton } from "@/components/documents/print-button";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getInvoiceDetail } from "@/lib/data/invoices";

type InvoicePrintPageProps = {
  params: Promise<{ invoiceId: string }>;
};

export default async function InvoicePrintPage({ params }: InvoicePrintPageProps) {
  const { invoiceId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/invoices/${invoiceId}/print`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before printing invoices" />;
  }

  const detail = await getInvoiceDetail(invoiceId);

  if (!detail.data) {
    return (
      <main className="document-print-page">
        <section className="empty-state print-hidden">
          <h1>Invoice unavailable</h1>
          <p>{detail.error ?? "This invoice was not found or is unavailable to your account."}</p>
          <Link className="secondary-action" href={`/admin/invoices/${invoiceId}`}>Return to invoice</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="document-print-page">
      <nav aria-label="Invoice print controls" className="document-print-toolbar print-hidden">
        <Link className="secondary-action" href={`/admin/invoices/${invoiceId}`}>
          <ArrowLeft aria-hidden="true" size={17} />
          Back to invoice
        </Link>
        <p>Customer invoice preview</p>
        <PrintButton label="Print or save PDF" />
      </nav>
      <InvoiceDocument invoice={detail.data} />
    </main>
  );
}
