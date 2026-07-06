import Link from "next/link";
import { CalendarDays, Camera, CheckCircle2, Clock3, Truck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCrewDashboardSummaries } from "@/lib/data/crew-jobs";

export default async function CrewPage() {
  const context = await getAuthenticatedPlatformContext("/crew");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the crew app" />;
  }

  const summaries = await getCrewDashboardSummaries({
    roles: context.roles,
    userId: context.user.id,
  });
  const lanes = [
    {
      title: "Today's jobs",
      count: summaries.lanes.todaysJobs.length,
      description: "Scheduled for today.",
      Icon: Truck,
    },
    {
      title: "Upcoming jobs",
      count: summaries.lanes.upcomingJobs.length,
      description: "Scheduled after today.",
      Icon: CalendarDays,
    },
    {
      title: "Needs photos",
      count: summaries.lanes.needsPhotos.length,
      description: "Missing before or after photos.",
      Icon: Camera,
    },
    {
      title: "Ready to complete",
      count: summaries.lanes.readyToComplete.length,
      description: "In progress and waiting for wrap-up.",
      Icon: CheckCircle2,
    },
  ];

  return (
    <PlatformFrame active="crew" roles={context.roles} userEmail={context.user.email}>
      <div className="crew-shell app-content">
        <section className="crew-hero">
          <p className="surface-label">
            <Truck aria-hidden="true" size={18} />
            Crew Field App
          </p>
          <h1>Today, clearly.</h1>
          <p>Jobs, directions, contact, photos, and completion in a field-friendly view.</p>
          <div className="action-row">
            <Link className="primary-action" href="/crew/jobs">
              <Truck aria-hidden="true" size={18} />
              Open jobs
            </Link>
          </div>
        </section>

        {summaries.error ? <DataWarning message={summaries.error} /> : null}

        <section className="crew-dashboard-grid" aria-label="Crew job summary">
          {lanes.map((lane) => (
            <article className="crew-summary-card" key={lane.title}>
              <lane.Icon aria-hidden="true" size={22} />
              <strong>{lane.count}</strong>
              <span>{lane.title}</span>
              <p>{lane.description}</p>
            </article>
          ))}
        </section>

        <section className="crew-panel">
          <div className="crew-panel-heading">
            <span className="crew-panel-icon" aria-hidden="true">
              <Clock3 size={19} />
            </span>
            <div>
              <h2>Field workflow</h2>
              <p>Start with the jobs list, open a job, upload photos, then mark the work complete.</p>
            </div>
          </div>
        </section>
      </div>
    </PlatformFrame>
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
