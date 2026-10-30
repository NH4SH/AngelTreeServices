import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerFetch } from "./server-transport.mjs";

let serviceRoleClient: SupabaseClient<any, "public", any> | null = null;

export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (!serviceRoleClient) {
    serviceRoleClient = createClient(url, serviceRoleKey, {
      global: { fetch: createSupabaseServerFetch(url, process.env.SUPABASE_INTERNAL_URL) },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceRoleClient;
}
