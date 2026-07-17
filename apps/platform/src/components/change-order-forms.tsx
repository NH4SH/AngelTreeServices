"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Copy, FilePlus2, Link2, Mail, Plus, Save, Send, ShieldCheck, Trash2, X } from "lucide-react";
import {
  createChangeOrder,
  createChangeOrderPortalLink,
  attachApprovedChangeOrdersToInvoice,
  duplicateChangeOrder,
  manuallyApproveChangeOrder,
  regenerateChangeOrderPortalLink,
  revokeChangeOrderPortalLink,
  sendChangeOrderEmail,
  updateChangeOrder,
  updateChangeOrderWorkflow,
} from "@/lib/actions/change-orders";
import {
  initialChangeOrderActionState,
  type ChangeOrderActionState,
} from "@/lib/action-states/change-orders";
import type { ChangeOrderJobOption, ChangeOrderTokenSummary } from "@/lib/data/change-orders";
import type { MaterialRecord } from "@/lib/data/materials";
import type { ChangeOrderWithRelations, OrganizationContact, ServiceCategory } from "@/lib/types/database";

type LineDraft = {
  clientId: string;
  persistedId?: string;
  title: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  categoryId: string;
  materialId: string;
  internalCost: string;
};

export function ChangeOrderEditor({
  canViewCosts,
  contacts,
  defaultJobId = "",
  jobs,
  materials,
  order,
  serviceCategories,
  sourceCloseoutId = "",
}: {
  canViewCosts: boolean;
  contacts: OrganizationContact[];
  defaultJobId?: string;
  jobs: ChangeOrderJobOption[];
  materials: MaterialRecord[];
  order?: ChangeOrderWithRelations;
  serviceCategories: ServiceCategory[];
  sourceCloseoutId?: string;
}) {
  const action = order ? updateChangeOrder : createChangeOrder;
  const [state, formAction, pending] = useActionState(action, initialChangeOrderActionState);
  const [selectedJobId, setSelectedJobId] = useState(order?.job_id ?? defaultJobId);
  const [lines, setLines] = useState<LineDraft[]>(order?.change_order_line_items?.length
    ? [...order.change_order_line_items].sort((a, b) => a.sort_order - b.sort_order).map((line) => ({
        clientId: line.id,
        persistedId: line.id,
        title: line.title,
        description: line.description ?? "",
        quantity: String(line.quantity),
        unit: line.unit ?? "each",
        rate: (line.unit_price_cents / 100).toFixed(2),
        categoryId: line.service_category_id ?? "",
        materialId: line.material_id ?? "",
        internalCost: line.internal_cost_estimate_cents == null ? "" : (line.internal_cost_estimate_cents / 100).toFixed(2),
      }))
    : [newLine()]);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const matchingContacts = useMemo(
    () => contacts.filter((contact) => selectedJob?.organization_id && contact.organization_id === selectedJob.organization_id && contact.is_active),
    [contacts, selectedJob?.organization_id],
  );
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const closeHref = order ? `/admin/change-orders/${order.id}` : "/admin/change-orders";

  return (
    <form action={formAction} className="crm-form change-order-editor">
      {state.message ? <ActionMessage state={state} /> : null}
      {order ? <input name="change_order_id" type="hidden" value={order.id} /> : null}
      <input name="source_closeout_id" type="hidden" value={order?.source_closeout_id ?? sourceCloseoutId} />
      <input name="source_quote_id" type="hidden" value={order?.source_quote_id ?? selectedJob?.source_quote_id ?? ""} />

      <section className="quote-editor-section">
        <div>
          <p className="surface-label"><FilePlus2 size={17} /> Additional work</p>
          <h2>{order ? `Edit ${order.change_order_number}` : "Create change order"}</h2>
          <p>Keep this separate from the original approved quote. Pricing reaches the customer only after office review.</p>
        </div>
        <label>
          Work order
          <select disabled={Boolean(order)} name="job_id" onChange={(event) => setSelectedJobId(event.target.value)} required value={selectedJobId}>
            <option value="">Choose work order</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>{jobLabel(job)}</option>
            ))}
          </select>
        </label>
        {order ? <input name="job_id" type="hidden" value={order.job_id ?? ""} /> : null}
        <div className="form-grid-two">
          <label>
            Title
            <input defaultValue={order?.title ?? ""} maxLength={180} name="title" placeholder="Additional tree removal near rear fence" required />
          </label>
          <label>
            Reason for change
            <input defaultValue={order?.reason ?? ""} name="reason" placeholder="Customer request, hidden condition, changed access..." />
          </label>
        </div>
        <label>
          Customer-visible description
          <textarea defaultValue={order?.customer_description ?? ""} name="customer_description" placeholder="Explain why the additional work is needed and what will change." rows={5} />
        </label>
        <div className="form-grid-two">
          <label>
            Requested by
            <select defaultValue={order?.requested_by_contact_id ?? ""} disabled={!selectedJob?.organization_id} name="requested_by_contact_id">
              <option value="">{selectedJob?.organization_id ? "Choose organization contact" : "Individual customer / not specified"}</option>
              {matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name} - {contactRole(contact)}</option>)}
            </select>
          </label>
          <label>
            Approval contact
            <select defaultValue={order?.approval_contact_id ?? ""} disabled={!selectedJob?.organization_id} name="approval_contact_id">
              <option value="">{selectedJob?.organization_id ? "Choose approval contact" : "Customer on work order"}</option>
              {matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name} - {contactRole(contact)}</option>)}
            </select>
          </label>
        </div>
        {selectedJob?.organization_id && matchingContacts.length === 0 ? <p className="form-message warning">This organization has no active contacts. Add an approval contact before sending.</p> : null}
      </section>

      <section className="quote-editor-section">
        <div className="quote-editor-section-header">
          <div><p className="surface-label">Added scope</p><h3>Change-order line items</h3></div>
          <button className="secondary-action" onClick={() => setLines((current) => [...current, newLine()])} type="button"><Plus size={17} /> Add line item</button>
        </div>
        <div className="change-order-lines">
          {lines.map((line, index) => (
            <article className="change-order-line" key={line.clientId}>
              <input name="line_id" type="hidden" value={line.persistedId ?? ""} />
              <div className="change-order-line-heading"><strong>Item {index + 1}</strong><button aria-label={`Remove item ${index + 1}`} className="icon-action secondary-action" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.clientId !== line.clientId))} type="button"><Trash2 size={17} /></button></div>
              <label>Title<input name="line_title" onChange={(event) => patchLine(setLines, line.clientId, "title", event.target.value)} required value={line.title} /></label>
              <label>Description / scope<textarea className="scope-textarea" name="line_description" onChange={(event) => patchLine(setLines, line.clientId, "description", event.target.value)} placeholder={'- Describe the added work\n- Preserve line breaks and bullets\n- Include customer-visible conditions'} rows={6} value={line.description} /></label>
              <div className="form-grid-three">
                <label>Quantity<input min="0.01" name="line_quantity" onChange={(event) => patchLine(setLines, line.clientId, "quantity", event.target.value)} step="0.01" type="number" value={line.quantity} /></label>
                <label>Unit<input name="line_unit" onChange={(event) => patchLine(setLines, line.clientId, "unit", event.target.value)} placeholder="each, hour, load" value={line.unit} /></label>
                <label>Rate<input min="0" name="line_rate" onChange={(event) => patchLine(setLines, line.clientId, "rate", event.target.value)} step="0.01" type="number" value={line.rate} /></label>
              </div>
              <div className="form-grid-two">
                <label>Service category<select name="line_service_category_id" onChange={(event) => patchLine(setLines, line.clientId, "categoryId", event.target.value)} value={line.categoryId}><option value="">Not specified</option>{serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
                <label>Material reference<select name="line_material_id" onChange={(event) => patchLine(setLines, line.clientId, "materialId", event.target.value)} value={line.materialId}><option value="">No material reference</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></label>
              </div>
              {canViewCosts ? <label>Internal cost estimate<input min="0" name="line_internal_cost" onChange={(event) => patchLine(setLines, line.clientId, "internalCost", event.target.value)} step="0.01" type="number" value={line.internalCost} /><span className="field-note">Internal only. Never shown in the customer portal.</span></label> : <input name="line_internal_cost" type="hidden" value="" />}
              <p className="change-order-line-total"><span>Line total</span><strong>{money(lineTotal(line))}</strong></p>
            </article>
          ))}
        </div>
        <div className="form-grid-two">
          <label>Tax<input defaultValue={(order?.tax_cents ?? 0) / 100 || ""} min="0" name="tax" step="0.01" type="number" /></label>
          <label>Fees<input defaultValue={(order?.fee_cents ?? 0) / 100 || ""} min="0" name="fees" step="0.01" type="number" /></label>
        </div>
        <dl className="quote-editor-totals"><div><dt>Added subtotal</dt><dd>{money(subtotal)}</dd></div><div><dt>Original approved amount</dt><dd>{money(order?.original_approved_amount_cents ?? 0)}</dd></div></dl>
      </section>

      <section className="quote-editor-section">
        <div><p className="surface-label">Coordination</p><h3>Notes and possible schedule impact</h3></div>
        <label>Customer-visible notes<textarea defaultValue={order?.customer_notes ?? ""} name="customer_notes" placeholder="Terms or coordination notes the customer should see" rows={4} /></label>
        <label>Internal office / crew supporting notes<textarea defaultValue={order?.internal_notes ?? ""} name="internal_notes" placeholder="Crew request, photo references, pricing rationale, or office review notes" rows={5} /></label>
        <label>Approval expires<input defaultValue={order?.expires_at?.slice(0, 10) ?? ""} name="expires_on" type="date" /></label>
        <fieldset className="change-order-impact-grid"><legend>Could this affect any of these?</legend>{impactOptions.map(([key, label]) => <label className="checkbox-field" key={key}><input defaultChecked={Boolean(order?.schedule_impact?.[key])} name={`impact_${key}`} type="checkbox" />{label}</label>)}</fieldset>
        <p className="field-note">Approval records the impact. It never moves the scheduled job automatically.</p>
      </section>

      <div className="quote-editor-action-bar">
        <button disabled={pending} name="submit_intent" type="submit" value="save"><Save size={17} />{pending ? "Saving..." : order ? "Save changes" : "Save draft"}</button>
        <button className="secondary-action" disabled={pending} name="submit_intent" type="submit" value={order ? "save_close" : "review"}><ShieldCheck size={17} />{order ? "Save and close" : "Save for review"}</button>
        <Link className="secondary-action" href={closeHref}><X size={17} /> Cancel</Link>
      </div>
    </form>
  );
}

