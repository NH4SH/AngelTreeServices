"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { CustomerWithLocations } from "@/lib/types/database";
import { AddCustomerForm, AddServiceLocationForm } from "./CustomerForms";

export function CustomerCreationTools({
  customers,
}: {
  customers: Pick<CustomerWithLocations, "id" | "display_name">[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside className={`customer-creation-tools ${open ? "is-open" : ""}`}>
      <button
        aria-controls="customer-creation-content"
        aria-expanded={open}
        className="primary-action customer-creation-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Plus aria-hidden="true" size={18} />
        Add customer
      </button>

      <div className="customer-creation-content" id="customer-creation-content">
        <section className="form-panel">
          <div className="customer-creation-heading">
            <div>
              <h2>Add customer</h2>
              <p className="form-panel-copy">Start the account with the main contact and first service address.</p>
            </div>
            <button aria-label="Close add customer form" className="customer-creation-close" onClick={() => setOpen(false)} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </div>
          <AddCustomerForm />
        </section>
        <section className="form-panel customer-secondary-tool">
          <h2>Add service location</h2>
          <p className="form-panel-copy">Add another property to an existing customer.</p>
          <AddServiceLocationForm customers={customers} />
        </section>
      </div>
    </aside>
  );
}
