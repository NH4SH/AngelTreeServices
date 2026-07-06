"use client";

import { useMemo, useState } from "react";
import { Camera, CheckCircle2, Megaphone, MessageSquareText, ShieldCheck } from "lucide-react";
import { CopyDraftCard } from "@/components/copy-draft-card";
import { EmailDraftCard } from "@/components/email-draft-card";
import {
  generateCompletedJobReviewRequest,
  generateCompletedJobSummaryDrafts,
} from "@/lib/documents/marketing-drafts";
import type { JobDetail, SignedJobPhoto } from "@/lib/types/database";

export function CompletedJobMarketingWorkspace({
  googleReviewUrl,
  job,
  photos,
}: {
  googleReviewUrl: string | null;
  job: JobDetail;
  photos: SignedJobPhoto[];
}) {
  const [completionNotes, setCompletionNotes] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [galleryEligible, setGalleryEligible] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const candidatePhotos = photos.filter((photo) => photo.photo_type === "before" || photo.photo_type === "after");
  const selectedPhotoCaptions = candidatePhotos
    .filter((photo) => selectedPhotoIds.includes(photo.id))
    .map((photo) => photo.caption || "");
  const reviewDraft = useMemo(
    () => generateCompletedJobReviewRequest(job, googleReviewUrl),
    [googleReviewUrl, job],
  );
  const summaryDrafts = useMemo(
    () => generateCompletedJobSummaryDrafts({ completionNotes, job, selectedPhotoCaptions }),
    [completionNotes, job, selectedPhotoCaptions],
  );

  function togglePhoto(photoId: string) {
    setSelectedPhotoIds((current) =>
      current.includes(photoId) ? current.filter((id) => id !== photoId) : [...current, photoId],
    );
  }

  return (
    <section className="marketing-workspace">
      <div className="document-workspace-heading">
        <div>
          <p className="surface-label">
            <Megaphone aria-hidden="true" size={18} />
            Completed job workflow
          </p>
          <h2>Prepare the follow-up before anything leaves the office.</h2>
        </div>
      </div>

      <div className="marketing-privacy-note">
        <ShieldCheck aria-hidden="true" size={18} />
        <p>
          Photos remain internal by default. Confirm customer permission before using any photo publicly.
          Draft copy removes contact details and street-address-like text.
        </p>
      </div>

      {!googleReviewUrl ? (
        <p className="form-message error">
          Add `NEXT_PUBLIC_GOOGLE_REVIEW_URL` to configure the Google review destination. Drafts currently show a placeholder.
        </p>
      ) : null}

      <div className="email-draft-grid">
        <EmailDraftCard draft={reviewDraft.email} label="Review request email draft" />
        <CopyDraftCard body={reviewDraft.textMessageBody} label="Review request text draft" note="Draft only. This does not send a text message." />
      </div>

      <div className="marketing-control-grid">
        <section className="marketing-control-panel">
          <h3><Camera aria-hidden="true" size={18} /> Before / after candidates</h3>
          <p>Select photos to help shape the drafts. Selection is local only and does not publish anything.</p>
          {candidatePhotos.length === 0 ? (
            <p className="inline-empty">No before or after photos attached yet.</p>
          ) : (
            <div className="marketing-photo-selector">
              {candidatePhotos.map((photo) => (
                <label key={photo.id}>
                  <input
                    checked={selectedPhotoIds.includes(photo.id)}
                    onChange={() => togglePhoto(photo.id)}
                    type="checkbox"
                  />
                  {photo.signed_url ? (
                    <img alt={photo.caption || `${photo.photo_type} job photo`} loading="lazy" src={photo.signed_url} />
                  ) : (
                    <span>Preview unavailable</span>
                  )}
                  <small>{photo.photo_type}{photo.caption ? `: ${photo.caption}` : ""}</small>
                </label>
              ))}
            </div>
          )}
        </section>

        <section className="marketing-control-panel">
          <h3><CheckCircle2 aria-hidden="true" size={18} /> Public gallery eligibility</h3>
          <p>These controls are a planning scaffold. They are not saved and cannot publish photos.</p>
          <label className="marketing-checkbox">
            <input checked={permissionConfirmed} onChange={(event) => setPermissionConfirmed(event.target.checked)} type="checkbox" />
            Customer permission confirmed for public photo use
          </label>
          <label className="marketing-checkbox">
            <input
              checked={galleryEligible}
              disabled={!permissionConfirmed}
              onChange={(event) => setGalleryEligible(event.target.checked)}
              type="checkbox"
            />
            Eligible for future public gallery review
          </label>
        </section>

        <section className="marketing-control-panel">
          <h3><MessageSquareText aria-hidden="true" size={18} /> Customer follow-up note</h3>
          <p>Local note scaffold only. Save this to the CRM after note-purpose tracking is designed.</p>
          <textarea
            maxLength={600}
            onChange={(event) => setFollowUpNote(event.target.value)}
            placeholder="Customer feedback, permission conversation, or follow-up needed..."
            rows={5}
            value={followUpNote}
          />
          <small>{followUpNote.length}/600 characters. Not saved.</small>
        </section>

        <section className="marketing-control-panel">
          <h3><Megaphone aria-hidden="true" size={18} /> Public completion notes</h3>
          <p>Add only details that are appropriate for a public draft. This remains local and unsaved.</p>
          <textarea
            maxLength={600}
            onChange={(event) => setCompletionNotes(event.target.value)}
            placeholder="Example: Removed storm-damaged limbs and completed a full cleanup."
            rows={5}
            value={completionNotes}
          />
        </section>
      </div>

      <div className="marketing-draft-grid">
        <CopyDraftCard body={summaryDrafts.googleBusinessPost} label="Google Business post draft" />
        <CopyDraftCard body={summaryDrafts.facebookPost} label="Facebook post draft" />
        <CopyDraftCard body={summaryDrafts.websiteGalleryCaption} label="Website gallery caption draft" />
      </div>
    </section>
  );
}
