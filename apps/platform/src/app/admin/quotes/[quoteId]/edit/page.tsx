import { safeReturnTo, withReturnTo } from "@/lib/drafts/return-context";
import Link from "next/link";
import { FileSignature } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getQuoteLookupSeeds } from "@/lib/data/quote-lookup-pages";
import { initialQuoteLookupValues } from "@/lib/quotes/lookup-contract";
import { getQuoteForEditing } from "@/lib/data/quotes";
import { getServiceCategories } from "@/lib/data/reports";
import { getMaterialCatalogOptions } from "@/lib/data/materials";
import type { QuoteStatus } from "@/lib/types/database";
import { AddQuoteForm } from "../../QuoteForm";

type QuoteEditPageProps = {
  params: Promise<{ quoteId: string }>;
  searchParams: Promise<{ returnTo?: string; contact_warning?: string; duplicated?: string; lead_archive_warning?: string; line_error?: string; renewal?: string; saved?: string; source_lead_job_id?: string }>;
};

export default async function QuoteEditPage({ params, searchParams }: QuoteEditPageProps) {
  const { quoteId } = await params;
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo, "/admin/quotes");
  const context = await getAuthenticatedPlatformContext(`/admin/quotes/${quoteId}/edit`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before editing quotes" />;
  }

  const [detail, serviceCategories, materials] = await Promise.all([
    getQuoteForEditing(quoteId),
    getServiceCategories(),
    getMaterialCatalogOptions(),
  ]);
  const lookupSeeds = detail.data && isEditable(detail.data.status) ? await getQuoteLookupSeeds(initialQuoteLookupValues(detail.data)) : { data: {}, error: null };

  return (
    <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content commerce-page commerce-editor-page">
        <Link className="crew-back-link" href={withReturnTo(`/admin/quotes/${quoteId}`, returnTo, "/admin/quotes")}>Back to quote</Link>
        {[detail.error, lookupSeeds.error, serviceCategories.error, materials.error]
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
            <Link className="primary-action" href={withReturnTo(`/admin/quotes/${quoteId}`, returnTo, "/admin/quotes")}>Return to quote</Link>
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
            {query.renewal === "1" || detail.data.recurring_occurrence_id ? (
              <section className="data-warning renewal-pricing-warning"><strong>Renewal pricing review required</strong><p>Prior scope and prices were copied only as a starting point. Review every line and save this draft before sending it.</p></section>
            ) : null}
            {query.duplicated === "quote" ? (
              <p className="form-message success" role="status">Quote duplicated as draft.</p>
            ) : null}
            {query.contact_warning === "1" ? (
              <p className="form-message error" role="alert">One or more selected organization contacts were inactive and were not copied. Choose active contacts before sending.</p>
            ) : null}
            {query.line_error === "1" ? (
              <p className="form-message error" role="alert">
                The quote draft was created, but its line items could not be saved. Review the lines and save again.
              </p>
            ) : null}
            {query.lead_archive_warning === "1" ? (
              <p className="form-message error" role="alert">
                The quote was created, but its website lead could not be archived automatically. Archive the lead manually from Leads and Communications.
              </p>
            ) : null}
            <AddQuoteForm
              userId={context.user.id}
              lookupSeeds={lookupSeeds.data}
              returnTo={returnTo}
              key={detail.data.id}
              materials={materials.data}
              quote={detail.data}
              serviceCategories={serviceCategories.data}
              sourceLeadJobId={query.source_lead_job_id}
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
