import Link from "next/link";
import { EmployeeForm } from "../../EmployeeForms";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import {
  getEmployeeDetail,
  getEmployeeFormOptions,
} from "@/lib/data/employees";

export default async function EmployeeEditPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const context = await getAuthenticatedPlatformContext(
    `/admin/employees/${employeeId}/edit`,
  );
  if (!context.configured)
    return (
      <SetupRequired title="Configure Supabase before editing employees" />
    );
  const canAdmin = hasAllowedRole(
    context.roles,
    platformRoleGroups.accessApproval,
  );
  if (!canAdmin)
    return (
      <PlatformFrame
        active="employees"
        roles={context.roles}
        userEmail={context.user.email}
      >
        <div className="shell app-content employee-workspace">
          <section className="empty-state">
            <h2>Owner/admin access required</h2>
            <p>
              Operational staff can manage onboarding and training, but employee
              identity and private employment fields require owner/admin access.
            </p>
          </section>
        </div>
      </PlatformFrame>
    );
  const [detail, options] = await Promise.all([
    getEmployeeDetail(employeeId, true),
    getEmployeeFormOptions(),
  ]);
  return (
    <PlatformFrame
      active="employees"
      roles={context.roles}
      userEmail={context.user.email}
    >
      <div className="shell app-content employee-workspace">
        <Link className="employee-back" href={`/admin/employees/${employeeId}`}>
          Back to employee
        </Link>
        {detail.data ? (
          <>
            <section className="employee-heading">
              <div>
                <h1>
                  Edit{" "}
                  {detail.data.employee.preferred_name ||
                    detail.data.employee.legal_name}
                </h1>
                <p>
                  Update work details here. Sign-in settings are on the employee
                  overview.
                </p>
              </div>
            </section>
            <section className="employee-edit-content">
              <EmployeeForm
                canSeePrivate
                employee={detail.data.employee}
                emergencyContact={detail.data.employee.employee_emergency_contacts?.find(
                  (contact) => contact.is_primary,
                )}
                privateNotes={detail.data.privateNotes}
                supervisors={options.supervisors}
              />
            </section>
          </>
        ) : (
          <section className="empty-state">
            <h2>Employee unavailable</h2>
            <p>{detail.error}</p>
          </section>
        )}
      </div>
    </PlatformFrame>
  );
}
