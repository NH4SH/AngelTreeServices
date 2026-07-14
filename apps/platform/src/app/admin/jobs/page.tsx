import { ClipboardCheck, MapPin } from "lucide-react";
import Link from "next/link";
import { DuplicateRecordButton } from "@/components/duplicate-record-button";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { AddJobForm } from "./JobForm";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { duplicateJob } from "@/lib/actions/duplicate-records";
import { getCustomerOptions, getServiceLocations } from "@/lib/data/customers";
import { getJobs } from "@/lib/data/jobs";
import type { JobStatus } from "@/lib/types/database";

const statuses: JobStatus[] = [
  "new_lead",
  "estimate_scheduled",
  "quoted",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "paid",
  "lost",
  "cancelled",
];

export default async function JobsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/jobs");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening jobs" />;
  }

  const [jobs, customers, serviceLocations] = await Promise.all([
    getJobs(),
    getCustomerOptions(),
    getServiceLocations(),
  ]);

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <ClipboardCheck aria-hidden="true" size={18} />
            Jobs / work orders
          </p>
          <h1>Jobs and work orders</h1>
          <p>Track approved, scheduled, active, and completed field work. Early website requests can still appear here for compatibility.</p>
        </section>

        {[jobs.error, customers.error, serviceLocations.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="filter-pills" aria-label="Job statuses">
          {statuses.map((status) => (
            <span key={status}>{status.replace("_", " ")}</span>
          ))}
        </section>

        <section className="crm-layout">
          <div className="crm-main">
            {jobs.data.length === 0 ? (
              <EmptyState title="No work orders yet" body="Create and approve a quote first, or add a job for work that is already approved." />
            ) : (
              <div className="record-list">
                {jobs.data.map((job) => (
                  <article className="record-card" key={job.id}>
                    <div className="record-card-header">
                      <div>
                        <h2>{job.service_type?.replace("_", " ") || "Service job"}</h2>
                        <p>{job.customers?.display_name ?? "Unknown customer"}</p>
                      </div>
                      <span className="status-pill">{job.status.replace("_", " ")}</span>
                    </div>
                    <p>{job.requested_scope || "No scope entered."}</p>
                    {job.service_locations ? (
                      <p className="inline-icon-line">
                        <MapPin aria-hidden="true" size={15} />
                        {job.service_locations.street}, {job.service_locations.city}
                      </p>
                    ) : null}
                    <dl className="record-details">
                      <div>
                        <dt>Priority</dt>
                        <dd>{job.priority}</dd>
                      </div>
                      <div>
                        <dt>Estimated</dt>
                        <dd>{job.scheduled_start_at ? new Date(job.scheduled_start_at).toLocaleDateString() : "Not set"}</dd>
                      </div>
                    </dl>
                    <div className="record-actions">
                      <Link href={`/admin/jobs/${job.id}`}>Open job</Link>
                      <DuplicateRecordButton
                        action={duplicateJob}
                        hiddenFieldName="job_id"
                        hiddenFieldValue={job.id}
                        label="Duplicate"
                        pendingLabel="Copying..."
                      />
                      <Link href={`/crew/jobs/${job.id}`}>Crew view</Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside className="crm-side">
            <section className="form-panel">
              <h2>Add job / work order</h2>
              <p className="form-panel-copy">For new estimates, start with a quote. Use this for approved work or legacy lead records.</p>
              <AddJobForm customers={customers.data} serviceLocations={serviceLocations.data} />
            </section>
          </aside>
        </section>
      </div>
    </PlatformFrame>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{body}</p>
    </section>
  );
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
