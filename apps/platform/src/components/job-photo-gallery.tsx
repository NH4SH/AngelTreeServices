import { Camera, ImageOff } from "lucide-react";
import type { JobPhotoType, SignedJobPhoto } from "@/lib/types/database";

const galleryGroups: { photoType: JobPhotoType; title: string }[] = [
  { photoType: "before", title: "Before photos" },
  { photoType: "after", title: "After photos" },
  { photoType: "issue", title: "Issue or hazard photos" },
  { photoType: "completion", title: "Completion photos" },
];

export function JobPhotoGallery({ photos }: { photos: SignedJobPhoto[] }) {
  return (
    <div className="job-photo-gallery">
      {galleryGroups.map((group) => (
        <PhotoGroup
          key={group.photoType}
          photos={photos.filter((photo) => photo.photo_type === group.photoType)}
          title={group.title}
        />
      ))}
    </div>
  );
}

function PhotoGroup({ photos, title }: { photos: SignedJobPhoto[]; title: string }) {
  return (
    <section className="photo-group">
      <h3>{title}</h3>
      {photos.length === 0 ? (
        <p>No photos yet.</p>
      ) : (
        <ul className="photo-thumbnail-grid">
          {photos.map((photo) => (
            <li key={photo.id}>
              {photo.signed_url ? (
                <a href={photo.signed_url} rel="noreferrer" target="_blank">
                  <img
                    alt={photo.caption || `${title} job photo`}
                    loading="lazy"
                    src={photo.signed_url}
                  />
                </a>
              ) : (
                <span className="photo-thumbnail-unavailable" role="note">
                  <ImageOff aria-hidden="true" size={20} />
                  Preview unavailable
                </span>
              )}
              <span className="photo-thumbnail-caption">
                <Camera aria-hidden="true" size={14} />
                {photo.caption || formatCreatedAt(photo.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
