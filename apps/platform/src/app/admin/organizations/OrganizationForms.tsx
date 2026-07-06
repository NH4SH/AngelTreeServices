"use client";

import { useActionState } from "react";
import { Building2, MapPin, UserPlus } from "lucide-react";
import { createOrganization, createOrganizationContact, createOrganizationProperty, type OrganizationActionState } from "./actions";
import type { Customer, OrganizationType } from "@/lib/types/database";

const initialState: OrganizationActionState = { status: "idle", message: "" };
const types: OrganizationType[] = ["property_manager", "hoa", "commercial", "other"];

export function AddOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, initialState);
  return <form action={action} className="crm-form"><Message state={state} /><label>Name<input name="name" required /></label><label>Type<select defaultValue="property_manager" name="organization_type">{types.map((type) => <option key={type} value={type}>{type.replace("_", " ")}</option>)}</select></label><div className="form-grid-two"><label>Billing email<input name="billing_email" type="email" /></label><label>Billing phone<input name="billing_phone" type="tel" /></label></div><label>Billing address<input name="billing_address" /></label><label>Notes<textarea name="notes" rows={3} /></label><button disabled={pending} type="submit"><Building2 size={17} />{pending ? "Saving..." : "Add organization"}</button></form>;
}

export function AddOrganizationContactForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createOrganizationContact, initialState);
  return <form action={action} className="crm-form"><input name="organization_id" type="hidden" value={organizationId} /><Message state={state} /><label>Full name<input name="full_name" required /></label><div className="form-grid-two"><label>Email<input name="email" type="email" /></label><label>Phone<input name="phone" type="tel" /></label></div><label>Role title<input name="role_title" placeholder="Community manager, board treasurer..." /></label><label className="checkbox-field"><input name="receives_invoices" type="checkbox" /> Receives invoices</label><label className="checkbox-field"><input defaultChecked name="receives_job_updates" type="checkbox" /> Receives job updates</label><button disabled={pending} type="submit"><UserPlus size={17} />{pending ? "Saving..." : "Add contact"}</button></form>;
}

export function AddOrganizationPropertyForm({ customers, organizationId }: { customers: Pick<Customer, "id" | "display_name">[]; organizationId: string }) {
  const [state, action, pending] = useActionState(createOrganizationProperty, initialState);
  return <form action={action} className="crm-form"><input name="organization_id" type="hidden" value={organizationId} /><Message state={state} /><label>Linked customer<select name="customer_id" required><option value="">Choose customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.display_name}</option>)}</select></label><label>Property label<input name="label" placeholder="North entrance, rental home, common area" /></label><label>Street<input name="street" required /></label><div className="form-grid-three"><input name="city" placeholder="City" required /><input defaultValue="VA" name="state" /><input name="postal_code" placeholder="ZIP" /></div><label>Service notes<textarea name="service_notes" rows={3} /></label><button disabled={pending || customers.length === 0} type="submit"><MapPin size={17} />{pending ? "Saving..." : "Add property"}</button></form>;
}

function Message({ state }: { state: OrganizationActionState }) { return state.message ? <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null; }
