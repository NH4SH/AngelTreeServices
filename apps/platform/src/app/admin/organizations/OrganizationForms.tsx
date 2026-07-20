"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import { Building2, MapPin, UserPlus } from "lucide-react";
import { createOrganization, createOrganizationContact, createOrganizationProperty, updateOrganization, type OrganizationActionState } from "./actions";
import type { Customer, Organization, OrganizationType, ServiceLocation } from "@/lib/types/database";

const initialState: OrganizationActionState = { status: "idle", message: "" };
const types: OrganizationType[] = ["property_manager", "hoa", "commercial", "nonprofit", "church", "municipality", "general_contractor", "apartment_community", "real_estate", "other"];

export function AddOrganizationForm() {
  const [state, action, pending] = useReliableActionState(createOrganization, initialState);

  return (
    <form action={action} className="crm-form">
      <Message state={state} />
      <label>
        Name
        <input name="name" placeholder="Angel Tree HOA, Parkside Commons, Riverside PM" required />
      </label>
      <label>
        Type
        <select defaultValue="property_manager" name="organization_type">
          {types.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Billing email
          <input name="billing_email" placeholder="billing@example.com" type="email" />
        </label>
        <label>
          Billing phone
          <input name="billing_phone" placeholder="(540) 555-1234" type="tel" />
        </label>
      </div>
      <label>
        Billing address
        <input name="billing_address" placeholder="Mailing address for statements and office records" />
      </label>
      <label>
        Notes
        <textarea name="notes" placeholder="Contract terms, preferred contacts, billing notes" rows={3} />
      </label>
      <div className="form-grid-two">
        <label>Payment terms<input name="payment_terms" placeholder="Net 30, due on receipt..." /></label>
        <label>Status<select defaultValue="active" name="status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
      </div>
      <label className="checkbox-field"><input name="tax_exempt" type="checkbox" /> Tax exempt</label>
      <label>Tax / exemption reference<input name="tax_reference" /></label>
      <button disabled={pending} type="submit">
        <Building2 size={17} />
        {pending ? "Saving..." : "Add organization"}
      </button>
    </form>
  );
}

export function EditOrganizationForm({ organization }: { organization: Organization }) {
  const [state, action, pending] = useReliableActionState(updateOrganization, initialState);

  return (
    <form action={action} className="crm-form edit-record-form">
      <input name="organization_id" type="hidden" value={organization.id} />
      <Message state={state} />
      <label>
        Organization name
        <input defaultValue={organization.name} name="name" required />
      </label>
      <label>
        Type
        <select defaultValue={organization.organization_type} name="organization_type">
          {types.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Billing email
          <input defaultValue={organization.billing_email ?? ""} name="billing_email" placeholder="billing@example.com" type="email" />
        </label>
        <label>
          Billing phone
          <input defaultValue={organization.billing_phone ?? ""} name="billing_phone" placeholder="(540) 555-1234" type="tel" />
        </label>
      </div>
      <label>
        Billing/contact address
        <textarea
          defaultValue={organization.billing_address ?? ""}
          name="billing_address"
          placeholder="Mailing address for statements and office records"
          rows={3}
        />
      </label>
      <label>
        Notes
        <textarea defaultValue={organization.notes ?? ""} name="notes" placeholder="Contract terms, preferred contacts, billing notes" rows={4} />
      </label>
      <div className="form-grid-two">
        <label>Payment terms<input defaultValue={organization.payment_terms ?? ""} name="payment_terms" placeholder="Net 30, due on receipt..." /></label>
        <label>Status<select defaultValue={organization.status ?? "active"} name="status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
      </div>
      <label className="checkbox-field"><input defaultChecked={organization.tax_exempt ?? false} name="tax_exempt" type="checkbox" /> Tax exempt</label>
      <label>Tax / exemption reference<input defaultValue={organization.tax_reference ?? ""} name="tax_reference" /></label>
      <div className="record-form-actions">
        <button disabled={pending} type="submit">
          <Building2 size={17} />
          {pending ? "Saving..." : "Save changes"}
        </button>
        <Link className="secondary-action" href={`/admin/organizations/${organization.id}`}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function AddOrganizationContactForm({ organizationId, serviceLocations }: { organizationId: string; serviceLocations: Pick<ServiceLocation, "id" | "label" | "street">[] }) {
  const [state, action, pending] = useReliableActionState(createOrganizationContact, initialState);

  return (
    <form action={action} className="crm-form">
      <input name="organization_id" type="hidden" value={organizationId} />
      <Message state={state} />
      <label>
        Full name
        <input name="full_name" placeholder="Primary manager or board contact" required />
      </label>
      <div className="form-grid-two">
        <label>
          Email
          <input name="email" placeholder="contact@example.com" type="email" />
        </label>
        <label>
          Phone
          <input name="phone" placeholder="(540) 555-1234" type="tel" />
        </label>
      </div>
      <label>
        Role title
        <input name="role_title" placeholder="Community manager, board treasurer..." />
      </label>
      <fieldset className="organization-contact-role-grid"><legend>Workflow roles</legend>{contactRoles.map(([value, label]) => <label className="checkbox-field" key={value}><input name="contact_roles" type="checkbox" value={value} />{label}</label>)}</fieldset>
      <label>Preferred contact method<select defaultValue="email" name="preferred_contact_method"><option value="email">Email</option><option value="phone">Phone call</option><option value="text">Text message</option><option value="other">Other</option></select></label>
      <label>Associated property<select name="service_location_id"><option value="">All organization properties</option>{serviceLocations.map((location) => <option key={location.id} value={location.id}>{location.label || location.street}</option>)}</select></label>
      <label>Contact notes<textarea name="contact_notes" rows={3} /></label>
      <label className="checkbox-field">
        <input name="receives_invoices" type="checkbox" />
        Receives invoices
      </label>
      <label className="checkbox-field">
        <input defaultChecked name="receives_job_updates" type="checkbox" />
        Receives job updates
      </label>
      <button disabled={pending} type="submit">
        <UserPlus size={17} />
        {pending ? "Saving..." : "Add contact"}
      </button>
    </form>
  );
}

export function AddOrganizationPropertyForm({ customers, organizationId }: { customers: Pick<Customer, "id" | "display_name">[]; organizationId: string }) {
  const [state, action, pending] = useReliableActionState(createOrganizationProperty, initialState);

  return (
    <form action={action} className="crm-form">
      <input name="organization_id" type="hidden" value={organizationId} />
      <Message state={state} />
      <label>
        Linked customer
        <select name="customer_id">
          <option value="">Organization-owned property</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Property label
        <input name="label" placeholder="North entrance, rental home, common area" />
      </label>
      <label>
        Street
        <input name="street" placeholder="Street address" required />
      </label>
      <div className="form-grid-three">
        <input name="city" placeholder="City" required />
        <input defaultValue="VA" name="state" placeholder="VA" />
        <input name="postal_code" placeholder="ZIP" />
      </div>
      <label>
        Service notes
        <textarea name="service_notes" placeholder="Access notes, parking, equipment concerns" rows={3} />
      </label>
      <button disabled={pending} type="submit">
        <MapPin size={17} />
        {pending ? "Saving..." : "Add property"}
      </button>
    </form>
  );
}

const contactRoles = [["primary", "Primary contact"], ["billing", "Billing contact"], ["property_manager", "Property manager"], ["onsite", "Onsite contact"], ["approval_authority", "Approval authority"], ["board_representative", "Board representative"], ["accounts_payable", "Accounts payable"], ["maintenance", "Maintenance contact"], ["emergency", "Emergency contact"], ["other", "Other"]] as const;

function Message({ state }: { state: OrganizationActionState }) {
  return state.message ? (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  ) : null;
}
