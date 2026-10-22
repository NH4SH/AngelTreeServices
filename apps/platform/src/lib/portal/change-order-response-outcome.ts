import type { ChangeOrderActionState } from "../action-states/change-orders";

/** Only a confirmed server result can select an outcome; old errors and submitted intent cannot. */
export function changeOrderResponseOutcome(approval: ChangeOrderActionState, response: ChangeOrderActionState) {
  const saved = approval.status === "success" ? approval : response.status === "success" ? response : null;
  if (!saved) return null;
  switch (saved.responseOutcome) {
    case "approved": return { kind: "approved", title: "Additional work approved", message: saved.message, nextStep: "Our office will confirm any schedule or coordination changes. No further response is needed here." };
    case "change_requested": return { kind: "change_requested", title: "Changes requested", message: saved.message, nextStep: "Please wait for an updated change order before approving the additional work." };
    case "declined": return { kind: "declined", title: "Additional work declined", message: saved.message, nextStep: "No further response is needed. Contact our office if you would like to discuss this additional work." };
    default: return { kind: "saved", title: "Response saved", message: saved.message, nextStep: "View the current change order below, or contact our office if you have questions." };
  }
}
