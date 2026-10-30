"use client";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { retryAttachmentCheck, type FileCheckState } from "./actions";
const initial: FileCheckState = {status:"idle",message:""};
export function AttachmentScanControl({bucket,path}:{bucket:string;path:string}) {
  const [state,action,pending] = useReliableActionState(retryAttachmentCheck,initial);
  return <form action={action}>
    <input type="hidden" name="bucket" value={bucket}/><input type="hidden" name="path" value={path}/>
    <button className="secondary-action" disabled={pending} type="submit">{pending ? "Checking file…" : "Check file"}</button>
    {state.message ? <p aria-live="polite" className={`form-message ${state.status}`}>{state.message}</p> : null}
  </form>;
}
