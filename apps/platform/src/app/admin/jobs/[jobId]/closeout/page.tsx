import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileSignature,
  MapPin,
  ReceiptText,
  UserRoundCheck,
} from "lucide-react";
import { CloseoutReviewActions } from "@/components/closeout-review-actions";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { CreateInvoiceFromJobAction } from "@/components/workflow-actions";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getJobCloseout } from "@/lib/data/job-closeouts";
import { getJobDetail } from "@/lib/data/jobs";
import { getJobPhotos } from "@/lib/data/job-photos";
import { getTimeEntries, getTimeEntryHours } from "@/lib/data/time-clock";

type CloseoutReviewPageProps = { params: Promise<{ jobId: string }> };

export default async function CloseoutReviewPage({ params }: CloseoutReviewPageProps) {
  const { jobId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/jobs/${jobId}/closeout`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before reviewing closeouts" />;
  }

  const [jobResult, closeoutResult, photosResult, timeResult] = await Promise.all([
    getJobDetail(jobId),
    getJobCloseout(jobId),
    getJobPhotos(jobId),
    getTimeEntries({ jobId }),
  ]);
  const job = jobResult.data;
  const bundle = closeoutResult.data;

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content closeout-review-page">
        <Link className="crew-back-link" href="/admin/jobs/closeouts">Back to closeout queue</Link>
        {[jobResult.error, closeoutResult.error, photosResult.error, timeResult.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        {!job || !bundle ? (
          <section className="empty-state"><h2>Closeout not available</h2><p>This work order has no accessible closeout record.</p></section>
        ) : (
          <>
            <section className="page-heading closeout-review-heading">
              <p className="surface-label"><ClipboardCheck aria-hidden="true" size={18} />Office closeout review</p>
              <h1>{job.customers?.display_name ?? "Customer"}</h1>
              <p>{job.service_type?.replaceAll("_", " ") ?? "Service job"} at {formatLocation(job.service_locations)}</p>
              <div className="action-row">
                <span className={`closeout-status-chip status-${bundle.closeout.status}`}>{formatStatus(bundle.closeout.status)}</span>
                <Link className="secondary-action" href={`/admin/jobs/${job.id}`}>Open work order</Link>
                <Link className="secondary-action" href={`/crew/jobs/${job.id}`}>Open crew view</Link>
              </div>
            </section>

            <section className="closeout-review-flags" aria-label="Closeout attention flags">
              <Flag active={bundle.closeout.has_scope_exception} label="Scope exception" />
              <Flag active={bundle.closeout.has_incident} label="Incident or damage" />
              <Flag active={bundle.closeout.has_additional_work} label="Additional work requested" />
            </section>

            <section className="closeout-review-grid">
              <article className="detail-panel">
                <PanelTitle icon={<MapPin size={18} />} title="Service location" />
                <p>{formatLocation(job.service_locations)}</p>
                <p>{job.service_locations?.access_notes || job.service_locations?.service_notes || "No access notes."}</p>
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<Clock3 size={18} />} title="Completion record" />
                <dl className="review-detail-list">
                  <div><dt>Submitted</dt><dd>{formatDateTime(bundle.closeout.submitted_at)}</dd></div>
                  <div><dt>Revisions</dt><dd>{bundle.submissions.length}</dd></div>
                  <div><dt>Last reviewed</dt><dd>{formatDateTime(bundle.closeout.reviewed_at)}</dd></div>
                </dl>
              </article>
            </section>

            <section className="closeout-review-section">
              <PanelTitle icon={<FileSignature size={18} />} title="Approved scope and completion" />
              <div className="review-scope-list">
                {bundle.scopeItems.map((item) => (
                  <article key={item.id}>
                    <div><h3>{item.title}</h3><span className={`scope-state state-${item.completion_state ?? "pending"}`}>{item.completion_state?.replaceAll("_", " ") ?? "Not marked"}</span></div>
                    {item.description ? <p className="pre-wrap-copy">{item.description}</p> : null}
                    {item.exception_note ? <p className="review-exception-note"><AlertTriangle aria-hidden="true" size={17} />{item.exception_note}</p> : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="closeout-review-section">
              <PanelTitle icon={<CheckCircle2 size={18} />} title="Completion checklist" />
              <div className="review-checklist-list">
                {bundle.checklist.map((item) => (
                  <div key={item.id}>
                    <span className={`checklist-state state-${item.completion_status}`}><CheckCircle2 aria-hidden="true" size={17} /></span>
                    <div><strong>{item.label}</strong><p>{item.completion_status.replaceAll("_", " ")}{item.explanation ? `: ${item.explanation}` : ""}</p></div>
                  </div>
                ))}
              </div>
            </section>

            <section className="closeout-review-grid">
              <article className="detail-panel wide-detail-panel">
                <PanelTitle icon={<ClipboardCheck size={18} />} title="Crew and office notes" />
                <p className="pre-wrap-copy">{bundle.closeout.crew_internal_notes || "No internal completion notes."}</p>
                <small className="privacy-note">Private. Never include this text automatically on an invoice or customer portal.</small>
              </article>
              <article className="detail-panel wide-detail-panel">
                <PanelTitle icon={<ReceiptText size={18} />} title="Customer-facing work summary" />
                <p className="pre-wrap-copy">{bundle.closeout.customer_summary || "No customer-facing summary entered."}</p>
              </article>
            </section>

            <section className="closeout-review-grid">
              <article className={`detail-panel ${bundle.closeout.has_incident ? "attention-panel" : ""}`}>
                <PanelTitle icon={<AlertTriangle size={18} />} title="Incident report" />
                <strong>{bundle.closeout.incident_occurred ? "Incident reported" : "No incident reported"}</strong>
                {bundle.closeout.incident_description ? <p className="pre-wrap-copy">{bundle.closeout.incident_description}</p> : null}
                <small className="privacy-note">Staff-only. Do not send automatically to the customer.</small>
              </article>
              <article className={`detail-panel ${bundle.closeout.has_additional_work ? "attention-panel" : ""}`}>
                <PanelTitle icon={<ClipboardCheck size={18} />} title="Additional work request" />
                <strong>{bundle.closeout.additional_work_requested ? "Follow-up needed" : "No additional work requested"}</strong>
                {bundle.closeout.additional_work_description ? <p className="pre-wrap-copy">{bundle.closeout.additional_work_description}</p> : null}
                <small className="privacy-note">Create a separate quote or work order. Do not add charges to the accepted scope automatically.</small>
              </article>
              <article className="detail-panel">
                <PanelTitle icon={<UserRoundCheck size={18} />} title="Customer acknowledgment" />
                <strong>{bundle.closeout.acknowledgment_status?.replaceAll("_", " ") ?? "Not selected"}</strong>
                {bundle.closeout.acknowledgment_name ? <p>{bundle.closeout.acknowledgment_name}</p> : null}
                <p>{formatDateTime(bundle.closeout.acknowledged_at)}</p>
              </article>
            </section>

            <section className="closeout-review-section">
              <PanelTitle icon={<Camera size={18} />} title="Before, after, and exception photos" />
              <JobPhotoGallery photos={photosResult.data} />
            </section>

            <section className="closeout-review-section">
              <PanelTitle icon={<Clock3 size={18} />} title="Job time entries" />
              {timeResult.data.length ? (
                <div className="review-time-list">
                  {timeResult.data.map((entry) => (
                    <div key={entry.id}>
                      <span>{entry.profiles?.full_name || entry.profiles?.email || "Employee"}</span>
                      <strong>{getTimeEntryHours(entry).toFixed(2)} hours</strong>
                      <small>{new Date(entry.clock_in_at).toLocaleString()} to {entry.clock_out_at ? new Date(entry.clock_out_at).toLocaleString() : "Active timer"}</small>
                    </div>
                  ))}
                </div>
              ) : <p className="inline-empty">No time entries are attached to this work order.</p>}
            </section>

            <CloseoutReviewActions jobId={job.id} status={bundle.closeout.status} />

            {bundle.closeout.status === "ready_to_invoice" ? (
              <section className="closeout-invoice-panel">
                <div><h2>Ready to invoice</h2><p>Use the existing invoice workflow. It will reopen an existing invoice instead of creating another one.</p></div>
                {job.invoices?.[0] ? (
                  <Link className="primary-action" href={`/admin/invoices/${job.invoices[0].id}`}>Open existing invoice</Link>
                ) : (
                  <CreateInvoiceFromJobAction jobId={job.id} />
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <h2 className="panel-title">{icon}{title}</h2>;
}

function Flag({ active, label }: { active: boolean; label: string }) {
  return <span className={active ? "active" : "clear"}>{active ? <AlertTriangle aria-hidden="true" size={17} /> : <CheckCircle2 aria-hidden="true" size={17} />}{active ? label : `No ${label.toLowerCase()}`}</span>;
}

function formatLocation(location: { street: string; city: string; state: string } | null | undefined) {
  return location ? `${location.street}, ${location.city}, ${location.state}` : "No service location";
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function formatStatus(status: string) {
  return status === "ready_to_invoice" ? "Ready to invoice" : status.replaceAll("_", " ");
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
