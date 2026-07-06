import { Clock3, ShieldCheck, UserRoundPlus } from "lucide-react";
import { AccessRequestReviewForm } from "@/components/access-request-review-form";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getEmployeeAccessRequests } from "@/lib/data/access-requests";

export default async function AdminAccessPage() {
  const context = await getAuthenticatedPlatformContext("/admin/access");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before reviewing employee access" />;
  }

  if (!hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) {
    return (
      <PlatformFrame active="access" roles={context.roles} userEmail={context.user.email}>
        <div className="shell app-content">
          <section className="page-heading">
            <p className="surface-label">
              <ShieldCheck aria-hidden="true" size={18} />
              Employee access
            </p>
            <h1>Access</h1>
            <p>Only owners and admins can approve or reject employee access requests.</p>
          </section>
        </div>
      </PlatformFrame>
    );
  }

  const requests = await getEmployeeAccessRequests();
  const pending = requests.data.filter((request) => request.status === "pending");
  const reviewed = requests.data.filter((request) => request.status !== "pending");

  return (
    <PlatformFrame active="access" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content access-admin-page">
        <section className="page-heading">
          <p className="surface-label">
            <ShieldCheck aria-hidden="true" size={18} />
            Employee access
          </p>
          <h1>Access</h1>
          <p>Approve new staff accounts, assign the right role, and enable time clock access only when needed.</p>
        </section>

        {requests.error ? (
          <section className="data-warning" role="status">
            <strong>Database notice</strong>
            <p>{requests.error}</p>
          </section>
        ) : null}

        <section className="commerce-summary-strip" aria-label="Access request summary">
          <SummaryChip label="Pending" value={pending.length} />
          <SummaryChip label="Approved" value={reviewed.filter((request) => request.status === "approved").length} />
          <SummaryChip label="Rejected" value={reviewed.filter((request) => request.status === "rejected").length} />
          <SummaryChip emphasis label="Total requests" value={requests.data.length} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Pending requests</h2>
            <span>Owner or admin approval is required before any internal access opens.</span>
          </div>

          {pending.length ? (
            <div className="access-request-list">
              {pending.map((request) => (
                <article className="access-request-card" key={request.id}>
                  <div className="access-request-header">
                    <div>
                      <strong>{request.full_name}</strong>
                      <span>{request.email}</span>
                    </div>
                    <b>{formatRequestedRole(request.requested_role)}</b>
                  </div>

                  <div className="access-request-meta">
                    <p><Clock3 aria-hidden="true" size={15} /> Submitted {formatDateTime(request.created_at)}</p>
                    {request.phone ? <p>Phone: {request.phone}</p> : null}
                  </div>

                  {request.note ? <p className="access-request-note">{request.note}</p> : null}

                  <AccessRequestReviewForm request={request} />
                </article>
              ))}
            </div>
          ) : (
            <EmptyInline
              body="New staff signups will appear here until an owner or admin reviews them."
              title="No pending requests right now."
            />
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Reviewed history</h2>
            <span>Recent approvals and rejections</span>
          </div>

          {reviewed.length ? (
            <div className="access-history-list">
              {reviewed.slice(0, 12).map((request) => (
                <article className="workflow-row access-history-row" key={request.id}>
                  <span className="workflow-row-icon" aria-hidden="true">
                    <UserRoundPlus size={15} />
                  </span>
                  <span>
                    <strong>{request.full_name}</strong>
                    <small>
                      {request.status === "approved" ? "Approved" : "Rejected"}
                      {request.assigned_role ? ` as ${request.assigned_role.replaceAll("_", " ")}` : ""}
                      {request.reviewed_at ? ` on ${formatDateTime(request.reviewed_at)}` : ""}
                    </small>
                    {request.reviewer_label ? <small>Reviewed by {request.reviewer_label}</small> : null}
                    {request.rejection_reason ? <small>{request.rejection_reason}</small> : null}
                  </span>
                  <b>{request.time_clock_enabled ? "Timer on" : request.status}</b>
                </article>
              ))}
            </div>
          ) : (
            <EmptyInline
              body="Approved or rejected requests will be listed here once the workflow starts getting used."
              title="No reviewed requests yet."
            />
          )}
        </section>
      </div>
    </PlatformFrame>
  );
}

function SummaryChip({ emphasis, label, value }: { emphasis?: boolean; label: string; value: number | string }) {
  return (
    <div className={emphasis ? "commerce-summary-chip emphasis" : "commerce-summary-chip"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyInline({ body, title }: { body: string; title: string }) {
  return (
    <div className="crew-empty-inline">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function formatRequestedRole(value: string | null) {
  if (!value) {
    return "General request";
  }

  return value.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
