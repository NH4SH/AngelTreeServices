"use client";

import { Ban, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import type { SenderBlock, SenderControls } from "@/lib/leads/sender-blocks";
import { changeWebsiteSenderBlock } from "./lead-actions";

type Props = { sender: SenderControls; block?: never } | { block: SenderBlock; sender?: never };

export function SenderBlockControls(props: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const available = props.sender && ["email", "phone"].some(k => props.sender!.contacts[k as "email" | "phone"] && !props.sender!.blockedKinds.includes(k as "email" | "phone"));
  if (props.sender && !available && !open) return <p className="sender-block-state">{props.sender.blockedKinds.length ? "Sender blocked · Manage blocks below to unblock." : "No valid email or phone available to block."}</p>;
  return <>
    {props.sender?.blockedKinds.length ? <p className="sender-block-state">{props.sender.blockedKinds.map(k => k === "email" ? "Email" : "Phone").join(" and ")} blocked</p> : null}
    <button className="secondary-action compact-action" onClick={() => setOpen(true)} type="button">
      {props.block ? <RotateCcw aria-hidden="true" size={16} /> : <Ban aria-hidden="true" size={16} />}
      {props.block ? "Unblock" : props.sender?.blockedKinds.length ? "Block another contact" : "Block sender"}
    </button>
    {open ? <SenderConfirmation {...props} onClose={() => { setOpen(false); router.refresh(); }} /> : null}
  </>;
}

function SenderConfirmation({ sender, block, onClose }: Props & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = useId(), description = useId();
  const [request] = useState(() => crypto.randomUUID());
  const [email, setEmail] = useState(Boolean(sender?.contacts.email && !sender.blockedKinds.includes("email")));
  const [phone, setPhone] = useState(false);
  const [state, action, pending] = useReliableActionState(changeWebsiteSenderBlock, { status: "idle", message: "" });
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); }, []);
  const success = state.status === "success";
  return <dialog aria-labelledby={title} aria-describedby={description} className="record-lifecycle-dialog sender-block-dialog" ref={dialog}
    onCancel={event => { if (pending) event.preventDefault(); }} onClose={onClose}>
    <form action={action} className="record-lifecycle-form">
      <header><h2 id={title}>{block ? "Unblock this contact?" : "Block sender"}</h2>
        <button aria-label="Close sender confirmation" className="icon-button" disabled={pending} onClick={() => dialog.current?.close()} type="button"><X aria-hidden="true" size={20} /></button>
      </header>
      <p id={description}>{block
        ? "Allow new website requests from this contact. Other matching blocks stay active. Old spam leads and blocked requests will not be restored or resent."
        : "Keep new website requests matching either selected contact out of active leads. History stays available. You can unblock each contact later."}</p>
      <input name="intent" type="hidden" value={block ? "unblock" : "block"} />
      <input name="request_id" type="hidden" value={request} />
      {block ? <><input name="block_id" type="hidden" value={block.id} /><p className="sender-block-identity"><strong>{block.kind === "email" ? "Email" : "Phone"}:</strong> {block.value}</p></> : <>
        <input name="job_id" type="hidden" value={sender.jobId} />
        <input name="email" type="hidden" value={sender.contacts.email ?? ""} />
        <input name="phone" type="hidden" value={sender.contacts.phone ?? ""} />
        <fieldset className="sender-block-choices" disabled={pending || success}>
          <legend>Block requests that match</legend>
          {sender.contacts.email ? <label><input checked={email} disabled={sender.blockedKinds.includes("email")} name="block_email" onChange={e => setEmail(e.target.checked)} type="checkbox" /><span>Email: {sender.contacts.email}{sender.blockedKinds.includes("email") ? " (already blocked)" : ""}</span></label> : null}
          {sender.contacts.phone ? <label><input checked={phone} disabled={sender.blockedKinds.includes("phone")} name="block_phone" onChange={e => setPhone(e.target.checked)} type="checkbox" /><span>Phone: {sender.contacts.phone}{sender.blockedKinds.includes("phone") ? " (already blocked)" : ""}</span></label> : null}
        </fieldset>
        <p className="muted">A shared email or phone will block requests from everyone using that contact. Choose only the contact you intend to block.</p>
      </>}
      <label className="confirmation-field"><span>{block ? "Reason for unblocking" : "Reason for blocking"}</span>
        <textarea disabled={pending || success} maxLength={500} minLength={5} name="reason" required rows={3} />
      </label>
      {state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      <footer><button className={success ? "primary-action" : "secondary-action"} disabled={pending} onClick={() => dialog.current?.close()} ref={cancel} type="button">{success ? "Done" : "Cancel"}</button>
        {!success ? <button className="primary-action" disabled={pending || (!block && !email && !phone)} type="submit">{pending ? "Saving…" : block ? "Unblock contact" : "Block selected contacts"}</button> : null}
      </footer>
    </form>
  </dialog>;
}
