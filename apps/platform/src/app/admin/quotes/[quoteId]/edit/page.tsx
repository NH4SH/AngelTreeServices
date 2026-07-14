import Link from "next/link";
import { FileSignature } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCustomerOptions, getServiceLocations } from "@/lib/data/customers";
import { getJobOptions } from "@/lib/data/jobs";
import { getQuoteDetail } from "@/lib/data/quotes";
import { getEstimateScheduleEventOptions } from "@/lib/data/schedule";
import type { QuoteStatus } from "@/lib/types/database";
import { AddQuoteForm } from "../../QuoteForm";

type QuoteEditPageProps = {
  params: Promise<{ quoteId: string }>;
  searchParams: Promise<{ duplicated?: string; line_error?: string; saved?: string }>;
};

export default async function QuoteEditPage({ params, searchParams }: QuoteEditPageProps) {
  const { quoteId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/admin/quotes/${quoteId}/edit`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before editing quotes" />;
  }

  const [detail, customers, serviceLocations, jobs, estimateScheduleEvents] = await Promise.all([
    getQuoteDetail(quoteId),
    getCustomerOptions(),
    getServiceLocations(),
    getJobOptions(),
    getEstimateScheduleEventOptions(),
  ]);

  return (
    <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page commerce-editor-page">
        <Link className="crew-back-link" href={`/admin/quotes/${quoteId}`}>Back to quote</Link>
        {[detail.error, customers.error, serviceLocations.error, jobs.error, estimateScheduleEvents.error]
          .filter(Boolean)
          .map((message) => <DataWarning key={message} message={message ?? ""} />)}

        {!detail.data ? (
          <section className="empty-state">
            <h2>Quote not found or no access</h2>
            <p>This quote is unavailable to the current account.</p>
          </section>
        ) : !isEditable(detail.data.status) ? (
          <section className="empty-state">
            <h2>This quote is locked</h2>
            <p>Approved, declined, expired, and cancelled quotes cannot be changed through regular editing.</p>
            <Link className="primary-action" href={`/admin/quotes/${quoteId}`}>Return to quote</Link>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <p className="surface-label">
                <FileSignature aria-hidden="true" size={18} />
                Quote editor
              </p>
              <h1>Edit {detail.data.quote_number || "draft quote"}</h1>
              <p>Update the proposal, then save or save and close from the action bar below.</p>
            </section>
            {query.saved === "1" ? (
              <p className="form-message success" role="status">Draft quote saved. You can keep editing it here.</p>
            ) : null}
            {query.duplicated === "quote" ? (
              <p className="form-message success" role="status">Quote duplicated as draft.</p>
            ) : null}
            {query.line_error === "1" ? (
              <p className="form-message error" role="alert">
                The quote draft was created, but its line items could not be saved. Review the lines and save again.
              </p>
            ) : null}
            <AddQuoteForm
              customers={customers.data}
              estimateScheduleEvents={estimateScheduleEvents.data}
              jobs={jobs.data}
              quote={detail.data}
              serviceLocations={serviceLocations.data}
            />
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function isEditable(status: QuoteStatus) {
  return ["draft", "sent", "change_requested"].includes(status);
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
