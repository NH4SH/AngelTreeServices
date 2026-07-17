import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  Sprout,
  X,
} from "lucide-react";
import {
  AddFollowUpForm,
  AddRecommendationForm,
  AddRecurringPlanForm,
  FollowUpActions,
  GenerateRenewalsButton,
  RecommendationActions,
} from "@/components/recurring-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import {
  getRecurringFormOptions,
  getRecurringOperationsDashboard,
} from "@/lib/data/recurring";
import type {
  FollowUpTaskWithRelations,
  RecurringOccurrenceWithRelations,
  RecurringPlanWithRelations,
  ServiceRecommendationWithRelations,
} from "@/lib/types/database";

type Props = {
  searchParams: Promise<{
    new_task?: string;
    new_plan?: string;
    new_recommendation?: string;
    recommendation_id?: string;
    customer_id?: string;
    organization_id?: string;
    service_location_id?: string;
  }>;
};

export default async function RecurringOperationsPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/recurring");
  if (!context.configured)
    return (
      <SetupRequired title="Configure Supabase before opening recurring services" />
    );
  const canViewFinancials = context.roles.some((role) =>
    ["owner", "admin", "payroll_admin"].includes(role),
  );
  const [dashboard, options] = await Promise.all([
    getRecurringOperationsDashboard(canViewFinancials),
    getRecurringFormOptions(),
  ]);
  const now = Date.now();
  const openTasks = dashboard.tasks.filter(
    (task) => !["completed", "cancelled"].includes(task.status),
  );
  const overdue = openTasks.filter(
    (task) => new Date(task.snoozed_until ?? task.due_at).getTime() < now,
  );
  const dueOccurrences = dashboard.occurrences.filter((item) =>
    [
      "review_needed",
      "upcoming",
      "quote_draft",
      "quote_sent",
      "approved",
    ].includes(item.status),
  );
  const pendingRecommendations = dashboard.recommendations.filter((item) =>
    ["pending_office_review", "recommended"].includes(item.status),
  );
  const sourceRecommendation =
    dashboard.recommendations.find(
      (item) => item.id === query.recommendation_id,
    ) ?? null;
  const contextualLocations = query.organization_id
    ? options.locations.filter(
        (location) => location.organization_id === query.organization_id,
      )
    : query.customer_id
      ? options.locations.filter(
          (location) => location.customer_id === query.customer_id,
        )
      : options.locations;
  const activePlans = dashboard.plans.filter((plan) => plan.state === "active");
  const activeProperties = activePlans.reduce(
    (total, plan) =>
      total +
      (plan.recurring_plan_locations ?? []).filter(
        (location) => location.state === "active",
      ).length,
    0,
  );
  const annualizedExpectedCents = activePlans.reduce((total, plan) => {
    const activeLocationCount = (plan.recurring_plan_locations ?? []).filter(
      (location) => location.state === "active",
    ).length;
    return (
      total +
      (plan.approved_price_cents ?? 0) *
        activeLocationCount *
        annualFrequency(plan.recurrence_pattern, plan.custom_interval_count)
    );
  }, 0);

  return (
    <PlatformFrame
      active="recurring"
      roles={context.roles}
      userEmail={context.user.email}
    >
      <div className="shell app-content recurring-page">
        <section className="page-heading recurring-heading">
          <div>
            <p className="surface-label">
              <Sprout size={18} /> Retention and recurring work
            </p>
            <h1>Recurring services</h1>
            <p>
              Review future work, renewals, and staff follow-ups before they
              become quotes or scheduled jobs.
            </p>
          </div>
          <div className="action-row">
            <Link
              className="secondary-action"
              href="/admin/recurring?new_task=1"
            >
              <ClipboardList size={17} /> Add follow-up
            </Link>
            <Link
              className="secondary-action"
              href="/admin/recurring?new_recommendation=1"
            >
              <Sprout size={17} /> Add recommendation
            </Link>
            <Link className="primary-action" href="/admin/recurring?new_plan=1">
              <Plus size={17} /> New service plan
            </Link>
          </div>
        </section>
        {dashboard.error || options.error ? (
          <Warning
            message={
              dashboard.error ??
              options.error ??
              "Recurring service data could not be loaded."
            }
          />
        ) : null}
        <section
          className="commerce-summary-strip"
          aria-label="Recurring operations summary"
        >
          <Summary
            label="Overdue follow-ups"
            value={overdue.length}
            attention={overdue.length > 0}
          />
          <Summary label="Open follow-ups" value={openTasks.length} />
          <Summary label="Renewals to review" value={dueOccurrences.length} />
          <Summary
            label="Recommendations"
            value={pendingRecommendations.length}
          />
          <Summary label="Active plans" value={activePlans.length} />
          <Summary label="Properties covered" value={activeProperties} />
          <Summary
            label="Expected annual plan value"
            value={money(annualizedExpectedCents)}
          />
          {canViewFinancials ? (
            <>
              <Summary
                label="Approved renewal value"
                value={money(dashboard.analytics.approvedRenewalValueCents)}
              />
              <Summary
                label="Recurring value invoiced"
                value={money(dashboard.analytics.invoicedRecurringValueCents)}
              />
              <Summary
                label="Recurring revenue collected"
                value={money(dashboard.analytics.collectedRecurringValueCents)}
              />
            </>
          ) : null}
          <Summary
            label="Renewal approval rate"
            value={
              dashboard.analytics.renewalRate === null
                ? "No decisions"
                : `${Math.round(dashboard.analytics.renewalRate * 100)}%`
            }
          />
        </section>
        <section className="recurring-queue-toolbar">
          <div>
            <h2>Office renewal queue</h2>
            <p>
              Generation creates only due opportunities and one review task per
              property cycle.
            </p>
          </div>
          <GenerateRenewalsButton />
        </section>
        <div className="recurring-dashboard-grid">
          <section className="recurring-queue-section">
            <header>
              <div>
                <p className="surface-label">
                  <Clock3 size={17} /> Staff queue
                </p>
                <h2>Follow-ups</h2>
              </div>
              <span>{openTasks.length}</span>
            </header>
            {openTasks.length ? (
              <div className="recurring-card-list">
                {openTasks.slice(0, 30).map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <Empty
                title="No open follow-ups"
                body="New renewal and recommendation tasks will appear here."
              />
            )}
          </section>
          <section className="recurring-queue-section">
            <header>
              <div>
                <p className="surface-label">
                  <CalendarClock size={17} /> Upcoming cycles
                </p>
                <h2>Renewal opportunities</h2>
              </div>
              <span>{dueOccurrences.length}</span>
            </header>
            {dueOccurrences.length ? (
              <div className="recurring-card-list">
                {dueOccurrences.slice(0, 30).map((item) => (
                  <OccurrenceCard item={item} key={item.id} />
                ))}
              </div>
            ) : (
              <Empty
                title="Nothing due yet"
                body="Generate due renewals after plans and next service dates are configured."
              />
            )}
          </section>
        </div>
        <section className="recurring-queue-section full-width">
          <header>
            <div>
              <p className="surface-label">
                <Sprout size={17} /> Future work
              </p>
              <h2>Recommendations awaiting review</h2>
            </div>
            <span>{pendingRecommendations.length}</span>
          </header>
          {pendingRecommendations.length ? (
            <div className="recurring-card-grid">
              {pendingRecommendations.map((item) => (
                <RecommendationCard item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <Empty
              title="No recommendations awaiting review"
              body="Crew and office recommendations stay internal until staff converts them into follow-up work."
            />
          )}
        </section>
        <section className="recurring-queue-section full-width">
          <header>
            <div>
              <p className="surface-label">
                <CheckCircle2 size={17} /> Plan portfolio
              </p>
              <h2>Service plans</h2>
            </div>
            <span>{dashboard.plans.length}</span>
          </header>
          {dashboard.plans.length ? (
            <div className="recurring-plan-table">
              {dashboard.plans.map((plan) => (
                <PlanRow key={plan.id} plan={plan} />
              ))}
            </div>
          ) : (
            <Empty
              title="No recurring service plans"
              body="Create a plan for annual, seasonal, or visit-based work."
            />
          )}
        </section>
        {query.new_plan === "1" ? (
          <Drawer title="Create recurring service plan">
            <AddRecurringPlanForm
              categories={options.categories}
              contacts={options.contacts}
              customers={options.customers}
              defaultAccountId={
                query.organization_id ?? query.customer_id ?? ""
              }
              defaultAccountKind={
                query.organization_id ? "organization" : "customer"
              }
              defaultLocationId={query.service_location_id ?? ""}
              locations={contextualLocations}
              organizations={options.organizations}
              sourceRecommendation={sourceRecommendation}
              staff={options.staff}
            />
          </Drawer>
        ) : null}
        {query.new_task === "1" ? (
          <Drawer title="Add staff follow-up">
            <AddFollowUpForm
              defaultLocationId={query.service_location_id}
              locations={contextualLocations}
              staff={options.staff}
            />
          </Drawer>
        ) : null}
        {query.new_recommendation === "1" ? (
          <Drawer title="Add future-work recommendation">
            <AddRecommendationForm
              categories={options.categories}
              defaultLocationId={query.service_location_id}
              locations={contextualLocations}
            />
          </Drawer>
        ) : null}
      </div>
    </PlatformFrame>
  );
}

function TaskCard({ task }: { task: FollowUpTaskWithRelations }) {
  const due = new Date(task.snoozed_until ?? task.due_at);
  const overdue = due.getTime() < Date.now();
  return (
    <article className={`recurring-task-card ${overdue ? "overdue" : ""}`}>
      <div>
        <span className={`status-pill priority-${task.priority}`}>
          {task.priority}
        </span>
        <span className="task-due">
          <Clock3 size={14} />
          {overdue ? "Overdue " : "Due "}
          {formatDateTime(due)}
        </span>
      </div>
      <h3>{task.title}</h3>
      <p>{task.description || task.task_type.replaceAll("_", " ")}</p>
      <small>
        {party(task)}
        {task.service_locations
          ? ` - ${task.service_locations.label || task.service_locations.street}`
          : ""}
      </small>
      <FollowUpActions status={task.status} taskId={task.id} />
    </article>
  );
}
function OccurrenceCard({ item }: { item: RecurringOccurrenceWithRelations }) {
  return (
    <article className="recurring-occurrence-card">
      <div>
        <span className={`status-pill occurrence-${item.status}`}>
          {item.status.replaceAll("_", " ")}
        </span>
        <strong>{formatDate(item.target_service_date)}</strong>
      </div>
      <h3>{item.recurring_service_plans?.plan_name ?? "Recurring service"}</h3>
      <p>
        {item.service_locations
          ? `${item.service_locations.label || "Property"} - ${item.service_locations.street}, ${item.service_locations.city}`
          : "Property unavailable"}
      </p>
      <Link
        className="secondary-action"
        href={`/admin/recurring/${item.recurring_plan_id}`}
      >
        Open plan
      </Link>
    </article>
  );
}
function RecommendationCard({
  item,
}: {
  item: ServiceRecommendationWithRelations;
}) {
  return (
    <article className="recurring-recommendation-card">
      <div>
        <span className={`status-pill priority-${item.priority}`}>
          {item.priority}
        </span>
        <small>{item.origin.replaceAll("_", " ")}</small>
      </div>
      <h3>{item.title}</h3>
      <p className="pre-wrap-copy">{item.customer_recommendation}</p>
      <small>
        {party(item)} -{" "}
        {item.service_locations?.label ||
          item.service_locations?.street ||
          "Property"}
        {item.recommended_timeframe ? ` - ${item.recommended_timeframe}` : ""}
      </small>
      <RecommendationActions recommendationId={item.id} />
    </article>
  );
}
function PlanRow({ plan }: { plan: RecurringPlanWithRelations }) {
  const locations = plan.recurring_plan_locations ?? [];
  const next = locations
    .filter((location) => location.state === "active")
    .sort((a, b) =>
      a.next_service_due_date.localeCompare(b.next_service_due_date),
    )[0];
  return (
    <article className="recurring-plan-row">
      <div>
        <Link href={`/admin/recurring/${plan.id}`}>{plan.plan_name}</Link>
        <span>
          {plan.service_categories?.label ||
            plan.recurrence_pattern.replaceAll("_", " ")}
        </span>
      </div>
      <div>
        <strong>
          {plan.organizations?.name ??
            plan.customers?.display_name ??
            "Account"}
        </strong>
        <span>
          {locations.length} propert{locations.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <div>
        <span className={`status-pill plan-${plan.state}`}>{plan.state}</span>
        <span>
          {next
            ? `Next ${formatDate(next.next_service_due_date)}`
            : "No active date"}
        </span>
      </div>
      <Link className="secondary-action" href={`/admin/recurring/${plan.id}`}>
        Open
      </Link>
    </article>
  );
}
function Drawer({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="commerce-drawer-overlay" role="dialog">
      <Link
        aria-label="Close panel"
        className="commerce-drawer-backdrop"
        href="/admin/recurring"
      />
      <aside className="commerce-drawer recurring-drawer">
        <header className="commerce-drawer-header">
          <div>
            <p className="surface-label">Recurring operations</p>
            <h2>{title}</h2>
          </div>
          <Link
            aria-label="Close panel"
            className="secondary-action icon-action"
            href="/admin/recurring"
          >
            <X size={18} />
          </Link>
        </header>
        {children}
      </aside>
    </div>
  );
}
function Summary({
  attention = false,
  label,
  value,
}: {
  attention?: boolean;
  label: string;
  value: number | string;
}) {
  return (
    <div className={`commerce-summary-chip ${attention ? "attention" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function annualFrequency(pattern: string, customInterval: number | null) {
  if (pattern === "weekly") return 52;
  if (pattern === "biweekly") return 26;
  if (pattern === "monthly") return 12;
  if (pattern === "bimonthly") return 6;
  if (pattern === "quarterly") return 4;
  if (pattern === "twice_yearly") return 2;
  if (pattern === "custom_days")
    return 365 / Math.max(customInterval ?? 365, 1);
  if (pattern === "custom_months")
    return 12 / Math.max(customInterval ?? 12, 1);
  return 1;
}
function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
function Empty({ body, title }: { body: string; title: string }) {
  return (
    <div className="inline-empty recurring-inline-empty">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
function Warning({ message }: { message: string }) {
  return (
    <section className="data-warning">
      <AlertCircle size={18} />
      <div>
        <strong>Database notice</strong>
        <p>{message}</p>
      </div>
    </section>
  );
}
function party(item: {
  customers?: { display_name: string } | null;
  organizations?: { name: string } | null;
}) {
  return item.organizations?.name ?? item.customers?.display_name ?? "Account";
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}
function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
