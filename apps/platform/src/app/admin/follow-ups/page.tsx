import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  MessageSquareMore,
  ReceiptText,
  Sprout,
} from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getCommunicationDashboardSummary } from "@/lib/data/communications";
import { getUnpaidInvoices } from "@/lib/data/invoices";
import { getQuotesAwaitingResponse } from "@/lib/data/quotes";
import { getRecurringOperationsDashboard } from "@/lib/data/recurring";
import type { CustomerCommunication, FollowUpTaskWithRelations } from "@/lib/types/database";

export default async function FollowUpsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/follow-ups");
  if (!context.configured) return <SetupRequired title="Configure Supabase before opening follow-ups" />;

  const canViewFinancials = hasAllowedRole(context.roles, platformRoleGroups.financialReporting);
  const [recurring, communications, quotes, invoices] = await Promise.all([
    loadRecurring(canViewFinancials),
    getCommunicationDashboardSummary(),
    getQuotesAwaitingResponse(),
    getUnpaidInvoices(),
  ]);
  const now = Date.now();
  const openTasks = recurring.tasks
    .filter((task) => !["completed", "cancelled"].includes(task.status))
    .sort((left, right) => taskTime(left) - taskTime(right));
  const dueTasks = openTasks.filter((task) => taskTime(task) <= now);
  const pendingRecommendations = recurring.recommendations.filter((item) => ["recommended", "pending_office_review", "deferred"].includes(item.status));
  const renewalOpportunities = recurring.occurrences.filter((item) => ["upcoming", "review_needed", "quote_draft", "quote_sent", "approved"].includes(item.status));
  const errors = [recurring.error, communications.error, quotes.error, invoices.error].filter((message): message is string => Boolean(message));

  return (
    <PlatformFrame active="follow-ups" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content follow-ups-page">
        <section className="page-heading follow-ups-heading">
          <div>
            <p className="surface-label"><ClipboardCheck size={18} />Customer retention</p>
            <h1>Follow-ups</h1>
            <p>One office queue for callbacks, quote responses, payment reminders, recommendations, and recurring opportunities.</p>
          </div>
          <Link className="primary-action" href="/admin/recurring?new_task=1">Add follow-up</Link>
        </section>

        {Array.from(new Set(errors)).map((message) => <Warning key={message} message={message} />)}

        <section className="follow-up-summary" aria-label="Follow-up workload">
          <Summary label="Due now" value={dueTasks.length} attention={dueTasks.length > 0} />
          <Summary label="Quotes waiting" value={quotes.data.length} />
          <Summary label="Payment follow-ups" value={invoices.data.length} />
          <Summary label="Failed messages" value={communications.data.failed.length} attention={communications.data.failed.length > 0} />
          <Summary label="Future work" value={pendingRecommendations.length + renewalOpportunities.length} />
        </section>

        <div className="follow-up-workspace">
          <section className="follow-up-lane">
            <LaneHeader icon={<Clock3 size={18} />} title="Due now" count={dueTasks.length + communications.data.failed.length} />
            <div className="follow-up-rows">
              {dueTasks.slice(0, 20).map((task) => <TaskRow key={task.id} task={task} />)}
              {communications.data.failed.map((item) => <CommunicationRow item={item} key={item.id} />)}
              {!dueTasks.length && !communications.data.failed.length ? <Empty text="No callbacks, reminders, or communication failures need attention." /> : null}
            </div>
          </section>

          <section className="follow-up-lane">
            <LaneHeader icon={<MessageSquareMore size={18} />} title="Waiting on customers" count={quotes.data.length + invoices.data.length} />
            <div className="follow-up-rows">
              {quotes.data.map((quote) => (
                <Link className="follow-up-row" href={`/admin/quotes/${quote.id}`} key={quote.id}>
                  <span className="follow-up-row-icon quote"><ClipboardCheck size={17} /></span>
                  <span><strong>{quote.quote_number || `Quote for ${quote.organizations?.name ?? quote.customers?.display_name ?? "customer"}`}</strong><small>{quote.organizations?.name ?? quote.customers?.display_name ?? "Unknown contracting party"}</small></span>
                  <b>{money(quote.total_cents)}</b>
                </Link>
              ))}
              {invoices.data.map((invoice) => (
                <Link className="follow-up-row" href={`/admin/invoices/${invoice.id}`} key={invoice.id}>
                  <span className="follow-up-row-icon invoice"><ReceiptText size={17} /></span>
                  <span><strong>{invoice.invoice_number || "Open invoice"}</strong><small>{invoice.organizations?.name ?? invoice.customers?.display_name ?? "Unknown contracting party"}</small></span>
                  <b>{money(invoice.balance_due_cents)}</b>
                </Link>
              ))}
              {!quotes.data.length && !invoices.data.length ? <Empty text="No quote responses or invoice payments are waiting." /> : null}
            </div>
          </section>

          <section className="follow-up-lane follow-up-lane-wide">
            <LaneHeader icon={<Sprout size={18} />} title="Future and recurring work" count={pendingRecommendations.length + renewalOpportunities.length} />
            <div className="follow-up-rows follow-up-rows-grid">
              {pendingRecommendations.slice(0, 12).map((item) => (
                <Link className="follow-up-row" href={`/admin/recurring?recommendation_id=${item.id}`} key={item.id}>
                  <span className="follow-up-row-icon recommendation"><Sprout size={17} /></span>
                  <span><strong>{item.title}</strong><small>{item.organizations?.name ?? item.customers?.display_name ?? "Future work recommendation"}</small></span>
                  <b>{item.recommended_timeframe || "Review"}</b>
                </Link>
              ))}
              {renewalOpportunities.slice(0, 12).map((item) => (
                <Link className="follow-up-row" href={`/admin/recurring/${item.recurring_plan_id}`} key={item.id}>
                  <span className="follow-up-row-icon renewal"><CalendarClock size={17} /></span>
                  <span><strong>{item.recurring_service_plans?.plan_name ?? "Recurring service"}</strong><small>{item.service_locations?.label || item.service_locations?.street || "Service location"}</small></span>
                  <b>{shortDate(item.target_service_date)}</b>
                </Link>
              ))}
              {!pendingRecommendations.length && !renewalOpportunities.length ? <Empty text="No recommendations or renewal opportunities need review." /> : null}
            </div>
            <footer className="follow-up-lane-footer"><Link href="/admin/recurring">Manage recurring services</Link><Link href="/admin/communications">Communication history</Link></footer>
          </section>
        </div>
      </div>
    </PlatformFrame>
  );
}

