import { firewoodProducts, firewoodTaxBasis } from "./catalog";

type Location = { street: string | null; city: string | null; state: string | null; postal_code: string | null };
type Prepared = { ok: true; form: FormData } | { ok: false; message: string };
const uuid = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

// Only this residential workflow claims the verified domestic-fuel exemption.
// Unsupported use is held for tax review; never infer it from customer type.
export function prepareFirewoodInvoice(form: FormData, existingLocation: Location | null): Prepared {
  const fail = (message: string): Prepared => ({ ok: false, message });
  if (value(form, "firewood_domestic_use") !== "confirmed") return fail("Confirm that the customer is buying the firewood for use at their own home. Business, landlord and rental-property purchases need a separate tax review.");
  const party = value(form, "contracting_party");
  const fresh = party === "new_customer";
  if (!fresh && (!party.startsWith("customer:") || !uuid.test(party.slice(9)))) return fail("Choose an individual customer for this household-use firewood invoice.");
  if (value(form, "job_id")) return fail("Create firewood as a standalone invoice. Keep tree-service work orders on their existing invoices.");
  if (!fresh && !uuid.test(value(form, "service_location_id"))) return fail("Choose the customer's delivery address before creating the firewood invoice.");
  const location = fresh ? { street: value(form, "new_customer_street"), city: value(form, "new_customer_city"), state: value(form, "new_customer_state"), postal_code: value(form, "new_customer_postal_code") } : existingLocation;
  if (!location?.street?.trim() || !location.city?.trim() || location.state?.trim().toUpperCase() !== "VA") return fail("Enter a complete Virginia delivery address for this firewood invoice. Other destinations need a separate tax review.");
  const names = form.getAll("invoice_line_item_name"), quantities = form.getAll("invoice_line_item_quantity"), prices = form.getAll("invoice_line_item_unit_price"), descriptions = form.getAll("invoice_line_item_description");
  if (!names.length || names.length > 100 || names.length !== quantities.length || names.length !== prices.length) return fail("Review the firewood quantities and prices before saving.");
  if (value(form, "notes").length > 18000 || descriptions.some(text => typeof text !== "string" || text.length > 12000)) return fail("Shorten the notes or product details before saving the firewood invoice.");
  const products = Object.values(firewoodProducts);
  let wood = false, total = 0;
  for (let i = 0; i < names.length; i++) {
    const product = products.find(item => item.name === names[i]);
    const quantity = String(quantities[i] ?? "").trim(), price = String(prices[i] ?? "").trim();
    if (!product || !/^[1-9]\d{0,2}$/.test(quantity) || Number(quantity) > 100 || !/^\d{1,7}(?:\.\d{1,2})?$/.test(price)) return fail("Use full-cord, half-cord or stacking lines with whole quantities from 1 to 100 and a valid editable price.");
    const cents = Math.round(Number(price) * 100);
    total += cents * Number(quantity);
    if (!Number.isSafeInteger(total) || total > 2147483647) return fail("The firewood invoice total is too large. Review the quantities and prices.");
    if (product !== firewoodProducts.stacking) wood = true;
  }
  if (!wood) return fail("Add at least one full-cord or half-cord line. Stacking is an optional part of a firewood delivery.");
  const prepared = new FormData();
  for (const [key, entry] of form) if (typeof entry === "string") prepared.append(key, entry);
  const address = [location.street.trim(), location.city.trim(), "VA", location.postal_code?.trim()].filter(Boolean).join(", ");
  prepared.delete("invoice_line_item_description");
  let evidenceAdded = false;
  for (let i = 0; i < names.length; i++) {
    const evidence = !evidenceAdded && names[i] !== firewoodProducts.stacking.name ? firewoodTaxBasis : "";
    if (evidence) evidenceAdded = true;
    prepared.append("invoice_line_item_description", [String(descriptions[i] ?? "").trim(), evidence].filter(Boolean).join("\n"));
  }
  prepared.set("notes", [value(form, "notes"), "Firewood household-use confirmation recorded by staff for this purchase and delivery address.", firewoodTaxBasis, `Delivery address: ${address}.`, "Order-taking business location: 5802 Ford Rd, Fredericksburg, VA 22407 (Spotsylvania County)."].filter(Boolean).join("\n"));
  // No browser-supplied financial status, total or tax value becomes authority.
  // Existing create_standalone_invoice derives the zero-tax draft atomically.
  prepared.delete("tax_cents"); prepared.delete("total_cents"); prepared.delete("invoice_id");
  return { ok: true, form: prepared };
}
