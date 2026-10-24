"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRoles, hasAllowedRole, platformRoleGroups } from "@/lib/auth/roles";
import { prepareFirewoodInvoice } from "@/lib/firewood/prepare-invoice";
import { createInvoice, type InvoiceActionState } from "@/app/admin/invoices/actions";

export async function createFirewoodInvoice(previous: InvoiceActionState, form: FormData): Promise<InvoiceActionState> {
  const client = await createClient();
  if (!client) return { status: "error", message: "Supabase is not configured." };
  const { data: { user } } = await client.auth.getUser();
  if (!user || !hasAllowedRole(await getUserRoles(client, user.id), platformRoleGroups.internalStaff)) return { status: "error", message: "Only active office staff may create firewood invoices." };
  let location = null;
  if (form.get("contracting_party") !== "new_customer") {
    const id = String(form.get("service_location_id") ?? "");
    if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return { status: "error", message: "Choose the customer's delivery address before creating the firewood invoice." };
    let result;
    try { result = await client.from("service_locations").select("id,customer_id,organization_id,street,city,state,postal_code")
      .eq("id", id).limit(1).abortSignal(AbortSignal.timeout(5_000)).maybeSingle(); }
    catch { return { status: "error", message: "The delivery address could not be checked. Refresh before creating the firewood invoice." }; }
    if (result.error || !result.data || result.data.id !== id || `customer:${result.data.customer_id}` !== form.get("contracting_party") || result.data.organization_id) return { status: "error", message: "The delivery address could not be confirmed for this customer. Refresh and choose it again." };
    location = result.data;
  }
  const prepared = prepareFirewoodInvoice(form, location);
  if (!prepared.ok) return { status: "error", message: prepared.message };
  const result = await createInvoice(previous, prepared.form, "firewood_household");
  if (result.status === "success") revalidatePath("/admin/firewood");
  return result;
}
