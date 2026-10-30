import { AttachmentCheckLink } from "@/components/AttachmentCheckLink";
import { employeeActivityPresentation, employeeClockLabels } from "@/lib/employee-presentation";
import {
  formatBusinessDate,
  formatBusinessDateTime,
} from "@/lib/business-time";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock3,
  FileText,
  KeyRound,
  Pencil,
  ShieldCheck,
  Truck,
  UserCheck,
  UsersRound,
} from "lucide-react";
import {
  CredentialForm,
  EmployeeDocumentForm,
  EmployeeRolesForm,
  LinkPlatformAccountForm,
  OnboardingItemForm,
  PromoteToAdminForm,
  SeparationItemForm,
} from "../EmployeeForms";
import {
  EmployeeActionDialog,
} from "../EmployeeActionDialog";
import {
  archiveEmployee,
  markEmployeeInactive,
  reactivateEmployee,
  reviewEmployeeDocument,
  reviewEmployeeRequest,
  startEmployeeOnboarding,
  verifyEmployeeCredential,
} from "../actions";
import { EmployeePasswordResetForm } from "@/components/employee-password-reset-form";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import {
  getEmployeeDetail,
  getEmployeeFormOptions,
} from "@/lib/data/employees";
import type { EmployeeCredential } from "@/lib/types/database";

