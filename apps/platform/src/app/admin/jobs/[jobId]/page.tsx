import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, Camera, ClipboardCheck, FilePlus2, FileSignature, Forklift, MapPin, Navigation, PackageCheck, ReceiptText, Truck, UsersRound } from "lucide-react";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { CommunicationControls } from "@/components/communication-controls";
import { PrintButton } from "@/components/documents/print-button";
import { WorkOrderDocument } from "@/components/documents/work-order-document";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { EmailDraftCard } from "@/components/email-draft-card";
import { CreateInvoiceFromJobAction, JobStatusActions } from "@/components/workflow-actions";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { JobCostPanel } from "@/components/job-cost-panel";
import { JobMaterialPlanForm } from "@/components/materials-forms";
import { CompletedJobMarketingWorkspace } from "@/components/completed-job-marketing-workspace";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddAppointmentForm } from "@/app/admin/schedule/AppointmentForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { duplicateJob } from "@/lib/actions/duplicate-records";
import { getAssignableUsers } from "@/lib/data/appointments";
import { getJobDetail } from "@/lib/data/jobs";
import { getJobPhotos } from "@/lib/data/job-photos";
import { getJobCostEntries } from "@/lib/data/reports";
import { getJobMaterials } from "@/lib/data/materials";
import { getCommunicationRecipientOptions, getCustomerCommunications } from "@/lib/data/communications";
import { generateWorkOrderCrewMessage } from "@/lib/documents/email-drafts";
import { getGoogleReviewUrl } from "@/lib/documents/marketing-drafts";
import { generateEstimateScheduledMessage, generateJobScheduledMessage, generatePostJobFollowUpMessage } from "@/lib/documents/scheduling-drafts";
import { getDirectionsUrl } from "@/lib/maps";
import { formatInvoiceStatus } from "@/lib/invoices/status";

type JobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams: Promise<{
    contact_warning?: string;
    duplicated?: string;
  }>;
};

