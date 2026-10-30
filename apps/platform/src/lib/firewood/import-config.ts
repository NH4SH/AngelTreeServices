import "server-only";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { type FirewoodImportConfig } from "./import-handler.ts";

/** Dedicated credentials only. This route cannot select a hosted database or
 * use the CRM's generic Stripe/Supabase credentials. Live keys are refused. */
export function getFirewoodTestImportDependencies(env = process.env) {
  if (env.FIREWOOD_TEST_IMPORT_ENABLED !== "1") return null;
  const sourceId = env.FIREWOOD_TEST_IMPORT_SOURCE_ID ?? "", accountId = env.FIREWOOD_TEST_STRIPE_ACCOUNT_ID ?? "";
  const signingSecret = env.FIREWOOD_TEST_IMPORT_SHARED_SECRET ?? "", keyId = env.FIREWOOD_TEST_IMPORT_KEY_ID ?? "";
  const environmentId = env.FIREWOOD_TEST_PROJECT_ID ?? "", url = env.FIREWOOD_TEST_SUPABASE_URL ?? "", serviceKey = env.FIREWOOD_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "";
  const stripeKey = env.FIREWOOD_TEST_STRIPE_KEY ?? "";
  try {
    const target = new URL(url);
    if (!/^[a-z][a-z0-9_-]{2,63}$/.test(sourceId) || !/^acct_[A-Za-z0-9]+$/.test(accountId) || !/^[A-Za-z0-9_-]{1,64}$/.test(keyId)
      || signingSecret.length < 32 || !/^ats_fwimport_[a-f0-9]{12}$/.test(environmentId)
      || target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !target.port || target.pathname !== "/" || target.search || target.username || target.password
      || !serviceKey || !/^(?:(?:sk|rk)_test_|rkcs_test_)[A-Za-z0-9]+$/.test(stripeKey)) return null;
    let transport: { host?: string; port?: number; protocol?: "http" } = {};
    if (env.FIREWOOD_TEST_STRIPE_API_ORIGIN) {
      const mock = new URL(env.FIREWOOD_TEST_STRIPE_API_ORIGIN);
      if (mock.protocol !== "http:" || mock.hostname !== "127.0.0.1" || !mock.port || mock.pathname !== "/" || mock.search || mock.username || mock.password) return null;
      transport = { host: "127.0.0.1", port: Number(mock.port), protocol: "http" };
    }
    const config: FirewoodImportConfig = { sourceId, accountId, signingSecret, keyId, environmentId };
    return { config, supabase: createClient(target.href, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
      stripe: new Stripe(stripeKey, { timeout: 5000, maxNetworkRetries: 0, ...transport }) };
  } catch { return null; }
}
