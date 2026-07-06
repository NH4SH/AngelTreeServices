import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";

type AdminJobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function AdminJobDetailPage({ params }: AdminJobDetailPageProps) {
  const { jobId } = await params;
  const context = await getAuthenticatedPlatformContext(`/admin/jobs/${jobId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening job details" />;
  }

  return (
    <PlatformFrame active="jobs" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <ClipboardCheck aria-hidden="true" size={18} />
            Job Detail Scaffold
          </p>
          <h1>Admin job details will live here.</h1>
          <p>
            Future detail pages can combine customer, service location, quote, invoice, photos,
            notes, and activity without overloading the job list.
          </p>
          <div className="action-row">
            <Link className="secondary-action" href="/admin/jobs">
              Back to jobs
            </Link>
            <Link className="primary-action" href={`/crew/jobs/${jobId}`}>
              Open crew view
            </Link>
          </div>
        </section>
      </div>
    </PlatformFrame>
  );
}
