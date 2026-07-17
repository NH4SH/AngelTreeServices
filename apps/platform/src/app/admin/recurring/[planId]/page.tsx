import Link from "next/link";
import {
  Building2,
  CalendarClock,
  ClipboardList,
  MapPin,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import {
  FollowUpActions,
  OccurrenceActions,
  PlanLocationScheduleForm,
  PlanLocationStateForm,
  PlanStateActions,
} from "@/components/recurring-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getRecurringPlanDetail } from "@/lib/data/recurring";

export default async function RecurringPlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const context = await getAuthenticatedPlatformContext(
    `/admin/recurring/${planId}`,
  );
  if (!context.configured)
    return (
      <SetupRequired title="Configure Supabase before opening this plan" />
    );
  const detail = await getRecurringPlanDetail(planId);
  const plan = detail.plan;
  return (
    <PlatformFrame
      active="recurring"
      roles={context.roles}
      userEmail={context.user.email}
    >
      <div className="shell app-content recurring-plan-detail">
        <Link className="crew-back-link" href="/admin/recurring">
          Back to recurring services
        </Link>
        {detail.error ? (
          <section className="data-warning">
            <strong>Database notice</strong>
            <p>{detail.error}</p>
          </section>
        ) : null}
        {!plan ? (
          <section className="empty-state">
            <h1>Recurring plan unavailable</h1>
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="surface-label">
                  <Sprout size={18} /> Recurring service plan
                </p>
                <h1>{plan.plan_name}</h1>
                <p>{plan.service_description}</p>
              </div>
              <div className="recurring-plan-heading-actions">
                <span className={`status-pill plan-${plan.state}`}>
                  {plan.state}
                </span>
                <PlanStateActions planId={plan.id} state={plan.state} />
              </div>
            </section>
            <section className="recurring-plan-summary">
              <article>
                <Building2 size={19} />
                <span>Account</span>
                <strong>
                  {plan.organizations?.name ??
                    plan.customers?.display_name ??
                    "Account unavailable"}
                </strong>
              </article>
              <article>
                <CalendarClock size={19} />
                <span>Frequency</span>
                <strong>{plan.recurrence_pattern.replaceAll("_", " ")}</strong>
              </article>
              <article>
                <ShieldCheck size={19} />
                <span>Authorization</span>
                <strong>{plan.authorization_mode.replaceAll("_", " ")}</strong>
              </article>
              <article>
                <MapPin size={19} />
                <span>Properties</span>
                <strong>{plan.recurring_plan_locations?.length ?? 0}</strong>
              </article>
            </section>
            <section className="recurring-detail-section">
              <header>
                <div>
                  <p className="surface-label">
                    <MapPin size={17} /> Property portfolio
                  </p>
                  <h2>Plan locations</h2>
                </div>
              </header>
              <div className="recurring-property-grid">
                {(plan.recurring_plan_locations ?? []).map((location) => (
                  <article key={location.id}>
                    <div>
                      <span className={`status-pill plan-${location.state}`}>
                        {location.state}
                      </span>
                      <h3>
                        {location.service_locations?.label ||
                          location.service_locations?.street ||
                          "Property"}
                      </h3>
                      <p>
                        {location.service_locations
                          ? `${location.service_locations.street}, ${location.service_locations.city}, ${location.service_locations.state}`
                          : "Location unavailable"}
                      </p>
                    </div>
                    {location.onsite_contact ? (
                      <p>
                        <strong>Onsite:</strong>{" "}
                        {location.onsite_contact.full_name}{" "}
                        {location.onsite_contact.is_active ? "" : "(inactive)"}
                      </p>
                    ) : (
                      <p className="inline-empty">
                        No property contact selected.
                      </p>
                    )}
                    <PlanLocationScheduleForm location={location} />
                    <PlanLocationStateForm location={location} />
                  </article>
                ))}
              </div>
            </section>
            <section className="recurring-detail-section">
              <header>
                <div>
                  <p className="surface-label">
                    <CalendarClock size={17} /> Renewal timeline
                  </p>
                  <h2>Occurrences</h2>
                </div>
              </header>
              {detail.occurrences.length ? (
                <div className="recurring-timeline">
                  {detail.occurrences.map((occurrence) => (
                    <article key={occurrence.id}>
                      <div className="timeline-marker" />
                      <div className="timeline-body">
                        <header>
                          <div>
                            <span
                              className={`status-pill occurrence-${occurrence.status}`}
                            >
                              {occurrence.status.replaceAll("_", " ")}
                            </span>
                            <h3>{date(occurrence.target_service_date)}</h3>
                          </div>
                          <span>
                            {occurrence.service_locations?.label ||
                              occurrence.service_locations?.street}
                          </span>
                        </header>
                        {occurrence.renewal_quote ? (
                          <Link
                            className="linked-record"
                            href={`/admin/quotes/${occurrence.renewal_quote.id}`}
                          >
                            <strong>
                              {occurrence.renewal_quote.quote_number ||
                                "Draft renewal quote"}
                            </strong>
                            <span>
                              {money(occurrence.renewal_quote.total_cents)} -{" "}
                              {occurrence.renewal_quote.status}
                            </span>
                          </Link>
                        ) : null}
                        {occurrence.work_order ? (
                          <Link
                            className="linked-record"
                            href={`/admin/jobs/${occurrence.work_order.id}`}
                          >
                            <strong>Work order</strong>
                            <span>
                              {occurrence.work_order.status.replaceAll(
                                "_",
                                " ",
                              )}
                            </span>
                          </Link>
                        ) : null}
                        <OccurrenceActions occurrence={occurrence} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="inline-empty recurring-inline-empty">
                  <p>
                    No occurrence generated yet. Use Generate due renewals from
                    the main queue when this plan enters its planning window.
                  </p>
                </div>
              )}
            </section>
            <section className="recurring-detail-section">
              <header>
                <div>
                  <p className="surface-label">
                    <ClipboardList size={17} /> Follow-up history
                  </p>
                  <h2>Plan tasks</h2>
                </div>
              </header>
              {detail.tasks.length ? (
                <div className="recurring-card-grid">
                  {detail.tasks.map((task) => (
                    <article className="recurring-task-card" key={task.id}>
                      <span className={`status-pill ${task.status}`}>
                        {task.status.replaceAll("_", " ")}
                      </span>
                      <h3>{task.title}</h3>
                      <p>{task.description}</p>
                      <small>{dateTime(task.due_at)}</small>
                      <FollowUpActions status={task.status} taskId={task.id} />
                    </article>
                  ))}
                </div>
              ) : (
                <p className="inline-empty">No task history yet.</p>
              )}
            </section>
          </>
        )}
      </div>
    </PlatformFrame>
  );
}
function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
