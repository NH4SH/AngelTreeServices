import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getCustomerOptions, getServiceLocations } from "@/lib/data/customers";
import { getOrganizations } from "@/lib/data/organizations";
import { getLeadSources } from "@/lib/data/reports";
import { AddJobForm } from "../JobForm";

export default async function NewJobPage() {
  const context = await getAuthenticatedPlatformContext("/admin/jobs/new");
  if (!context.configured) return <SetupRequired title="Configure Supabase before adding jobs" />;
  const canManageJobs = hasAllowedRole(context.roles, platformRoleGroups.internalStaff);

  if (!canManageJobs) return <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}><div className="shell app-content"><section className="empty-state"><h1>Staff access required</h1><p>Your account cannot create work orders.</p></section></div></PlatformFrame>;

  const [customers, organizations, serviceLocations, leadSources] = await Promise.all([
    getCustomerOptions(),
    getOrganizations(),
    getServiceLocations(),
    getLeadSources(),
  ]);

  return <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content job-create-page">
      <Link className="crew-back-link" href="/admin/jobs">Back to jobs</Link>
      <header className="page-heading"><p className="surface-label"><ClipboardCheck size={18} />Manual work order</p><h1>Add job</h1><p>Most jobs are created automatically after a quote is approved. Use manual job creation for approved work entered outside the quote workflow or legacy records.</p></header>
      {[customers.error, organizations.error, serviceLocations.error, leadSources.error].filter(Boolean).map((message) => <section className="data-warning" key={message} role="status"><strong>Database notice</strong><p>{message}</p></section>)}
      <section className="job-create-form"><AddJobForm customers={customers.data} leadSources={leadSources.data} organizations={organizations.data} serviceLocations={serviceLocations.data} /></section>
    </div>
  </PlatformFrame>;
}
