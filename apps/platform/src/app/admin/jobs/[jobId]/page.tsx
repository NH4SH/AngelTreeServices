import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  Camera,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileSignature,
  Forklift,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Navigation,
  PackageCheck,
  ReceiptText,
  Truck,
  UserRound,
} from "lucide-react";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { CommunicationControls } from "@/components/communication-controls";
import { CompletedJobMarketingWorkspace } from "@/components/completed-job-marketing-workspace";
import { InlineJobWorkAdditionForm } from "@/components/change-order-forms";
import { PrintButton } from "@/components/documents/print-button";
import { WorkOrderDocument } from "@/components/documents/work-order-document";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { EmailDraftCard } from "@/components/email-draft-card";
import { JobCostPanel } from "@/components/job-cost-panel";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { JobScheduleManager } from "@/components/job-schedule-manager";
import { JobMaterialPlanForm } from "@/components/materials-forms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { CreateInvoiceFromJobAction, JobStatusActions, MarkJobCompleteAction } from "@/components/workflow-actions";
import { duplicateJob } from "@/lib/actions/duplicate-records";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getAssignableUsers } from "@/lib/data/appointments";
import { getCommunicationRecipientOptions, getCustomerCommunications } from "@/lib/data/communications";
import { getJobPhotos } from "@/lib/data/job-photos";
import { getJobDetail } from "@/lib/data/jobs";
import { getJobMaterials } from "@/lib/data/materials";
import { getJobCostEntries } from "@/lib/data/reports";
import { generateWorkOrderCrewMessage } from "@/lib/documents/email-drafts";
import { getGoogleReviewUrl } from "@/lib/documents/marketing-drafts";
import { generateEstimateScheduledMessage, generateJobScheduledMessage, generatePostJobFollowUpMessage } from "@/lib/documents/scheduling-drafts";
import { formatInvoiceStatus } from "@/lib/invoices/status";
import { formatJobOperationalState, getCurrentWorkAppointment, getCurrentWorkSession, getJobOperationalState } from "@/lib/jobs/operational-status";
import { getDirectionsUrl } from "@/lib/maps";

type JobDetailPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ change_added?: string; contact_warning?: string; duplicated?: string }>;
};

