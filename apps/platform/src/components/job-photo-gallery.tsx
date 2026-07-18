import { Camera, ImageOff } from "lucide-react";
import type { JobPhotoType, SignedJobPhoto } from "@/lib/types/database";

const galleryGroups: { photoType: JobPhotoType; title: string }[] = [
  { photoType: "before", title: "Before photos" },
  { photoType: "during", title: "During-work photos" },
  { photoType: "after", title: "After photos" },
  { photoType: "issue", title: "Issue or hazard photos" },
  { photoType: "equipment_access", title: "Equipment and access photos" },
  { photoType: "completion", title: "Completion photos" },
];

export function JobPhotoGallery({ photos }: { photos: SignedJobPhoto[] }) {
  if (photos.length === 0) {
    return (
      <div className="job-photo-empty">
        <ImageOff aria-hidden="true" size={22} />
        <div><strong>No photos yet.</strong><span>Add photos from the crew work order when they are useful.</span></div>
      </div>
    );
  }

  return (
    <div className="job-photo-gallery">
      {galleryGroups.filter((group) => photos.some((photo) => photo.photo_type === group.photoType)).map((group) => (
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
      <div className="photo-group-heading">
        <h3>{title}</h3>
        <span>{photos.length} {photos.length === 1 ? "photo" : "photos"}</span>
      </div>
      {photos.length === 0 ? (
        <p className="photo-group-empty">No photos yet.</p>
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
