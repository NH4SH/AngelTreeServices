import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PlatformFrame } from '@/components/PlatformFrame';
import { SetupRequired } from '@/components/SetupRequired';
import { FirewoodOfficeWorkspace } from '@/components/firewood-office-workspace';
import { getAuthenticatedPlatformContext } from '@/lib/auth/pageContext';
import { hasAllowedRole, platformRoleGroups } from '@/lib/auth/roles';
import { getFirewoodOfficeRuntime } from '@/lib/firewood/office-runtime';
import { readFirewoodOfficeWorkspace } from '@/lib/firewood/office-workspace';
import { submitFirewoodOfficeAction } from '@/lib/actions/firewood-office';

export default async function FirewoodOfficePage({ searchParams }: { searchParams: Promise<{ office_page?: string; office_order?: string; office_invoice?: string }> }) {
  const context = await getAuthenticatedPlatformContext('/admin/firewood/office');
  if (!context.configured) return <SetupRequired title="Sign in before opening website orders" />;
  if (!hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) notFound();
  const model = await readFirewoodOfficeWorkspace(context.supabase, await searchParams, { admitted: Boolean(getFirewoodOfficeRuntime()), roles: context.roles });
  return <PlatformFrame active="invoices" roles={context.roles} userEmail={context.user.email}>
    <div className="shell app-content firewood-page"><section className="page-heading"><div><h1>Firewood office</h1><p>Approve requested prices and review delivery or cancellation.</p></div>
      <Link className="secondary-action" href="/admin/invoices">Back to invoices</Link></section>
      <FirewoodOfficeWorkspace model={model} submitAction={submitFirewoodOfficeAction} />
    </div>
  </PlatformFrame>;
}
