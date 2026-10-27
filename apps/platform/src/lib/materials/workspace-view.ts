import type { MaterialRecord } from "@/lib/data/materials";

export const materialsViews = ["overview", "catalog", "movements", "reservations", "purchases", "disposal", "production", "deliveries"] as const;
export type MaterialsView = typeof materialsViews[number];
export type MaterialCatalogFilters = { q?: string; category?: string; page?: string; edit?: string };
export const materialCatalogPageSize = 25;
export function resolveMaterialsView(value?: string): MaterialsView {
  return materialsViews.includes(value as MaterialsView) ? value as MaterialsView : "overview";
}
export function materialCatalogPageNumber(value?: string) {
  const page = Number(value);
  return /^\d+$/.test(value ?? "") && Number.isSafeInteger(page) && page > 0 && page <= Math.floor(Number.MAX_SAFE_INTEGER / materialCatalogPageSize) ? page : 1;
}
export function materialCatalogPage(materials: MaterialRecord[], filters: MaterialCatalogFilters) {
  const matching = materials.filter(material => (!filters.category || material.category === filters.category)
    && (!filters.q || [material.name, material.sku, material.description].some(value => value?.toLowerCase().includes(filters.q!.toLowerCase()))));
  const start = (materialCatalogPageNumber(filters.page) - 1) * materialCatalogPageSize;
  return { data: matching.slice(start, start + materialCatalogPageSize), count: matching.length, categories: [...new Set(materials.map(material => material.category))] };
}
