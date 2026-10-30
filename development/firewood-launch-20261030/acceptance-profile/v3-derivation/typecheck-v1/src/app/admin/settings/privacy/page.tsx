import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";

const publicPrivacyURL = "https://angeltreeservices.org/privacy/";
const privacyRequestURL = "https://angeltreeservices.org/privacy-request/";

export default async function PrivacyDataPage() {
  const context = await getAuthenticatedPlatformContext("/admin/settings/privacy");
  if (!context.configured || !context.user) {
    return <SetupRequired title="Configure Supabase before opening Privacy & Data" />;
  }

  return (
    <PlatformFrame active="settings" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content privacy-data-page">
        <section className="page-heading">
          <p className="surface-label"><ShieldCheck size={18} />Settings</p>
          <h1>Privacy &amp; Data</h1>
          <p>A plain-language guide to information used by the Angel Tree workspace.</p>
        </section>

        <section className="detail-grid privacy-data-grid">
          <article className="detail-card">
            <h2>What the workspace uses</h2>
            <p>Depending on your role, the workspace can show account details, schedules, customer and property information, job records, estimates, invoices, communications, documents, and field photos.</p>
          </article>
          <article className="detail-card">
            <h2>Why it is used</h2>
            <p>This information supports access control, scheduling, estimates, job delivery, customer communication, billing, safety, recordkeeping, and company operations.</p>
          </article>
          <article className="detail-card">
            <h2>Access and retention</h2>
            <p>Access is role-based. Removing or disabling your login does not automatically erase historical company business records that must remain accurate for customers, accounting, safety, or legal obligations.</p>
          </article>
          <article className="detail-card">
            <h2>Your choices</h2>
            <p>You may request access to, correction of, or deletion of eligible personal information, or ask the office to remove your account access. We verify requests before acting.</p>
          </article>
        </section>

        <section className="action-row privacy-data-actions" aria-label="Privacy resources">
          <a className="secondary-action" href={publicPrivacyURL} target="_blank" rel="noreferrer">Privacy policy <ExternalLink size={16} /></a>
          <a className="primary-action" href={privacyRequestURL} target="_blank" rel="noreferrer">Make a privacy or account request <ExternalLink size={16} /></a>
          <Link className="text-link" href="/admin/settings">Back to settings</Link>
        </section>
      </div>
    </PlatformFrame>
  );
}
