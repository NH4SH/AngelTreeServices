import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, Camera, ClipboardCheck, FileSignature, MapPin, Navigation, ReceiptText, Truck, UsersRound } from "lucide-react";
import { AppointmentStatusActions } from "@/components/appointment-status-actions";
import { PrintButton } from "@/components/documents/print-button";
import { WorkOrderDocument } from "@/components/documents/work-order-document";
import { EmailDraftCard } from "@/components/email-draft-card";
import { JobStatusActions } from "@/components/workflow-actions";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { CompletedJobMarketingWorkspace } from "@/components/completed-job-marketing-workspace";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddAppointmentForm } from "@/app/admin/schedule/AppointmentForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getAssignableUsers } from "@/lib/data/appointments";
import { getJobDetail } from "@/lib/data/jobs";
import { getJobPhotos } from "@/lib/data/job-photos";
import { generateWorkOrderCrewMessage } from "@/lib/documents/email-drafts";
import { getGoogleReviewUrl } from "@/lib/documents/marketing-drafts";
import { generateEstimateScheduledMessage, generateJobScheduledMessage, generatePostJobFollowUpMessage } from "@/lib/documents/scheduling-drafts";
import { getDirectionsUrl } from "@/lib/maps";

type JobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { jobId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/jobs/${jobId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening job details" />;
  }

  const [detail, assignedUsers, photos] = await Promise.all([
    getJobDetail(jobId),
    getAssignableUsers(),
    getJobPhotos(jobId),
  ]);
  const job = detail.data;

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <Link className="crew-back-link" href="/admin/jobs">Back to jobs</Link>
        {detail.error ? <DataWarning message={detail.error} /> : null}
        {assignedUsers.error ? <DataWarning message={assignedUsers.error} /> : null}
        {photos.error ? <DataWarning message={`Photos: ${photos.error}`} /> : null}
        {!job ? (
          <EmptyState title="Job not found or no access" body="This record is unavailable to the current account." />
        ) : (
          <>
            <section className="page-heading">
              <p className="surface-label"><ClipboardCheck aria-hidden="true" size={18} />Job File</p>
              <h1>{job.service_type?.replace("_", " ") || "Service job"}</h1>
              <p>{job.requested_scope || "No requested scope entered yet."}</p>
              <div className="action-row">
                <Link className="secondary-action" href={`/crew/jobs/${job.id}`}>Crew view</Link>
              </div>
            </section>

            <section className="scheduling-workspace">
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
              <article className="detail-panel">
                <PanelTitle icon={<ClipboardCheck size={18} />} title="Status" />
                <span className="status-pill">{job.status.replace("_", " ")}</span>
                <JobStatusActions jobId={job.id} status={job.status} />
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<UsersRound size={18} />} title="Customer" />
                <Link className="linked-record" href={`/admin/customers/${job.customer_id}`}>
                  <strong>{job.customers?.display_name ?? "Unknown customer"}</strong>
                  <span>{job.customers?.phone || job.customers?.email || "No contact set"}</span>
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
              <RecordLinks
                empty="No invoices yet."
                icon={<ReceiptText size={18} />}
                items={(job.invoices ?? []).map((invoice) => ({
                  href: `/admin/invoices/${invoice.id}`,
                  meta: `${invoice.status.replace("_", " ")} - ${formatCurrency(invoice.balance_due_cents)} due`,
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
            </section>

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

            {job.status === "completed" ? (
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
