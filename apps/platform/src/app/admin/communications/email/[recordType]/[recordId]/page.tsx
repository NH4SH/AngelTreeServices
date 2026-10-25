import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { RecordEmailHistoryBrowser } from "@/components/record-email-history-browser";
import { RecordDeliveryRequestsBrowser } from "@/components/record-delivery-requests-browser";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { recordEmailScope, recordEmailHistoryHref, recordEmailRecordHref } from "@/lib/email/record-history-scope";
import { readEmailHistoryRecord, readRecordEmailPage, recordEmailPageNumber } from "@/lib/email/record-history";
import { readRecordDeliveryPage, recordDeliveryPageNumber } from "@/lib/email/record-delivery-requests";

export default async function RecordEmailHistoryPage({ params, searchParams }: {
  params: Promise<{ recordType: string; recordId: string }>;
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const { recordType, recordId } = await params, query = await searchParams;
  const scope = recordEmailScope(recordType, recordId);
  if (!scope) notFound();
  const view = query.view === "requests" ? "requests" : query.view === "attention" ? "attention" : "all";
  const href = recordEmailHistoryHref(scope, view, view === "requests" ? recordDeliveryPageNumber(query.page) : recordEmailPageNumber(query.page));
  const context = await getAuthenticatedPlatformContext(href);
  if (!context.configured) return <SetupRequired title="Configure Supabase before browsing email history" />;
  if (!hasAllowedRole(context.roles, platformRoleGroups.internalStaff)) notFound();
  const record = await readEmailHistoryRecord(context.supabase, scope);
  if (record.state === "missing") notFound();
  const result = record.state === "found" && view !== "requests" ? await readRecordEmailPage(context.supabase, scope, view, query.page) : null;
  const requests = record.state === "found" && view === "requests" ? await readRecordDeliveryPage(context.supabase, scope, query.page) : null;
  return <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}><div className="shell app-content communication-page record-email-page">
    {record.state === "found" && requests ? <RecordDeliveryRequestsBrowser scope={scope} label={record.label} result={requests} /> : record.state === "found" && result ? <RecordEmailHistoryBrowser scope={scope} label={record.label} view={view} result={result} /> : <>
      <Link href={recordEmailRecordHref(scope)}>Back to record</Link><h1>Email history</h1>
      <p className="form-message error" role="alert">This record could not be checked. Refresh before reviewing its email history.</p>
      <a href={href} className="secondary-action">Refresh</a>
    </>}
  </div></PlatformFrame>;
}
