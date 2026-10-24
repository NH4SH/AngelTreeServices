"use client";

import { useReliableActionState } from "@/hooks/use-reliable-action-state";
import { StructuredAddressFields } from "@/components/address-autocomplete";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDocumentRecovery } from "@/hooks/use-document-recovery";
import { DocumentRecoveryPanel } from "@/components/document-recovery-panel";
import { safeReturnTo, withReturnTo } from "@/lib/drafts/return-context";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ArrowDown, ArrowUp, Copy, IndentIncrease, Plus, Save, Trash2, X } from "lucide-react";
import { createFirewoodInvoice } from "@/lib/actions/firewood";
import { firewoodLine, firewoodProducts, type FirewoodProduct } from "@/lib/firewood/catalog";
import { createInvoice, updateInvoice, type InvoiceActionState } from "./actions";
import { belongsToContractingParty, parseContractingParty } from "@/lib/contracting-parties";
import { getDefaultInvoiceDueDate } from "@/lib/invoices/due-date";
import type { Customer, InvoiceDetail, Job, Organization, ServiceCategory, ServiceLocation } from "@/lib/types/database";

const initialState: InvoiceActionState = {
  status: "idle",
  message: "",
};

export function AddInvoiceForm({
  userId, returnTo, firewood = false,
  customers,
  initialCustomerId,
  initialJobId,
  jobs,
  organizations,
  serviceCategories,
  serviceLocations,
}: {
  userId: string; returnTo?: string; firewood?: boolean;
  customers: Pick<Customer, "id" | "display_name" | "email" | "phone" | "billing_address">[];
  initialCustomerId?: string;
  initialJobId?: string;
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "organization_id" | "service_location_id">[];
  organizations: Pick<Organization, "id" | "name">[];
  serviceCategories: ServiceCategory[];
  serviceLocations: ServiceLocation[];
}) {
  const router = useRouter();
  const listHref = safeReturnTo(returnTo, "/admin/invoices");
  const requestId = useRef<string | null>(null);
  const [state, formAction, pending] = useReliableActionState(async (previous: InvoiceActionState, form: FormData) => {
    // The job lock also protects a reload/new form. Preserve this request identity
    // for an uncertain response without resetting the entered invoice details.
    if (recovery.blocked) return { status: "error" as const, message: "Review or discard the recovery copy before saving." };
    requestId.current ??= recovery.requestId.current || crypto.randomUUID();
    form.set("request_id", requestId.current);
    recovery.beforeSubmit(requestId.current, form);
    form.set("client_navigation", "1");
    const result = await (firewood ? createFirewoodInvoice : createInvoice)(previous, form);
    if (result.status === "success" && !result.existingInvoice) {
      recovery.acknowledge(); setDirty(false);
      if (result.navigateTo) router.push(result.navigateTo);
    }
    return result;
  }, initialState);
  const [dirty, setDirty] = useState(false);
  const [selectedPartyValue, setSelectedPartyValue] = useState(initialCustomerId ? `customer:${initialCustomerId}` : "");
  const [customerSearch, setCustomerSearch] = useState("");
  const creatingCustomer = selectedPartyValue === "new_customer";
  const selectedParty = parseContractingParty(selectedPartyValue);
  const [lineItems, setLineItems] = useState<InvoiceLineDraft[]>([{ ...newInvoiceLine("new-invoice-line-1"), ...(firewood ? firewoodLine("full") : {}) }]);
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
  function addFirewood(product: FirewoodProduct) {
    setLineItems(items => [...items, { ...newInvoiceLine(), ...firewoodLine(product) }]); markDirty();
  }
  const totalCents = lineItems.reduce((sum, item) => sum + invoiceLineTotal(item), 0);
  const recovery = useDocumentRecovery({
    userId, kind: "invoice", recordKey: `new:${firewood ? "firewood:" : ""}${initialCustomerId ?? ""}:${initialJobId ?? ""}`, revision: "new", persistedIds: [],
    dirty, pending, changeToken: lineItems,
    restore: copy => {
      setCustomerSearch(""); setSelectedPartyValue(copy.fields.contracting_party ?? "");
      setLineItems(copy.lines.map(line => ({ ...line, clientId: crypto.randomUUID(), persistedId: undefined })));
      requestId.current = copy.requestId || null; markDirty();
    },
  });
  function markDirty() { recovery.changed(); setDirty(true); }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form ref={recovery.formRef} action={formAction} aria-busy={pending} className="crm-form quote-editor-form" onChange={() => markDirty()} onReset={event => event.preventDefault()}>
      <input name="returnTo" type="hidden" value={listHref} />
      <DocumentRecoveryPanel recovery={recovery} listHref={listHref} />
      <fieldset disabled={pending} className="quote-editor-fields">
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}

      {state.invoiceId ? <Link className="secondary-action" href={withReturnTo(`/admin/invoices/${state.invoiceId}`, listHref, "/admin/invoices")}>Open existing invoice</Link> : null}

      <section className="quote-editor-section">
        <div>
          {!firewood ? <p className="surface-label">New invoice</p> : null}
          {firewood ? <h2>Customer and delivery</h2> : <h3>Contracting party and billing details</h3>}
        </div>
        <div className="form-grid-two">
          <label>
            Find customer
            <input onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Name, phone, email, or address" type="search" value={customerSearch} />
          </label>
          <label>
            {firewood ? "Customer" : "Contracting party"}
            <select
              name="contracting_party"
              onChange={(event) => setSelectedPartyValue(event.target.value)}
              value={selectedPartyValue}
            >
              <option value="">{firewood ? "Choose a customer" : "Choose customer or organization"}</option>
              <option value="new_customer">Create a new walk-in customer</option>
              <optgroup label="Individual customers">{visibleCustomers.map((customer) => <option key={customer.id} value={`customer:${customer.id}`}>{customer.display_name}{customer.phone ? ` - ${customer.phone}` : ""}</option>)}</optgroup>
              {!firewood ? <optgroup label="Organizations">{organizations.map((organization) => <option key={organization.id} value={`organization:${organization.id}`}>{organization.name}</option>)}</optgroup> : null}
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
              <StructuredAddressFields
                className="quick-address-fields"
                defaultValues={{ city: "Fredericksburg", state: "VA" }}
                names={{
                  street: "new_customer_street",
                  city: "new_customer_city",
                  state: "new_customer_state",
                  postalCode: "new_customer_postal_code",
                }}
                required={{ street: true, city: true, state: true }}
              />
            </div>
            <p>Enter either a phone number or email. The customer and property are created with this invoice.</p>
            <p className="form-help">New customer contact details are not included in recovery. Enter them again if you restore this invoice.</p>
          </fieldset>
        ) : null}
        {!creatingCustomer ? <div className="form-grid-two">
          <label>
            {firewood ? "Delivery address" : "Service location (optional)"}
            <select name="service_location_id" required={firewood}>
              <option value="">{firewood ? "Choose a delivery address" : "No property selected"}</option>
              {matchingLocations.map((location) => <option key={location.id} value={location.id}>{[location.label, location.street, location.city].filter(Boolean).join(" - ")}</option>)}
            </select>
          </label>
          {!firewood ? <label>
            Work order (optional)
            <select defaultValue={initialJobId ?? ""} name="job_id">
              <option value="">Standalone invoice, no work order</option>
              {invoiceableJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.service_type ?? "job"} - {job.status.replace("_", " ")}
                </option>
              ))}
            </select>
          </label> : <input name="job_id" type="hidden" value="" />}
        </div> : null}
        <label>
          Due date
          <input defaultValue={getDefaultInvoiceDueDate()} name="due_date" required type="date" />
          <small className="form-help">Defaults to 15 days after the invoice date.</small>
        </label>
        <label>
          Internal notes
          <textarea name="notes" placeholder="Notes for the Angel Tree Services team" rows={3} />
        </label>
      </section>

      <section className="quote-editor-section">
        <div className="quote-editor-section-header">
          <div>
            {!firewood ? <p className="surface-label">Charges</p> : null}
            {firewood ? <h2>Firewood and stacking</h2> : <h3>Invoice line items</h3>}
          </div>
          {firewood ? <div className="record-actions" aria-label="Add firewood products">{(Object.keys(firewoodProducts) as FirewoodProduct[]).map(product => <button key={product} className="secondary-action" type="button" onClick={() => addFirewood(product)}>{`Add ${product === "stacking" ? "stacking" : `${product} cord`} · ${formatMoney(Math.round(Number(firewoodProducts[product].price) * 100))}${product === "stacking" ? " / delivery" : ""}`}</button>)}</div> : <button
            className="secondary-action quote-line-helper-button"
            onClick={() => {
              setLineItems((items) => [...items, newInvoiceLine()]);
              markDirty();
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add line item
          </button>}
        </div>

        <InvoiceLineEditors
          firewood={firewood}
          lineItems={lineItems}
          onDirty={() => markDirty()}
          serviceCategories={serviceCategories}
          setLineItems={setLineItems}
        />

        <dl className="quote-editor-totals" aria-label="Invoice totals">
          <div><dt>Subtotal</dt><dd>{formatMoney(totalCents)}</dd></div>
          {firewood ? <div><dt>Sales tax · household-use exemption</dt><dd>$0.00</dd></div> : null}
          <div><dt>Total</dt><dd>{formatMoney(totalCents)}</dd></div>
        </dl>
      </section>

      {firewood ? <section className="quote-editor-section">
        <h2>Household-use confirmation</h2>
        <label className="firewood-use-confirmation"><input type="checkbox" name="firewood_domestic_use" value="confirmed" required />The customer confirms this wood is for use at their own home, primarily for domestic use.</label>
        <p className="form-help">Qualifying household-use firewood sold from Spotsylvania is exempt from state and local sales tax. Business, landlord and rental-property purchases need a separate tax review.</p>
        <p className="form-help">Stacking is charged per delivery. Confirm wheelbarrow access and the delivery arrangements with the customer. Saving creates a draft invoice; it does not send email or take payment.</p>
      </section> : null}
      </fieldset>
      <div className="quote-editor-action-bar">
        <button disabled={pending || recovery.blocked || (!selectedParty && !creatingCustomer)} type="submit">
          <Save aria-hidden="true" size={17} />
          {pending ? "Saving..." : "Create invoice"}
        </button>
        <Link
          className="secondary-action"
          href={listHref}
          onClick={(event) => { if (pending) event.preventDefault(); else confirmInvoiceClose(event, dirty); }}
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

export function EditInvoiceForm({ userId, returnTo, invoice, serviceCategories }: { userId: string; returnTo?: string; invoice: InvoiceDetail; serviceCategories: ServiceCategory[] }) {
  const router = useRouter();
  const listHref = safeReturnTo(returnTo, "/admin/invoices");
  const [state, formAction, pending] = useReliableActionState(async (previous: InvoiceActionState, form: FormData) => {
    if (recovery.blocked) return { status: "error" as const, message: "Review or discard the recovery copy before saving." };
    recovery.beforeSubmit("", form); form.set("client_navigation", "1");
    const result = await updateInvoice(previous, form);
    if (result.status === "success") {
      recovery.acknowledge(); setDirty(false);
      if (result.navigateTo) router.push(result.navigateTo);
    }
    return result;
  }, initialState);
  const [dirty, setDirty] = useState(false);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(invoice.updated_at);
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
  const recovery = useDocumentRecovery({
    userId, kind: "invoice", recordKey: invoice.id, revision: expectedUpdatedAt,
    persistedIds: lineItems.flatMap(line => line.persistedId ? [line.persistedId] : []), dirty, pending, changeToken: lineItems,
    restore: copy => { setLineItems(copy.lines.map(line => ({ ...line, clientId: crypto.randomUUID(), persistedId: line.persistedId || undefined }))); markDirty(); },
  });
  function markDirty() { recovery.changed(); setDirty(true); }


  useEffect(() => {
    if (state.status === "success") {
      setDirty(false);
      if (state.savedUpdatedAt) setExpectedUpdatedAt(state.savedUpdatedAt);
      if (state.savedLineIds) setLineItems(items => items.map(item => ({
        ...item, persistedId: state.savedLineIds?.[item.clientId] ?? item.persistedId,
      })));
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
    <form ref={recovery.formRef} action={formAction} aria-busy={pending} className="crm-form quote-editor-form" onChange={() => markDirty()} onReset={event => event.preventDefault()}>
      <input name="returnTo" type="hidden" value={listHref} />
      <DocumentRecoveryPanel recovery={recovery} listHref={listHref} />
      <input name="invoice_id" type="hidden" value={invoice.id} />
      <input name="expected_updated_at" type="hidden" value={expectedUpdatedAt} />
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

      <fieldset disabled={pending} style={{ display: "contents" }}>
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
          <input
            defaultValue={invoice.due_at?.slice(0, 10) ?? getDefaultInvoiceDueDate(new Date(invoice.created_at))}
            name="due_date"
            required
            type="date"
          />
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
              markDirty();
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add line item
          </button>
        </div>

        <InvoiceLineEditors
          lineItems={lineItems}
          onDirty={() => markDirty()}
          serviceCategories={serviceCategories}
          setLineItems={setLineItems}
        />
        <dl className="quote-editor-totals">
          <div><dt>Total</dt><dd>{formatMoney(totalCents)}</dd></div>
          <div><dt>Recorded payments</dt><dd>{formatMoney(invoice.total_cents - invoice.balance_due_cents)}</dd></div>
        </dl>
      </section>

      </fieldset>
      <div className="quote-editor-action-bar">
        <div>
          <button disabled={pending || recovery.blocked} name="submit_intent" type="submit" value="save">
            <Save aria-hidden="true" size={17} />
            {pending ? "Saving..." : "Save changes"}
          </button>
          <button className="secondary-action" disabled={pending || recovery.blocked} name="submit_intent" type="submit" value="save_close">
            {pending ? "Saving..." : "Save and close"}
          </button>
        </div>
        <Link
          className="secondary-action"
          href={withReturnTo(`/admin/invoices/${invoice.id}`, listHref, "/admin/invoices")}
          onClick={(event) => { if (pending) event.preventDefault(); else confirmInvoiceClose(event, dirty); }}
        >
          <X aria-hidden="true" size={17} />
          Close
        </Link>
      </div>
    </form>
  );
}

function InvoiceLineEditors({
  lineItems, firewood = false,
  onDirty,
  serviceCategories,
  setLineItems,
}: {
  lineItems: InvoiceLineDraft[]; firewood?: boolean;
  onDirty?: () => void;
  serviceCategories: ServiceCategory[];
  setLineItems: Dispatch<SetStateAction<InvoiceLineDraft[]>>;
}) {
  const markDirty = () => onDirty?.();

  if (firewood) return <div className="firewood-line-list">
    {lineItems.map((item, index) => <article className="firewood-line" key={item.clientId}>
      <input name="invoice_line_item_id" type="hidden" value={item.persistedId ?? ""} />
      <input name="invoice_line_item_client_id" type="hidden" value={item.clientId} />
      <input name="invoice_line_item_service_category_id" type="hidden" value={item.serviceCategoryId} />
      <div className="firewood-line-heading">
        {item.name === firewoodProducts.stacking.name ? <><strong>Optional stacking</strong><input name="invoice_line_item_name" type="hidden" value={item.name} /></> : <label>Cord size<select name="invoice_line_item_name" value={item.name} onChange={event => {
          const product = event.target.value === firewoodProducts.half.name ? "half" : "full";
          updateInvoiceLine(item.clientId, { ...firewoodLine(product), quantity: item.quantity }, setLineItems); markDirty();
        }}><option value={firewoodProducts.full.name}>Full cord · delivered</option><option value={firewoodProducts.half.name}>Half cord · delivered</option></select></label>}
        <button aria-label={`Remove firewood line ${index + 1}`} className="secondary-action" disabled={lineItems.length === 1} type="button" onClick={() => { setLineItems(items => items.filter(row => row.clientId !== item.clientId)); markDirty(); }}><Trash2 aria-hidden="true" size={16} />Remove</button>
      </div>
      <div className="quote-line-money-grid">
        <label>{item.name === firewoodProducts.stacking.name ? "Deliveries to stack" : "Quantity"}<input inputMode="numeric" name="invoice_line_item_quantity" type="number" min="1" max="100" step="1" required value={item.quantity} onChange={event => { updateInvoiceLine(item.clientId, { quantity: event.target.value }, setLineItems); markDirty(); }} /></label>
        <label>{item.name === firewoodProducts.stacking.name ? "Price per delivery" : "Unit price"}<input inputMode="decimal" name="invoice_line_item_unit_price" type="number" min="0" step="0.01" required value={item.unitPrice} onChange={event => { updateInvoiceLine(item.clientId, { unitPrice: event.target.value }, setLineItems); markDirty(); }} /></label>
        <div className="quote-line-total" aria-label={`Line ${index + 1} total`}><span>Amount</span><strong>{formatMoney(invoiceLineTotal(item))}</strong></div>
      </div>
      <details><summary>Delivery and product details</summary><label>Description<textarea name="invoice_line_item_description" rows={3} value={item.description} onChange={event => { updateInvoiceLine(item.clientId, { description: event.target.value }, setLineItems); markDirty(); }} /></label></details>
    </article>)}
  </div>;

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
          <input name="invoice_line_item_client_id" type="hidden" value={item.clientId} />
          <label>
            Title
            <input
              readOnly={firewood}
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
