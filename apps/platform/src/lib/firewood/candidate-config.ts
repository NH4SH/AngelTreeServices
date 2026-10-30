import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { type FirewoodImportConfig } from "./candidate-handler.ts";
import {SANDBOX_ACCOUNT} from "./candidate-contract.mjs";

/** Dedicated credentials only. This route cannot select a hosted database or
 * use the CRM's generic Stripe/Supabase credentials. Live keys are refused. */
export function getFirewoodCandidateDependencies(env = process.env) {
  if (env.FIREWOOD_CANDIDATE_IMPORT_ENABLED !== "1") return null;
  const sourceId = env.FIREWOOD_CANDIDATE_IMPORT_SOURCE_ID ?? "", accountId = env.FIREWOOD_CANDIDATE_STRIPE_ACCOUNT_ID ?? "";
  const signingSecret = env.FIREWOOD_CANDIDATE_IMPORT_SHARED_SECRET ?? "", keyId = env.FIREWOOD_CANDIDATE_IMPORT_KEY_ID ?? "";
  const environmentId = env.FIREWOOD_CANDIDATE_PROJECT_ID ?? "", url = env.FIREWOOD_CANDIDATE_SUPABASE_URL ?? "", serviceKey = env.FIREWOOD_CANDIDATE_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const stripeKey = env.FIREWOOD_CANDIDATE_STRIPE_KEY ?? "";
  try {
    const target = new URL(url);
    if (sourceId !== "website_firewood_candidate_v1" || accountId !== SANDBOX_ACCOUNT || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId)
      || !/^[A-Za-z0-9_-]{32,256}$/.test(signingSecret) || !/^ats_fwcandidate_[a-f0-9]{12}$/.test(environmentId)
      || target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !target.port || target.pathname !== "/" || target.search || target.hash || target.username || target.password
      || !serviceKey || !/^(?:(?:sk|rk)_test_|rkcs_test_)[A-Za-z0-9]+$/.test(stripeKey)) return null;
    let transport: { host?: string; port?: number; protocol?: "http" } = {};
    if (env.FIREWOOD_CANDIDATE_STRIPE_API_ORIGIN) {
      const mock = new URL(env.FIREWOOD_CANDIDATE_STRIPE_API_ORIGIN);
      if (mock.protocol !== "http:" || mock.hostname !== "127.0.0.1" || !mock.port || mock.pathname !== "/" || mock.search || mock.hash || mock.username || mock.password) return null;
      transport = { host: "127.0.0.1", port: Number(mock.port), protocol: "http" };
    }
    const config: FirewoodImportConfig = { sourceId, accountId, signingSecret, keyId, environmentId };
    return { config, supabase: createClient(target.href, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
      stripe: new Stripe(stripeKey, { timeout: 5000, maxNetworkRetries: 0, ...transport }) };
  } catch { return null; }
}
