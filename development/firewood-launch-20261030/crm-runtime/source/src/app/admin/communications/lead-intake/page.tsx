import Link from "next/link";
import { CheckCircle2, CircleAlert, Globe2 } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { getLeadIntakeDiagnostics } from "@/lib/leads/diagnostics";

export default async function LeadIntakeDiagnosticsPage() {
  const context = await getAuthenticatedPlatformContext("/admin/communications/lead-intake");
  if (!context.configured) return <SetupRequired title="Configure Supabase before checking lead intake" />;

  if (!hasAllowedRole(context.roles, platformRoleGroups.accessApproval)) {
    return (
      <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}>
        <div className="shell app-content">
          <section className="empty-state">
            <h2>Owner/admin access required</h2>
            <p>Lead intake configuration diagnostics are limited to owners and admins.</p>
          </section>
        </div>
      </PlatformFrame>
    );
  }

  const diagnostics = await getLeadIntakeDiagnostics();

  return (
    <PlatformFrame active="communications" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <div>
            <p className="surface-label"><Globe2 aria-hidden="true" size={18} />Private admin diagnostic</p>
            <h1>Website lead intake</h1>
            <p>Configuration visibility only. No keys or customer submission data are shown here.</p>
          </div>
          <Link className="secondary-action" href="/admin/communications">Back to Leads &amp; Communications</Link>
        </section>

        <section className="detail-grid">
          <Diagnostic label="Canonical endpoint" ok value={diagnostics.endpoint} />
          <Diagnostic
            label="Database write path"
            ok={diagnostics.databaseWriteAvailable}
            value={diagnostics.databaseWriteAvailable ? "Service-role API can reach the jobs table" : diagnostics.databaseError ?? "Service-role API is not configured"}
          />
          <Diagnostic
            label="Office notification"
            ok={diagnostics.notificationConfigured}
            value={`${diagnostics.notificationConfigured ? "Email provider configured" : "Email provider not configured"} · ${diagnostics.notificationDestination}`}
          />
          <article className="detail-panel">
            <h2 className="panel-title"><CheckCircle2 aria-hidden="true" size={18} />Allowed origins</h2>
            <ul className="mini-list">
              {diagnostics.allowedOrigins.map((origin) => <li key={origin}>{origin}</li>)}
            </ul>
          </article>
        </section>
      </div>
    </PlatformFrame>
  );
}

function Diagnostic({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <article className="detail-panel">
      <h2 className="panel-title"><Icon aria-hidden="true" size={18} />{label}</h2>
      <p>{value}</p>
    </article>
  );
}
