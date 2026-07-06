import Link from "next/link";
import type { ReactNode } from "react";
import { Camera, Lightbulb, Megaphone, MessageSquareText, ShieldCheck, Star } from "lucide-react";
import { CopyDraftCard } from "@/components/copy-draft-card";
import { JobPhotoGallery } from "@/components/job-photo-gallery";
import { PlatformFrame } from "@/components/PlatformFrame";
import { SetupRequired } from "@/components/SetupRequired";
import { getAuthenticatedPlatformContext } from "@/lib/auth/pageContext";
import { getJobPhotos } from "@/lib/data/job-photos";
import { getCompletedJobsForMarketing } from "@/lib/data/jobs";
import {
  generateCompletedJobReviewRequest,
  generateCompletedJobSummaryDrafts,
  getGoogleReviewUrl,
  publicSafeText,
} from "@/lib/documents/marketing-drafts";
import type { JobDetail, SignedJobPhoto } from "@/lib/types/database";

export default async function MarketingPage() {
  const context = await getAuthenticatedPlatformContext("/admin/marketing");

  if (!context.configured) {
    return <SetupRequired title="Configure Supabase before opening marketing drafts" />;
  }

  const jobs = await getCompletedJobsForMarketing();
  const photoResults = await Promise.all(
    jobs.data.map(async (job) => ({
      jobId: job.id,
      result: await getJobPhotos(job.id),
    })),
  );
  const photosByJob = new Map(photoResults.map(({ jobId, result }) => [jobId, result.data]));
  const photoErrors = photoResults.flatMap(({ jobId, result }) =>
    result.error ? [`Job ${jobId.slice(0, 8)} photos: ${result.error}`] : [],
  );
  const googleReviewUrl = getGoogleReviewUrl();

  return (
    <PlatformFrame active="marketing" roles={context.roles} userEmail={context.user.email}>
      <div className="shell app-content">
        <section className="page-heading">
          <p className="surface-label">
            <Megaphone aria-hidden="true" size={18} />
            Marketing drafts
          </p>
          <h1>Marketing</h1>
          <p>Prepare review requests, completed-job drafts, and public-safe gallery candidates.</p>
        </section>

        <section className="notice-panel">
          <strong><ShieldCheck aria-hidden="true" size={18} /> Privacy boundary</strong>
          <p>
            Keep photos internal until customer permission is recorded. Public-facing draft helpers use
            city-level location context only and remove contact details and street-address-like text.
          </p>
        </section>

        {jobs.error ? <DataWarning message={jobs.error} /> : null}
        {photoErrors.map((message) => <DataWarning key={message} message={message} />)}

        {jobs.data.length === 0 ? (
          <EmptyState title="No completed jobs yet" body="Finished work will appear here for review requests and draft content." />
        ) : (
          <>
            <MarketingSection
              description="Open a completed job to review the email and text drafts before contacting the customer."
              icon={<Star aria-hidden="true" size={18} />}
              title="Review requests"
            >
              <div className="marketing-queue-list">
                {jobs.data.map((job) => {
                  const draft = generateCompletedJobReviewRequest(job, googleReviewUrl);
                  return (
                    <article className="marketing-queue-item" key={job.id}>
                      <div>
                        <strong>{job.customers?.display_name ?? "Customer"}</strong>
                        <span>{formatJobLabel(job)}</span>
                      </div>
                      <span>{draft.reviewUrl ? "Review link configured" : "Review link needs setup"}</span>
                      <Link href={`/admin/jobs/${job.id}`}>Open workflow</Link>
                    </article>
                  );
                })}
              </div>
            </MarketingSection>

            <MarketingSection
              description="Copy-only drafts use service type, city, scope, and internal photo captions after privacy redaction."
              icon={<MessageSquareText aria-hidden="true" size={18} />}
              title="Completed job post drafts"
            >
              <div className="marketing-post-list">
                {jobs.data.map((job) => (
                  <PostDraftGroup job={job} key={job.id} />
                ))}
              </div>
            </MarketingSection>

            <MarketingSection
              description="These previews remain private. Select public candidates from the completed job workflow only after customer permission is confirmed."
              icon={<Camera aria-hidden="true" size={18} />}
              title="Before / after gallery candidates"
            >
              <div className="marketing-gallery-list">
                {jobs.data.map((job) => (
                  <section className="marketing-gallery-group" key={job.id}>
                    <div className="marketing-section-heading">
                      <div>
                        <h3>{formatJobLabel(job)}</h3>
                        <p>Internal previews only.</p>
                      </div>
                      <Link href={`/admin/jobs/${job.id}`}>Review candidates</Link>
                    </div>
                    <JobPhotoGallery photos={getPublicCandidatePhotos(photosByJob.get(job.id) ?? [])} />
                  </section>
                ))}
              </div>
            </MarketingSection>

            <MarketingSection
              description="Use these as starting points for educational local content. They contain no customer details."
              icon={<Lightbulb aria-hidden="true" size={18} />}
              title="Service-area content ideas"
            >
              <ul className="marketing-idea-list">
                {buildServiceAreaIdeas(jobs.data).map((idea) => <li key={idea}>{idea}</li>)}
              </ul>
            </MarketingSection>
          </>
        )}
      </div>
    </PlatformFrame>
  );
}

function MarketingSection({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="marketing-page-section">
      <div className="marketing-section-heading">
        <div>
          <h2>{icon}{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function PostDraftGroup({ job }: { job: JobDetail }) {
  const drafts = generateCompletedJobSummaryDrafts({
    job,
    selectedPhotoCaptions: [],
  });

  return (
    <section className="marketing-post-group">
      <div className="marketing-section-heading">
        <div>
          <h3>{formatJobLabel(job)}</h3>
          <p>Review the wording before using it publicly.</p>
        </div>
        <Link href={`/admin/jobs/${job.id}`}>Open job</Link>
      </div>
      <div className="marketing-draft-grid">
        <CopyDraftCard body={drafts.googleBusinessPost} label="Google Business post" />
        <CopyDraftCard body={drafts.facebookPost} label="Facebook post" />
        <CopyDraftCard body={drafts.websiteGalleryCaption} label="Website gallery caption" />
      </div>
    </section>
  );
}

function getPublicCandidatePhotos(photos: SignedJobPhoto[]) {
  return photos.filter((photo) => photo.photo_type === "before" || photo.photo_type === "after");
}

function buildServiceAreaIdeas(jobs: JobDetail[]) {
  const ideas = jobs.map((job) => {
    const city = publicSafeText(job.service_locations?.city || "the Fredericksburg area");
    const service = (job.service_type || "property care").replaceAll("_", " ");
    return `${capitalize(service)} in ${city}: what property owners should consider before scheduling seasonal work.`;
  });

  return [...new Set(ideas)].slice(0, 8);
}

function formatJobLabel(job: JobDetail) {
  const city = publicSafeText(job.service_locations?.city || "Fredericksburg region");
  return `${capitalize((job.service_type || "service job").replaceAll("_", " "))} - ${city}`;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function EmptyState({ body, title }: { body: string; title: string }) {
  return <section className="empty-state"><h2>{title}</h2><p>{body}</p></section>;
}

function DataWarning({ message }: { message: string }) {
  return <section className="data-warning" role="status"><strong>Database notice</strong><p>{message}</p></section>;
}
