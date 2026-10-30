"use client";
import {useState} from "react";
export function AdditionalEmailOption({checked,onChange,disabled}:{checked:boolean;onChange:(checked:boolean)=>void;disabled:boolean}) {
  const [requestId,setRequestId]=useState('');
  return <details className="additional-email-option"><summary>Additional email</summary><p className="form-helper">Use this for an additional message or to replace a saved email that has never been dispatched. You can edit this message before sending. Uncertain deliveries must be reviewed first.</p>
    <label><input type="checkbox" name="email_additional_copy" value="1" checked={checked} disabled={disabled} onChange={event=>{if(event.target.checked)setRequestId(crypto.randomUUID());onChange(event.target.checked);}}/> Send an additional email for this version</label>
    <input type="hidden" name="email_copy_request_id" value={requestId}/>
  </details>;
}
