import Link from "next/link";
import { Camera, CheckCircle2, MapPin, MessageCircle, Phone, Truck } from "lucide-react";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCrewJobs } from "@/lib/data/crew-jobs";
import type { CrewJob } from "@/lib/types/database";

export default async function CrewJobsPage() {
  const context = await getAuthenticatedPlatformContext("/crew/jobs");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening crew jobs" />;
  }

  const jobs = await getCrewJobs({
    roles: context.roles,
    userId: context.user.id,
  });

  return (
    <PlatformFrame active="crew" roles={context.roles} userEmail={context.user.email}>
      <div className="crew-shell app-content">
        <section className="crew-hero">
          <p className="surface-label">
            <Truck aria-hidden="true" size={18} />
            Crew Jobs
          </p>
          <h1>Jobs list.</h1>
          <p>Large cards for field work. Open a job for scope, photos, checklist, and completion.</p>
        </section>

        {jobs.error ? <DataWarning message={jobs.error} /> : null}

        {jobs.data.length === 0 ? (
          <section className="empty-state">
            <h2>No crew jobs yet</h2>
            <p>Scheduled and in-progress jobs will appear here when RLS and assignments allow access.</p>
          </section>
        ) : (
          <section className="crew-job-list" aria-label="Crew jobs">
            {jobs.data.map((job) => (
              <CrewJobCard job={job} key={job.id} />
            ))}
          </section>
        )}
      </div>
    </PlatformFrame>
  );
}

function CrewJobCard({ job }: { job: CrewJob }) {
  const phone = job.customers?.phone;
  const directionsUrl = getDirectionsUrl(job);
  const photoTypes = new Set((job.job_photos ?? []).map((photo) => photo.photo_type));

  return (
    <article className="crew-job-card">
      <div className="crew-job-card-top">
        <div>
          <p className="job-kicker">{formatDateTime(job.scheduled_start_at)}</p>
          <h2>{job.service_type?.replace("_", " ") ?? "Service job"}</h2>
          <p>{formatLocation(job)}</p>
        </div>
        <span className="status-pill">{job.status.replace("_", " ")}</span>
      </div>
      <p>{job.requested_scope || "No scope entered yet."}</p>
      <div className="crew-photo-flags" aria-label="Photo needs">
        <span className={photoTypes.has("before") ? "complete" : ""}>Before</span>
        <span className={photoTypes.has("after") ? "complete" : ""}>After</span>
      </div>
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

function getDirectionsUrl(job: CrewJob) {
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
