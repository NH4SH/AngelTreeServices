import type { Job, ServiceLocation } from "@/lib/types/database";

export type ContractingParty =
  | { kind: "customer"; customerId: string; organizationId: null }
  | { kind: "organization"; customerId: null; organizationId: string };

export function parseContractingParty(value: FormDataEntryValue | string | null): ContractingParty | null {
  const [kind, id, extra] = String(value ?? "").split(":");
  if (!id || extra) return null;
  if (kind === "customer") return { kind, customerId: id, organizationId: null };
  if (kind === "organization") return { kind, customerId: null, organizationId: id };
  return null;
}

export function contractingPartyValue(record: { customer_id: string | null; organization_id: string | null }) {
  if (record.organization_id) return `organization:${record.organization_id}`;
  if (record.customer_id) return `customer:${record.customer_id}`;
  return "";
}

export function belongsToContractingParty(
  record: Pick<Job | ServiceLocation, "customer_id" | "organization_id">,
  party: ContractingParty,
) {
  return party.kind === "customer"
    ? record.customer_id === party.customerId
    : record.organization_id === party.organizationId;
}
