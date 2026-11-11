export const operationalLookupKinds = ["material", "equipment", "job"] as const;
export type OperationalLookupKind = typeof operationalLookupKinds[number];
export const operationalFields = {
  material_id: "material", input_material_id: "material", output_material_id: "material",
  equipment_asset_id: "equipment", vehicle_asset_id: "equipment", trailer_asset_id: "equipment", job_id: "job",
} as const;
export type OperationalFieldName = keyof typeof operationalFields;
