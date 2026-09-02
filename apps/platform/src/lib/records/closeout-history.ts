type CloseoutRecord = {
  acknowledgment_status: string | null;
  additional_work_requested: boolean | null;
  created_at: string;
  crew_internal_notes: string | null;
  customer_summary: string | null;
  incident_occurred: boolean | null;
  reopen_reason: string | null;
  reopened_at: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  status: string;
  submitted_at: string | null;
  updated_at: string;
};

type CloseoutChildRecord = {
  created_at: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

export function hasMeaningfulCloseoutRecord(record: CloseoutRecord) {
  return record.status !== "draft"
    || record.updated_at > record.created_at
    || record.crew_internal_notes !== null
    || record.customer_summary !== null
    || record.incident_occurred !== null
    || record.additional_work_requested !== null
    || record.acknowledgment_status !== null
    || record.submitted_at !== null
    || record.reviewed_at !== null
    || record.review_notes !== null
    || record.reopened_at !== null
    || record.reopen_reason !== null;
}

export function hasMeaningfulCloseoutChild(record: CloseoutChildRecord) {
  return record.updated_by_user_id !== null || record.updated_at > record.created_at;
}
