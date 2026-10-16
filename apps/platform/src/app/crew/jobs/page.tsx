import { formatBusinessDateTime, formatBusinessDate, getBusinessDateKey } from "@/lib/business-time";
import Link from "next/link";
import { Camera, CheckCircle2, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { fieldJobScopes, getCrewJobPage, isFieldDate, type FieldJobScope, type FieldJob } from "@/lib/data/crew-field-jobs";

export default async function CrewJobsPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; cursor?: string }> }) {
  const context = await getAuthenticatedPlatformContext("/crew/jobs");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening crew jobs" />;
  }

  const params = await searchParams;
  const scope: FieldJobScope = fieldJobScopes.includes(params.view as FieldJobScope) ? params.view as FieldJobScope : "today";
  const date = params.date ?? getBusinessDateKey(new Date());
  const displayDate = isFieldDate(date) ? date : getBusinessDateKey(new Date());
  const jobs = await getCrewJobPage(context.supabase, { scope, date, cursor: params.cursor });
  const titles: Record<FieldJobScope, string> = { today: "Today", upcoming: "Upcoming", active: "All active", unscheduled: "Unscheduled", history: "History", needs_photos: "Needs photos", ready_to_complete: "Ready to complete" };
  const pageHref = (view: FieldJobScope, cursor?: string | null) => `/crew/jobs?${new URLSearchParams({ view, date: displayDate, ...(cursor ? { cursor } : {}) })}`;

  return (
    <PlatformFrame active="crew" roles={context.roles} userEmail={context.user.email}>
      <div className="crew-shell app-content">
        <section className="crew-hero">
          <p className="surface-label">
            <Truck aria-hidden="true" size={18} />
            Crew
          </p>
          <h1>Jobs</h1>
          <p>{scope === "history" ? "Completed work, with photos and records kept together." : "Find your next stop and open the work order."}</p>
          <nav className="crew-hero-actions" aria-label="Job views">
            {(["today", "upcoming", "active", "unscheduled", "history"] as FieldJobScope[]).map(view => (
              <Link className={view === scope ? "primary-action" : "secondary-action"} aria-current={view === scope ? "page" : undefined} href={pageHref(view)} key={view}>{titles[view]}</Link>
            ))}
          </nav>
        </section>

        <div className="crew-panel-heading"><h2>{titles[scope]}</h2><p>{scope === "today" ? `${formatBusinessDate(displayDate)} · ` : scope === "upcoming" ? `After ${formatBusinessDate(displayDate)} · ` : ""}{jobs.total} {jobs.total === 1 ? "job" : "jobs"}</p></div>
        {jobs.error ? <><DataWarning message={jobs.error} /><Link className="secondary-action" href={pageHref(scope)}>Open first page</Link></> : null}

        {jobs.error ? null : jobs.data.length === 0 ? (
          <section className="empty-state">
            <h2>No jobs in this view</h2>
            <p>{scope === "history" ? "Completed jobs will appear here. Open All active for ongoing work." : "Check Upcoming or All active for your other assigned work."}</p>
          </section>
        ) : (
          <section className="crew-job-list" aria-label="Crew jobs">
            {jobs.data.map((job) => (
              <CrewJobCard job={job} key={job.id} />
            ))}
          </section>
        )}
        <nav className="crew-hero-actions" aria-label="Job pages">
          {params.cursor ? <Link className="secondary-action" href={pageHref(scope)}>First page</Link> : null}
          {jobs.nextCursor ? <Link className="secondary-action" href={pageHref(scope, jobs.nextCursor)}>{scope === "history" ? "Older jobs" : "Next jobs"}</Link> : null}
        </nav>
      </div>
    </PlatformFrame>
  );
}

function CrewJobCard({ job }: { job: FieldJob }) {
  const phone = job.organizations?.billing_phone ?? job.customers?.phone;
  const directionsUrl = getDirectionsUrl(job);
  const photoTypes = new Set(Object.entries(job.photo_counts).filter(([, count]) => count && count > 0).map(([category]) => category));
  const missingPhotos = [!photoTypes.has("before") ? "Before" : null, !photoTypes.has("after") ? "After" : null]
    .filter(Boolean)
    .join(" and ");

  return (
    <article className="crew-job-card">
      <div className="crew-job-card-top">
        <div>
          <p className="job-kicker">{formatDateTime(job.scheduled_start_at)}</p>
          <h2>{job.service_type?.replace("_", " ") ?? "Service job"}</h2>
          <p>{job.organizations?.name ?? job.customers?.display_name ?? "Contracting party not available"}</p>
          <p>{formatLocation(job)}</p>
        </div>
        <span className="status-pill">{job.status.replaceAll("_", " ")}</span>
      </div>
      {job.completed_at ? <p>Work completed {formatDateTime(job.completed_at)}</p> : null}
      <p>{job.requested_scope || "No scope entered yet."}</p>
      <div className="crew-job-status-strip">
        <div className="crew-photo-flags" aria-label="Photo needs">
          <span className={photoTypes.has("before") ? "complete" : ""}>Before</span>
          <span className={photoTypes.has("after") ? "complete" : ""}>After</span>
        </div>
        <p className="crew-photo-summary">{missingPhotos ? `Need ${missingPhotos.toLowerCase()} photos` : "Photo set looks complete"}</p>
      </div>
      <Link className="primary-action crew-job-open-link" href={`/crew/jobs/${job.id}`}>
        <Truck aria-hidden="true" size={20} />
        Open job
      </Link>
      <div className="crew-action-row">
        {directionsUrl ? (
          <a href={directionsUrl} rel="noreferrer" target="_blank">
            <MapPin aria-hidden="true" size={19} />
            Directions
          </a>
        ) : (
          <span className="crew-unavailable-action" role="note">
            <MapPin aria-hidden="true" size={19} />
            <span>
              Directions
              <small>No address</small>
            </span>
          </span>
        )}
        {phone ? (
          <a href={`tel:${phone}`}>
            <Phone aria-hidden="true" size={19} />
            Call
          </a>
        ) : (
          <span className="crew-unavailable-action" role="note">
            <Phone aria-hidden="true" size={19} />
            <span>
              Call
              <small>No phone</small>
            </span>
          </span>
        )}
        {phone ? (
          <a href={`sms:${phone}`}>
            <MessageCircle aria-hidden="true" size={19} />
            Message
          </a>
        ) : (
          <span className="crew-unavailable-action" role="note">
            <MessageCircle aria-hidden="true" size={19} />
            <span>
              Message
              <small>No phone</small>
            </span>
          </span>
        )}
        <Link href={`/crew/jobs/${job.id}#photos`}>
          <Camera aria-hidden="true" size={19} />
          Photos
        </Link>
        <Link href={`/crew/jobs/${job.id}#complete`}>
          <CheckCircle2 aria-hidden="true" size={19} />
          Complete
        </Link>
      </div>
    </article>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "No time set";
  }

  return formatBusinessDateTime(new Date(value), {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocation(job: FieldJob) {
  const location = job.service_locations;
  if (!location) {
    return "No service location";
  }

  return `${location.street}, ${location.city}`;
}

function getDirectionsUrl(job: FieldJob) {
  const location = job.service_locations;
  if (!location) {
    return null;
  }

  const query = [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
