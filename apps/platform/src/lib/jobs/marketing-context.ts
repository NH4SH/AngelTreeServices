import type { JobWithRelations } from "@/lib/types/database";

export type MarketingJob = Pick<JobWithRelations, "id" | "service_type" | "requested_scope"> & {
  customers?: { display_name: string } | null;
  organizations?: { name: string } | null;
  service_locations?: { city: string } | null;
};

/** Marketing drafts do not need billing ledgers, crew notes or street addresses. */
export function marketingJobContext(job: JobWithRelations): MarketingJob {
  return {
    id: job.id, service_type: job.service_type, requested_scope: job.requested_scope,
    customers: job.customers ? { display_name: job.customers.display_name } : null,
    organizations: job.organizations ? { name: job.organizations.name } : null,
    service_locations: job.service_locations ? { city: job.service_locations.city } : null,
  };
}
