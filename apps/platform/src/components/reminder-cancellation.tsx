"use client";
import { useRouter } from "next/navigation";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { cancelScheduledCommunication, type CommunicationActionState } from "@/lib/actions/communications";
import { formatBusinessDateTime } from "@/lib/business-time";
import type { CustomerCommunication } from "@/lib/types/database";
const initialState: CommunicationActionState = { status: "idle", message: "" };
const formatType = (value: string) => value.replaceAll("_", " ");
const formatDateTime = (value: string) => formatBusinessDateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });

export function ReminderCancellation({ communication, refreshAfter = false }: { communication: CustomerCommunication; refreshAfter?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useReliableActionState(async (previous: CommunicationActionState, form: FormData) => {
    const result = await cancelScheduledCommunication(previous, form);
    if (refreshAfter) router.refresh();
    return result;
  }, initialState);
  return (
    <form action={action}>
      <input name="communication_id" type="hidden" value={communication.id} />
      <input name="expected_updated_at" type="hidden" value={communication.updated_at} />
      <button
        aria-label={`Cancel ${formatType(communication.communication_type)} scheduled ${formatDateTime(communication.scheduled_for)}`}
        className="secondary-action"
        disabled={pending || !communication.updated_at}
        type="submit"
      >{pending ? "Cancelling..." : "Cancel"}</button>
      {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  );
}
