export type ScopePreset = { id: string; label: string; kind: "scope" | "debris"; name: string; description: string; debrisHandling: string };
export const PRESET_PREFIX = "ats-personal-wording-v1:";
export const debrisChoices = ["", "haul_all", "leave_wood", "leave_chips", "leave_wood_and_chips", "partial_haul", "other"];

export function parseScopePresets(raw: string | null): ScopePreset[] {
  if (!raw || raw.length > 200_000) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 40) return [];
    const result: ScopePreset[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      if (!value || typeof value !== "object" || seen.has(value.id) || typeof value.id !== "string" || value.id.length > 100
        || !["scope", "debris"].includes(value.kind) || typeof value.label !== "string" || !value.label.trim() || value.label.length > 80
        || typeof value.name !== "string" || value.name.length > 300 || typeof value.description !== "string" || value.description.length > 6000
        || !debrisChoices.includes(value.debrisHandling)) return [];
      seen.add(value.id);
      // Explicit projection excludes prices, quantities, customer IDs and any
      // unexpected properties, even from hand-edited browser storage.
      result.push({ id: value.id, label: value.label, kind: value.kind, name: value.name, description: value.description, debrisHandling: value.debrisHandling });
    }
    return result;
  } catch { return []; }
}
