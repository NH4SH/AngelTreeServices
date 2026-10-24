import Link from "next/link";
import { notFound } from "next/navigation";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { RecordReminderBrowser } from "@/components/record-reminder-browser";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { reminderBrowseHref, reminderBrowseReturn, reminderRecordScope } from "@/lib/communications/record-browse";
import { readReminderBrowseRecord } from "@/lib/communications/record-browser";
import { readCommunicationQueuePage, type CommunicationQueueView } from "@/lib/communications/queue-page";
import { readRecordReminderSummary } from "@/lib/communications/record-summary";

export default async function RecordReminderPage({ params, searchParams }: {
  params: Promise<{ recordType: string; recordId: string }>;
  searchParams: Promise<{ view?: string; page?: string; returnTo?: string }>;
}) {
  const { recordType, recordId } = await params, query = await searchParams;
  const scope = reminderRecordScope(recordType, recordId);
  if (!scope) notFound();
  const returnTo = reminderBrowseReturn(scope, query.returnTo);
  const view: CommunicationQueueView = query.view === "history" || query.view === "failed" ? query.view : "scheduled";
  const context = await getAuthenticatedPlatformContext(reminderBrowseHref(scope, view, 1, returnTo));
  if (!context.configured) return <SetupRequired title="Configure Supabase before browsing reminders" />;
  if (!hasAllowedRole(context.roles, platformRoleGroups.internalStaff)) notFound();
  const record = await readReminderBrowseRecord(context.supabase, scope);
  if (record.state === "missing") notFound();
  const content = record.state === "unavailable" ? <>
    <Link href={returnTo}>Back to record</Link><h1>Reminders &amp; history</h1>
    <p className="form-message error" role="alert">This record could not be checked. Refresh this page before reviewing its reminders.</p>
  </> : await (async () => {
    const [result, summary] = await Promise.all([
      readCommunicationQueuePage(context.supabase, view, query.page, scope),
      readRecordReminderSummary(context.supabase, scope.recordType, scope.recordId),
    ]);
    return <RecordReminderBrowser scope={scope} label={record.label} returnTo={returnTo} view={view} result={result} summary={summary} />;
  })();
  return <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}><div className="shell app-content communication-page record-reminder-page">{content}</div></PlatformFrame>;
}