export function ChangeOrderWorkflowPanel({ order }: { order: ChangeOrderWithRelations }) {
  const [workflowState, workflowAction, workflowPending] = useActionState(updateChangeOrderWorkflow, initialChangeOrderActionState);
  const [emailState, emailAction, emailPending] = useActionState(sendChangeOrderEmail, initialChangeOrderActionState);
  const [manualState, manualAction, manualPending] = useActionState(manuallyApproveChangeOrder, initialChangeOrderActionState);
  const open = ["draft", "pending_internal_review", "ready_to_send", "sent", "change_requested"].includes(order.status);
  return (
    <div className="change-order-workflow-stack">
      <p className={`status-pill change-order-status ${order.status}`}>{formatStatus(order.status)}</p>
      {workflowState.message ? <ActionMessage state={workflowState} /> : null}
      {emailState.message ? <ActionMessage state={emailState} /> : null}
      {order.status === "draft" || order.status === "change_requested" ? <WorkflowButton action={workflowAction} disabled={workflowPending} id={order.id} intent="request_review" label="Send for internal review" icon={<ShieldCheck size={17} />} /> : null}
      {["draft", "pending_internal_review", "change_requested"].includes(order.status) ? <WorkflowButton action={workflowAction} disabled={workflowPending} id={order.id} intent="approve_internal" label="Approve internally" icon={<CheckCircle2 size={17} />} /> : null}
      {["pending_internal_review", "ready_to_send"].includes(order.status) ? <WorkflowButton action={workflowAction} disabled={workflowPending} id={order.id} intent="return_clarification" label="Return for clarification" icon={<X size={17} />} secondary /> : null}
      {["ready_to_send", "sent"].includes(order.status) ? <form action={emailAction}><input name="change_order_id" type="hidden" value={order.id} /><button disabled={emailPending} type="submit"><Mail size={17} />{emailPending ? "Sending..." : order.status === "sent" ? "Resend approval email" : "Send for customer approval"}</button></form> : null}
      {open ? <details className="change-order-manual-approval"><summary>Record approval received outside portal</summary><form action={manualAction} className="crm-form"><input name="change_order_id" type="hidden" value={order.id} /><label>Approver name<input name="approver_name" required /></label><label>Approval method<select name="approval_method" required><option value="phone">Phone</option><option value="email">Email outside CRM</option><option value="in_person">In person</option><option value="signed_paper">Signed paper</option><option value="other">Other documented method</option></select></label><label>Documentation notes<textarea name="approval_notes" required rows={3} /></label><button disabled={manualPending} type="submit"><CheckCircle2 size={17} />{manualPending ? "Recording..." : "Record manual approval"}</button>{manualState.message ? <ActionMessage state={manualState} /> : null}</form></details> : null}
      {open ? <form action={workflowAction} onSubmit={(event) => { if (!window.confirm("Cancel this change order? It will not change the original quote or work already approved.")) event.preventDefault(); }}><input name="change_order_id" type="hidden" value={order.id} /><input name="workflow_intent" type="hidden" value="cancel" /><button className="danger-secondary-action" disabled={workflowPending} type="submit">Cancel change order</button></form> : null}
    </div>
  );
}

