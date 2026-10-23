import type { PortalTokenActionState } from "../actions/portal-tokens";
import { customerQuoteDisplayStatus, customerQuoteState } from "./customer-states";

/** Current closed status wins; open records need a confirmed server result. */
export function proposalResponseOutcome(status: string, approval: PortalTokenActionState, changes: PortalTokenActionState, expiresAt?: string | null, now = Date.now()) {
  // A confirmed response may have committed just before the displayed deadline.
  // Preserve its result; an explicitly closed server status still wins below.
  const saved = (approval.ok && approval.status === "success") || (changes.ok && changes.status === "success");
  const displayStatus = customerQuoteDisplayStatus(status, saved ? null : expiresAt, now);
  const current = customerQuoteState(displayStatus);
  if (!current.canRespond) return { kind: displayStatus, statusLabel: current.title, title: current.title, message: current.message };
  if (approval.ok && approval.status === "success") return { kind: "approved", statusLabel: "Approved", title: "Proposal approved", message: approval.message };
  if (changes.ok && changes.status === "success") return { kind: "change_requested", statusLabel: "Changes requested", title: "Change request saved", message: changes.message };
  return null;
}
