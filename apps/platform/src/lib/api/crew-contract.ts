import { completionChecklistItems } from "@/lib/crew/completion-checklist";
import { getDirectionsUrl } from "@/lib/maps";
import type {
  CrewJob,
  JobCloseoutBundle,
  JobPhotoType,
  JobPhotoUploadCategory,
  SignedJobPhoto,
} from "@/lib/types/database";

export const crewApiVersion = "2026-05-31";
export const crewJobScopes = ["today", "upcoming", "active"] as const;
export type CrewJobScope = (typeof crewJobScopes)[number];

type CrewPhotoSummary = Record<JobPhotoUploadCategory, number>;

export type CrewApiJobListItem = {
  id: string;
  status: CrewJob["status"];
  serviceType: string | null;
  priority: CrewJob["priority"];
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  scope: string | null;
  customer: {
    name: string;
    phone: string | null;
  } | null;
  serviceLocation: {
    label: string | null;
    street: string;
    city: string;
    state: string;
    postalCode: string | null;
  } | null;
  photoSummary: CrewPhotoSummary;
  actions: {
    callUrl: string | null;
    directionsUrl: string | null;
    messageUrl: string | null;
  };
};

export type CrewApiJobDetail = CrewApiJobListItem & {
  completedAt: string | null;
  serviceLocation: (NonNullable<CrewApiJobListItem["serviceLocation"]> & {
    accessNotes: string | null;
    gateCode: string | null;
    serviceNotes: string | null;
  }) | null;
  crewVisibleNotes: {
    id: string;
    body: string;
    createdAt: string;
  }[];
  completionChecklist: {
    persisted: boolean;
    items: {
      label: string;
      completed: boolean;
      status: "pending" | "complete" | "not_applicable";
    }[];
  };
};

export type CrewApiJobPhoto = {
  id: string;
  photoType: JobPhotoType;
  caption: string | null;
  createdAt: string;
  signedUrl: string | null;
};

export function toCrewApiJobListItem(job: CrewJob): CrewApiJobListItem {
  const phone = job.customers?.phone ?? null;
  const location = job.service_locations;

  return {
    id: job.id,
    status: job.status,
    serviceType: job.service_type,
    priority: job.priority,
    scheduledStartAt: job.scheduled_start_at,
    scheduledEndAt: job.scheduled_end_at,
    scope: job.requested_scope,
    customer: job.customers
      ? {
          name: job.customers.display_name,
          phone,
        }
      : null,
    serviceLocation: location
      ? {
          label: location.label,
          street: location.street,
          city: location.city,
          state: location.state,
          postalCode: location.postal_code,
        }
      : null,
    photoSummary: getPhotoSummary(job),
    actions: {
      callUrl: phone ? `tel:${phone}` : null,
      directionsUrl: getDirectionsUrl(location),
      messageUrl: phone ? `sms:${phone}` : null,
    },
  };
}

export function toCrewApiJobDetail(job: CrewJob, closeout?: JobCloseoutBundle | null): CrewApiJobDetail {
  const listItem = toCrewApiJobListItem(job);
  const location = job.service_locations;

  return {
    ...listItem,
    completedAt: job.completed_at,
    serviceLocation: location
      ? {
          ...listItem.serviceLocation!,
          accessNotes: location.access_notes,
          gateCode: location.gate_code,
          serviceNotes: location.service_notes,
        }
      : null,
    crewVisibleNotes: (job.notes ?? [])
      .filter((note) => note.visibility === "crew_visible")
      .map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.created_at,
      })),
    completionChecklist: {
      persisted: Boolean(closeout),
      items: closeout
        ? closeout.checklist.map((item) => ({
            label: item.label,
            completed: item.completion_status === "complete",
            status: item.completion_status,
          }))
        : completionChecklistItems.map((label) => ({
            label,
            completed: false,
            status: "pending" as const,
          })),
    },
  };
}

export function toCrewApiJobPhoto(photo: SignedJobPhoto): CrewApiJobPhoto {
  return {
    id: photo.id,
    photoType: photo.photo_type,
    caption: photo.caption,
    createdAt: photo.created_at,
    signedUrl: photo.signed_url,
  };
}

export function filterCrewJobsByScope(
  jobs: CrewJob[],
  scope: CrewJobScope,
  dateKey: string,
) {
  if (scope === "active") {
    return jobs;
  }

  return jobs.filter((job) => {
    const jobDateKey = getEasternDateKey(job.scheduled_start_at);

    if (!jobDateKey) {
      return false;
    }

    return scope === "today" ? jobDateKey === dateKey : jobDateKey > dateKey;
  });
}

export function getDefaultEasternDateKey() {
  return getEasternDateKey(new Date().toISOString())!;
}

function getPhotoSummary(job: CrewJob): CrewPhotoSummary {
  const summary: CrewPhotoSummary = {
    after: 0,
    before: 0,
    completion: 0,
    during: 0,
    equipment_access: 0,
    issue: 0,
  };

  (job.job_photos ?? []).forEach((photo) => {
    if (photo.photo_type in summary) {
      summary[photo.photo_type as JobPhotoUploadCategory] += 1;
    }
  });

  return summary;
}

function getEasternDateKey(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/New_York",
    year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");

  return year && month && day ? `${year}-${month}-${day}` : null;
}
