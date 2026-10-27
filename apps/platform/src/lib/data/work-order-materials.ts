import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasAllowedRole, platformRoleGroups, type PlatformRoleName } from "@/lib/auth/roles";
import type { MaterialRecord } from "@/lib/data/materials";

export type MaterialPlanOption = Pick<MaterialRecord, "id" | "name" | "default_unit">;
export type WorkOrderMaterialRequirement = {
  id: string; job_id: string; material_id: string; planned_quantity: number;
  unit: string; notes: string | null; is_estimated: boolean;
};
type MaterialPlan = { materials: MaterialPlanOption[]; requirements: WorkOrderMaterialRequirement[] };

/** Office planning needs neither stock movements nor disposal/reservation history. */
export async function getWorkOrderMaterialPlan(jobId: string, roles: PlatformRoleName[], userId: string): Promise<{ data: MaterialPlan | null; error: string | null }> {
  const unavailable = "Material planning could not load completely. Reload before adding materials.";
  try {
    const db = await createClient();
    if (!db) return { data: null, error: "Supabase is not configured." };
    const [parent, materials] = await Promise.all([
      db.from("jobs").select(`id, assigned_crew_user_id,
        job_material_requirements!job_material_requirements_job_id_fkey(id, job_id, material_id, planned_quantity, unit, notes, is_estimated)`)
        .eq("id", jobId).order("created_at", { referencedTable: "job_material_requirements", ascending: true })
        .order("id", { referencedTable: "job_material_requirements", ascending: true }).maybeSingle(),
      (async () => {
        const rows: MaterialPlanOption[] = [], ids = new Set<string>();
        for (let from = 0; ; from += 1000) {
          const result = await db.from("material_catalog").select("id, name, default_unit")
            .eq("is_active", true).is("archived_at", null).order("name").order("id").range(from, from + 999);
          if (result.error || !Array.isArray(result.data)) throw Error(unavailable);
          for (const row of result.data) {
            if (!row || typeof row.id !== "string" || ids.has(row.id) || typeof row.name !== "string" || !row.name || typeof row.default_unit !== "string" || !row.default_unit) throw Error(unavailable);
            ids.add(row.id); rows.push(row);
          }
          if (result.data.length < 1000) return rows;
        }
      })(),
    ]);
    const job = parent.data;
    if (parent.error || !job || job.id !== jobId || !Array.isArray(job.job_material_requirements)) return { data: null, error: unavailable };
    if (!hasAllowedRole(roles, platformRoleGroups.internalStaff) && job.assigned_crew_user_id !== userId) return { data: null, error: "This work order is not assigned to your account." };
    const requirements = job.job_material_requirements as WorkOrderMaterialRequirement[];
    if (new Set(requirements.map(row => row?.id)).size !== requirements.length || requirements.some(row => !row || typeof row.id !== "string" || row.job_id !== jobId || typeof row.material_id !== "string" || !Number.isFinite(row.planned_quantity) || row.planned_quantity <= 0 || typeof row.unit !== "string" || typeof row.is_estimated !== "boolean" || !(row.notes === null || typeof row.notes === "string"))) return { data: null, error: unavailable };
    return { data: { materials, requirements }, error: null };
  } catch { return { data: null, error: unavailable }; }
}
