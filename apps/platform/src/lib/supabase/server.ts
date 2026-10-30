import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import { getSupabasePublicConfig } from "./config";
import { createSupabaseServerFetch } from "./server-transport.mjs";

export const createClient = cache(async function createClient() {
  const config = getSupabasePublicConfig();

  if (!config) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(config.url, config.anonKey, {
    global: { fetch: createSupabaseServerFetch(config.url, process.env.SUPABASE_INTERNAL_URL) },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware or route handlers will refresh sessions later.
        }
      },
    },
  });
});
