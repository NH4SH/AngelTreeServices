export const materialCategories = [
  "mulch", "chips", "logs", "green_waste", "stump_grindings", "soil", "gravel",
  "seed_sod", "plants", "fertilizer", "chemical", "fuel", "hardware",
  "ppe_consumable", "disposal", "subcontracted", "other",
] as const;

export const materialUnits = [
  "each", "bag", "bundle", "pallet", "cubic_yard", "ton", "pound", "gallon",
  "quart", "load", "truck_load", "trailer_load", "hour", "linear_foot",
  "square_foot", "acre",
] as const;

export const inventoryTransactionTypes = [
  "receive", "produce", "transfer", "reserve", "release", "load", "job_use",
  "delivery", "disposal", "donation", "return", "adjustment", "loss", "sale", "reversal",
] as const;

export const crewInventoryTransactionTypes = [
  "load", "job_use", "return", "delivery", "disposal", "donation",
] as const;

export const inventoryLocationTypes = [
  "yard", "warehouse", "truck", "trailer", "job_site", "vendor",
  "disposal_facility", "customer", "donation_site", "stockpile", "other",
] as const;

export const disposalDestinationTypes = [
  "landfill", "transfer_station", "recycling", "yard", "chipdrop", "donation",
  "community_garden", "municipal_partner", "customer", "other",
] as const;

export type MaterialCategory = (typeof materialCategories)[number];
export type MaterialUnit = (typeof materialUnits)[number];
export type InventoryTransactionType = (typeof inventoryTransactionTypes)[number];

export function materialLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatMaterialQuantity(value: number | string, unit: string, estimated = false) {
  const quantity = Number(value);
  const display = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${estimated ? "Estimated " : ""}${display} ${materialLabel(unit).toLowerCase()}`;
}

