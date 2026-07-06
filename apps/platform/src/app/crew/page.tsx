import Link from "next/link";
import { CalendarDays, Camera, CheckCircle2, Clock3, MapPin, TimerReset, Truck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCrewDashboardSummaries } from "@/lib/data/crew-jobs";
import type { CrewJob } from "@/lib/types/database";

export default async function CrewPage() {
  const context = await getAuthenticatedPlatformContext("/crew");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening the crew app" />;
  }

  const summaries = await getCrewDashboardSummaries({
    roles: context.roles,
    userId: context.user.id,
  });
  const summariesList = [
    {
      title: "Today's jobs",
      count: summaries.lanes.todaysJobs.length,
      description: "On the board for today.",
      Icon: Truck,
    },
    {
      title: "Upcoming jobs",
      count: summaries.lanes.upcomingJobs.length,
      description: "Next on deck.",
      Icon: CalendarDays,
    },
    {
      title: "Needs photos",
      count: summaries.lanes.needsPhotos.length,
      description: "Before or after still missing.",
      Icon: Camera,
    },
    {
      title: "Ready to complete",
      count: summaries.lanes.readyToComplete.length,
      description: "Wrap-up steps still pending.",
      Icon: CheckCircle2,
    },
  ];

  return (
    <PlatformFrame active="crew" roles={context.roles} userEmail={context.user.email}>
      <div className="crew-shell app-content">
        <section className="crew-hero">
          <p className="surface-label">
            <Truck aria-hidden="true" size={18} />
            Crew
          </p>
          <h1>Today</h1>
          <p>Open the next job, get directions, call the customer, add photos, and wrap up the checklist.</p>
          <div className="crew-hero-actions">
            <Link className="primary-action" href="/crew/jobs">
              <Truck aria-hidden="true" size={18} />
              Open all jobs
            </Link>
            <Link className="secondary-action" href="/crew/time">
              <TimerReset aria-hidden="true" size={18} />
              Open time clock
            </Link>
          </div>
        </section>

        {summaries.error ? <DataWarning message={summaries.error} /> : null}

        <section className="crew-panel crew-today-panel" aria-label="Today's jobs">
          <div className="crew-panel-heading">
            <span className="crew-panel-icon" aria-hidden="true">
              <Clock3 size={19} />
            </span>
            <div>
              <h2>Today's jobs</h2>
              <p>Start here. Open the next stop and work straight down the list.</p>
            </div>
          </div>
          {summaries.lanes.todaysJobs.length > 0 ? (
            <div className="crew-today-list">
              {summaries.lanes.todaysJobs.map((job) => (
                <CrewTodayJobRow job={job} key={job.id} />
              ))}
            </div>
          ) : (
            <div className="crew-empty-inline">
              <strong>No jobs scheduled for today.</strong>
              <p>Upcoming assigned work will appear here when the schedule is ready.</p>
            </div>
          )}
        </section>

        <section className="crew-quick-stats" aria-label="Crew job summary">
          {summariesList.slice(1).map((lane) => (
            <article className="crew-quick-stat" key={lane.title}>
              <lane.Icon aria-hidden="true" size={20} />
              <div>
                <strong>{lane.count}</strong>
                <span>{lane.title}</span>
                <p>{lane.description}</p>
              </div>
            </article>
          ))}
        </section>
      </div>
    </PlatformFrame>
  );
}

function CrewTodayJobRow({ job }: { job: CrewJob }) {
  return (
    <article className="crew-today-row">
      <div className="crew-today-row-copy">
        <p className="job-kicker">{formatDateTime(job.scheduled_start_at)}</p>
        <h3>{job.service_type?.replace("_", " ") ?? "Service job"}</h3>
        <p>{formatLocation(job)}</p>
      </div>
      <Link className="primary-action crew-today-open" href={`/crew/jobs/${job.id}`}>
        Open job
      </Link>
    </article>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No time set";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLocation(job: CrewJob) {
  const location = job.service_locations;

  if (!location) {
    return "No service location";
  }

  return `${location.street}, ${location.city}`;
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
