export type WebsiteLeadArchiveRecord = {
  archived_at: string | null;
  lead_disposition: "active" | "spam" | "archived";
};

export function getWebsiteLeadArchiveDecision(record?: WebsiteLeadArchiveRecord | null) {
  if (record?.lead_disposition === "active" && !record.archived_at) return "archive" as const;
  if (record?.lead_disposition === "archived" && record.archived_at) return "already_archived" as const;
  return "skip" as const;
}
