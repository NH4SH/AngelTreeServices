import { employeeClockLabels } from "@/lib/employee-presentation";
import Link from "next/link";
import { AlertTriangle, Search, UserPlus } from "lucide-react";
import { EmployeeForm, QualificationRequirementsForm } from "./EmployeeForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import {
  getEmployeeDashboardSummary,
  getEmployeeFormOptions,
  getEmployees,
  type EmployeeListRow,
} from "@/lib/data/employees";

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    crew?: string;
    role?: string;
    supervisor?: string;
    onboarding?: string;
    credential?: string;
    training?: string;
    access?: string;
    new?: string;
    archived?: string;
  }>;
};
export default async function EmployeesPage({ searchParams }: Props) {
  const query = await searchParams;
  const context = await getAuthenticatedPlatformContext("/admin/employees");
  if (!context.configured)
    return (
      <SetupRequired title="Configure Supabase before opening employees" />
    );
  const [employeesResult, options, summary] = await Promise.all([
    getEmployees(),
    getEmployeeFormOptions(),
    getEmployeeDashboardSummary(),
  ]);
  const canAdmin = hasAllowedRole(
    context.roles,
    platformRoleGroups.accessApproval,
  );
  const employees = employeesResult.data.filter((employee) =>
    matches(employee, query),
  );
  const moreFilters = Boolean(
    query.crew ||
      query.supervisor ||
      query.role ||
      query.onboarding ||
      query.credential ||
      query.training ||
      query.access,
  );
  return (
    <PlatformFrame
      active="employees"
      roles={context.roles}
      userEmail={context.user.email}
    >
      <div className="shell app-content employee-workspace employee-directory-workspace">
        <header className="employee-heading">
          <div>
            <h1>
              {query.new === "1" && canAdmin ? "Add employee" : "Your team"}
            </h1>
            <p>
              {query.new === "1" && canAdmin
                ? "Start with the basics. You can add the rest later."
                : "People, work details, and access — in one place."}
            </p>
          </div>
          {query.new !== "1" && canAdmin ? (
            <Link
              className="employee-button employee-button-primary"
              href="/admin/employees?new=1"
              aria-label="Add employee"
            >
              <UserPlus size={18} />
              <span className="employee-add-label">Add employee</span><span className="employee-add-short" aria-hidden="true">Add</span>
            </Link>
          ) : null}
        </header>
        {[employeesResult.error, options.error, summary.error]
          .filter(Boolean)
          .map((message) => (
            <DataWarning key={message} message={message ?? ""} />
          ))}
        {query.archived ? (
          <p role="status" className="form-message success">
            Employee archived. Historical records are retained.
          </p>
        ) : null}
        {query.new === "1" && canAdmin ? (
          <div className="employee-edit-content">
            <EmployeeForm
              canSeePrivate={canAdmin}
              supervisors={options.supervisors}
            />
          </div>
        ) : (
          <>
            <details className="employee-followup-disclosure">
              <summary>Team follow-up</summary>
            <nav aria-label="Team follow-up" className="employee-followups">
              <Link href="/admin/employees?onboarding=incomplete">
                <strong>
                  {
                    employeesResult.data.filter(
                      (employee) => employee.onboardingProgress < 100,
                    ).length
                  }
                </strong>{" "}
                incomplete onboarding checklists
              </Link>
              <Link href="/admin/employees?credential=expiring">
                <strong>{summary.data.expiring.length}</strong> credentials
                expiring
              </Link>
              <Link href="/admin/employees?credential=expired">
                <strong>{summary.data.expired.length}</strong> expired
                credentials
              </Link>
              <span>
                <strong>{summary.data.pendingDocuments.length}</strong>{" "}
                documents to review
              </span>
            </nav>
            </details>
            <form
              className="employee-directory-filters"
              method="get"
              role="search"
              aria-label="Find employees"
            >
              <div className="employee-search-row">
                <label className="employee-search-input">
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Search employees</span>
                  <input
                    defaultValue={query.q ?? ""}
                    name="q"
                    placeholder="Search name, position, or crew"
                    type="search"
                  />
                </label>
                <label>
                  Status
                  <select defaultValue={query.status ?? ""} name="status">
                    <option value="">All statuses</option>
                    {[
                      "applicant",
                      "onboarding",
                      "active",
                      "seasonal",
                      "leave",
                      "inactive",
                      "separated",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {title(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="employee-button" type="submit">
                  Search
                </button>
              </div>
              <details className="employee-more-filters" open={moreFilters}>
                <summary>
                  More filters{moreFilters ? " · filters applied" : ""}
                </summary>
                <div className="employee-filter-fields">
                  <label>
                    Crew
                    <select defaultValue={query.crew ?? ""} name="crew">
                      <option value="">All crews</option>
                      {Array.from(
                        new Set(
                          employeesResult.data
                            .map((employee) => employee.crew_name)
                            .filter(Boolean),
                        ),
                      ).map((value) => (
                        <option key={value} value={value ?? ""}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Supervisor
                    <select
                      defaultValue={query.supervisor ?? ""}
                      name="supervisor"
                    >
                      <option value="">All supervisors</option>
                      {options.supervisors.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.preferred_name ||
                            employee.legal_name ||
                            "Supervisor"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Role
                    <select defaultValue={query.role ?? ""} name="role">
                      <option value="">All roles</option>
                      {["crew", "estimator", "payroll_admin", "admin"].map(
                        (value) => (
                          <option key={value} value={value}>
                            {title(value)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Onboarding checklist
                    <select
                      defaultValue={query.onboarding ?? ""}
                      name="onboarding"
                    >
                      <option value="">Any progress</option>
                      <option value="incomplete">Incomplete</option>
                      <option value="complete">Complete</option>
                    </select>
                  </label>
                  <label>
                    Credential
                    <select
                      defaultValue={query.credential ?? ""}
                      name="credential"
                    >
                      <option value="">Any credential state</option>
                      {[
                        "current",
                        "expiring",
                        "expired",
                        "pending",
                        "none",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {title(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Training
                    <select defaultValue={query.training ?? ""} name="training">
                      <option value="">Any training</option>
                      <option value="recorded">Training recorded</option>
                      <option value="none">No training recorded</option>
                    </select>
                  </label>
                  <label>
                    CRM access
                    <select defaultValue={query.access ?? ""} name="access">
                      <option value="">Any access</option>
                      <option value="active">Enabled</option>
                      <option value="disabled">Disabled</option>
                      <option value="pending">Awaiting approval</option>
                      <option value="no_account">No account</option>
                    </select>
                  </label>
                </div>
                <button className="employee-button" type="submit">
                  Apply filters
                </button>
              </details>
            </form>
            <div className="employee-list-heading">
              <h2>
                {employees.length}{" "}
                {employees.length === 1 ? "employee" : "employees"}
              </h2>
              <Link href="/admin/employees" className="employee-text-link">
                Clear filters
              </Link>
            </div>
            <div className="employee-directory">
              <div className="employee-directory-labels" aria-hidden="true">
                <span>Employee</span>
                <span>Status</span>
                <span>Access</span>
                <span>Checklist</span>
                <span />
              </div>
              {employees.length ? (
                employees.map((employee) => (
                  <EmployeeRow employee={employee} key={employee.id} />
                ))
              ) : (
                <section className="employee-empty">
                  <h2>
                    {employeesResult.data.length
                      ? "No matching employees"
                      : "Build your team"}
                  </h2>
                  <p>
                    {employeesResult.data.length
                      ? "Try another name or clear the filters."
                      : canAdmin
                        ? "Add your first employee to keep work details and access together."
                        : "An owner or administrator can add employees here."}
                  </p>
                  {employeesResult.data.length > 0 || canAdmin ? (
                    <Link
                      className="employee-button"
                      href={
                        employeesResult.data.length
                          ? "/admin/employees"
                          : "/admin/employees?new=1"
                      }
                    >
                      {employeesResult.data.length
                        ? "Clear filters"
                        : "Add employee"}
                    </Link>
                  ) : null}
                </section>
              )}
            </div>
            <footer className="employee-directory-footer">
              <nav aria-label="Related team work">
                <Link href="/admin/training">Training</Link>
                <Link href="/admin/safety">Safety meetings</Link>
                <Link href="/admin/access">Access requests</Link>
              </nav>
              {canAdmin ? (
                <details className="employee-disclosure">
                  <summary>Team settings</summary>
                  <h2>Qualification rules</h2>
                  <p>
                    Choose when an assignment needs a credential or manager
                    approval.
                  </p>
                  <QualificationRequirementsForm
                    credentialTypes={options.credentialTypes}
                    requirements={options.qualificationRequirements}
                  />
                </details>
              ) : null}
            </footer>
          </>
        )}
      </div>
    </PlatformFrame>
  );
}
function EmployeeRow({ employee }: { employee: EmployeeListRow }) {
  return (
    <article className="employee-directory-row">
      <div className="employee-directory-person">
        <Link href={`/admin/employees/${employee.id}`}>
          {employee.preferred_name || employee.legal_name || "Employee"}
        </Link>
        <p>
          {employee.job_title || "Position not set"}
          {employee.crew_name ? ` · ${employee.crew_name}` : ""}
          {employee.employee_number ? ` · ${employee.employee_number}` : ""}
        </p>
        {["expired", "expiring", "pending"].includes(
          employee.credentialState,
        ) ? (
          <small className="employee-credential-attention">
            <AlertTriangle size={14} />
            Credential review needed
          </small>
        ) : null}
      </div>
      <span className={`employee-status status-${employee.employment_status}`}>
        {title(employee.employment_status)}
      </span>
      <span className="employee-directory-access">
        <span><span className="employee-access-label">CRM </span>
        {
          {
            active: "Enabled",
            disabled: "Disabled",
            pending: "Awaiting approval",
            no_account: "No account",
          }[employee.platformAccessState]
        }</span>
        <span><span className="employee-access-label">Time clock </span>{employeeClockLabels[employee.timeClockState]}</span>
      </span>
      <span className="employee-directory-progress">
        <span className="employee-mobile-label">Onboarding checklist </span>
        {employee.onboardingProgress}%
      </span>
      <Link
        aria-label={`View ${employee.preferred_name || employee.legal_name || "employee"}`}
        className="employee-view-link"
        href={`/admin/employees/${employee.id}`}
      >
        View<span aria-hidden="true"> →</span>
      </Link>
    </article>
  );
}
function matches(
  employee: EmployeeListRow,
  query: Awaited<Props["searchParams"]>,
) {
  const q = query.q?.toLowerCase().trim();
  return (
    (!query.status || employee.employment_status === query.status) &&
    (!query.crew || employee.crew_name === query.crew) &&
    (!query.supervisor ||
      employee.supervisor_employee_id === query.supervisor) &&
    (!query.role || employee.roleNames.includes(query.role)) &&
    (!query.onboarding ||
      (query.onboarding === "complete"
        ? employee.onboardingProgress === 100
        : employee.onboardingProgress < 100)) &&
    (!query.credential || employee.credentialState === query.credential) &&
    (!query.training || employee.trainingState === query.training) &&
    (!query.access || employee.platformAccessState === query.access) &&
    (!q ||
      [
        employee.legal_name,
        employee.preferred_name,
        employee.employee_number,
        employee.job_title,
        employee.crew_name,
      ].some((value) => value?.toLowerCase().includes(q)))
  );
}
function title(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning">
      <strong>Some employee details could not load</strong>
      <p>{message}</p>
    </section>
  );
}