async function loadRecurring(canViewFinancials: boolean) {
  try {
    return await getRecurringOperationsDashboard(canViewFinancials);
  } catch (error) {
    console.error("Follow-up recurring queue failed", error);
    return { tasks: [], plans: [], occurrences: [], recommendations: [], settings: null, analytics: { approvedRenewalValueCents: 0, invoicedRecurringValueCents: 0, collectedRecurringValueCents: 0, renewalRate: null }, error: "Recurring follow-ups are temporarily unavailable." };
  }
}

function TaskRow({ task }: { task: FollowUpTaskWithRelations }) {
  return (
    <Link className="follow-up-row" href={taskHref(task)}>
      <span className="follow-up-row-icon task"><Clock3 size={17} /></span>
      <span><strong>{task.title}</strong><small>{task.organizations?.name ?? task.customers?.display_name ?? task.service_locations?.label ?? task.task_type.replaceAll("_", " ")}</small></span>
      <b className={taskTime(task) < Date.now() ? "is-overdue" : ""}>{relativeDue(task.snoozed_until ?? task.due_at)}</b>
    </Link>
  );
}

function CommunicationRow({ item }: { item: CustomerCommunication }) {
  return (
    <Link className="follow-up-row" href={communicationHref(item)}>
      <span className="follow-up-row-icon failed"><AlertTriangle size={17} /></span>
      <span><strong>{item.communication_type.replaceAll("_", " ")}</strong><small>{item.last_error || `Delivery failed for ${item.recipient_email}`}</small></span>
      <b className="is-overdue">Fix</b>
    </Link>
  );
}

function LaneHeader({ count, icon, title }: { count: number; icon: React.ReactNode; title: string }) {
  return <header className="follow-up-lane-header"><span>{icon}</span><h2>{title}</h2><b>{count}</b></header>;
}

function Summary({ attention = false, label, value }: { attention?: boolean; label: string; value: number }) {
  return <div className={attention ? "attention" : ""}><strong>{value}</strong><span>{label}</span></div>;
}

function Empty({ text }: { text: string }) { return <p className="follow-up-empty">{text}</p>; }
function Warning({ message }: { message: string }) { return <section className="data-warning" role="status"><strong>Follow-up notice</strong><p>{message}</p></section>; }
function taskTime(task: FollowUpTaskWithRelations) { return new Date(task.snoozed_until ?? task.due_at).getTime(); }
function taskHref(task: FollowUpTaskWithRelations) {
  if (task.quote_id) return `/admin/quotes/${task.quote_id}`;
  if (task.invoice_id) return `/admin/invoices/${task.invoice_id}`;
  if (task.job_id) return `/admin/jobs/${task.job_id}`;
  if (task.recurring_plan_id) return `/admin/recurring/${task.recurring_plan_id}`;
  if (task.organization_id) return `/admin/organizations/${task.organization_id}`;
  if (task.customer_id) return `/admin/customers/${task.customer_id}`;
  return "/admin/recurring";
}
function communicationHref(item: CustomerCommunication) {
  if (item.quote_id) return `/admin/quotes/${item.quote_id}`;
  if (item.invoice_id) return `/admin/invoices/${item.invoice_id}`;
  if (item.job_id) return `/admin/jobs/${item.job_id}`;
  return "/admin/communications";
}
function relativeDue(value: string) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return shortDate(value);
}
function shortDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)); }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
