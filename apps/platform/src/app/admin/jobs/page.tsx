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
import { getOrganizations } from "@/lib/data/organizations";
import { getLeadSources } from "@/lib/data/reports";
import type { JobStatus } from "@/lib/types/database";

const statuses: JobStatus[] = [
  "new_lead",
  "estimate_scheduled",
  "quoted",
  "accepted",
  "scheduled",
  "in_progress",
  "returned_for_correction",
  "completed_pending_review",
  "ready_to_invoice",
  "completed",
  "invoiced",
  "paid",
  "lost",
  "cancelled",
];

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/jobs");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening jobs" />;
  }

  const [jobs, customers, organizations, serviceLocations, leadSources] = await Promise.all([
    getJobs(),
    getCustomerOptions(),
    getOrganizations(),
    getServiceLocations(),
    getLeadSources(),
  ]);
  const selectedStatus = statuses.includes(query.status as JobStatus) ? query.status as JobStatus : null;
  const visibleJobs = selectedStatus ? jobs.data.filter((job) => job.status === selectedStatus) : jobs.data;

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
          <div className="action-row">
            <Link className="primary-action" href="/admin/jobs/closeouts">Open closeout review queue</Link>
          </div>
        </section>

        {[jobs.error, customers.error, organizations.error, serviceLocations.error, leadSources.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}

        <section className="filter-pills" aria-label="Job statuses">
          <Link aria-current={!selectedStatus ? "page" : undefined} href="/admin/jobs">All</Link>
          {statuses.map((status) => (
            <Link aria-current={selectedStatus === status ? "page" : undefined} href={`/admin/jobs?status=${status}`} key={status}>{status.replaceAll("_", " ")}</Link>
          ))}
        </section>

        <section className="crm-layout">
          <div className="crm-main">
            {visibleJobs.length === 0 ? (
              <EmptyState title={selectedStatus ? `No ${selectedStatus.replaceAll("_", " ")} jobs` : "No work orders yet"} body={selectedStatus ? "Choose another status or open all jobs." : "Create and approve a quote first, or add a job for work that is already approved."} />
            ) : (
              <div className="record-list">
                {visibleJobs.map((job) => (
                  <article className="record-card" key={job.id}>
                    <div className="record-card-header">
                      <div>
                        <h2>{job.service_type?.replace("_", " ") || "Service job"}</h2>
                        <p>{job.organizations?.name ?? job.customers?.display_name ?? "Unknown contracting party"}</p>
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
              <AddJobForm customers={customers.data} leadSources={leadSources.data} organizations={organizations.data} serviceLocations={serviceLocations.data} />
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
