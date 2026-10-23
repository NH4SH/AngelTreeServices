import type { PortalTokenActionState } from "../actions/portal-tokens";
import { customerQuoteState } from "./customer-states";

/** Current closed status wins; open records need a confirmed server result. */
export function proposalResponseOutcome(status: string, approval: PortalTokenActionState, changes: PortalTokenActionState) {
  const current = customerQuoteState(status);
  if (!current.canRespond) return { kind: status, statusLabel: current.title, title: current.title, message: current.message };
  if (approval.ok && approval.status === "success") return { kind: "approved", statusLabel: "Approved", title: "Proposal approved", message: approval.message };
  if (changes.ok && changes.status === "success") return { kind: "change_requested", statusLabel: "Changes requested", title: "Change request saved", message: changes.message };
  return null;
}