type Props = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{
    created?: string;
    updated?: string;
    access_result?: string;
    access_message?: string;
    section?: string;
  }>;
};
export default async function EmployeeDetailPage({
  params,
  searchParams,
}: Props) {
  const { employeeId } = await params;
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext(
    `/admin/employees/${employeeId}`,
  );
  if (!context.configured)
    return (
      <SetupRequired title="Configure Supabase before opening employee records" />
    );
  const canAdmin = hasAllowedRole(
    context.roles,
    platformRoleGroups.accessApproval,
  );
  const [detailResult, options] = await Promise.all([
    getEmployeeDetail(employeeId, canAdmin),
    getEmployeeFormOptions(),
  ]);
  const detail = detailResult.data;
  const employee = detail?.employee;
  const section = [
    "overview",
    "onboarding",
    "records",
    "history",
    "offboarding",
  ].includes(query.section ?? "")
    ? query.section!
    : "overview";
  const base = `/admin/employees/${employeeId}`;
  const accessEnabled = Boolean(
    employee?.auth_user_id &&
      employee.profiles?.status === "active" &&
      employee.is_active &&
      !["inactive", "separated"].includes(employee.employment_status) &&
      !employee.archived_at,
  );
  const inactive = Boolean(
    employee &&
      (!employee.is_active ||
        employee.archived_at ||
        ["inactive", "separated"].includes(employee.employment_status)),
  );
  const name = employee?.preferred_name || employee?.legal_name || "Employee";
  const accessMessage =
    query.access_result === "error"
      ? query.access_message
      : query.access_message?.startsWith("CRM access disabled.")
        ? employee?.archived_at
          ? "Employee archived. CRM and time-clock access are disabled. Historical records are retained."
          : "Employee deactivated. CRM and time-clock access are disabled. Historical records are retained."
        : query.access_message?.startsWith("CRM access restored")
          ? employee?.employment_status === "onboarding"
            ? "Onboarding started. Previous roles and assignments are restored. Review time-clock permission separately."
            : "Employee reactivated. Previous roles and assignments are restored. Review time-clock permission separately."
          : query.access_message;
  return (
    <PlatformFrame
      active="employees"
      roles={context.roles}
      userEmail={context.user.email}
    >
      <div className="shell app-content employee-workspace">
        <Link className="employee-back" href="/admin/employees">
          Back to employees
        </Link>
        {[detailResult.error, options.error].filter(Boolean).map((message) => (
          <DataWarning key={message} message={message ?? ""} />
        ))}
        {accessMessage ? (
          <p
            role={query.access_result === "error" ? "alert" : "status"}
            className={`form-message ${query.access_result === "error" ? "error" : "success"}`}
          >
            {accessMessage}
          </p>
        ) : null}
        {query.created ? (
          <p role="status" className="form-message success">
            Employee added.
          </p>
        ) : null}
        {query.updated ? (
          <p role="status" className="form-message success">
            Changes saved.
          </p>
        ) : null}
        {!employee || !detail ? (
          <section className="empty-state">
            <h1>Employee unavailable</h1>
            <p>
              Return to the directory to choose another employee, or try
              refreshing this page.
            </p>
          </section>
        ) : (
          <>
            <header className="employee-heading">
              <div>
                <div className="employee-name-line">
                  <h1>{name}</h1>
                  <span
                    className={`employee-status status-${employee.employment_status}`}
                  >
                    {employee.archived_at
                      ? "Archived"
                      : title(employee.employment_status)}
                  </span>
                </div>
                <p>
                  {employee.job_title || "Position not set"}
                  {employee.crew_name ? ` · ${employee.crew_name}` : ""}
                  {employee.employee_number
                    ? ` · ${employee.employee_number}`
                    : ""}
                </p>
              </div>
              {canAdmin ? (
                <Link
                  className="employee-button employee-button-primary"
                  href={`${base}/edit`}
                >
                  <Pencil size={17} />
                  Edit employee
                </Link>
              ) : null}
            </header>
            <div
              className="employee-access-strip"
              aria-label="Employee access summary"
            >
              <div>
                <KeyRound size={18} />
                <span>
                  CRM access{" "}
                  <strong>
                    {employee.auth_user_id
                      ? accessEnabled
                        ? "Enabled"
                        : "Disabled"
                      : "No account"}
                  </strong>
                </span>
              </div>
              <div>
                <Clock3 size={18} />
                <span>
                  Time clock{" "}
                  <strong>
                    {employeeClockLabels[detail.timeClockState]}
                  </strong>
                </span>
              </div>
              <div className="employee-access-action">
                {canAdmin ? (
                  inactive ? (
                    <EmployeeActionDialog
                      action={reactivateEmployee}
                      employeeId={employee.id}
                      employeeName={name}
                      label="Reactivate Employee"
                      description="Restore this employee’s access to the CRM."
                      consequences={[
                        "Previous roles and assignments will return.",
                        "Time-clock permission needs a separate review.",
                      ]}
                    />
                  ) : (
                    <EmployeeActionDialog
                      action={markEmployeeInactive}
                      employeeId={employee.id}
                      employeeName={name}
                      label="Deactivate Employee"
                      danger
                      description="This employee will no longer be able to use the CRM or clock time."
                      consequences={[
                        "CRM access will be disabled.",
                        "Time-clock access will be disabled.",
                        "Historical records will be retained.",
                      ]}
                    />
                  )
                ) : null}
              </div>
            </div>
            <nav aria-label="Employee sections" className="employee-tabs">
              {[
                ["overview", "Overview"],
                ["onboarding", "Onboarding"],
                ["records", "Records"],
                ["history", "History"],
                ...(employee.employee_separation_items?.length
                  ? [["offboarding", "Offboarding"]]
                  : []),
              ].map(([key, label]) => (
                <Link
                  aria-current={section === key ? "page" : undefined}
                  href={`${base}${key === "overview" ? "" : `?section=${key}`}`}
                  key={key}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {section === "overview" ? (
              <div className="employee-overview">
                <aside className="employee-next-steps">
                  <h2>Next steps</h2>
                  <Link href={`${base}?section=onboarding`}>
                    Onboarding checklist{" "}
                    <span>
                      {progress(employee.employee_onboarding_items ?? [])}%
                      complete
                    </span>
                  </Link>
                  <Link href={`${base}?section=records`}>
                    Credentials{" "}
                    <span>
                      {credentialSummary(employee.employee_credentials ?? [])}
                    </span>
                  </Link>
                  {inactive && employee.employee_separation_items?.length ? (
                    <Link href={`${base}?section=offboarding`}>Review offboarding checklist</Link>
                  ) : null}
                  {employee.auth_user_id ? (
                    <Link href={`/admin/time/${employee.auth_user_id}`}>
                      Review time-clock permission
                    </Link>
                  ) : (
                    <Link href="/admin/access">Review access requests</Link>
                  )}
                  <p>
                    Scheduling:{" "}
                    {schedulingEligibility(
                      employee.employment_status,
                      employee.is_active,
                    ).toLowerCase()}
                    .
                  </p>
                  <details className="employee-disclosure">
                    <summary>Sign-in & permissions</summary>
                    <article className="detail-panel">
                      <p>
                        {employee.auth_user_id
                          ? `Sign-in email: ${employee.profiles?.email || "Not available"}`
                          : "No sign-in account yet. You can still assign this employee to work."}
                      </p>
                      <div className="filter-pills">
                        {detail.roles.length ? (
                          detail.roles.map((role) => (
                            <span key={role}>{title(role)}</span>
                          ))
                        ) : (
                          <span>
                            {employee.auth_user_id
                              ? "No role"
                              : "No login account"}
                          </span>
                        )}
                      </div>
                      {canAdmin && !employee.auth_user_id ? (
                        <LinkPlatformAccountForm
                          accounts={options.platformAccounts}
                          employeeId={employee.id}
                        />
                      ) : null}
                      {canAdmin && employee.auth_user_id && !accessEnabled ? (
                        <p className="employee-muted">Reactivate this account before changing permissions or sending a password reset. Saved roles stay on file.</p>
                      ) : null}
                      {canAdmin &&
                      employee.auth_user_id &&
                      !detail.roles.includes("admin") &&
                      !detail.roles.includes("owner") ? (
                        <details className="employee-disclosure">
                          <summary>Give administrator access</summary>
                          <fieldset className="employee-permission-fields" disabled={!accessEnabled}>
                          <PromoteToAdminForm
                            authUserId={employee.auth_user_id}
                            employeeId={employee.id}
                            roles={detail.roles}
                          />
                          </fieldset>
                        </details>
                      ) : null}
                      {canAdmin && employee.auth_user_id ? (
                        <details className="employee-disclosure">
                          <summary>Change permissions</summary>
                          <fieldset className="employee-permission-fields" disabled={!accessEnabled}>
                          <EmployeeRolesForm
                            authUserId={employee.auth_user_id}
                            employeeId={employee.id}
                            roles={detail.roles}
                          />
                          </fieldset>
                        </details>
                      ) : null}
                      {canAdmin &&
                      employee.auth_user_id &&
                      employee.profiles ? (
                        <details className="employee-disclosure">
                          <summary>Help with signing in</summary>
                          <EmployeePasswordResetForm
                            disabledReason={!accessEnabled ? "Reactivate this account before sending a reset email." : undefined}
                            users={[
                              {
                                ...employee.profiles,
                                role_names: detail.roles,
                              },
                            ]}
                          />
                        </details>
                      ) : null}
                    </article>
                  </details>
                  {canAdmin ? (
                    <details className="employee-disclosure">
                      <summary>More employee actions</summary>
                      {employee.employee_separation_items?.length && !inactive ? (
                        <p><Link href={`${base}?section=offboarding`}>Previous offboarding checklist</Link> · retained for reference</p>
                      ) : null}
                      {employee.employment_status !== "onboarding" ? (
                        <EmployeeActionDialog
                          action={startEmployeeOnboarding}
                          employeeId={employee.id}
                          employeeName={name}
                          label="Change status to Onboarding"
                          description="Change employment status to Onboarding. Checklist progress is kept separately."
                          consequences={[
                            "CRM access will be restored with saved roles and assignments.",
                            "Time-clock access will be disabled until reviewed.",
                            "Existing checklist progress will be retained.",
                          ]}
                        />
                      ) : null}
                      <p>
                        Archive an employee to remove them from the directory.
                        Their records stay on file.
                      </p>
                      <EmployeeActionDialog
                        action={archiveEmployee}
                        employeeId={employee.id}
                        employeeName={name}
                        label="Archive Employee"
                        description="Remove this employee from the directory and disable their access."
                        consequences={[
                          "CRM and time-clock access will be disabled.",
                          "Historical records will be retained.",
                        ]}
                        danger
                      />
                    </details>
                  ) : null}
                </aside>
                <div className="employee-main-column">
                  <article className="detail-panel">
                    <PanelTitle
                      icon={<UserCheck size={18} />}
                      title="Contact and employment"
                    />
                    <dl className="crew-detail-list">
                      <Row
                        label="Legal name"
                        value={employee.legal_name || "Not set"}
                      />
                      <Row
                        label="Contact email"
                        value={employee.contact_email || "Not set"}
                      />
                      <Row
                        label="Phone"
                        value={employee.contact_phone || "Not set"}
                      />
                      <Row
                        label="Home address"
                        value={employee.home_address || "Not set"}
                      />
                      <Row
                        label="Hire date"
                        value={
                          employee.hire_date
                            ? formatDate(employee.hire_date)
                            : "Not set"
                        }
                      />
                      <Row
                        label="Employment type"
                        value={
                          employee.employment_type
                            ? title(employee.employment_type)
                            : "Not set"
                        }
                      />
                      <Row
                        label="Supervisor"
                        value={
                          employee.supervisor?.preferred_name ||
                          employee.supervisor?.legal_name ||
                          "Not assigned"
                        }
                      />
                    </dl>
                  </article>
                  <article className="detail-panel">
                    <PanelTitle
                      icon={<ShieldCheck size={18} />}
                      title="Emergency contact"
                    />
                    {employee.employee_emergency_contacts?.length ? (
                      employee.employee_emergency_contacts.map((contact) => (
                        <dl className="crew-detail-list" key={contact.id}>
                          <Row label="Name" value={contact.full_name} />
                          <Row
                            label="Relationship"
                            value={contact.relationship || "Not set"}
                          />
                          <Row label="Phone" value={contact.phone} />
                        </dl>
                      ))
                    ) : (
                      <p className="inline-empty">
                        Emergency contact is incomplete.
                      </p>
                    )}
                  </article>
                  <article className="employee-section">
                    <h2>Notes</h2>
                    <p className="employee-preserve-lines">
                      {employee.operational_notes || "No team notes yet."}
                    </p>
                    {canAdmin ? (
                      <details className="employee-disclosure">
                        <summary>Private notes · owner/admin only</summary>
                        <p className="employee-preserve-lines">
                          {detail.privateNotes || "No private notes."}
                        </p>
                      </details>
                    ) : null}
                  </article>
                </div>

              </div>
            ) : null}
            {section === "onboarding" ? (
              <div className="employee-section-view">
                <div className="employee-section-intro">
                  <div>
                    <h2>Get ready for work</h2>
                    <p>
                      Checklist progress is separate from employment status. Updating a task does not change status or access.
                    </p>
                  </div>

                </div>{" "}
                <section
                  className="panel employee-onboarding-panel"
                  id="onboarding"
                >
                  <div className="panel-header">
                    <h2>Onboarding checklist</h2>
                    <span>
                      {progress(employee.employee_onboarding_items ?? [])}%
                      complete
                    </span>
                  </div>
                  <div className="employee-checklist">
                    {employee.employee_onboarding_items
                      ?.slice()
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((item) => (
                        <OnboardingItemForm
                          employeeId={employee.id}
                          item={item}
                          key={item.id}
                        />
                      ))}
                  </div>
                </section>
              </div>
            ) : null}
            {section === "records" ? (
              <div className="employee-section-view">
                <div className="employee-section-intro">
                  <div>
                    <h2>Documents & equipment</h2>
                    <p>
                      Add a record when you need it. Existing records are listed
                      first.
                    </p>
                  </div>
                  <Link className="employee-text-link" href="/admin/equipment">
                    Assign equipment / PPE
                  </Link>
                </div>{" "}
                <section className="employee-workspace-grid">
                  <section className="panel" id="credentials">
                    <div className="panel-header">
                      <h2>Credentials and licenses</h2>
                      <span>
                        Uploads remain pending until staff verifies them.
                      </span>
                    </div>
                    <div className="linked-record-list">
                      {employee.employee_credentials?.length ? (
                        employee.employee_credentials.map((credential) => (
                          <article
                            className={`linked-record credential-row ${credentialTone(credential)}`}
                            key={credential.id}
                          >
                            <strong>
                              {credential.credential_types?.label ||
                                "Credential"}
                            </strong>
                            <span>
                              {credentialDisplayStatus(credential)}
                              {credential.expiration_date
                                ? ` · ${formatDate(credential.expiration_date)}`
                                : ""}
                            </span>
                            {credential.status === "pending_verification" ? (
                              <form action={verifyEmployeeCredential}>
                                <input
                                  name="employee_id"
                                  type="hidden"
                                  value={employee.id}
                                />
                                <input
                                  name="credential_id"
                                  type="hidden"
                                  value={credential.id}
                                />
                                <button
                                  className="secondary-action"
                                  type="submit"
                                >
                                  <CheckCircle2 size={16} />
                                  Verify credential
                                </button>
                              </form>
                            ) : null}
                          </article>
                        ))
                      ) : (
                        <p className="inline-empty">No credentials recorded.</p>
                      )}
                    </div>
                    <details className="employee-disclosure">
                      <summary>Add credential</summary>
                      <CredentialForm
                        canAdmin={canAdmin}
                        employeeId={employee.id}
                        types={options.credentialTypes}
                      />
                    </details>
                  </section>
                  <section className="panel" id="documents">
                    <div className="panel-header">
                      <h2>Private documents</h2>
                      <span>
                        Only people with permission can open these files.
                      </span>
                    </div>
                    {employee.employee_documents?.length ? (
                      employee.employee_documents.map((document) => (
                        <article className="linked-record" key={document.id}>
                          <strong>{document.title}</strong>
                          <span>
                            {title(document.access_classification)} ·{" "}
                            {title(document.review_status)}
                            {document.expiration_date
                              ? ` · expires ${formatDate(document.expiration_date)}`
                              : ""}
                          </span>
                          {document.signed_url ? (
                            <a
                              className="secondary-action"
                              href={document.signed_url}
                              rel="noreferrer"
                              target="_blank"
                            >
                              Open private file
                            </a>
                          ) : <AttachmentCheckLink bucket="employee-files" sourceType="employee_document" sourceId={document.id}/>}
                          {document.review_status === "pending" ? (
                            <form
                              action={reviewEmployeeDocument}
                              className="document-review-inline"
                            >
                              <input
                                name="employee_id"
                                type="hidden"
                                value={employee.id}
                              />
                              <input
                                name="document_id"
                                type="hidden"
                                value={document.id}
                              />
                              <label className="review-field">
                                Review note
                                <input
                                  name="review_notes"
                                  placeholder="Optional note"
                                />
                              </label>
                              <button
                                name="review_status"
                                type="submit"
                                value="approved"
                              >
                                Approve
                              </button>
                              <button
                                name="review_status"
                                type="submit"
                                value="rejected"
                              >
                                Reject
                              </button>
                            </form>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="inline-empty">No employee documents.</p>
                    )}
                    <details className="employee-disclosure">
                      <summary>Upload document</summary>
                      <EmployeeDocumentForm
                        canOwnerOnly={canAdmin}
                        employeeId={employee.id}
                      />
                    </details>
                  </section>
                </section>
                <article className="detail-panel">
                  <PanelTitle
                    icon={<Truck size={18} />}
                    title="Issued equipment and PPE"
                  />
                  {detail.equipmentAssignments.length ? (
                    detail.equipmentAssignments.map((assignment: any) => (
                      <Link
                        className="linked-record"
                        href={`/admin/equipment/${assignment.asset_id}`}
                        key={assignment.id}
                      >
                        <strong>
                          {assignment.equipment_assets?.name || "Equipment"}
                        </strong>
                        <span>
                          {assignment.equipment_assets?.asset_number || "Asset"}{" "}
                          · {assignment.returned_at ? "Returned" : "Issued"}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="inline-empty">
                      No equipment or PPE assignment history.
                    </p>
                  )}
                </article>
              </div>
            ) : null}
            {section === "history" ? (
              <div className="employee-section-view">
                <h2>Employee history</h2>{" "}
                <section className="detail-grid">
                  <article className="detail-panel">
                    <PanelTitle
                      icon={<UsersRound size={18} />}
                      title="Training history"
                    />
                    {employee.training_attendees?.length ? (
                      employee.training_attendees.map((attendee) => (
                        <article className="linked-record" key={attendee.id}>
                          <strong>
                            {attendee.training_sessions?.title || "Training"}
                          </strong>
                          <span>
                            {title(attendee.result)} ·{" "}
                            {attendee.training_sessions?.starts_at
                              ? formatDate(attendee.training_sessions.starts_at)
                              : "Date unavailable"}
                          </span>
                        </article>
                      ))
                    ) : (
                      <p className="inline-empty">No training recorded.</p>
                    )}
                    <Link className="secondary-action" href="/admin/training">
                      Record training
                    </Link>
                  </article>
                  <article className="detail-panel">
                    <PanelTitle
                      icon={<ShieldCheck size={18} />}
                      title="Safety meetings"
                    />
                    {employee.safety_meeting_attendees?.length ? (
                      employee.safety_meeting_attendees.map((attendee) => (
                        <article className="linked-record" key={attendee.id}>
                          <strong>
                            {attendee.safety_meetings?.title ||
                              "Safety meeting"}
                          </strong>
                          <span>
                            {title(attendee.attendance_status)} ·{" "}
                            {attendee.acknowledged_at
                              ? "Acknowledged"
                              : "Acknowledgment pending"}
                          </span>
                        </article>
                      ))
                    ) : (
                      <p className="inline-empty">No safety meeting history.</p>
                    )}
                    <Link className="secondary-action" href="/admin/safety">
                      Record safety meeting
                    </Link>
                  </article>
                  <article className="detail-panel">
                    <PanelTitle
                      icon={<AlertTriangle size={18} />}
                      title="Employee requests"
                    />
                    {employee.employee_requests?.length ? (
                      employee.employee_requests.map((request) => (
                        <article className="linked-record" key={request.id}>
                          <strong>{request.title}</strong>
                          <span>
                            {title(request.request_type)} ·{" "}
                            {title(request.status)}
                          </span>
                          {request.status === "pending" ? (
                            <form
                              action={reviewEmployeeRequest}
                              className="document-review-inline"
                            >
                              <input
                                name="employee_id"
                                type="hidden"
                                value={employee.id}
                              />
                              <input
                                name="request_id"
                                type="hidden"
                                value={request.id}
                              />
                              <label className="review-field">
                                Review note
                                <input
                                  name="review_notes"
                                  placeholder="Optional note"
                                />
                              </label>
                              <button
                                name="status"
                                type="submit"
                                value="approved"
                              >
                                Approve
                              </button>
                              <button
                                name="status"
                                type="submit"
                                value="rejected"
                              >
                                Reject
                              </button>
                            </form>
                          ) : null}
                        </article>
                      ))
                    ) : (
                      <p className="inline-empty">
                        No employee correction or training requests.
                      </p>
                    )}
                  </article>
                  <article className="detail-panel">
                    <PanelTitle
                      icon={<Activity size={18} />}
                      title="Activity history"
                    />
                    {detail.activity.length ? (
                      detail.activity.map((event) => {
                        const entry = employeeActivityPresentation(event);
                        return (
                          <article className="linked-record employee-history-entry" key={String(event.id)}>
                            <strong>{entry.title}</strong>
                            <span>{formatDateTime(String(event.created_at))} · {entry.actor}</span>
                            {entry.reason ? <p><strong>Reason:</strong> {entry.reason}</p> : null}
                            {entry.changes.length ? <dl>{entry.changes.map((change) => (
                              <div key={change.label}><dt>{change.label}</dt><dd>{change.before} → {change.after}</dd></div>
                            ))}</dl> : null}
                            {entry.rolesRetained ? <p className="employee-muted">Saved roles retained.</p> : null}
                          </article>
                        );
                      })
                    ) : (
                      <p className="inline-empty">
                        No employee activity recorded yet.
                      </p>
                    )}
                  </article>
                </section>
              </div>
            ) : null}
            {section === "offboarding" ? (
              <div className="employee-section-view">
                {" "}
                {employee.employee_separation_items?.length ? (
                  <section className="panel employee-separation-panel">
                    <div className="panel-header">
                      <div>
                        <h2>{inactive ? "Offboarding checklist" : "Previous offboarding checklist"}</h2>
                        <p>
                          {inactive
                            ? "Review equipment returns, future work, and final time entries. Records stay on file."
                            : "These tasks are retained from an earlier offboarding. They do not change current employment status or access."}
                        </p>
                      </div>
                    </div>
                    <div className="employee-checklist">
                      {employee.employee_separation_items.map((item) => (
                        <details className="employee-task" key={item.id}>
                          <summary>
                            <span>{item.label}</span>
                            <small>{title(item.completion_status)}</small>
                          </summary>
                          {canAdmin ? (
                            <SeparationItemForm employeeId={employee.id} item={item} />
                          ) : (
                            <p className="employee-muted">
                              An owner or administrator can update this
                              checklist.
                            </p>
                          )}
                        </details>
                      ))}
                    </div>
                  </section>
                ) : null}
                {!employee.employee_separation_items?.length ? (
                  <p>
                    No offboarding tasks yet. Tasks appear after deactivation.
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </PlatformFrame>
  );
}
function PanelTitle({
  icon,
  title: label,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <h2 className="panel-title">
      {icon}
      {label}
    </h2>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function progress(items: { completion_status: string }[]) {
  return items.length
    ? Math.round(
        (items.filter((item) => item.completion_status !== "incomplete")
          .length /
          items.length) *
          100,
      )
    : 0;
}
function credentialDisplayStatus(credential: EmployeeCredential) {
  if (credential.status !== "active") return title(credential.status);
  if (
    credential.expiration_date &&
    new Date(credential.expiration_date) < new Date()
  )
    return "Expired";
  const warningDays = credential.credential_types?.default_warning_days ?? 30;
  if (
    credential.expiration_date &&
    new Date(credential.expiration_date) <=
      new Date(Date.now() + warningDays * 86400000)
  )
    return `Expiring within ${warningDays} days`;
  return "Active";
}
function credentialTone(credential: EmployeeCredential) {
  const status = credentialDisplayStatus(credential);
  return status === "Expired"
    ? "danger"
    : status.startsWith("Expiring") || status === "Pending Verification"
      ? "warning"
      : "success";
}
function credentialSummary(credentials: EmployeeCredential[]) {
  const expired = credentials.filter(
    (credential) =>
      credential.expiration_date &&
      new Date(credential.expiration_date) < new Date(),
  ).length;
  return expired
    ? `${expired} expired`
    : `${credentials.filter((credential) => credential.status === "active").length} active`;
}
function schedulingEligibility(status: string, isActive: boolean) {
  if (!isActive || ["inactive", "separated", "leave"].includes(status))
    return "Override required";
  if (["applicant", "onboarding"].includes(status)) return "Review needed";
  return "Normally eligible";
}
function title(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatDate(value: string) {
  return formatBusinessDate(value, { dateStyle: "medium" });
}
function formatDateTime(value: string) {
  return formatBusinessDateTime(new Date(value), {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning">
      <strong>Some employee details could not load</strong>
      <p>{message}</p>
    </section>
  );
}
