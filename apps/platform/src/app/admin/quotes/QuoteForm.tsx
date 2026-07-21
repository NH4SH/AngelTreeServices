"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from "react";
import { ArrowDown, ArrowUp, Copy, IndentIncrease, Plus, Save, Trash2, X } from "lucide-react";
import { createQuote, updateQuote, type QuoteActionState } from "./actions";
import { belongsToContractingParty, contractingPartyValue, parseContractingParty } from "@/lib/contracting-parties";
import type { Customer, Job, Organization, OrganizationContact, QuoteDetail, ServiceCategory, ServiceLocation } from "@/lib/types/database";
import type { EstimateScheduleEventOption } from "@/lib/data/schedule";
import type { MaterialRecord } from "@/lib/data/materials";

const initialState: QuoteActionState = {
  status: "idle",
  message: "",
};

type LineItemDraft = {
  id: string;
  persistedId?: string;
  name: string;
  description: string;
  serviceCategoryId: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
};

const initialLineItem = (id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`): LineItemDraft => ({
  id,
  name: "",
  description: "",
  serviceCategoryId: "",
  materialId: "",
  quantity: "1",
  unitPrice: "",
});

export function AddQuoteForm({
  customers,
  defaultCustomerId = "",
  estimateScheduleEvents,
  jobs,
  materials,
  organizations,
  organizationContacts,
  quote,
  serviceCategories,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  defaultCustomerId?: string;
  estimateScheduleEvents: EstimateScheduleEventOption[];
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "organization_id" | "service_location_id">[];
  materials: MaterialRecord[];
  organizations: Pick<Organization, "id" | "name">[];
  organizationContacts: Pick<OrganizationContact, "id" | "organization_id" | "full_name" | "contact_roles" | "email">[];
  quote?: QuoteDetail;
  serviceCategories: ServiceCategory[];
  serviceLocations: Pick<ServiceLocation, "id" | "customer_id" | "organization_id" | "label" | "street" | "city" | "state" | "postal_code">[];
}) {
  const isEditing = Boolean(quote);
  const action = isEditing ? updateQuote : createQuote;
  const [state, formAction, pending] = useReliableActionState(action, initialState);
  const [dirty, setDirty] = useState(false);
  const [selectedPartyValue, setSelectedPartyValue] = useState(
    quote ? contractingPartyValue(quote) : defaultCustomerId ? `customer:${defaultCustomerId}` : "",
  );
  const selectedParty = parseContractingParty(selectedPartyValue);
  const originalPartyValue = quote ? contractingPartyValue(quote) : "";
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    quote?.quote_line_items?.length
      ? [...quote.quote_line_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => ({
            id: item.id,
            persistedId: item.id,
            name: item.name,
            description: item.description ?? "",
            serviceCategoryId: item.service_category_id ?? "",
            materialId: item.material_id ?? "",
            quantity: String(item.quantity),
            unitPrice: (item.unit_price_cents / 100).toFixed(2),
          }))
      : [initialLineItem("new-quote-line-1")],
  );
  const matchingLocations = useMemo(
    () => selectedParty ? serviceLocations.filter((location) => belongsToContractingParty(location, selectedParty)) : [],
    [selectedParty, serviceLocations],
  );
  const matchingJobs = useMemo(
    () => selectedParty ? jobs.filter((job) => belongsToContractingParty(job, selectedParty)) : [],
    [selectedParty, jobs],
  );
  const matchingContacts = useMemo(
    () => selectedParty?.kind === "organization"
      ? organizationContacts.filter((contact) => contact.organization_id === selectedParty.organizationId)
      : [],
    [organizationContacts, selectedParty],
  );
  const subtotalCents = lineItems.reduce((sum, item) => sum + getLineItemTotalCents(item), 0);
  const closeHref = quote ? `/admin/quotes/${quote.id}` : "/admin/quotes";

  useEffect(() => {
    if (state.status === "success") {
      setDirty(false);
    }
  }, [state]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  return (
    <form
      action={formAction}
      className="crm-form quote-editor-form"
      onChange={() => setDirty(true)}
    >
      {quote ? <input name="quote_id" type="hidden" value={quote.id} /> : null}
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}

      <section className="quote-editor-section">
        <div>
          <p className="surface-label">{isEditing ? "Edit quote" : "Draft quote"}</p>
          <h3>Contracting party and proposed work</h3>
        </div>
        {quote && ["sent", "change_requested"].includes(quote.status) ? (
          <p className="form-guidance warning">
            Saving changes keeps this quote in its current workflow status. Editing this quote updates the customer's existing link without revoking it.
          </p>
        ) : null}
        <div className="form-grid-two">
          <label>
            Contracting party
            <select
              name="contracting_party"
              onChange={(event) => {
                setSelectedPartyValue(event.target.value);
                setDirty(true);
              }}
              required
              value={selectedPartyValue}
            >
              <option value="">Choose customer or organization</option>
              <optgroup label="Individual customers">{customers.map((customer) => <option key={customer.id} value={`customer:${customer.id}`}>{customer.display_name}</option>)}</optgroup>
              <optgroup label="Organizations">{organizations.map((organization) => <option key={organization.id} value={`organization:${organization.id}`}>{organization.name}</option>)}</optgroup>
            </select>
          </label>
          <label>
            Service location
            <select defaultValue={quote?.service_location_id ?? ""} name="service_location_id" required>
              <option value="">Choose service location</option>
              {matchingLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {formatLocation(location)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {quote && selectedPartyValue !== originalPartyValue ? (
          <label className="checkbox-field">
            <input name="confirm_contracting_party_change" required type="checkbox" />
            I understand this changes the legal contracting party. Existing portal access remains attached to this quote.
          </label>
        ) : null}
        {selectedParty?.kind === "organization" ? (
          <>
          <div className="form-grid-two">
            <label>
              Quote recipient
              <select defaultValue={quote?.recipient_contact_id ?? ""} name="recipient_contact_id" required>
                <option value="">Choose recipient</option>
                {matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.email ? ` - ${contact.email}` : ""}</option>)}
              </select>
            </label>
            <label>
              Approval contact
              <select defaultValue={quote?.approval_contact_id ?? ""} name="approval_contact_id" required>
                <option value="">Choose approval contact</option>
                {matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.contact_roles?.length ? ` - ${contact.contact_roles.join(", ")}` : ""}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid-two">
            <label>
              Onsite contact
              <select defaultValue={quote?.onsite_contact_id ?? ""} name="onsite_contact_id">
                <option value="">No onsite contact selected</option>
                {matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}
              </select>
            </label>
            <label>
              Billing contact
              <select defaultValue={quote?.billing_contact_id ?? ""} name="billing_contact_id">
                <option value="">Use approval contact</option>
                {matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}{contact.email ? ` - ${contact.email}` : ""}</option>)}
              </select>
            </label>
          </div>
          </>
        ) : null}
        <div className="form-grid-two">
          <label>
            Purchase order / reference
            <input defaultValue={quote?.purchase_order_reference ?? ""} name="purchase_order_reference" />
          </label>
          <label>
            Payment terms
            <input defaultValue={quote?.payment_terms ?? ""} name="payment_terms" placeholder="Net 30" />
          </label>
        </div>
        <div className="form-grid-two">
          <label>
            Estimate event
            <select defaultValue={quote?.estimate_schedule_event_id ?? ""} name="estimate_schedule_event_id">
              <option value="">No linked estimate event</option>
              {estimateScheduleEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} - {formatDateTime(event.starts_at)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Existing job / work order
            <select defaultValue={quote?.job_id ?? ""} name="job_id">
              <option value="">No existing job yet</option>
              {matchingJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.service_type ?? "job"} - {job.status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Customer notes
          <textarea
            defaultValue={quote?.customer_message ?? ""}
            name="customer_message"
            placeholder="Customer-facing quote notes or proposal introduction"
            rows={4}
          />
        </label>
        <div className="form-grid-two">
          <label>
            Wood and chips plan
            <select defaultValue={quote?.debris_handling ?? ""} name="debris_handling">
              <option value="">Not decided</option>
              <option value="haul_all">Haul all wood and chips</option>
              <option value="leave_wood">Leave wood onsite</option>
              <option value="leave_chips">Leave chips onsite</option>
              <option value="leave_wood_and_chips">Leave wood and chips onsite</option>
              <option value="partial_haul">Partial haul</option>
              <option value="other">Other arrangement</option>
            </select>
          </label>
          <label>
            Wood / chips instructions
            <textarea defaultValue={quote?.debris_handling_notes ?? ""} name="debris_handling_notes" placeholder="Stack logs by rear fence; leave one chip load near garden." rows={3} />
          </label>
        </div>
        <label>
          Expiration date
          <input defaultValue={toDateInputValue(quote?.expires_at)} name="expires_at" type="date" />
        </label>
      </section>

      <section className="quote-editor-section">
        <div className="quote-editor-section-header">
          <div>
            <p className="surface-label">Proposal lines</p>
            <h3>Line items</h3>
          </div>
          <button
            className="secondary-action quote-line-helper-button"
            onClick={() => {
              setLineItems((items) => [...items, initialLineItem()]);
              setDirty(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add line item
          </button>
        </div>

        <div className="quote-line-editor-list">
          {lineItems.map((item, index) => (
            <article className="quote-line-editor" key={item.id}>
              <div className="quote-line-editor-top">
                <strong>Line {index + 1}</strong>
                <div className="quote-line-controls">
                  <IconButton
                    disabled={index === 0}
                    label="Move line item up"
                    onClick={() => {
                      moveLineItem(index, index - 1, setLineItems);
                      setDirty(true);
                    }}
                  >
                    <ArrowUp aria-hidden="true" size={15} />
                  </IconButton>
                  <IconButton
                    disabled={index === lineItems.length - 1}
                    label="Move line item down"
                    onClick={() => {
                      moveLineItem(index, index + 1, setLineItems);
                      setDirty(true);
                    }}
                  >
                    <ArrowDown aria-hidden="true" size={15} />
                  </IconButton>
                  <IconButton label="Duplicate line item" onClick={() => {
                    duplicateLineItem(index, setLineItems);
                    setDirty(true);
                  }}>
                    <Copy aria-hidden="true" size={15} />
                  </IconButton>
                  <IconButton
                    disabled={lineItems.length === 1}
                    label="Remove line item"
                    onClick={() => {
                      setLineItems((items) => items.filter((candidate) => candidate.id !== item.id));
                      setDirty(true);
                    }}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </IconButton>
                </div>
              </div>

              <label>
                Title
                {item.persistedId ? <input name="line_item_id" type="hidden" value={item.persistedId} /> : <input name="line_item_id" type="hidden" value="" />}
                <input
                  name="line_item_name"
                  onChange={(event) => updateLineItem(item.id, { name: event.target.value }, setLineItems)}
                  placeholder="Tree removal, canopy raising, stump grinding"
                  value={item.name}
                />
              </label>
              <div className="quote-description-heading">
                <label htmlFor={`line-item-description-${item.id}`}>Description / scope</label>
                <button
                  className="quote-indent-button"
                  onClick={() => {
                    indentLineItemDescription(item.id, setLineItems);
                    setDirty(true);
                  }}
                  type="button"
                >
                  <IndentIncrease aria-hidden="true" size={15} />
                  Indent line
                </button>
              </div>
              <textarea
                id={`line-item-description-${item.id}`}
                name="line_item_description"
                onChange={(event) => updateLineItem(item.id, { description: event.target.value }, setLineItems)}
                placeholder={"Describe the work included in this line item. Use Shift+Enter for a new line.\n- Remove deadwood over driveway\n  - Haul away debris\n  - Leave logs stacked by fence"}
                rows={7}
                value={item.description}
              />
              <label>
                Service category
                <select
                  name="line_item_service_category_id"
                  onChange={(event) => updateLineItem(item.id, { serviceCategoryId: event.target.value }, setLineItems)}
                  value={item.serviceCategoryId}
                >
                  <option value="">Uncategorized</option>
                  {serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                </select>
              </label>
              <label>
                Linked material (internal planning)
                <select
                  name="line_item_material_id"
                  onChange={(event) => updateLineItem(item.id, { materialId: event.target.value }, setLineItems)}
                  value={item.materialId}
                >
                  <option value="">No inventory item</option>
                  {materials.map((material) => <option key={material.id} value={material.id}>{material.name} ({material.default_unit.replaceAll("_", " ")})</option>)}
                </select>
              </label>
              <div className="quote-line-money-grid">
                <label>
                  Quantity
                  <input
                    inputMode="decimal"
                    name="line_item_quantity"
                    onChange={(event) => updateLineItem(item.id, { quantity: event.target.value }, setLineItems)}
                    value={item.quantity}
                  />
                </label>
                <label>
                  Unit price
                  <input
                    inputMode="decimal"
                    name="line_item_unit_price"
                    onChange={(event) => updateLineItem(item.id, { unitPrice: event.target.value }, setLineItems)}
                    placeholder="0.00"
                    value={item.unitPrice}
                  />
                </label>
                <div className="quote-line-total" aria-label={`Line ${index + 1} total`}>
                  <span>Amount</span>
                  <strong>{formatCurrency(getLineItemTotalCents(item))}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>

        <dl className="quote-editor-totals" aria-label="Quote totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatCurrency(subtotalCents)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatCurrency(subtotalCents)}</dd>
          </div>
        </dl>
      </section>

      <div className="quote-editor-action-bar">
        <div>
          <button
            disabled={pending || customers.length === 0}
            name="submit_intent"
            type="submit"
            value="save"
          >
            <Save aria-hidden="true" size={17} />
            {pending ? "Saving..." : isEditing ? "Save changes" : "Save draft"}
          </button>
          <button
            className="secondary-action"
            disabled={pending || customers.length === 0}
            name="submit_intent"
            type="submit"
            value="save_close"
          >
            {pending ? "Saving..." : isEditing ? "Save and close" : "Save draft and close"}
          </button>
        </div>
        <Link
          className="secondary-action"
          href={closeHref}
          onClick={(event) => confirmClose(event, dirty)}
        >
          <X aria-hidden="true" size={17} />
          Close
        </Link>
      </div>
    </form>
  );
}

function confirmClose(event: MouseEvent<HTMLAnchorElement>, dirty: boolean) {
  if (dirty && !window.confirm("Close without saving your changes?")) {
    event.preventDefault();
  }
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} disabled={disabled} onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}

function updateLineItem(
  id: string,
  patch: Partial<Omit<LineItemDraft, "id">>,
  setLineItems: Dispatch<SetStateAction<LineItemDraft[]>>,
) {
  setLineItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
}

function duplicateLineItem(index: number, setLineItems: Dispatch<SetStateAction<LineItemDraft[]>>) {
  setLineItems((items) => [
    ...items.slice(0, index + 1),
    { ...items[index], id: initialLineItem().id },
    ...items.slice(index + 1),
  ]);
}

function moveLineItem(
  fromIndex: number,
  toIndex: number,
  setLineItems: Dispatch<SetStateAction<LineItemDraft[]>>,
) {
  setLineItems((items) => {
    if (toIndex < 0 || toIndex >= items.length) {
      return items;
    }

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}

function indentLineItemDescription(
  id: string,
  setLineItems: Dispatch<SetStateAction<LineItemDraft[]>>,
) {
  setLineItems((items) =>
    items.map((item) => {
      if (item.id !== id) {
        return item;
      }

      const prefix = item.description && !item.description.endsWith("\n") ? "\n" : "";
      return { ...item, description: `${item.description}${prefix}  ` };
    }),
  );
}

function getLineItemTotalCents(item: LineItemDraft) {
  const quantity = Number.parseFloat(item.quantity || "0");
  const unitPrice = Number.parseFloat(item.unitPrice || "0");

  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
    return 0;
  }

  return Math.max(0, Math.round(quantity * unitPrice * 100));
}

function formatLocation(location: Pick<ServiceLocation, "label" | "street" | "city" | "state" | "postal_code">) {
  return [
    location.label,
    [location.street, location.city, location.state, location.postal_code].filter(Boolean).join(", "),
  ].filter(Boolean).join(" - ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}