export function ChangeOrderPortalPanel({ changeOrderId, tokens }: { changeOrderId: string; tokens: ChangeOrderTokenSummary[] }) {
  const [createState, createAction, createPending] = useActionState(createChangeOrderPortalLink, initialChangeOrderActionState);
  const [regenerateState, regenerateAction, regeneratePending] = useActionState(regenerateChangeOrderPortalLink, initialChangeOrderActionState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeChangeOrderPortalLink, initialChangeOrderActionState);
  const active = tokens.find((token) => !token.revoked_at && (!token.expires_at || new Date(token.expires_at).getTime() > Date.now()));
  const portalUrl = createState.portalUrl ?? regenerateState.portalUrl ?? active?.portalUrl ?? null;
  const busy = createPending || regeneratePending || revokePending;
  return (
    <div className="change-order-link-panel">
      <div><p className="surface-label"><Link2 size={17} /> Customer link</p><h2>{active ? "Active secure link" : "No active link"}</h2><p>Normal edits update this link and never revoke it.</p></div>
      {portalUrl ? <button className="secondary-action" onClick={() => void navigator.clipboard.writeText(portalUrl)} type="button"><Copy size={17} /> Copy customer link</button> : <form action={createAction}><input name="change_order_id" type="hidden" value={changeOrderId} /><button disabled={busy} type="submit"><Link2 size={17} />{createPending ? "Generating..." : "Generate link"}</button></form>}
      {[createState, regenerateState, revokeState].map((state, index) => state.message ? <ActionMessage key={index} state={state} /> : null)}
      {active ? <details><summary>Link controls</summary><p>Regenerating disables the previous customer link. Revoking disables access without creating a replacement.</p><form action={regenerateAction} onSubmit={(event) => { if (!window.confirm("Regenerating this link will disable the previous customer link.")) event.preventDefault(); }}><input name="change_order_id" type="hidden" value={changeOrderId} /><button className="secondary-action" disabled={busy} type="submit">{regeneratePending ? "Regenerating..." : "Regenerate link"}</button></form><form action={revokeAction} onSubmit={(event) => { if (!window.confirm("Revoke this customer link? The customer will no longer be able to open it.")) event.preventDefault(); }}><input name="change_order_id" type="hidden" value={changeOrderId} /><button className="danger-secondary-action" disabled={busy} type="submit">{revokePending ? "Revoking..." : "Revoke link"}</button></form></details> : null}
    </div>
  );
}

