import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, ClipboardList, FileCheck2, MapPin } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCloseoutQueue } from "@/lib/data/job-closeouts";
import type { CloseoutQueueItem } from "@/lib/data/job-closeouts";

export default async function JobCloseoutQueuePage() {
  const context = await getAuthenticatedPlatformContext("/admin/jobs/closeouts");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening closeout review" />;
  }

  const queue = await getCloseoutQueue();
  const lanes = {
    attention: queue.data.filter((item) => item.status === "submitted" && (item.has_incident || item.has_scope_exception || item.has_additional_work)),
    awaiting: queue.data.filter((item) => item.status === "submitted" && !(item.has_incident || item.has_scope_exception || item.has_additional_work)),
    returned: queue.data.filter((item) => item.status === "returned"),
    ready: queue.data.filter((item) => ["approved", "ready_to_invoice"].includes(item.status)),
  };

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content closeout-queue-page">
        <Link className="crew-back-link" href="/admin/jobs">Back to jobs</Link>
        <section className="page-heading closeout-queue-heading">
          <p className="surface-label"><ClipboardList aria-hidden="true" size={18} />Closeout review</p>
          <h1>Completed work awaiting office review</h1>
          <p>Review scope results, photos, notes, incidents, and time before releasing a work order for invoicing.</p>
        </section>

        {queue.error ? <DataWarning message={queue.error} /> : null}

        <section className="closeout-queue-summary" aria-label="Closeout queue summary">
          <Summary label="Needs attention" value={lanes.attention.length} tone="warning" />
          <Summary label="Awaiting review" value={lanes.awaiting.length} tone="info" />
          <Summary label="Returned to crew" value={lanes.returned.length} tone="neutral" />
          <Summary label="Approved or ready" value={lanes.ready.length} tone="success" />
        </section>

        {queue.data.length === 0 ? (
          <section className="empty-state">
            <h2>No closeouts in the queue</h2>
            <p>Submitted crew closeouts will appear here for office review.</p>
          </section>
        ) : (
          <div className="closeout-queue-lanes">
            <QueueLane icon={<AlertTriangle size={19} />} items={lanes.attention} title="Needs attention" />
            <QueueLane icon={<ClipboardList size={19} />} items={lanes.awaiting} title="Awaiting review" />
            <QueueLane icon={<FileCheck2 size={19} />} items={lanes.ready} title="Approved and ready" />
            <QueueLane icon={<CheckCircle2 size={19} />} items={lanes.returned} title="Returned to crew" />
          </div>
        )}
      </div>
    </PlatformFrame>
  );
}

function QueueLane({ icon, items, title }: { icon: React.ReactNode; items: CloseoutQueueItem[]; title: string }) {
  if (items.length === 0) return null;

  return (
    <section className="closeout-queue-lane">
      <div className="closeout-lane-heading"><span>{icon}</span><h2>{title}</h2><strong>{items.length}</strong></div>
      <div className="closeout-queue-list">
        {items.map((item) => {
          const job = item.jobs;
          const location = job?.service_locations;
          const photoCount = job?.job_photos?.length ?? 0;
          const invoice = job?.invoices?.[0];
          return (
            <article className="closeout-queue-row" key={item.id}>
              <div className="closeout-queue-main">
                <div>
                  <h3>{job?.customers?.display_name ?? "Unknown customer"}</h3>
                  <p><MapPin aria-hidden="true" size={15} />{location ? `${location.street}, ${location.city}, ${location.state}` : "No service location"}</p>
                </div>
                <span className={`closeout-status-chip status-${item.status}`}>{formatCloseoutStatus(item.status)}</span>
              </div>
              <dl className="closeout-queue-meta">
                <div><dt>Completed</dt><dd>{job?.completed_at ? new Date(job.completed_at).toLocaleDateString() : "Not set"}</dd></div>
                <div><dt>Assigned crew</dt><dd>{item.assigned_crew_label ?? "Unassigned"}</dd></div>
                <div><dt>Photos</dt><dd><Camera aria-hidden="true" size={15} />{photoCount}</dd></div>
                <div><dt>Invoice</dt><dd>{invoice ? invoice.status.replaceAll("_", " ") : "Not generated"}</dd></div>
              </dl>
              <div className="closeout-flag-row">
                {item.has_scope_exception ? <span>Scope exception</span> : null}
                {item.has_incident ? <span>Incident</span> : null}
                {item.has_additional_work ? <span>Additional work request</span> : null}
                {!item.has_scope_exception && !item.has_incident && !item.has_additional_work ? <span className="clear-flag">No exception flags</span> : null}
              </div>
              <Link className="primary-action compact-action" href={`/admin/jobs/${job?.id}/closeout`}>Review closeout</Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Summary({ label, tone, value }: { label: string; tone: string; value: number }) {
  return <div className={`closeout-summary-item ${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

function formatCloseoutStatus(status: CloseoutQueueItem["status"]) {
  return status === "ready_to_invoice" ? "Ready to invoice" : status.replaceAll("_", " ");
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
