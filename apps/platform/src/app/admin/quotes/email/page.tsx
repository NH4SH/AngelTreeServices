import Link from "next/link";
import { randomUUID } from "node:crypto";
import { Mail, ShieldCheck, UsersRound } from "lucide-react";
import { MultiQuoteEmailComposer } from "@/components/multi-quote-email-composer";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getQuotePortalTokens } from "@/lib/data/portal-quote";
import { getQuoteDetail } from "@/lib/data/quotes";
import { getQuoteEmailPortalLinkState } from "@/lib/portal/quote-email-link-state";
import { buildMultiQuoteEmailDraft, normalizeMultiQuoteIds, validateMultiQuoteSelection } from "@/lib/quotes/multi-email";

type MultiQuoteEmailPageProps = {
  searchParams: Promise<{ quote_id?: string | string[] }>;
};

export default async function MultiQuoteEmailPage({ searchParams }: MultiQuoteEmailPageProps) {
  const context = await getAuthenticatedPlatformContext("/admin/quotes/email");
  if (!context.configured) return <SetupRequired title="Configure Supabase before emailing proposals" />;

  const query = await searchParams;
  const submittedIds = Array.isArray(query.quote_id) ? query.quote_id : query.quote_id ? [query.quote_id] : [];
  const quoteIds = normalizeMultiQuoteIds(submittedIds);
  const details = await Promise.all(quoteIds.map((quoteId) => getQuoteDetail(quoteId)));
  const loadError = details.find((detail) => detail.error || !detail.data);
  const quotes = details.flatMap((detail) => detail.data ? [detail.data] : []);
  const validation = loadError
    ? { ok: false as const, message: loadError.error ?? "One or more selected quotes could not be loaded." }
    : validateMultiQuoteSelection(quotes);

  if (!validation.ok) {
    return <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/customers">Back to customers</Link>
        <section className="page-heading"><div><p className="surface-label"><Mail aria-hidden="true" size={18} />Combined proposal email</p><h1>Review selected quotes</h1></div></section>
        <section className="data-warning" role="alert"><strong>Cannot prepare this email</strong><p>{validation.message}</p></section>
      </div>
    </PlatformFrame>;
  }

  const tokenLookups = await Promise.all(quotes.map((quote) => getQuotePortalTokens(quote.id)));
  const previewQuotes = quotes.map((quote, index) => ({
    quote,
    portalUrl: tokenLookups[index].data.find((token) => token.portalUrl)?.portalUrl ?? "",
  }));
  const draft = buildMultiQuoteEmailDraft(previewQuotes);
  const legacyQuoteIds = quotes.flatMap((quote, index) =>
    getQuoteEmailPortalLinkState(tokenLookups[index].data) === "legacy_unrecoverable" ? [quote.id] : [],
  );
  const backHref = validation.customerId
    ? `/admin/customers/${validation.customerId}`
    : `/admin/organizations/${validation.organizationId}`;
  const tokenWarning = tokenLookups.find((lookup) => lookup.error)?.error;

  return <PlatformFrame active="quotes" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content">
      <Link className="crew-back-link" href={backHref}>Back to {validation.partyName}</Link>
      <section className="page-heading">
        <div>
          <p className="surface-label"><Mail aria-hidden="true" size={18} />Combined proposal email</p>
          <h1>Review {quotes.length} proposals</h1>
          <p>One customer email, with a separate secure review and approval path for every quote.</p>
        </div>
        <div className="page-heading-actions multi-quote-party-action">
          <Link className="secondary-action" href={backHref}>
            <UsersRound aria-hidden="true" size={17} />
            {validation.organizationId ? "Open organization" : "Open customer"}
          </Link>
        </div>
      </section>
      {tokenWarning ? <section className="data-warning" role="status"><strong>Secure link preview notice</strong><p>{tokenWarning} Links will be checked again when sent.</p></section> : null}
      <section className="detail-panel multi-quote-review-note">
        <ShieldCheck aria-hidden="true" size={20} />
        <p>Sending does not combine pricing or approvals. The customer can review and decide on each proposal independently.</p>
      </section>
      <MultiQuoteEmailComposer
        attemptId={randomUUID()}
        draft={draft}
        legacyQuoteIds={legacyQuoteIds}
        partyName={validation.partyName}
        quoteIds={quoteIds}
        recipient={validation.recipient}
      />
    </div>
  </PlatformFrame>;
}
