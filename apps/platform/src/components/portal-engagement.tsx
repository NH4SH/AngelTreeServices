import { Eye, EyeOff } from "lucide-react";

type PortalEngagement = {
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
};

export function PortalViewStatus({ engagement }: { engagement: PortalEngagement }) {
  if (!engagement.last_viewed_at || engagement.view_count < 1) {
    return (
      <span className="portal-view-status not-viewed">
        <EyeOff aria-hidden="true" size={14} />
        Not viewed
      </span>
    );
  }

  return (
    <span
      className="portal-view-status viewed"
      title={`Last viewed ${formatAbsoluteDateTime(engagement.last_viewed_at)}`}
    >
      <Eye aria-hidden="true" size={14} />
      {formatRelativeView(engagement.last_viewed_at)}
    </span>
  );
}

export function PortalEngagementPanel({ engagement }: { engagement: PortalEngagement }) {
  return (
    <section className="commerce-side-panel portal-engagement-panel">
      <h2 className="panel-title"><Eye aria-hidden="true" size={18} />Customer activity</h2>
      {!engagement.first_viewed_at || !engagement.last_viewed_at || engagement.view_count < 1 ? (
        <p className="inline-empty">Not viewed yet.</p>
      ) : (
        <dl className="record-details portal-engagement-details">
          <div>
            <dt>First viewed</dt>
            <dd>{formatAbsoluteDateTime(engagement.first_viewed_at)}</dd>
          </div>
          <div>
            <dt>Last viewed</dt>
            <dd>{formatAbsoluteDateTime(engagement.last_viewed_at)}</dd>
          </div>
          <div>
            <dt>Views</dt>
            <dd>{engagement.view_count} meaningful {engagement.view_count === 1 ? "session" : "sessions"}</dd>
          </div>
        </dl>
      )}
      <p className="portal-engagement-note">
        Views represent approximate portal sessions and may not identify the specific person who opened the link.
      </p>
    </section>
  );
}

function formatRelativeView(value: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));

  if (elapsedMinutes < 1) return "Viewed just now";
  if (elapsedMinutes < 60) return `Viewed ${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"} ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Viewed ${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} ago`;
  if (elapsedHours < 48) return "Viewed yesterday";

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 30) return `Viewed ${elapsedDays} days ago`;

  return `Viewed ${formatShortDate(value)}`;
}

function formatAbsoluteDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(value));
}
