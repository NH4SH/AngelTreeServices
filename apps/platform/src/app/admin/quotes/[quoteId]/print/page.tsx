import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/documents/print-button";
import { QuoteDocument } from "@/components/documents/quote-document";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getQuoteDetail } from "@/lib/data/quotes";

type QuotePrintPageProps = {
  params: Promise<{ quoteId: string }>;
};

export default async function QuotePrintPage({ params }: QuotePrintPageProps) {
  const { quoteId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/quotes/${quoteId}/print`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before printing quotes" />;
  }

  const detail = await getQuoteDetail(quoteId);

  if (!detail.data) {
    return (
      <main className="quote-print-page">
        <section className="empty-state print-hidden">
          <h1>Quote unavailable</h1>
          <p>{detail.error ?? "This quote was not found or is unavailable to your account."}</p>
          <Link className="secondary-action" href={`/admin/quotes/${quoteId}`}>Return to quote</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="quote-print-page">
      <nav aria-label="Quote print controls" className="quote-print-toolbar print-hidden">
        <Link className="secondary-action" href={`/admin/quotes/${quoteId}`}>
          <ArrowLeft aria-hidden="true" size={17} />
          Back to quote
        </Link>
        <p>Customer proposal preview</p>
        <PrintButton label="Print or save PDF" />
      </nav>
      <QuoteDocument quote={detail.data} />
    </main>
  );
}
