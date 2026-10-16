// Legacy statuses stay readable; new outcomes distinguish acceptance from delivery.
export function websiteLeadNoticeLabel(outcome: string | null, legacyStatus: string) {
  switch (outcome) {
    case "pending": return "Waiting for office notice";
    case "sending": return "In progress — review before retry";
    case "accepted": return "Accepted by email provider";
    case "unknown": return "Needs review before retry";
    case "rejected": return "Not accepted by email provider";
    case "not_attempted": return "Not sent — check email setup";
    default: return ({ pending: "Pending", sent: "Sent", failed: "Failed — review notice history", skipped: "Not sent" })[legacyStatus] ?? "Needs review";
  }
}