export default async function JobDetailPage({ params, searchParams }: JobDetailPageProps) {
  const { jobId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(`/admin/jobs/${jobId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening job details" />;
  }

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
  const nextAppointment = job?.appointments
    ?.filter((appointment) => ["estimate", "job", "maintenance"].includes(appointment.appointment_type) && ["scheduled", "confirmed"].includes(appointment.status))
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())[0] ?? null;

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/jobs">Back to jobs</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {assignedUsers.error ? <DataWarning message={assignedUsers.error} /> : null}
        {photos.error ? <DataWarning message={`Photos: ${photos.error}`} /> : null}
        {communications.error ? <DataWarning message={`Customer reminders: ${communications.error}`} /> : null}
        {jobCosts.error ? <DataWarning message={`Job costs: ${jobCosts.error}`} /> : null}
        {materials.error ? <DataWarning message={`Materials: ${materials.error}`} /> : null}
        {recipientOptions.error ? <DataWarning message={`Reminder recipients: ${recipientOptions.error}`} /> : null}
        {query.duplicated === "job" ? (
          <p className="form-message success" role="status">Work order duplicated.</p>
        ) : null}
        {query.contact_warning === "1" ? (
          <p className="form-message error" role="alert">One or more selected organization contacts were inactive and were not copied. Review the work order contacts before scheduling.</p>
        ) : null}
        {!job ? (
          <EmptyState title="Job not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="page-heading">
              <p className="surface-label"><ClipboardCheck aria-hidden="true" size={18} />Job File</p>
              <h1>{job.service_type?.replace("_", " ") || "Service job"}</h1>
              <p>{job.requested_scope || "No requested scope entered yet."}</p>
              <div className="action-row">
                {job.status === "accepted" ? <a className="primary-action" href="#job-scheduling">Schedule work</a> : null}
                {["scheduled", "in_progress"].includes(job.status) ? <Link className="primary-action" href={`/admin/schedule?job_id=${job.id}`}>View schedule</Link> : null}
                {["completed", "ready_to_invoice"].includes(job.status) ? <a className="primary-action" href="#job-status-actions">Generate invoice</a> : null}
                <Link className="secondary-action" href={`/crew/jobs/${job.id}`}>Crew view</Link>
                <DuplicateRecordButton
                  action={duplicateJob}
                  buttonClassName="secondary-action"
                  hiddenFieldName="job_id"
                  hiddenFieldValue={job.id}
                  label="Duplicate work order"
                  pendingLabel="Copying work order..."
                />
              </div>
            </section>

            <section className="scheduling-workspace" id="job-scheduling">
              <div className="document-workspace-heading">
                <div>
                  <p className="surface-label"><CalendarDays aria-hidden="true" size={18} />Scheduling</p>
                  <h2>Add an estimate, job visit, or follow-up</h2>
                </div>
                <Link className="secondary-action" href="/admin/schedule">Open schedule</Link>
              </div>
              <div className="scheduling-form-grid">
                <section>
                  <h3>Schedule estimate</h3>
                  <AddAppointmentForm assignedUsers={assignedUsers.data} defaultAppointmentType="estimate" jobId={job.id} jobs={[]} lockedAppointmentType="estimate" />
                </section>
                <section>
                  <h3>Schedule job</h3>
                  <AddAppointmentForm assignedUsers={assignedUsers.data} defaultAppointmentType="job" jobId={job.id} jobs={[]} lockedAppointmentType="job" />
                </section>
                <section>
                  <h3>Add follow-up</h3>
                  <AddAppointmentForm assignedUsers={assignedUsers.data} defaultAppointmentType="follow_up" jobId={job.id} jobs={[]} lockedAppointmentType="follow_up" />
                </section>
              </div>
            </section>

            <section className="detail-grid">
              <article className="detail-panel" id="job-status-actions">
                <PanelTitle icon={<ClipboardCheck size={18} />} title="Status" />
                <span className="status-pill">{job.status.replace("_", " ")}</span>
                <JobStatusActions jobId={job.id} status={job.status} />
                {["completed", "ready_to_invoice"].includes(job.status) ? <CreateInvoiceFromJobAction jobId={job.id} /> : null}
                {["returned_for_correction", "completed_pending_review", "ready_to_invoice"].includes(job.status) ? (
                  <Link className="secondary-action compact-action" href={`/admin/jobs/${job.id}/closeout`}>Review closeout</Link>
                ) : null}
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<UsersRound size={18} />} title="Contracting party" />
                <Link className="linked-record" href={job.organization_id ? `/admin/organizations/${job.organization_id}` : `/admin/customers/${job.customer_id}`}>
                  <strong>{job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party"}</strong>
                  <span>{job.organizations?.billing_phone || job.organizations?.billing_email || job.customers?.phone || job.customers?.email || "No contact set"}</span>
                </Link>
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<MapPin size={18} />} title="Service location" />
                <p>{job.service_locations ? `${job.service_locations.street}, ${job.service_locations.city}, ${job.service_locations.state}` : "No service location"}</p>
                <p>{job.service_locations?.access_notes || job.service_locations?.service_notes || "No access or service notes."}</p>
                {getDirectionsUrl(job.service_locations) ? (
                  <a className="primary-action compact-action" href={getDirectionsUrl(job.service_locations) ?? undefined} rel="noreferrer" target="_blank">
                    <Navigation aria-hidden="true" size={17} />
                    Directions
                  </a>
                ) : null}
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<CalendarDays size={18} />} title="Schedule" />
                {job.appointments?.length ? job.appointments.map((appointment) => (
                  <article className="linked-record" key={appointment.id}>
                    <strong>{appointment.appointment_type.replace("_", " ")}</strong>
                    <span>{new Date(appointment.starts_at).toLocaleString()} - {appointment.status.replace("_", " ")}</span>
                    <AppointmentStatusActions appointmentId={appointment.id} currentStatus={appointment.status} jobId={job.id} />
                  </article>
                )) : <EmptyInline>No appointments yet.</EmptyInline>}
              </article>
              {(nextAppointment || job.scheduled_start_at) ? (
                <article className="detail-panel wide-detail-panel">
                  <PanelTitle icon={<CalendarDays size={18} />} title="Customer appointment communication" />
                  <p className="inline-empty">Customer messages use the current schedule and service location. Internal calendar, access, gate, crew, and service notes are never included.</p>
                  <CommunicationControls
                    communicationType={nextAppointment?.appointment_type === "estimate" ? "estimate_reminder" : "work_reminder"}
                    communications={communications.data.filter((item) => nextAppointment ? item.appointment_id === nextAppointment.id : item.job_id === job.id)}
                    recipientOptions={recipientOptions.data}
                    recordId={nextAppointment?.id ?? job.id}
                    recordType={nextAppointment ? "appointment" : "job"}
                  />
                </article>
              ) : null}
              <RecordLinks
                empty="No quotes yet."
                icon={<FileSignature size={18} />}
                items={(job.quotes ?? []).map((quote) => ({
                  href: `/admin/quotes/${quote.id}`,
                  meta: `${quote.status.replace("_", " ")} - ${formatCurrency(quote.total_cents)}`,
                  title: quote.quote_number || "Quote",
                }))}
                title="Related quote"
              />
              <article className="detail-panel wide-detail-panel change-order-job-panel">
                <div className="panel-heading-row">
                  <PanelTitle icon={<FilePlus2 size={18} />} title="Additional work and change orders" />
                  <Link className="primary-action compact-action" href={`/admin/change-orders?new=1&jobId=${job.id}`}>
                    <FilePlus2 size={17} /> Create change order
                  </Link>
                </div>
                <div className="job-scope-groups">
                  <section>
                    <h3>Original approved scope</h3>
                    <p className="pre-wrap-copy">{job.requested_scope || "Open the approved quote for original scope details."}</p>
                  </section>
                  <section>
                    <h3>Approved change orders</h3>
                    {(job.change_orders ?? []).filter((order) => order.status === "approved").length ? (job.change_orders ?? []).filter((order) => order.status === "approved").map((order) => (
                      <Link className="linked-record" href={`/admin/change-orders/${order.id}`} key={order.id}>
                        <strong>{order.change_order_number} - {order.title}</strong>
                        <span>{formatCurrency(order.total_cents)} additional - {order.invoice_id ? "billed" : "not yet billed"}</span>
                      </Link>
                    )) : <EmptyInline>No approved additions.</EmptyInline>}
                  </section>
                  <section>
                    <h3>Pending change orders</h3>
                    {(job.change_orders ?? []).filter((order) => ["draft", "pending_internal_review", "ready_to_send", "sent", "change_requested"].includes(order.status)).length ? (job.change_orders ?? []).filter((order) => ["draft", "pending_internal_review", "ready_to_send", "sent", "change_requested"].includes(order.status)).map((order) => (
                      <Link className="linked-record" href={`/admin/change-orders/${order.id}`} key={order.id}><strong>{order.change_order_number} - {order.title}</strong><span>{order.status.replaceAll("_", " ")} - not part of crew scope or billing</span></Link>
                    )) : <EmptyInline>No pending additions.</EmptyInline>}
                  </section>
                  {(job.change_orders ?? []).some((order) => ["declined", "cancelled", "expired"].includes(order.status)) ? <section><h3>Declined or cancelled</h3>{(job.change_orders ?? []).filter((order) => ["declined", "cancelled", "expired"].includes(order.status)).map((order) => <Link className="linked-record" href={`/admin/change-orders/${order.id}`} key={order.id}><strong>{order.change_order_number}</strong><span>{order.status}</span></Link>)}</section> : null}
                </div>
              </article>
              <RecordLinks
                empty="No invoices yet."
                icon={<ReceiptText size={18} />}
                items={(job.invoices ?? []).map((invoice) => ({
                  href: `/admin/invoices/${invoice.id}`,
                  meta: `${formatInvoiceStatus(invoice.status)} - ${formatCurrency(invoice.balance_due_cents)} due`,
                  title: invoice.invoice_number || "Invoice",
                }))}
                title="Related invoice"
              />
              <article className="detail-panel wide-detail-panel">
                <PanelTitle icon={<Camera size={18} />} title="Job photos" />
                <JobPhotoGallery photos={photos.data} />
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<Truck size={18} />} title="Crew work order" />
                <p>Scope, service location, access notes, crew notes, checklist, and photo needs are available in the crew view.</p>
                <Link className="primary-action compact-action" href={`/crew/jobs/${job.id}`}>Open work order</Link>
              </article>
              <article className="detail-panel wide-detail-panel">
                <PanelTitle icon={<Forklift size={18} />} title="Assigned equipment" />
                {job.equipment_assignments?.length ? (
                  <div className="linked-record-list">
                    {job.equipment_assignments.map((assignment) => (
                      <Link className="linked-record" href={`/admin/equipment/${assignment.asset_id}`} key={assignment.id}>
                        <strong>{assignment.equipment_assets?.name ?? "Equipment"}</strong>
                        <span>{assignment.equipment_assets?.asset_number ?? "No asset number"} - {assignment.equipment_assets?.status.replaceAll("_", " ") ?? "Unknown status"}</span>
                      </Link>
                    ))}
                  </div>
                ) : <EmptyInline>No equipment assigned to this work order yet.</EmptyInline>}
                <Link className="secondary-action compact-action" href="/admin/equipment">Assign equipment</Link>
              </article>
              <article className="detail-panel wide-detail-panel">
                <PanelTitle icon={<PackageCheck size={18} />} title="Materials plan and actual use" />
                {materials.data ? <>
                  <div className="job-material-comparison">
                    {materials.data.requirements.length ? materials.data.requirements.map((requirement: any) => {
                      const material = materials.data?.materials.find((item: any) => item.id === requirement.material_id);
                      const used = materials.data?.transactions.filter((item: any) => item.material_id === requirement.material_id && item.transaction_type === "job_use").reduce((sum: number, item: any) => sum + Number(item.quantity), 0) ?? 0;
                      return <article key={requirement.id}><div><strong>{material?.name ?? "Material"}</strong><span>{requirement.notes || "No planning notes"}</span></div><dl><div><dt>Planned</dt><dd>{requirement.is_estimated ? "Est. " : ""}{requirement.planned_quantity} {requirement.unit.replaceAll("_", " ")}</dd></div><div><dt>Used</dt><dd>{used} {requirement.unit.replaceAll("_", " ")}</dd></div></dl></article>;
                    }) : <EmptyInline>No materials planned yet.</EmptyInline>}
                  </div>
                  <JobMaterialPlanForm jobId={job.id} materials={materials.data.materials as any} />
                  <Link className="secondary-action compact-action" href="/admin/materials?view=reservations">Reserve or review stock</Link>
                </> : <EmptyInline>Apply the materials migration to plan inventory.</EmptyInline>}
              </article>
            </section>

            {hasAllowedRole(context.roles, platformRoleGroups.financialReporting) ? (
              <JobCostPanel canManage costs={jobCosts.data} jobId={job.id} />
            ) : null}

            <section className="document-workspace">
              <div className="document-workspace-heading print-hidden">
                <div>
                  <p className="surface-label"><Truck aria-hidden="true" size={18} />Printable work order</p>
                  <h2>Crew work order preview</h2>
                </div>
                <PrintButton label="Print work order" />
              </div>
              <WorkOrderDocument job={job} />
            </section>

            <section className="email-draft-grid">
              {(job.appointments ?? []).slice(0, 3).map((appointment) => (
                <EmailDraftCard
                  draft={appointment.appointment_type === "estimate"
                    ? generateEstimateScheduledMessage(job, appointment)
                    : appointment.appointment_type === "job"
                      ? generateJobScheduledMessage(job, appointment)
                      : generatePostJobFollowUpMessage(job)}
                  key={appointment.id}
                  label={`${appointment.appointment_type.replace("_", " ")} message draft`}
                />
              ))}
              <EmailDraftCard draft={generateWorkOrderCrewMessage(job)} label="Crew message draft" />
            </section>

            {["completed", "ready_to_invoice", "invoiced", "paid"].includes(job.status) ? (
              <CompletedJobMarketingWorkspace
                googleReviewUrl={getGoogleReviewUrl()}
                job={job}
                photos={photos.data}
              />
            ) : null}
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function RecordLinks({ empty, icon, items, title }: { empty: string; icon: ReactNode; items: { href: string; meta: string; title: string }[]; title: string }) {
  return (
    <article className="detail-panel">
      <PanelTitle icon={icon} title={title} />
      {items.length ? items.map((item) => (
        <Link className="linked-record" href={item.href} key={item.href}><strong>{item.title}</strong><span>{item.meta}</span></Link>
      )) : <EmptyInline>{empty}</EmptyInline>}
    </article>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <h2 className="panel-title">{icon}{title}</h2>;
}

function EmptyInline({ children }: { children: ReactNode }) {
  return <p className="inline-empty">{children}</p>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <section className="empty-state"><h2>{title}</h2><p>{body}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
