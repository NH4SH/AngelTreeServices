"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { createInvoice, updateInvoice, type InvoiceActionState } from "./actions";
import type { Customer, InvoiceDetail, InvoiceStatus, Job } from "@/lib/types/database";

const initialState: InvoiceActionState = {
  status: "idle",
  message: "",
};

const statuses: InvoiceStatus[] = ["draft", "sent", "partially_paid", "paid", "overdue", "void"];

export function AddInvoiceForm({
  customers,
  jobs,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
}) {
  const [state, formAction, pending] = useActionState(createInvoice, initialState);

  return (
    <form action={formAction} className="crm-form">
      {state.message ? (
        <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
      <label>
        Customer
        <select name="customer_id" required>
          <option value="">Choose customer</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Job
        <select name="job_id" required>
          <option value="">Choose job</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.service_type ?? "job"} - {job.status.replace("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <label>
          Status
          <select name="status" defaultValue="draft">
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Due date
          <input name="due_date" type="date" />
        </label>
      </div>
      <label>
        Notes
        <textarea name="notes" placeholder="Internal invoice notes" rows={3} />
      </label>
      <fieldset className="nested-fieldset">
        <legend>Line item scaffold</legend>
        <input name="line_item_description" placeholder="Line item description" />
        <div className="form-grid-two">
          <input name="line_item_quantity" placeholder="Quantity" defaultValue="1" inputMode="decimal" />
          <input name="line_item_unit_price" placeholder="Unit price" inputMode="decimal" />
        </div>
      </fieldset>
      <button disabled={pending || customers.length === 0 || jobs.length === 0} type="submit">
        {pending ? "Saving..." : "Add invoice"}
      </button>
    </form>
  );
}

type InvoiceLineDraft = {
  clientId: string;
  persistedId?: string;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

export function EditInvoiceForm({ invoice }: { invoice: InvoiceDetail }) {
  const [state, formAction, pending] = useActionState(updateInvoice, initialState);
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
            quantity: String(item.quantity),
            unitPrice: (item.unit_price_cents / 100).toFixed(2),
          }))
      : [newInvoiceLine()],
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
            Customer
            <input disabled value={invoice.customers?.display_name ?? "Unknown customer"} />
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

        <div className="quote-line-editor-list">
          {lineItems.map((item, index) => (
            <article className="quote-line-editor" key={item.clientId}>
              <div className="quote-line-editor-top">
                <strong>Line {index + 1}</strong>
                <button
                  aria-label={`Remove line ${index + 1}`}
                  className="secondary-action invoice-line-remove"
                  disabled={lineItems.length === 1}
                  onClick={() => {
                    setLineItems((items) => items.filter((candidate) => candidate.clientId !== item.clientId));
                    setDirty(true);
                  }}
                  title="Remove line item"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
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
              <label>
                Description
                <textarea
                  name="invoice_line_item_description"
                  onChange={(event) => updateInvoiceLine(item.clientId, { description: event.target.value }, setLineItems)}
                  placeholder="Describe the billed work"
                  rows={5}
                  value={item.description}
                />
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
                    value={item.unitPrice}
                  />
                </label>
                <div className="quote-line-total">
                  <span>Amount</span>
                  <strong>{formatMoney(invoiceLineTotal(item))}</strong>
                </div>
              </div>
            </article>
          ))}
        </div>
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

function newInvoiceLine(): InvoiceLineDraft {
  return {
    clientId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    name: "",
    description: "",
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