export function DuplicateChangeOrderButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(duplicateChangeOrder, initialChangeOrderActionState);
  return <form action={action}><input name="change_order_id" type="hidden" value={id} /><button className="secondary-action" disabled={pending} type="submit"><Copy size={17} />{pending ? "Copying..." : "Duplicate"}</button>{state.message ? <ActionMessage state={state} /> : null}</form>;
}

export function AttachApprovedChangeOrdersButton({ invoiceId }: { invoiceId: string }) {
  const [state, action, pending] = useActionState(attachApprovedChangeOrdersToInvoice, initialChangeOrderActionState);
  return <form action={action}><input name="invoice_id" type="hidden" value={invoiceId} /><button className="secondary-action" disabled={pending} type="submit"><FilePlus2 size={17} />{pending ? "Checking approved work..." : "Add approved change orders"}</button>{state.message ? <ActionMessage state={state} /> : null}<p className="field-note">Only approved, uninvoiced additions are copied. Draft, declined, and cancelled work is excluded.</p></form>;
}

function WorkflowButton({ action, disabled, icon, id, intent, label, secondary = false }: { action: (payload: FormData) => void; disabled: boolean; icon: React.ReactNode; id: string; intent: string; label: string; secondary?: boolean }) {
  return <form action={action}><input name="change_order_id" type="hidden" value={id} /><input name="workflow_intent" type="hidden" value={intent} /><button className={secondary ? "secondary-action" : undefined} disabled={disabled} type="submit">{icon}{label}</button></form>;
}
function ActionMessage({ state }: { state: ChangeOrderActionState }) { return <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>; }
function newLine(): LineDraft { return { clientId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, title: "", description: "", quantity: "1", unit: "each", rate: "", categoryId: "", materialId: "", internalCost: "" }; }
function patchLine(setLines: React.Dispatch<React.SetStateAction<LineDraft[]>>, id: string, key: keyof LineDraft, value: string) { setLines((current) => current.map((line) => line.clientId === id ? { ...line, [key]: value } : line)); }
function lineTotal(line: LineDraft) { return Math.round((Number.parseFloat(line.quantity) || 0) * (Number.parseFloat(line.rate) || 0) * 100); }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function formatStatus(status: string) { return status.replaceAll("_", " "); }
function contactRole(contact: OrganizationContact) { return contact.contact_roles?.length ? contact.contact_roles.map(formatStatus).join(", ") : contact.role_title || "Contact"; }
function jobLabel(job: ChangeOrderJobOption) { const party = job.organizations?.name ?? job.customers?.display_name ?? "Unknown account"; const place = job.service_locations?.label || job.service_locations?.street || "No property label"; return `${party} - ${place} - ${formatStatus(job.service_type ?? "work order")}`; }
const impactOptions = [["scheduled_date", "Scheduled date"], ["estimated_duration", "Estimated duration"], ["assigned_crew", "Assigned crew"], ["equipment", "Equipment"], ["materials", "Materials"], ["permits", "Permits"], ["subcontractors", "Subcontractors"]] as const;
