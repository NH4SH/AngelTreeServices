import Link from "next/link";
import type { ReactNode } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  Phone,
  Truck,
  Wrench,
} from "lucide-react";
import { CompletionChecklist } from "@/components/completion-checklist";
import { JobPhotoUploader } from "@/components/job-photo-uploader";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { CrewStatusActions } from "./CrewStatusActions";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCrewJobById } from "@/lib/data/crew-jobs";
import { getJobPhotos } from "@/lib/data/job-photos";
import type { CrewJob, SignedJobPhoto } from "@/lib/types/database";

type CrewJobDetailPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function CrewJobDetailPage({ params }: CrewJobDetailPageProps) {
  const { jobId } = await params;
  const context = await getAuthenticatedPlatformContext(`/crew/jobs/${jobId}`);

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening crew job details" />;
  }

  const job = await getCrewJobById(jobId, {
    roles: context.roles,
    userId: context.user.id,
  });
  const photos = job.data ? await getJobPhotos(jobId) : { data: [], error: null };

  return (
    <PlatformFrame active="crew" roles={context.roles} userEmail={context.user.email}>
      <div className="crew-shell app-content">
        <Link className="crew-back-link" href="/crew/jobs">
          Back to jobs
        </Link>

        {job.error ? <DataWarning message={job.error} /> : null}
        {photos.error ? <DataWarning message={`Photos: ${photos.error}`} /> : null}

        {!job.data ? (
          <section className="empty-state">
            <h2>Job not available</h2>
            <p>This job either does not exist or is not visible to this signed-in account.</p>
          </section>
        ) : (
          <CrewJobDetail job={job.data} photos={photos.data} />
        )}
      </div>
    </PlatformFrame>
  );
}

function CrewJobDetail({ job, photos }: { job: CrewJob; photos: SignedJobPhoto[] }) {
  const phone = job.customers?.phone;
  const directionsUrl = getDirectionsUrl(job);
  const crewNotes = (job.notes ?? []).filter((note) => note.visibility === "crew_visible");

  return (
    <>
      <section className="crew-hero">
        <p className="surface-label">
          <Truck aria-hidden="true" size={18} />
          Crew job
        </p>
        <h1>{job.service_type?.replace("_", " ") ?? "Service job"}</h1>
        <p>{formatLocation(job)}</p>
        <div className="crew-job-meta-row">
          <span>{formatDateTime(job.scheduled_start_at)}</span>
          <span>{job.status.replace("_", " ")}</span>
        </div>
      </section>

      <section className="crew-action-row primary-crew-actions" aria-label="Job actions">
        {directionsUrl ? (
          <a href={directionsUrl} rel="noreferrer" target="_blank">
            <MapPin aria-hidden="true" size={20} />
            Directions
          </a>
        ) : (
          <span className="crew-unavailable-action" role="note">
            <MapPin aria-hidden="true" size={20} />
            <span>
              Directions
              <small>No address</small>
            </span>
          </span>
        )}
        {phone ? (
          <a href={`tel:${phone}`}>
            <Phone aria-hidden="true" size={20} />
            Call
          </a>
        ) : (
          <span className="crew-unavailable-action" role="note">
            <Phone aria-hidden="true" size={20} />
            <span>
              Call
              <small>No phone</small>
            </span>
          </span>
        )}
        {phone ? (
          <a href={`sms:${phone}`}>
            <MessageCircle aria-hidden="true" size={20} />
            Message
          </a>
        ) : (
          <span className="crew-unavailable-action" role="note">
            <MessageCircle aria-hidden="true" size={20} />
            <span>
              Message
              <small>No phone</small>
            </span>
          </span>
        )}
        <Link href="#photos">
          <Camera aria-hidden="true" size={20} />
          Photos
        </Link>
        <Link href="#complete">
          <CheckCircle2 aria-hidden="true" size={20} />
          Complete
        </Link>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<ClipboardCheck size={19} />} title="Scope of work" subtitle="Read this first before starting." />
        <p className="crew-scope-copy">{job.requested_scope || "No scope entered yet."}</p>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<Phone size={19} />} title="Customer" subtitle="Only job contact details appear here." />
        <dl className="crew-detail-list">
          <div>
            <dt>Name</dt>
            <dd>{job.customers?.display_name ?? "Not available"}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{phone ?? "Not available"}</dd>
          </div>
        </dl>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<MapPin size={19} />} title="Service location" subtitle={formatLocation(job)} />
        <dl className="crew-detail-list">
          <div>
            <dt>Access notes</dt>
            <dd>{job.service_locations?.access_notes || "No access notes."}</dd>
          </div>
          <div>
            <dt>Service notes</dt>
            <dd>{job.service_locations?.service_notes || "No service notes."}</dd>
          </div>
          <div>
            <dt>Gate code</dt>
            <dd>{job.service_locations?.gate_code || "Not set"}</dd>
          </div>
        </dl>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<Truck size={19} />} title="Crew notes" subtitle="Field-only essentials." />
        <div className="crew-note-list">
          {crewNotes.length > 0 ? (
            crewNotes.map((note) => <p key={note.id}>{note.body}</p>)
          ) : (
            <p>No crew-visible notes yet.</p>
          )}
        </div>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<Wrench size={19} />} title="Equipment needed" subtitle="Placeholder for future planning." />
        <p>Equipment, materials, and vehicle needs can be added after job detail workflows settle.</p>
      </section>

      <section className="crew-panel" id="photos">
        <PanelHeading icon={<Camera size={19} />} title="Job photos" subtitle="Take clear before and after photos for the office record." />
        <div className="crew-photo-help">
          <div>
            <strong>Before</strong>
            <p>Capture the work area before starting.</p>
          </div>
          <div>
            <strong>After</strong>
            <p>Capture the final condition before leaving.</p>
          </div>
        </div>
        <JobPhotoGallery photos={photos} />
        <div className="photo-uploader-grid">
          <JobPhotoUploader
            description="Capture the work area before starting."
            jobId={job.id}
            photoCategory="before"
            title="Before photo"
          />
          <JobPhotoUploader
            description="Capture the finished work area."
            jobId={job.id}
            photoCategory="after"
            title="After photo"
          />
          <JobPhotoUploader
            description="Document hazards, damage, or scope changes."
            jobId={job.id}
            photoCategory="issue"
            title="Issue photo"
          />
          <JobPhotoUploader
            description="Capture the final condition for the office record."
            jobId={job.id}
            photoCategory="completion"
            title="Completion photo"
          />
        </div>
        <p className="field-note">
          Uploads stay private in Supabase Storage. Preview links expire automatically.
        </p>
      </section>

      <section id="complete">
        <CompletionChecklist />
      </section>
      <CrewStatusActions jobId={job.id} status={job.status} />
    </>
  );
}

function PanelHeading({ icon, subtitle, title }: { icon: ReactNode; subtitle: string; title: string }) {
  return (
    <div className="crew-panel-heading">
      <span className="crew-panel-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
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

  return `${location.street}, ${location.city}, ${location.state}`;
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
