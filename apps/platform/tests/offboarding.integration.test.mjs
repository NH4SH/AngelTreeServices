import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Explicit opt-in, only the standard loopback Supabase stack. Never use hosted
// credentials here. Run after a LOCAL reset including PR01/F08 and PR02.
const enabled = process.env.PR02_DISPOSABLE_STACK === "1";
const config = {
  url: process.env.SUPABASE_TEST_URL,
  key: process.env.SUPABASE_TEST_ANON_KEY,
  service: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY,
};
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
test(
  "disposable Supabase Auth: same issued JWT loses Data API/RPC access and reactivation restores it",
  { skip: !enabled },
  async (t) => {
    assert.ok(
      config.url && config.key && config.service,
      "Provide the isolated local stack test variables.",
    );
    const url = new URL(config.url);
    assert.equal(
      url.origin,
      "http://127.0.0.1:54321",
      "Only the standard disposable loopback stack is allowed.",
    );
    const service = createClient(config.url, config.service, options),
      created = [];
    const marker = randomBytes(8).toString("hex");
    const check = (result) => {
      assert.ifError(result.error);
      return result.data;
    };
    const client = (jwt) =>
      createClient(config.url, config.key, {
        ...options,
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
    async function account(role, label) {
      // The repository intentionally has no seed.sql; seed synthetic roles locally.
      check(
        await service
          .from("roles")
          .upsert({ name: role }, { onConflict: "name" }),
      );
      const email = `pr02-${label}-${marker}@example.invalid`,
        password = randomBytes(24).toString("base64url");
      const user = check(
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
      ).user;
      created.push(user.id);
      check(
        await service
          .from("profiles")
          .update({ status: "active" })
          .eq("id", user.id),
      );
      const employee = check(
        await service
          .from("employee_records")
          .insert({
            auth_user_id: user.id,
            legal_name: `PR02 disposable ${label}`,
            employment_status: "active",
            is_active: true,
          })
          .select("id")
          .single(),
      );
      const roleRow = check(
        await service.from("roles").select("id").eq("name", role).single(),
      );
      check(
        await service
          .from("user_roles")
          .insert({ user_id: user.id, role_id: roleRow.id }),
      );
      const auth = createClient(config.url, config.key, options);
      const session = check(
        await auth.auth.signInWithPassword({ email, password }),
      ).session;
      return {
        ...user,
        employeeId: employee.id,
        email,
        password,
        jwt: session.access_token,
        refresh: session.refresh_token,
        auth,
      };
    }
    try {
      // The company owner used for commands remains active throughout.
      const actor = await account("owner", "actor"),
        ownerClient = client(actor.jwt);
      for (const role of [
        "owner",
        "admin",
        "estimator",
        "payroll_admin",
        "crew",
      ])
        await t.test(role, async () => {
          const target = await account(role, role),
            oldClient = client(target.jwt);
          assert.equal(
            check(await oldClient.rpc("has_effective_platform_access")),
            true,
          );
          assert.equal(
            check(
              await oldClient.from("profiles").select("id").eq("id", target.id),
            ).length,
            1,
          );
          check(
            await oldClient.rpc("submit_my_employee_request", {
              p_request_type: "other",
              p_title: "PR02 fixture",
              p_details: "Disposable local test only.",
            }),
          );
          check(
            await ownerClient.rpc("set_employee_access_status", {
              p_employee_id: target.employeeId,
              p_status: "inactive",
              p_reason: "PR02 disposable offboarding",
            }),
          );
          // Reuse the byte-for-byte original Auth-issued JWT; no session replacement.
          assert.equal(
            check(await oldClient.rpc("has_effective_platform_access")),
            false,
          );
          for (const table of [
            "profiles",
            "user_roles",
            "employee_records",
            "jobs",
            "customers",
          ])
            assert.equal(
              check(await oldClient.from(table).select("*")).length,
              0,
              table,
            );
          assert.ok(
            (
              await oldClient.rpc("submit_my_employee_request", {
                p_request_type: "other",
                p_title: "Bypass",
                p_details: "Denied",
              })
            ).error,
          );
          assert.equal(
            check(
              await oldClient
                .from("profiles")
                .update({ status: "active" })
                .eq("id", target.id)
                .select("id"),
            ).length,
            0,
          );
          assert.ok(
            (
              await oldClient.rpc("set_employee_access_status", {
                p_employee_id: target.employeeId,
                p_status: "active",
                p_reason: "Self bypass",
              })
            ).error,
          );
          // Auth may issue new sessions because provider sessions are intentionally
          // retained. Every resulting token must still fail the database predicate.
          const fresh = check(
            await createClient(
              config.url,
              config.key,
              options,
            ).auth.signInWithPassword({
              email: target.email,
              password: target.password,
            }),
          ).session;
          assert.equal(
            check(
              await client(fresh.access_token).rpc(
                "has_effective_platform_access",
              ),
            ),
            false,
          );
          const refreshed = check(
            await target.auth.auth.refreshSession({
              refresh_token: target.refresh,
            }),
          ).session;
          assert.equal(
            check(
              await client(refreshed.access_token).rpc(
                "has_effective_platform_access",
              ),
            ),
            false,
          );
          check(
            await ownerClient.rpc("set_employee_access_status", {
              p_employee_id: target.employeeId,
              p_status: "active",
              p_reason: "PR02 disposable reactivation",
            }),
          );
          assert.equal(
            check(await oldClient.rpc("has_effective_platform_access")),
            true,
          );
          assert.equal(
            check(
              await service
                .from("time_clock_permissions")
                .select("is_enabled")
                .eq("user_id", target.id)
                .single(),
            ).is_enabled,
            false,
          );
        });
    } finally {
      // Fixtures and history remain in this disposable database until its next local
      // reset. Remove only disposable Auth identities created by this invocation.
      for (const id of created.reverse())
        check(await service.auth.admin.deleteUser(id));
    }
  },
);
