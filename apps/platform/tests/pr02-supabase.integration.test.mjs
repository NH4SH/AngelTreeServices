import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const enabled =
  process.env.PR02_DISPOSABLE_STACK === "1" &&
  Boolean(process.env.PR02_LOCAL_STATUS_FILE);
const opts = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const categories = [
  "before",
  "during",
  "after",
  "issue",
  "equipment_access",
  "completion",
];
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

test(
  "PR02 disposable real Supabase HTTP, web sessions, storage, RLS and concurrent commands",
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    const c = JSON.parse(
      readFileSync(process.env.PR02_LOCAL_STATUS_FILE, "utf8"),
    );
    assert.equal(c.API_URL, "http://127.0.0.1:54321");
    assert.match(
      process.env.DOCKER_HOST ?? "",
      /^unix:\/\//,
      "Require an explicit local Docker socket",
    );
    const docker = process.env.PR02_DOCKER_BIN;
    assert.ok(docker);
    const service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, opts);
    const check = (r, label = "request") => {
      assert.ifError(
        r.error &&
          Object.assign(new Error(`${label}: ${r.error.message}`), {
            code: r.error.code,
          }),
      );
      return r.data;
    };
    const userClient = (jwt) =>
      createClient(c.API_URL, c.ANON_KEY, {
        ...opts,
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
    const marker = randomBytes(5).toString("hex"),
      report = {
        marker,
        roles: [],
        storage: [],
        concurrency: [],
        blast: [],
        recommendation: {},
        web: [],
        commands: [],
      };
    async function sql(source) {
      return await new Promise((resolve, reject) => {
        const p = spawn(
          docker,
          [
            "exec",
            "-i",
            "supabase_db_ats_pr02_disposable",
            "psql",
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
          ],
          { env: process.env },
        );
        let out = "",
          err = "";
        p.stdout.on("data", (b) => (out += b));
        p.stderr.on("data", (b) => (err += b));
        p.on("error", reject);
        p.on("exit", (code) =>
          code === 0 ? resolve(out.trim()) : reject(new Error(err)),
        );
        p.stdin.end(source);
      });
    }
    async function account(role, label = role) {
      check(
        await service
          .from("roles")
          .upsert({ name: role }, { onConflict: "name" }),
        "fixture role",
      );
      const email = `pr02-http-${label}-${marker}@example.invalid`,
        password = randomBytes(24).toString("base64url");
      const u = check(
        await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        }),
        "fixture Auth",
      ).user;
      const employee = check(
        await service
          .from("employee_records")
          .insert({
            auth_user_id: u.id,
            legal_name: `PR02 ${label} ${marker}`,
            employment_status: "active",
            is_active: true,
          })
          .select("id")
          .single(),
        "fixture employee",
      );
      const roleRow = check(
        await service.from("roles").select("id").eq("name", role).single(),
      );
      check(
        await service
          .from("user_roles")
          .insert({ user_id: u.id, role_id: roleRow.id }),
      );
      check(
        await service
          .from("time_clock_permissions")
          .upsert({ user_id: u.id, is_enabled: true }),
      );
      const auth = createClient(c.API_URL, c.ANON_KEY, opts),
        session = check(
          await auth.auth.signInWithPassword({ email, password }),
          "password sign-in",
        ).session;
      return {
        id: u.id,
        employeeId: employee.id,
        email,
        password,
        auth,
        session,
        client: userClient(session.access_token),
        role,
      };
    }
    const lifecycle = (actor, u, status = "inactive") =>
      actor.client.rpc("set_employee_access_status", {
        p_employee_id: u.employeeId,
        p_status: status,
        p_reason: `PR02 disposable ${marker}`,
      });
    const roles = (actor, u, names) =>
      actor.client.rpc("replace_platform_user_roles", {
        p_target_user_id: u.id,
        p_role_names: names,
        p_reason: `PR02 race ${marker}`,
      });
    const offboard = async (actor, u, status = "inactive") =>
      check(await lifecycle(actor, u, status), "lifecycle");
    const read = async (u, table) =>
      check(await u.client.from(table).select("*"), `${u.role} read ${table}`);
    let webProcess, webFd;
    try {
      const owner = await account("owner", "controller"),
        admin = await account("admin", "controller-admin"),
        unassigned = await account("crew", "unassigned");
      const organization = check(
        await service
          .from("organizations")
          .insert({ name: `PR02 org ${marker}` })
          .select("id")
          .single(),
      );
      const customer = check(
        await service
          .from("customers")
          .insert({ display_name: `PR02 customer ${marker}` })
          .select("id")
          .single(),
      );
      const location = check(
        await service
          .from("service_locations")
          .insert({
            customer_id: customer.id,
            street: "1 Disposable Fixture Way",
            city: "Fredericksburg",
          })
          .select("id")
          .single(),
      );
      const otherJob = check(
        await service
          .from("jobs")
          .insert({
            customer_id: customer.id,
            service_location_id: location.id,
            status: "scheduled",
            requested_scope: `PR02 unassigned ${marker}`,
          })
          .select("id")
          .single(),
      );
      const common = {
        customer_id: customer.id,
        service_location_id: location.id,
        status: "scheduled",
      };
      async function jobSet(u) {
        const jobs = [];
        for (const path of [
          "legacy",
          "employee",
          "session_user",
          "session_employee",
        ]) {
          const job = check(
            await service
              .from("jobs")
              .insert({
                ...common,
                requested_scope: `PR02 ${u.role} ${path} ${marker}`,
                assigned_crew_user_id: path === "legacy" ? u.id : null,
                assigned_crew_employee_id:
                  path === "employee" ? u.employeeId : null,
              })
              .select("id")
              .single(),
          );
          jobs.push(job.id);
          if (path.startsWith("session")) {
            const event = check(
              await service
                .from("schedule_events")
                .insert({
                  job_id: job.id,
                  title: `PR02 session ${marker}`,
                  event_type: "job",
                  starts_at: new Date(Date.now() + 3600000).toISOString(),
                  ends_at: new Date(Date.now() + 7200000).toISOString(),
                })
                .select("id")
                .single(),
            );
            check(
              await service.from("schedule_event_assignments").insert({
                event_id: event.id,
                user_id: path === "session_user" ? u.id : null,
                employee_id: path === "session_employee" ? u.employeeId : null,
              }),
            );
            // Simulate genuine legacy rows without the identity-normalization counterpart.
            await sql(
              `begin;alter table public.schedule_event_assignments disable trigger schedule_event_assignments_sync_employee_identity;update public.schedule_event_assignments set ${path === "session_user" ? "employee_id=null" : "user_id=null"} where event_id='${event.id}';alter table public.schedule_event_assignments enable trigger schedule_event_assignments_sync_employee_identity;commit;`,
            );
          } else
            await sql(
              `begin;alter table public.jobs disable trigger jobs_sync_crew_identity;update public.jobs set ${path === "legacy" ? "assigned_crew_employee_id=null" : "assigned_crew_user_id=null"} where id='${job.id}';alter table public.jobs enable trigger jobs_sync_crew_identity;commit;`,
            );
        }
        check(
          await service
            .from("quotes")
            .insert({ job_id: jobs[0], customer_id: customer.id }),
        );
        check(
          await service
            .from("invoices")
            .insert({ job_id: jobs[0], customer_id: customer.id }),
        );
        return jobs;
      }
      const crew = await account("crew", "recommendation-crew"),
        crewJobs = await jobSet(crew);
      await t.test(
        "recommendation assigned/different/unassigned/staff/inactive behavior",
        async () => {
          const call = (u, id) =>
            u.client.rpc("submit_crew_service_recommendation", {
              p_job_id: id,
              p_title: `PR02 recommendation ${marker}`,
              p_description: "Disposable authorization fixture",
              p_timeframe: "next_month",
              p_internal_notes: null,
            });
          check(await call(crew, crewJobs[0]), "assigned recommendation");
          assert.ok(
            (await call(unassigned, crewJobs[0])).error,
            "different crew must fail",
          );
          const nullAssignment = await call(unassigned, otherJob.id);
          const fixed = process.env.PR02_EXPECT_RECOMMENDATION_FIX === "1";
          assert.equal(
            Boolean(nullAssignment.error),
            fixed,
            "unassigned-job pre/post fix reproduction",
          );
          check(await call(admin, otherJob.id), "staff recommendation");
          if (fixed) {
            check(
              await call(crew, crewJobs[1]),
              "durable employee recommendation",
            );
            check(await call(crew, crewJobs[2]), "session user recommendation");
            check(
              await call(crew, crewJobs[3]),
              "session employee recommendation",
            );
          }
          await offboard(owner, crew);
          for (const id of [crewJobs[0], otherJob.id, crewJobs[2]])
            assert.ok((await call(crew, id)).error);
          await offboard(owner, crew, "active");
          report.recommendation = {
            assigned: "PASS",
            differentCrew: "DENIED",
            unassigned: fixed ? "DENIED" : "BYPASS CONFIRMED",
            staff: "PASS",
            inactive: "DENIED",
            fixed,
          };
        },
      );
      if (process.env.PR02_REPRO_ONLY === "1") return;
      // Start an isolated app process with ONLY local public Supabase configuration.
      const appEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_SUPABASE_URL: c.API_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: c.ANON_KEY,
      };
      assert.ok(process.env.PR02_WEB_LOG);
      webFd = openSync(process.env.PR02_WEB_LOG, "a", 0o600);
      webProcess = spawn(
        process.execPath,
        [
          "node_modules/next/dist/bin/next",
          "dev",
          "--webpack",
          "--hostname",
          "127.0.0.1",
          "--port",
          "3102",
        ],
        {
          cwd: new URL("../", import.meta.url),
          env: appEnv,
          stdio: ["ignore", webFd, webFd],
        },
      );
      for (let n = 0; n < 120; n++) {
        try {
          if ((await fetch("http://127.0.0.1:3102/login")).status === 200)
            break;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
        if (n === 119) throw Error("Disposable Next server not ready");
      }
      async function cookie(u) {
        const jar = [];
        const ssr = createServerClient(c.API_URL, c.ANON_KEY, {
          cookies: {
            getAll: () => jar,
            setAll: (items) => {
              for (const item of items) {
                const i = jar.findIndex((x) => x.name === item.name);
                if (i >= 0) jar[i] = item;
                else jar.push(item);
              }
            },
          },
        });
        check(
          await ssr.auth.signInWithPassword({
            email: u.email,
            password: u.password,
          }),
          "SSR sign-in",
        );
        return jar.map((x) => `${x.name}=${x.value}`).join("; ");
      }
      async function web(u, header, job, active) {
        const res = await fetch(`http://127.0.0.1:3102/crew/jobs/${job}`, {
          headers: { cookie: header },
        });
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.equal(
          html.includes(
            "Crew access stays locked until the request is approved.",
          ),
          !active,
        );
        assert.equal(
          html.includes(`PR02 ${u.role} legacy ${marker}`),
          active,
          "actual job scope is present only while authorized",
        );
        const api = await fetch(
          "http://127.0.0.1:3102/api/crew/jobs?scope=active",
          { headers: { Authorization: `Bearer ${u.session.access_token}` } },
        );
        assert.equal(api.status, active ? 200 : 403);
        if (u.role !== "crew") {
          const reports = await fetch("http://127.0.0.1:3102/admin/reports", {
            headers: { cookie: header },
          });
          assert.equal(reports.status, 200);
          const reportsHtml = await reports.text();
          assert.equal(
            reportsHtml.includes(
              "Admin and operations routes stay protected until approval is complete.",
            ),
            !active,
          );
          if (active) assert.ok(reportsHtml.includes("Business reporting"));
        }
        report.web.push({
          role: u.role,
          active,
          cookieStatus: res.status,
          accessShell: !active,
          bearerStatus: api.status,
        });
      }
      for (const role of [
        "owner",
        "admin",
        "estimator",
        "payroll_admin",
        "crew",
      ])
        await t.test(
          `real old JWT, RLS, storage and web: ${role}`,
          async () => {
            const u = await account(role, `matrix-${role}`),
              jobs = await jobSet(u),
              cookieHeader = await cookie(u),
              jwt = u.session.access_token;
            assert.equal(
              check(await u.client.rpc("has_effective_platform_access")),
              true,
            );
            for (const id of jobs)
              assert.equal(
                check(await u.client.from("jobs").select("id").eq("id", id))
                  .length,
                1,
                "active assignment path",
              );
            for (const table of ["customers", "employee_records"])
              assert.ok((await read(u, table)).length > 0);
            if (role !== "crew")
              for (const table of ["organizations", "quotes", "invoices"])
                assert.ok((await read(u, table)).length > 0, table);
            await web(u, cookieHeader, jobs[0], true);
            const storagePaths = [];
            for (const category of categories) {
              const path = `${jobs[0]}/${category}/${marker}.png`;
              check(
                await u.client.storage
                  .from("job-photos")
                  .upload(path, png, { contentType: "image/png" }),
                "active photo " + category,
              );
              assert.ok(
                check(await u.client.storage.from("job-photos").download(path))
                  .size > 0,
              );
              storagePaths.push(path);
              report.storage.push({
                role,
                category,
                active: "upload/read PASS",
              });
            }
            const signed = check(
              await u.client.storage
                .from("job-photos")
                .createSignedUrl(storagePaths[0], 60),
            ).signedUrl;
            const privileged = await service.from("job_photos").insert({
              job_id: jobs[0],
              uploaded_by_user_id: u.id,
              photo_type: "before",
              storage_path: storagePaths[0],
            });
            check(privileged);
            if (role === "crew") {
              assert.ok(
                (
                  await unassigned.client.storage
                    .from("job-photos")
                    .download(storagePaths[0])
                ).error,
                "unassigned crew read",
              );
              assert.ok(
                (
                  await unassigned.client.storage
                    .from("job-photos")
                    .upload(`${jobs[0]}/before/unassigned.png`, png, {
                      contentType: "image/png",
                    })
                ).error,
                "unassigned crew upload",
              );
              assert.ok(
                (
                  await u.client.storage
                    .from("job-photos")
                    .upload(`${otherJob.id}/before/cross.png`, png, {
                      contentType: "image/png",
                    })
                ).error,
                "cross job",
              );
            }
            for (const path of [
              `bad/before/${marker}.png`,
              `${jobs[0]}/unsupported/${marker}.png`,
              `${jobs[0]}/before/nested/${marker}.png`,
            ])
              assert.ok(
                (
                  await u.client.storage
                    .from("job-photos")
                    .upload(path, png, { contentType: "image/png" })
                ).error,
                "malformed/unsupported",
              );
            assert.notEqual(
              (
                await fetch(
                  `${c.API_URL}/storage/v1/object/public/job-photos/${storagePaths[0]}`,
                )
              ).status,
              200,
              "anonymous public URL",
            );
            const anon = createClient(c.API_URL, c.ANON_KEY, opts);
            assert.ok(
              (await anon.storage.from("job-photos").download(storagePaths[0]))
                .error,
              "anonymous authenticated API",
            );
            assert.ok(
              (
                await anon.storage
                  .from("job-photos")
                  .upload(`${jobs[0]}/before/anon.png`, png, {
                    contentType: "image/png",
                  })
              ).error,
              "anonymous upload",
            );
            const beforeClock = check(
              await u.client
                .from("time_clock_permissions")
                .select("is_enabled")
                .eq("user_id", u.id)
                .single(),
            );
            assert.equal(beforeClock.is_enabled, true);
            await offboard(owner, u);
            assert.equal(u.session.access_token, jwt, "unchanged original JWT");
            check(
              await u.client.auth.getUser(jwt),
              "Auth still recognizes original JWT",
            );
            assert.equal(
              check(await u.client.rpc("has_effective_platform_access")),
              false,
            );
            for (const table of [
              "jobs",
              "customers",
              "quotes",
              "invoices",
              "employee_records",
              "profiles",
              "user_roles",
              "job_photos",
            ])
              assert.equal(
                (await read(u, table)).length,
                0,
                "inactive " + table,
              );
            for (const id of jobs)
              assert.equal(
                check(await u.client.from("jobs").select("id").eq("id", id))
                  .length,
                0,
                "inactive assignment path",
              );
            assert.equal(
              check(
                await u.client
                  .from("profiles")
                  .update({ status: "active" })
                  .eq("id", u.id)
                  .select("id"),
              ).length,
              0,
            );
            assert.equal(
              check(
                await u.client
                  .from("employee_records")
                  .update({ is_active: true })
                  .eq("id", u.employeeId)
                  .select("id"),
              ).length,
              0,
            );
            const attemptedRole = check(
              await service
                .from("roles")
                .select("id")
                .eq("name", role === "owner" ? "admin" : "owner")
                .single(),
            );
            const roleWrite = await u.client
              .from("user_roles")
              .insert({ user_id: u.id, role_id: attemptedRole.id });
            assert.equal(
              roleWrite.error?.code,
              "42501",
              "well-formed role write is denied by privilege, not a bad foreign key",
            );
            assert.ok(
              (await u.client.rpc("start_assigned_job", { p_job_id: jobs[0] }))
                .error,
            );
            assert.ok((await lifecycle(u, u, "active")).error);
            assert.ok(
              (
                await admin.client
                  .from("profiles")
                  .update({ status: "active" })
                  .eq("id", u.id)
              ).error,
              "direct admin restore blocked",
            );
            for (const path of storagePaths)
              assert.ok(
                (await u.client.storage.from("job-photos").download(path))
                  .error,
                "old JWT storage read",
              );
            assert.ok(
              (
                await u.client.storage
                  .from("job-photos")
                  .upload(`${jobs[0]}/before/inactive.png`, png, {
                    contentType: "image/png",
                  })
              ).error,
              "old JWT storage upload",
            );
            assert.equal(
              (await fetch(signed)).status,
              200,
              "already issued signed URL remains bearer capability",
            );
            await web(u, cookieHeader, jobs[0], false);
            const refreshed = check(
              await u.auth.auth.refreshSession({
                refresh_token: u.session.refresh_token,
              }),
              "refresh",
            ).session;
            assert.equal(
              check(
                await userClient(refreshed.access_token).rpc(
                  "has_effective_platform_access",
                ),
              ),
              false,
            );
            const fresh = check(
              await createClient(
                c.API_URL,
                c.ANON_KEY,
                opts,
              ).auth.signInWithPassword({
                email: u.email,
                password: u.password,
              }),
              "fresh login",
            ).session;
            assert.equal(
              check(
                await userClient(fresh.access_token).rpc(
                  "has_effective_platform_access",
                ),
              ),
              false,
            );
            await offboard(owner, u, "active");
            assert.equal(
              check(await u.client.rpc("has_effective_platform_access")),
              true,
            );
            for (const id of jobs)
              assert.equal(
                check(await u.client.from("jobs").select("id").eq("id", id))
                  .length,
                1,
              );
            assert.equal(
              check(
                await service
                  .from("time_clock_permissions")
                  .select("is_enabled")
                  .eq("user_id", u.id)
                  .single(),
              ).is_enabled,
              false,
            );
            await web(u, cookieHeader, jobs[0], true);
            report.roles.push({
              role,
              active: "PASS",
              sameJwt: "DENIED (Auth accepts)",
              refresh: "Auth succeeds; CRM denied",
              freshSignIn: "Auth succeeds; CRM denied",
              reactivation:
                "old JWT/cookie/assignments restored; timer disabled",
            });
          },
        );
      // Broad active account regression smoke. SQL transaction temporarily removes
      // only new restrictive policies, compares counts, and ROLLS BACK every change.
      await t.test(
        "active RLS blast-radius regression comparison",
        async () => {
          const tables = [
            "customers",
            "organizations",
            "jobs",
            "quotes",
            "invoices",
            "schedule_events",
            "employee_records",
            "time_entries",
            "equipment_assets",
            "material_catalog",
            "documents",
            "job_photos",
            "admin_notifications",
            "admin_notification_preferences",
            "reporting_settings",
          ];
          check(
            await service.from("equipment_assets").insert({
              asset_number: `PR02-${marker}`,
              name: "Disposable equipment",
              category: "other",
            }),
          );
          check(
            await service.from("material_catalog").insert({
              name: `Disposable material ${marker}`,
              category: "other",
              default_unit: "each",
            }),
          );
          check(
            await service.from("documents").insert({
              title: "Disposable document",
              document_type: "other",
              storage_path: `fixture/${marker}.pdf`,
              access_classification: "staff",
            }),
          );
          for (const role of [
            "owner",
            "admin",
            "estimator",
            "payroll_admin",
            "crew",
          ]) {
            const u = await account(role, `blast-${role}`);
            check(
              await service.from("time_entries").insert({
                user_id: u.id,
                entry_type: "other",
                status: "active",
                clock_in_at: new Date().toISOString(),
              }),
            );
            check(
              await service
                .from("admin_notification_preferences")
                .upsert({ user_id: u.id }),
            );
            const activity = check(
              await service
                .from("activity_log")
                .insert({
                  actor_user_id: u.id,
                  actor_type: "system",
                  subject_type: "employee",
                  subject_id: u.employeeId,
                  event_type: "pr02_disposable_notice",
                  metadata_json: {},
                })
                .select("id")
                .single(),
            );
            check(
              await service.from("admin_notifications").insert({
                activity_id: activity.id,
                recipient_user_id: u.id,
                category: "other",
                title: "Disposable notice",
                email_status: "skipped",
              }),
            );
            const before = {};
            for (const table of tables) {
              const rows = await read(u, table);
              before[table] = rows.length;
            }
            const counts = tables
              .map(
                (table) => `'${table}',(select count(*) from public.${table})`,
              )
              .join(",");
            const claims = JSON.stringify({ sub: u.id, role: "authenticated" });
            const baseline = await sql(
              `begin;select set_config('request.jwt.claims','${claims}',true);${tables.map((table) => `drop policy "Effective platform access required" on public.${table};`).join("")}set local role authenticated;select jsonb_build_object(${counts});rollback;`,
            );
            const parsed = JSON.parse(
              baseline
                .split("\n")
                .findLast(
                  (line) => line.startsWith("{") && line.includes("customers"),
                ),
            );
            assert.deepEqual(
              before,
              parsed,
              "account gate must preserve active table visibility",
            );
            report.blast.push({ role, counts: before });
          }
        },
      );
      await t.test(
        "concurrent owner/role/offboarding transactions on separate connections",
        async () => {
          async function race(requests) {
            const blocker = sql(
              "set application_name='pr02-lock-blocker';begin;select pg_advisory_xact_lock(hashtext('platform-role-management'));select pg_sleep(4);commit;",
            );
            let ready = false;
            for (let attempt = 0; attempt < 20; attempt++) {
              ready =
                (await sql(
                  "select exists(select 1 from pg_stat_activity where application_name='pr02-lock-blocker' and wait_event='PgSleep')",
                )) === "t";
              if (ready) break;
              await new Promise((r) => setTimeout(r, 100));
            }
            assert.equal(
              ready,
              true,
              "blocker must own lock before HTTP race starts",
            );
            // Supabase request builders are lazy thenables: start both requests NOW.
            const pending = requests.map((fn) => Promise.resolve(fn()));
            await new Promise((r) => setTimeout(r, 300));
            const waiting = Number(
              await sql(
                "select count(*) from pg_locks where locktype='advisory' and not granted",
              ),
            );
            const result = await Promise.all(pending);
            await blocker;
            report.commands.push({
              raceLockWaiters: waiting,
              outcomes: result.map((r) =>
                r.error
                  ? { code: r.error.code, message: r.error.message }
                  : { ok: true },
              ),
            });
            assert.ok(
              waiting >= 1,
              "real database advisory-lock contention observed",
            );
            return { result, waiting };
          }
          const a = await account("owner", "race-owner-a"),
            b = await account("owner", "race-owner-b");
          // Retire the controller role locally so these are the only effective owners.
          const ownerRole = check(
            await service
              .from("roles")
              .select("id")
              .eq("name", "owner")
              .single(),
          );
          const ownerRows = check(
            await service
              .from("user_roles")
              .select("user_id")
              .eq("role_id", ownerRole.id),
          );
          for (const row of ownerRows) {
            if ([a.id, b.id].includes(row.user_id)) continue;
            const eligibility = await sql(
              `select app_private.effective_platform_access('${row.user_id}')`,
            );
            if (eligibility === "t")
              check(
                await roles(a, { id: row.user_id }, ["admin"]),
                "isolate two owner race fixtures",
              );
          }
          let x = await race([
            () => roles(a, b, ["admin"]),
            () => lifecycle(b, a),
          ]);
          assert.equal(
            x.result.filter((r) => !r.error).length,
            1,
            "race may succeed only once",
          );
          const count = Number(
            await sql(
              "select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id where r.name='owner' and app_private.effective_platform_access(ur.user_id)",
            ),
          );
          assert.equal(count, 1);
          report.concurrency.push({
            case: "last owners role removal vs offboarding",
            successes: 1,
            effectiveOwners: count,
            waiting: x.waiting,
          });
          let survivor = x.result[0].error ? b : a;
          const d = await account("owner", "reverse-owner-a"),
            e = await account("owner", "reverse-owner-b");
          check(await roles(d, survivor, ["admin"]));
          x = await race([() => lifecycle(e, d), () => roles(d, e, ["admin"])]);
          assert.equal(x.result.filter((r) => !r.error).length, 1);
          const reverseCount = Number(
            await sql(
              "select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id where r.name='owner' and app_private.effective_platform_access(ur.user_id)",
            ),
          );
          assert.equal(reverseCount, 1);
          report.concurrency.push({
            case: "reverse-order owner offboarding vs role removal",
            successes: 1,
            effectiveOwners: reverseCount,
            waiting: x.waiting,
          });
          survivor = x.result[0].error ? d : e;
          assert.ok(
            (await lifecycle(survivor, survivor)).error,
            "last effective owner cannot self-offboard",
          );

          const subordinate = await account("crew", "repeat-target"),
            admin2 = await account("admin", "repeat-admin");
          x = await race([
            () => lifecycle(admin, subordinate),
            () => lifecycle(admin2, subordinate),
          ]);
          for (const r of x.result) check(r);
          assert.equal(
            check(
              await service
                .from("employee_records")
                .select("is_active")
                .eq("id", subordinate.employeeId)
                .single(),
            ).is_active,
            false,
          );
          const logs = check(
            await service
              .from("activity_log")
              .select("id")
              .eq("subject_id", subordinate.employeeId)
              .eq("event_type", "employee_marked_inactive"),
          );
          assert.equal(logs.length, 2);
          report.concurrency.push({
            case: "repeated offboarding",
            successes: 2,
            auditEvents: 2,
            waiting: x.waiting,
          });
          await offboard(survivor, subordinate, "active");
          x = await race([
            () => roles(admin, subordinate, ["estimator"]),
            () => lifecycle(admin2, subordinate),
          ]);
          assert.ok(!x.result[1].error, "offboarding always succeeds");
          assert.equal(
            check(
              await subordinate.client.rpc("has_effective_platform_access"),
            ),
            false,
          );
          report.concurrency.push({
            case: "role change vs separation",
            roleChange: x.result[0].error
              ? "DENIED after separation"
              : "completed before separation",
            offboarding: "PASS",
            effectiveAccess: false,
            waiting: x.waiting,
          });
        },
      );
    } finally {
      if (webProcess) webProcess.kill("SIGTERM");
      if (webFd !== undefined) closeSync(webFd);
      // Preserve disposable fixtures/history for inspection; local reset is teardown.
      if (process.env.PR02_VERIFICATION_RESULTS)
        writeFileSync(
          process.env.PR02_VERIFICATION_RESULTS,
          JSON.stringify(report, null, 2) + "\n",
          { mode: 0o600 },
        );
    }
  },
);
