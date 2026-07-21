"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ArrowDown, ArrowUp, Copy, IndentIncrease, Plus, Save, Trash2, X } from "lucide-react";
import { createInvoice, updateInvoice, type InvoiceActionState } from "./actions";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import type { Customer, InvoiceDetail, Job, Organization, ServiceCategory, ServiceLocation } from "@/lib/types/database";

const initialState: InvoiceActionState = {
  status: "idle",
  message: "",
};

export function AddInvoiceForm({
  customers,
  initialCustomerId,
  initialJobId,
  jobs,
  organizations,
  serviceCategories,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name" | "email" | "phone" | "billing_address">[];
  initialCustomerId?: string;
  initialJobId?: string;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "organization_id" | "service_location_id">[];
  organizations: Pick<Organization, "id" | "name">[];
  serviceCategories: ServiceCategory[];
  serviceLocations: ServiceLocation[];
}) {
  const [state, formAction, pending] = useReliableActionState(createInvoice, initialState);
  const [dirty, setDirty] = useState(false);
  const [selectedPartyValue, setSelectedPartyValue] = useState(initialCustomerId ? `customer:${initialCustomerId}` : "");
  const [customerSearch, setCustomerSearch] = useState("");
  const creatingCustomer = selectedPartyValue === "new_customer";
  const selectedParty = parseContractingParty(selectedPartyValue);
  const [lineItems, setLineItems] = useState<InvoiceLineDraft[]>([newInvoiceLine("new-invoice-line-1")]);
  const matchingJobs = useMemo(
    () => selectedParty ? jobs.filter((job) => belongsToContractingParty(job, selectedParty)) : [],
    [jobs, selectedParty],
  );
  const invoiceableJobs = useMemo(
    () => matchingJobs.filter((job) => ["completed", "ready_to_invoice"].includes(job.status)),
    [matchingJobs],
  );
  const matchingLocations = useMemo(
    () => selectedParty ? serviceLocations.filter((location) => belongsToContractingParty(location, selectedParty)) : [],
    [selectedParty, serviceLocations],
  );
  const visibleCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => [customer.display_name, customer.email, customer.phone, customer.billing_address].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [customerSearch, customers]);
  const totalCents = lineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0);

  return (
    <form action={formAction} className="crm-form quote-editor-form" onChange={() => setDirty(true)}>
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}

      <section className="quote-editor-section">
        <div>
          <p className="surface-label">New invoice</p>
          <h3>Contracting party and billing details</h3>
        </div>
        <div className="form-grid-two">
          <label>
            Find customer
            <input onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Name, phone, email, or address" type="search" value={customerSearch} />
          </label>
          <label>
            Contracting party
            <select
              name="contracting_party"
              onChange={(event) => setSelectedPartyValue(event.target.value)}
              value={selectedPartyValue}
            >
              <option value="">Choose customer or organization</option>
              <option value="new_customer">Create a new walk-in customer</option>
              <optgroup label="Individual customers">{visibleCustomers.map((customer) => <option key={customer.id} value={`customer:${customer.id}`}>{customer.display_name}{customer.phone ? ` - ${customer.phone}` : ""}</option>)}</optgroup>
              <optgroup label="Organizations">{organizations.map((organization) => <option key={organization.id} value={`organization:${organization.id}`}>{organization.name}</option>)}</optgroup>
            </select>
          </label>
        </div>
        {creatingCustomer ? (
          <fieldset className="quick-customer-fields">
            <legend>New customer</legend>
            <div className="form-grid-two">
              <label>Name<input name="new_customer_name" required /></label>
              <label>Phone<input inputMode="tel" name="new_customer_phone" /></label>
              <label>Email<input name="new_customer_email" type="email" /></label>
              <label>Street address<input name="new_customer_street" required /></label>
              <label>City<input defaultValue="Fredericksburg" name="new_customer_city" required /></label>
              <label>State<input defaultValue="VA" maxLength={2} name="new_customer_state" required /></label>
              <label>ZIP<input inputMode="numeric" name="new_customer_postal_code" /></label>
            </div>
            <p>Enter either a phone number or email. The customer and property are created with this invoice.</p>
          </fieldset>
        ) : null}
        {!creatingCustomer ? <div className="form-grid-two">
          <label>
            Service location (optional)
            <select name="service_location_id">
              <option value="">No property selected</option>
              {matchingLocations.map((location) => <option key={location.id} value={location.id}>{[location.label, location.street, location.city].filter(Boolean).join(" - ")}</option>)}
            </select>
          </label>
          <label>
            Work order (optional)
            <select defaultValue={initialJobId ?? ""} name="job_id">
              <option value="">Standalone invoice, no work order</option>
              {invoiceableJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.service_type ?? "job"} - {job.status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div> : null}
        <label>
          Due date
          <input name="due_date" type="date" />
        </label>
        <label>
          Internal notes
          <textarea name="notes" placeholder="Notes for the Angel Tree Services team" rows={3} />
        </label>
      </section>

      <section className="quote-editor-section">
        <div className="quote-editor-section-header">
          <div>
            <p className="surface-label">Charges</p>
            <h3>Invoice line items</h3>
          </div>
          <button
            className="secondary-action quote-line-helper-button"
            onClick={() => {
              setLineItems((items) => [...items, newInvoiceLine()]);
              setDirty(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add line item
          </button>
        </div>

        <InvoiceLineEditors
          lineItems={lineItems}
          onDirty={() => setDirty(true)}
          serviceCategories={serviceCategories}
          setLineItems={setLineItems}
        />

        <dl className="quote-editor-totals" aria-label="Invoice totals">
          <div><dt>Subtotal</dt><dd>{formatMoney(totalCents)}</dd></div>
          <div><dt>Total</dt><dd>{formatMoney(totalCents)}</dd></div>
        </dl>
      </section>

      <div className="quote-editor-action-bar">
        <button disabled={pending || (!selectedParty && !creatingCustomer)} type="submit">
          <Save aria-hidden="true" size={17} />
          {pending ? "Saving..." : "Create invoice"}
        </button>
        <Link
          className="secondary-action"
          href="/admin/invoices"
          onClick={(event) => confirmInvoiceClose(event, dirty)}
        >
          <X aria-hidden="true" size={17} />
          Close
        </Link>
      </div>
    </form>
  );
}

type InvoiceLineDraft = {
  clientId: string;
  persistedId?: string;
  name: string;
  description: string;
  serviceCategoryId: string;
  quantity: string;
  unitPrice: string;
};

export function EditInvoiceForm({ invoice, serviceCategories }: { invoice: InvoiceDetail; serviceCategories: ServiceCategory[] }) {
  const [state, formAction, pending] = useReliableActionState(updateInvoice, initialState);
  const [dirty, setDirty] = useState(false);
  const [lineItems, setLineItems] = useState<InvoiceLineDraft[]>(
    invoice.invoice_line_items?.length
      ? [...invoice.invoice_line_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => ({
            clientId: item.id,
            persistedId: item.id,
            name: item.name,
            description: item.description ?? "",
            serviceCategoryId: item.service_category_id ?? "",
            quantity: String(item.quantity),
            unitPrice: (item.unit_price_cents / 100).toFixed(2),
          }))
      : [newInvoiceLine("new-invoice-line-1")],
  );
  const totalCents = lineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0);

  useEffect(() => {
    if (state.status === "success") {
      setDirty(false);
    }
  }, [state]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  return (
    <form action={formAction} className="crm-form quote-editor-form" onChange={() => setDirty(true)}>
      <input name="invoice_id" type="hidden" value={invoice.id} />
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}

      {invoice.status !== "draft" ? (
        <p className="form-guidance warning">
          This invoice has already entered the billing workflow. Review changes carefully before saving.
        </p>
      ) : null}

      <section className="quote-editor-section">
        <div>
          <p className="surface-label">Invoice details</p>
          <h3>Billing record</h3>
        </div>
        <div className="form-grid-two">
          <label>
            Contracting party
            <input disabled value={invoice.organizations?.name ?? invoice.customers?.display_name ?? "Unknown contracting party"} />
          </label>
          <label>
            Job
            <input disabled value={invoice.jobs?.service_type?.replaceAll("_", " ") ?? "Linked job"} />
          </label>
        </div>
        <label>
          Due date
          <input defaultValue={invoice.due_at?.slice(0, 10) ?? ""} name="due_date" type="date" />
        </label>
      </section>

      <section className="quote-editor-section">
        <div className="quote-editor-section-header">
          <div>
            <p className="surface-label">Charges</p>
            <h3>Invoice line items</h3>
          </div>
          <button
            className="secondary-action quote-line-helper-button"
            onClick={() => {
              setLineItems((items) => [...items, newInvoiceLine()]);
              setDirty(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add line item
          </button>
        </div>

        <InvoiceLineEditors
          lineItems={lineItems}
          onDirty={() => setDirty(true)}
          serviceCategories={serviceCategories}
          setLineItems={setLineItems}
        />
        <dl className="quote-editor-totals">
          <div><dt>Total</dt><dd>{formatMoney(totalCents)}</dd></div>
          <div><dt>Recorded payments</dt><dd>{formatMoney(invoice.total_cents - invoice.balance_due_cents)}</dd></div>
        </dl>
      </section>

      <div className="quote-editor-action-bar">
        <div>
          <button disabled={pending} name="submit_intent" type="submit" value="save">
            <Save aria-hidden="true" size={17} />
            {pending ? "Saving..." : "Save changes"}
          </button>
          <button className="secondary-action" disabled={pending} name="submit_intent" type="submit" value="save_close">
            {pending ? "Saving..." : "Save and close"}
          </button>
        </div>
        <Link
          className="secondary-action"
          href={`/admin/invoices/${invoice.id}`}
          onClick={(event) => confirmInvoiceClose(event, dirty)}
        >
          <X aria-hidden="true" size={17} />
          Close
        </Link>
      </div>
    </form>
  );
}

function InvoiceLineEditors({
  lineItems,
  onDirty,
  serviceCategories,
  setLineItems,
}: {
  lineItems: InvoiceLineDraft[];
  onDirty?: () => void;
  serviceCategories: ServiceCategory[];
  setLineItems: Dispatch<SetStateAction<InvoiceLineDraft[]>>;
}) {
  const markDirty = () => onDirty?.();

  return (
    <div className="quote-line-editor-list">
      {lineItems.map((item, index) => (
        <article className="quote-line-editor" key={item.clientId}>
          <div className="quote-line-editor-top">
            <strong>Line {index + 1}</strong>
            <div className="quote-line-controls">
              <InvoiceIconButton
                disabled={index === 0}
                label="Move line item up"
                onClick={() => {
                  moveInvoiceLine(index, index - 1, setLineItems);
                  markDirty();
                }}
              >
                <ArrowUp aria-hidden="true" size={15} />
              </InvoiceIconButton>
              <InvoiceIconButton
                disabled={index === lineItems.length - 1}
                label="Move line item down"
                onClick={() => {
                  moveInvoiceLine(index, index + 1, setLineItems);
                  markDirty();
                }}
              >
                <ArrowDown aria-hidden="true" size={15} />
              </InvoiceIconButton>
              <InvoiceIconButton
                label="Duplicate line item"
                onClick={() => {
                  duplicateInvoiceLine(index, setLineItems);
                  markDirty();
                }}
              >
                <Copy aria-hidden="true" size={15} />
              </InvoiceIconButton>
              <InvoiceIconButton
                disabled={lineItems.length === 1}
                label="Remove line item"
                onClick={() => {
                  setLineItems((items) => items.filter((candidate) => candidate.clientId !== item.clientId));
                  markDirty();
                }}
              >
                <Trash2 aria-hidden="true" size={15} />
              </InvoiceIconButton>
            </div>
          </div>
          <input name="invoice_line_item_id" type="hidden" value={item.persistedId ?? ""} />
          <label>
            Title
            <input
              name="invoice_line_item_name"
              onChange={(event) => updateInvoiceLine(item.clientId, { name: event.target.value }, setLineItems)}
              placeholder="Tree removal, deposit, cleanup"
              value={item.name}
            />
          </label>
          <div className="quote-description-heading">
            <label htmlFor={`invoice-line-description-${item.clientId}`}>Description / scope</label>
            <button
              className="quote-indent-button"
              onClick={() => {
                indentInvoiceLine(item.clientId, setLineItems);
                markDirty();
              }}
              type="button"
            >
              <IndentIncrease aria-hidden="true" size={15} />
              Indent line
            </button>
          </div>
          <textarea
            id={`invoice-line-description-${item.clientId}`}
            name="invoice_line_item_description"
            onChange={(event) => updateInvoiceLine(item.clientId, { description: event.target.value }, setLineItems)}
            placeholder={"Describe the billed work. Use Shift+Enter for a new line.\n- Remove deadwood over driveway\n  - Haul away debris\n  - Leave logs stacked by fence"}
            rows={7}
            value={item.description}
          />
          <label>
            Service category
            <select
              name="invoice_line_item_service_category_id"
              onChange={(event) => updateInvoiceLine(item.clientId, { serviceCategoryId: event.target.value }, setLineItems)}
              value={item.serviceCategoryId}
            >
              <option value="">Uncategorized</option>
              {serviceCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>
          <div className="quote-line-money-grid">
            <label>
              Quantity
              <input
                inputMode="decimal"
                name="invoice_line_item_quantity"
                onChange={(event) => updateInvoiceLine(item.clientId, { quantity: event.target.value }, setLineItems)}
                value={item.quantity}
              />
            </label>
            <label>
              Unit price
              <input
                inputMode="decimal"
                name="invoice_line_item_unit_price"
                onChange={(event) => updateInvoiceLine(item.clientId, { unitPrice: event.target.value }, setLineItems)}
                placeholder="0.00"
                value={item.unitPrice}
              />
            </label>
            <div className="quote-line-total" aria-label={`Line ${index + 1} total`}>
              <span>Amount</span>
              <strong>{formatMoney(invoiceLineTotal(item))}</strong>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function InvoiceIconButton({
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

function newInvoiceLine(clientId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`): InvoiceLineDraft {
  return {
    clientId,
    name: "",
    description: "",
    serviceCategoryId: "",
    quantity: "1",
    unitPrice: "",
  };
}

function updateInvoiceLine(
  id: string,
  patch: Partial<Omit<InvoiceLineDraft, "clientId">>,
  setLines: Dispatch<SetStateAction<InvoiceLineDraft[]>>,
) {
  setLines((items) => items.map((item) => item.clientId === id ? { ...item, ...patch } : item));
}

function duplicateInvoiceLine(index: number, setLines: Dispatch<SetStateAction<InvoiceLineDraft[]>>) {
  setLines((items) => [
    ...items.slice(0, index + 1),
    { ...items[index], clientId: newInvoiceLine().clientId, persistedId: undefined },
    ...items.slice(index + 1),
  ]);
}

function moveInvoiceLine(
  fromIndex: number,
  toIndex: number,
  setLines: Dispatch<SetStateAction<InvoiceLineDraft[]>>,
) {
  setLines((items) => {
    if (toIndex < 0 || toIndex >= items.length) {
      return items;
    }

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  });
}

function indentInvoiceLine(id: string, setLines: Dispatch<SetStateAction<InvoiceLineDraft[]>>) {
  setLines((items) =>
    items.map((item) => {
      if (item.clientId !== id) {
        return item;
      }

      const prefix = item.description && !item.description.endsWith("\n") ? "\n" : "";
      return { ...item, description: `${item.description}${prefix}  ` };
    }),
  );
}

function invoiceLineTotal(item: InvoiceLineDraft) {
  const quantity = Number.parseFloat(item.quantity || "0");
  const unitPrice = Number.parseFloat(item.unitPrice || "0");
  return Number.isFinite(quantity) && Number.isFinite(unitPrice)
    ? Math.max(0, Math.round(quantity * unitPrice * 100))
    : 0;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function confirmInvoiceClose(event: MouseEvent<HTMLAnchorElement>, dirty: boolean) {
  if (dirty && !window.confirm("Close without saving your changes?")) {
    event.preventDefault();
  }
}
