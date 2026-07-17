import Link from "next/link";
import type { ReactNode } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  Phone,
  ReceiptText,
  Truck,
  Wrench,
} from "lucide-react";
import { CrewJobCloseoutForm } from "@/components/crew-job-closeout-form";
import { JobPhotoUploader } from "@/components/job-photo-uploader";
import { JobCostEntryForm } from "@/components/reporting-input-forms";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getCrewJobById } from "@/lib/data/crew-jobs";
import { getJobPhotos } from "@/lib/data/job-photos";
import { getJobCloseout } from "@/lib/data/job-closeouts";
import { getActiveTimeEntryForUser } from "@/lib/data/time-clock";
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
  const [photos, closeout, activeTimer] = job.data
    ? await Promise.all([
        getJobPhotos(jobId),
        getJobCloseout(jobId),
        getActiveTimeEntryForUser(context.user.id),
      ])
    : [
        { data: [], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ];

  return (
    <PlatformFrame active="crew" roles={context.roles} userEmail={context.user.email}>
      <div className="crew-shell app-content">
        <Link className="crew-back-link" href="/crew/jobs">
          Back to jobs
        </Link>

        {job.error ? <DataWarning message={job.error} /> : null}
        {photos.error ? <DataWarning message={`Photos: ${photos.error}`} /> : null}
        {closeout.error ? <DataWarning message={`Closeout: ${closeout.error}`} /> : null}
        {activeTimer.error ? <DataWarning message={`Time clock: ${activeTimer.error}`} /> : null}

        {!job.data ? (
          <section className="empty-state">
            <h2>Job not available</h2>
            <p>This job either does not exist or is not visible to this signed-in account.</p>
          </section>
        ) : (
          <CrewJobDetail
            activeTimerJobId={activeTimer.data?.job_id ?? null}
            assignedCrewLabel={context.user.email ?? "Assigned crew member"}
            closeout={closeout.data}
            job={job.data}
            photos={photos.data}
          />
        )}
      </div>
    </PlatformFrame>
  );
}

function CrewJobDetail({
  activeTimerJobId,
  assignedCrewLabel,
  closeout,
  job,
  photos,
}: {
  activeTimerJobId: string | null;
  assignedCrewLabel: string;
  closeout: Awaited<ReturnType<typeof getJobCloseout>>["data"];
  job: CrewJob;
  photos: SignedJobPhoto[];
}) {
  const phone = job.customers?.phone;
  const directionsUrl = getDirectionsUrl(job);
  const crewNotes = (job.notes ?? []).filter((note) => note.visibility === "crew_visible");
  const customerNotes = (job.notes ?? []).filter((note) => note.visibility === "customer_visible");

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
          <span>{formatStatus(job.status)}</span>
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

      {customerNotes.length > 0 ? (
        <section className="crew-panel">
          <PanelHeading icon={<MessageCircle size={19} />} title="Customer-visible notes" subtitle="These notes may also appear in customer-facing records." />
          <div className="crew-note-list">
            {customerNotes.map((note) => <p className="pre-wrap-copy" key={note.id}>{note.body}</p>)}
          </div>
        </section>
      ) : null}

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
        <PanelHeading icon={<Truck size={19} />} title="Assigned crew" subtitle="The account responsible for this work order." />
        <p>{assignedCrewLabel}</p>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<Wrench size={19} />} title="Equipment needed" subtitle="Placeholder for future planning." />
        <p>Equipment, materials, and vehicle needs can be added after job detail workflows settle.</p>
      </section>

      <section className="crew-panel">
        <PanelHeading icon={<ReceiptText size={19} />} title="Submit a receipt or job cost" subtitle="The office reviews every crew submission before it affects estimated job cost." />
        <JobCostEntryForm jobId={job.id} />
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
            description="Document progress during the work when useful."
            jobId={job.id}
            photoCategory="during"
            title="During-work photo"
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
          <JobPhotoUploader
            description="Document equipment placement or difficult access conditions."
            jobId={job.id}
            photoCategory="equipment_access"
            title="Equipment or access photo"
          />
        </div>
        <p className="field-note">
          Uploads stay private in Supabase Storage. Preview links expire automatically.
        </p>
      </section>

      <section id="complete">
        {closeout ? (
          <CrewJobCloseoutForm
            bundle={closeout}
            hasActiveJobTimer={activeTimerJobId === job.id}
            jobId={job.id}
            jobStatus={job.status}
          />
        ) : (
          <section className="crew-panel">
            <PanelHeading icon={<CheckCircle2 size={19} />} title="Job closeout unavailable" subtitle="The closeout migration must be applied before this workflow can be used." />
          </section>
        )}
      </section>
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

function formatStatus(status: CrewJob["status"]) {
  const labels: Partial<Record<CrewJob["status"], string>> = {
    completed_pending_review: "Completed, awaiting office review",
    ready_to_invoice: "Ready to invoice",
    returned_for_correction: "Returned for correction",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}

function DataWarning({ message }: { message: string }) {
  return (
    <section className="data-warning" role="status">
      <strong>Database notice</strong>
      <p>{message}</p>
    </section>
  );
}