export default async function JobDetailPage({ params, searchParams }: JobDetailPageProps) {
  const { jobId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/admin/jobs/${jobId}`);

  if (!context.configured) return <SetupRequired title="Configure Supabase before opening job details" />;

  const [detail, assignedUsers, photos, communications, jobCosts, materials] = await Promise.all([
    getJobDetail(jobId),
    getAssignableUsers(),
    getJobPhotos(jobId),
    getCustomerCommunications({ jobId, limit: 30 }),
    getJobCostEntries(jobId),
    getJobMaterials(jobId, context.roles, context.user.id),
  ]);
  const job = detail.data;
  const recipientOptions = job
    ? await getCommunicationRecipientOptions({ customerId: job.customer_id, organizationId: job.organization_id })
    : { data: [], error: null };

  if (!job) {
    return (
      <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
        <div className="shell app-content"><EmptyState title="Job not found or no access" body="This record is unavailable to the current account." /></div>
      </PlatformFrame>
    );
  }

  const currentAppointment = getCurrentWorkAppointment(job.appointments ?? []);
  const currentWorkSession = getCurrentWorkSession(job.schedule_events ?? []);
  const operationalState = getJobOperationalState({ appointments: job.appointments, scheduleEvents: job.schedule_events, invoices: job.invoices, jobStatus: job.status });
  const operationalLabel = formatJobOperationalState(operationalState);
  const approvedQuote = (job.quotes ?? []).find((quote) => quote.status === "approved") ?? job.quotes?.[0] ?? null;
  const invoice = (job.invoices ?? []).find((item) => item.status !== "void") ?? job.invoices?.[0] ?? null;
  const approvedChanges = (job.change_orders ?? []).filter((order) => order.status === "approved");
  const pendingChanges = (job.change_orders ?? []).filter((order) => ["draft", "pending_internal_review", "ready_to_send", "sent", "change_requested"].includes(order.status));
  const originalScopeLines = [...(approvedQuote?.quote_line_items ?? [])].sort((left, right) => left.sort_order - right.sort_order);
  const addedScopeLines = [...approvedChanges, ...pendingChanges]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .flatMap((order) => [...(order.change_order_line_items ?? [])]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((line) => ({ line, order })));
  const unbilledChanges = approvedChanges.filter((order) => !order.invoice_id);
  const canManageBilling = hasAllowedRole(context.roles, platformRoleGroups.internalStaff);
  const canViewFinancials = hasAllowedRole(context.roles, platformRoleGroups.financialReporting);
  const canCreateInvoice = canManageBilling && !invoice && ["accepted", "scheduled", "in_progress", "completed", "completed_pending_review", "ready_to_invoice"].includes(job.status);
  const directionsUrl = getDirectionsUrl(job.service_locations);

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content job-command-page">
        <Link className="crew-back-link" href="/admin/jobs">Back to jobs</Link>
        <PageNotices
          errors={[detail.error, assignedUsers.error, photos.error, communications.error, jobCosts.error, materials.error, recipientOptions.error]}
          query={query}
        />

        <header className="job-command-header">
          <div className="job-command-title">
            <div>
              <p className="surface-label"><ClipboardCheck aria-hidden="true" size={18} />Work order</p>
              <h1>{title(job.service_type || "Service job")}</h1>
              <p className="job-command-scope">{job.requested_scope || "No approved scope entered yet."}</p>
            </div>
            <span className={`job-operational-status state-${operationalState}`}>{operationalLabel}</span>
          </div>

          <dl className="job-command-facts">
            <SummaryFact icon={<UserRound size={18} />} label="Customer" value={job.organizations?.name ?? job.customers?.display_name ?? "Not attached"} />
            <SummaryFact icon={<MapPin size={18} />} label="Service location" value={formatLocation(job.service_locations)} />
            <SummaryFact icon={<CalendarDays size={18} />} label="Scheduled" value={currentWorkSession ? formatDateTime(currentWorkSession.starts_at) : currentAppointment ? formatDateTime(currentAppointment.starts_at) : "Not scheduled"} />
            <SummaryFact icon={<Truck size={18} />} label="Assigned crew" value={job.assigned_crew?.full_name ?? job.assigned_crew?.email ?? "Not assigned"} />
            <SummaryFact icon={<FileSignature size={18} />} label="Approved quote" value={approvedQuote ? formatCurrency(approvedQuote.total_cents) : "Not linked"} />
            <SummaryFact icon={<ReceiptText size={18} />} label="Invoice" value={invoice ? `${formatInvoiceStatus(invoice.status)} · ${formatCurrency(invoice.balance_due_cents)} due` : "Not created"} />
          </dl>

          <div className="job-command-actions">
            {operationalState === "to_be_scheduled" ? <a className="primary-action" href="#job-schedule">Schedule job</a> : null}
            {operationalState === "scheduled" ? <Link className="primary-action" href={`/admin/schedule?job_id=${job.id}`}>View or change schedule</Link> : null}
            {invoice ? <Link className="primary-action" href={`/admin/invoices/${invoice.id}`}>Open invoice</Link> : null}
            {canCreateInvoice ? <CreateInvoiceFromJobAction jobId={job.id} operationalStatus={operationalState === "work_complete" ? undefined : operationalLabel} /> : null}
            <Link className="secondary-action" href={`/crew/jobs/${job.id}`}>Crew view</Link>
            {approvedQuote ? <Link className="secondary-action" href={`/admin/quotes/${approvedQuote.id}`}>Open quote</Link> : null}
            {operationalState === "in_progress" ? <Link className="secondary-action" href={`/admin/schedule?job_id=${job.id}`}>Change schedule</Link> : null}
            <a className="secondary-action" href="#job-photos"><Camera aria-hidden="true" size={17} />Photos</a>
            <MarkJobCompleteAction completedAt={job.completed_at} jobId={job.id} status={job.status} />
            {job.status === "scheduled" ? <JobStatusActions jobId={job.id} status={job.status} /> : null}
            <a className="secondary-action" href="#job-more"><MoreHorizontal aria-hidden="true" size={17} />More</a>
          </div>
        </header>

        <section className="job-billing-summary" aria-labelledby="job-billing-title">
          <div className="job-section-heading">
            <div><p className="surface-label"><CircleDollarSign size={17} />Billing</p><h2 id="job-billing-title">Quote and invoice</h2></div>
          </div>
          <div className="job-billing-records">
            <BillingRecord
              action={approvedQuote ? <Link href={`/admin/quotes/${approvedQuote.id}`}>Open quote</Link> : null}
              label="Quote"
              title={approvedQuote?.quote_number ?? "No approved quote"}
              value={approvedQuote ? `${title(approvedQuote.status)} · ${formatCurrency(approvedQuote.total_cents)}` : "Create or approve a quote when pricing is needed."}
            />
            <BillingRecord
              action={invoice ? <Link href={`/admin/invoices/${invoice.id}`}>Open invoice</Link> : canCreateInvoice ? <CreateInvoiceFromJobAction jobId={job.id} operationalStatus={operationalLabel} /> : null}
              label="Invoice"
              title={invoice ? invoice.invoice_number ?? "Invoice draft" : "Not created"}
              value={invoice ? `${formatInvoiceStatus(invoice.status)} · ${formatCurrency(invoice.balance_due_cents)} due` : "A draft can be created without completing or closing the job."}
            />
          </div>
          {invoice && unbilledChanges.length ? <p className="job-attention-note">{unbilledChanges.length} approved {unbilledChanges.length === 1 ? "addition has" : "additions have"} not been added to this invoice.</p> : null}
        </section>

        <section className="job-core-section" id="job-scope">
          <div className="job-section-heading">
            <div><p className="surface-label"><FileSignature size={17} />Work list</p><h2>Scope of work</h2></div>
          </div>
          <div className="job-work-scope-list">
            {originalScopeLines.length ? originalScopeLines.map((line) => (
              <article className="job-work-scope-line" key={line.id}>
                <span className="job-work-line-kind original">Original</span>
                <div><strong>{line.name}</strong>{line.description ? <p className="pre-wrap-copy">{line.description}</p> : null}</div>
                <span>{line.quantity} × {formatCurrency(line.unit_price_cents)}</span>
                <strong>{formatCurrency(line.total_cents)}</strong>
              </article>
            )) : (
              <article className="job-work-scope-line">
                <span className="job-work-line-kind original">Original</span>
                <div><strong>{title(job.service_type || "Approved work")}</strong><p className="pre-wrap-copy">{job.requested_scope || "Open the approved quote for scope details."}</p></div>
              </article>
            )}
            {addedScopeLines.map(({ line, order }) => {
              const approved = order.status === "approved";
              return (
                <article className={`job-work-scope-line ${approved ? "approved" : "pending"}`} key={line.id}>
                  <span className={`job-work-line-kind ${approved ? "approved" : "pending"}`}>{approved ? "Added" : "Draft addition"}</span>
                  <div><strong>{line.title}</strong>{line.description ? <p className="pre-wrap-copy">{line.description}</p> : null}<Link href={`/admin/change-orders/${order.id}`}>{approved ? "View approval" : "Review and approve"}</Link></div>
                  <span>{line.quantity} {line.unit ?? ""} × {formatCurrency(line.unit_price_cents)}</span>
                  <strong>{formatCurrency(line.amount_cents)}</strong>
                </article>
              );
            })}
          </div>
          <InlineJobWorkAdditionForm jobId={job.id} />
        </section>

        <section className="job-core-section" id="job-schedule">
          <JobScheduleManager events={job.schedule_events ?? []} jobId={job.id} users={assignedUsers.data} />
          <div className="job-schedule-calendar-link"><Link className="secondary-action compact-action" href={`/admin/schedule?job_id=${job.id}`}>Open full calendar</Link></div>
          {(job.appointments ?? []).filter((appointment) => appointment.appointment_type !== "job").length ? <div className="job-appointment-list legacy-appointment-list">{(job.appointments ?? []).filter((appointment) => appointment.appointment_type !== "job").map((appointment) => (
            <article key={appointment.id}>
              <div><strong>{title(appointment.appointment_type)}</strong><span>{formatDateTime(appointment.starts_at)} · {title(appointment.status)}{appointment.profiles ? ` · ${appointment.profiles.full_name ?? appointment.profiles.email ?? "Assigned staff"}` : " · Unassigned"}</span></div>
              <AppointmentStatusActions appointmentId={appointment.id} currentStatus={appointment.status} jobId={job.id} />
            </article>
          ))}</div> : null}
        </section>

        <section className="job-core-section" id="job-photos">
          <div className="job-section-heading">
            <div><p className="surface-label"><Camera size={17} />Photos</p><h2>{photos.data.length ? `${photos.data.length} job ${photos.data.length === 1 ? "photo" : "photos"}` : "Job photos"}</h2></div>
            <Link className="secondary-action compact-action" href={`/crew/jobs/${job.id}#photos`}>Add photos</Link>
          </div>
          <JobPhotoGallery photos={photos.data} />
        </section>

        <details className="job-disclosure">
          <summary><span><MessageSquare size={19} /><strong>Customer communication</strong><small>{communications.data.length ? `${communications.data.length} recent records` : "No communication history"}</small></span><ChevronDown size={19} /></summary>
          <div className="job-disclosure-content">
            <CommunicationControls
              communicationType={currentAppointment?.appointment_type === "estimate" ? "estimate_reminder" : "work_reminder"}
              communications={communications.data.filter((item) => currentAppointment ? item.appointment_id === currentAppointment.id : item.job_id === job.id)}
              recipientOptions={recipientOptions.data}
              recordId={currentAppointment?.id ?? job.id}
              recordType={currentAppointment ? "appointment" : "job"}
            />
          </div>
        </details>

        <details className="job-disclosure">
          <summary><span><Truck size={19} /><strong>Operations</strong><small>Crew, equipment, materials, and access</small></span><ChevronDown size={19} /></summary>
          <div className="job-disclosure-content job-operations-grid">
            <section><h3>Crew work order</h3><p>Field scope, access notes, materials, and photos remain available to assigned crew.</p><Link className="secondary-action compact-action" href={`/crew/jobs/${job.id}`}>Open crew view</Link></section>
            <section><h3>Access</h3><p>{job.service_locations?.access_notes || job.service_locations?.service_notes || "No access instructions recorded."}</p>{directionsUrl ? <a className="secondary-action compact-action" href={directionsUrl} rel="noreferrer" target="_blank"><Navigation size={16} />Directions</a> : null}</section>
            <section><h3>Equipment</h3>{job.equipment_assignments?.length ? job.equipment_assignments.map((assignment) => <Link className="linked-record" href={`/admin/equipment/${assignment.asset_id}`} key={assignment.id}><strong>{assignment.equipment_assets?.name ?? "Equipment"}</strong><span>{assignment.equipment_assets?.asset_number ?? "No asset number"} · {title(assignment.equipment_assets?.status ?? "unknown")}</span></Link>) : <CompactEmpty>No equipment assigned.</CompactEmpty>}<Link className="secondary-action compact-action" href="/admin/equipment">Manage equipment</Link></section>
            <section className="job-operations-wide"><h3>Materials</h3>{materials.data ? <><div className="job-material-comparison">{materials.data.requirements.length ? materials.data.requirements.map((requirement: any) => { const material = materials.data?.materials.find((item: any) => item.id === requirement.material_id); return <article key={requirement.id}><div><strong>{material?.name ?? "Material"}</strong><span>{requirement.notes || "No planning notes"}</span></div><b>{requirement.planned_quantity} {requirement.unit.replaceAll("_", " ")}</b></article>; }) : <CompactEmpty>No materials planned.</CompactEmpty>}</div><JobMaterialPlanForm jobId={job.id} materials={materials.data.materials as any} /></> : <CompactEmpty>Materials tracking is unavailable.</CompactEmpty>}</section>
          </div>
        </details>

        {canViewFinancials ? <details className="job-disclosure"><summary><span><CircleDollarSign size={19} /><strong>Financials</strong><small>Private costs and profitability inputs</small></span><ChevronDown size={19} /></summary><div className="job-disclosure-content"><JobCostPanel canManage costs={jobCosts.data} jobId={job.id} /></div></details> : null}

        <details className="job-disclosure" id="job-more">
          <summary><span><MoreHorizontal size={19} /><strong>Advanced and more</strong><small>Print, drafts, marketing, and duplication</small></span><ChevronDown size={19} /></summary>
          <div className="job-disclosure-content job-advanced-stack">
            <section className="document-workspace"><div className="document-workspace-heading print-hidden"><div><p className="surface-label"><Truck size={17} />Printable work order</p><h2>Crew work order preview</h2></div><PrintButton label="Print work order" /></div><WorkOrderDocument job={job} /></section>
            <section className="email-draft-grid">{(job.appointments ?? []).slice(0, 3).map((appointment) => <EmailDraftCard draft={appointment.appointment_type === "estimate" ? generateEstimateScheduledMessage(job, appointment) : appointment.appointment_type === "job" ? generateJobScheduledMessage(job, appointment) : generatePostJobFollowUpMessage(job)} key={appointment.id} label={`${title(appointment.appointment_type)} message draft`} />)}<EmailDraftCard draft={generateWorkOrderCrewMessage(job)} label="Crew message draft" /></section>
            {operationalState === "work_complete" || operationalState === "invoiced" || operationalState === "paid" ? <CompletedJobMarketingWorkspace googleReviewUrl={getGoogleReviewUrl()} job={job} photos={photos.data} /> : null}
            <div className="job-more-actions"><DuplicateRecordButton action={duplicateJob} buttonClassName="secondary-action" hiddenFieldName="job_id" hiddenFieldValue={job.id} label="Duplicate work order" pendingLabel="Copying work order..." /></div>
          </div>
        </details>
      </div>
    </PlatformFrame>
  );
}

function SummaryFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div><dt>{icon}{label}</dt><dd>{value}</dd></div>;
}

function BillingRecord({ action, label, title: recordTitle, value }: { action: ReactNode; label: string; title: string; value: string }) {
  return <article><span>{label}</span><div><strong>{recordTitle}</strong><p>{value}</p></div>{action}</article>;
}

function CompactEmpty({ children }: { children: ReactNode }) {
  return <p className="job-compact-empty">{children}</p>;
}

function PageNotices({ errors, query }: { errors: (string | null)[]; query: { change_added?: string; contact_warning?: string; duplicated?: string } }) {
  const messages = [...new Set(errors.filter((error): error is string => Boolean(error)))];
  return <>{messages.map((message) => <section className="data-warning" key={message} role="status"><strong>Database notice</strong><p>{message}</p></section>)}{query.change_added === "1" ? <p className="form-message success" role="status">Work item added as a draft. Review and approve it before crew work or billing.</p> : null}{query.duplicated === "job" ? <p className="form-message success" role="status">Work order duplicated.</p> : null}{query.contact_warning === "1" ? <p className="form-message error" role="alert">One or more inactive organization contacts were not copied. Review contacts before scheduling.</p> : null}</>;
}

function EmptyState({ title: emptyTitle, body }: { title: string; body: string }) {
  return <section className="empty-state"><h2>{emptyTitle}</h2><p>{body}</p></section>;
}

function formatLocation(location: { street: string; city: string; state: string; postal_code?: string | null } | null | undefined) {
  return location ? [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ") : "No service location";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
