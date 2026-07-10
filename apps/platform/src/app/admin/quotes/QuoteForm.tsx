"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from "react";
import { useActionState } from "react";
import { ArrowDown, ArrowUp, Copy, IndentIncrease, Plus, Save, Trash2, X } from "lucide-react";
import { createQuote, updateQuote, type QuoteActionState } from "./actions";
import type { Customer, Job, QuoteDetail, ServiceLocation } from "@/lib/types/database";
import type { EstimateScheduleEventOption } from "@/lib/data/schedule";

const initialState: QuoteActionState = {
  status: "idle",
  message: "",
};

type LineItemDraft = {
  id: string;
  persistedId?: string;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const initialLineItem = (): LineItemDraft => ({
  id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
  name: "",
  description: "",
  quantity: "1",
  unitPrice: "",
});

export function AddQuoteForm({
  customers,
  defaultCustomerId = "",
  estimateScheduleEvents,
  jobs,
  quote,
  serviceLocations,
}: {
  customers: Pick<Customer, "id" | "display_name">[];
  defaultCustomerId?: string;
  estimateScheduleEvents: EstimateScheduleEventOption[];
  jobs: Pick<Job, "id" | "status" | "service_type" | "customer_id" | "service_location_id">[];
  quote?: QuoteDetail;
  serviceLocations: Pick<ServiceLocation, "id" | "customer_id" | "label" | "street" | "city" | "state" | "postal_code">[];
}) {
  const isEditing = Boolean(quote);
  const action = isEditing ? updateQuote : createQuote;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [dirty, setDirty] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(quote?.customer_id ?? defaultCustomerId);
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(
    quote?.quote_line_items?.length
      ? [...quote.quote_line_items]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => ({
            id: item.id,
            persistedId: item.id,
            name: item.name,
            description: item.description ?? "",
            quantity: String(item.quantity),
            unitPrice: (item.unit_price_cents / 100).toFixed(2),
          }))
      : [initialLineItem()],
  );
  const matchingLocations = useMemo(
    () => serviceLocations.filter((location) => !selectedCustomerId || location.customer_id === selectedCustomerId),
    [selectedCustomerId, serviceLocations],
  );
  const matchingJobs = useMemo(
    () => jobs.filter((job) => !selectedCustomerId || job.customer_id === selectedCustomerId),
    [selectedCustomerId, jobs],
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
          <h3>Customer and proposed work</h3>
        </div>
        {quote && ["sent", "change_requested"].includes(quote.status) ? (
          <p className="form-guidance warning">
            Saving changes returns this quote to draft so the revised version can be reviewed again. Editing this quote will update the customer's existing link. It will not revoke the link.
          </p>
        ) : null}
        <div className="form-grid-two">
          <label>
            Customer
            <select
              name="customer_id"
              onChange={(event) => {
                setSelectedCustomerId(event.target.value);
                setDirty(true);
              }}
              required
              value={selectedCustomerId}
            >
              <option value="">Choose customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.display_name}
                </option>
              ))}
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
