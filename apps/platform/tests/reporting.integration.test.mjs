import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { validateBusinessReport } from "../src/lib/reporting/model.ts";
import { reportPresentation } from "../src/lib/reporting/presentation.ts";
const enabled =
  process.env.PR17_DISPOSABLE_STACK === "1" &&
  Boolean(process.env.PR17_LOCAL_STATUS_FILE);
test(
  "PR17 complete reports with real local Auth, RLS, source history and HTTP exports",
  { skip: !enabled, timeout: 360000 },
  async (t) => {
    const c = JSON.parse(
      readFileSync(process.env.PR17_LOCAL_STATUS_FILE, "utf8"),
    );
    assert.equal(c.API_URL, "http://127.0.0.1:54321");
    assert.equal(process.env.PR17_WEB_URL, "http://127.0.0.1:3102");
    assert.match(process.env.DOCKER_HOST ?? "", /^unix:/);
    const opts = {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
      service = createClient(c.API_URL, c.SERVICE_ROLE_KEY, opts),
      anon = createClient(c.API_URL, c.ANON_KEY, opts);
    const check = (r) => {
        assert.ifError(
          r.error && Error(r.error.message + " [" + r.error.code + "]"),
        );
        return r.data;
      },
      denied = (r, code) => {
        assert.ok(r.error);
        if (code) assert.equal(r.error.code, code);
      };
    const marker = randomUUID().slice(0, 8),
      actors = [],
      results = [],
      metrics = [];
    let bulkCustomer = null,
      reviewCustomer = null;
    const sql = (source) =>
      new Promise((resolve, reject) => {
        const p = spawn(
          process.env.PR17_DOCKER_BIN,
          [
            "exec",
            "-i",
            "supabase_db_ats_pr02_disposable",
            "psql",
            "-X",
            "-qAt",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
          ],
          { env: process.env },
        );
        let out = "",
          err = "";
        p.stdout.on("data", (b) => (out += b));
        p.stderr.on("data", (b) => (err += b));
        p.on("error", reject);
        p.on("exit", (code) =>
          code ? reject(Error(err)) : resolve(out.trim()),
        );
        p.stdin.end(source);
      });
    t.after(async () => {
      if (bulkCustomer)
        check(
          await service
            .from("quotes")
            .update({ archived_at: new Date().toISOString() })
            .eq("customer_id", bulkCustomer),
        );
      if (actors.length) {
        check(
          await service
            .from("profiles")
            .update({ status: "disabled" })
            .in("id", actors),
        );
        check(
          await service
            .from("employee_records")
            .update({ is_active: false, employment_status: "separated" })
            .in("auth_user_id", actors),
        );
      }
      if (process.env.PR17_RESULTS_FILE)
        writeFileSync(
          process.env.PR17_RESULTS_FILE,
          JSON.stringify({ marker, reviewCustomer, results, metrics }, null, 2),
        );
    });
    async function actor(role, label = role) {
      const password = randomBytes(24).toString("base64url"),
        u = check(
          await service.auth.admin.createUser({
            email: `pr17-${label}-${marker}@example.invalid`,
            password,
            email_confirm: true,
          }),
        ).user;
      actors.push(u.id);
      check(
        await service
          .from("profiles")
          .update({ status: "active", full_name: `PR17 ${label} ${marker}` })
          .eq("id", u.id),
      );
      const er = check(
        await service
          .from("employee_records")
          .insert({
            auth_user_id: u.id,
            legal_name: `PR17 ${label} ${marker}`,
            is_active: true,
            employment_status: "active",
          })
          .select("id")
          .single(),
      );
      const r = check(
        await service.from("roles").select("id").eq("name", role).single(),
      );
      check(
        await service
          .from("user_roles")
          .insert({ user_id: u.id, role_id: r.id }),
      );
      const jar = new Map(),
        client = createServerClient(c.API_URL, c.ANON_KEY, {
          cookies: {
            getAll: () => [...jar].map(([name, value]) => ({ name, value })),
            setAll: (values) => values.forEach((v) => jar.set(v.name, v.value)),
          },
        });
      check(await client.auth.signInWithPassword({ email: u.email, password }));
      return {
        id: u.id,
        employeeId: er.id,
        client,
        cookie: () =>
          [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      };
    }
    const owner = await actor("owner"),
      admin = await actor("admin"),
      payroll = await actor("payroll_admin"),
      estimator = await actor("estimator"),
      estimator2 = await actor("estimator", "other-estimator"),
      crew = await actor("crew"),
      customerActor = await actor("customer");
    const customer = check(
      await service
        .from("customers")
        .insert({
          display_name: "PR17 Whole job " + marker,
          email: `pr17-${marker}@example.invalid`,
          phone: "540-555-0117",
        })
        .select("id")
        .single(),
    );
    reviewCustomer = customer.id;
    const location = check(
      await service
        .from("service_locations")
        .insert({
          customer_id: customer.id,
          street: "17 Local Review Lane",
          city: "Fredericksburg",
          state: "VA",
        })
        .select("id")
        .single(),
    );
    const run = (label, fn) =>
      t.test(label, async () => {
        await fn();
        results.push({ name: label, pass: true });
      });
    const args = (view = "profitability", extra = {}) => ({
      p_view: view,
      p_start: "2026-10-01",
      p_end: "2026-10-31",
      p_filters: { customer: customer.id },
      ...extra,
    });
    const read = async (view = "profitability", extra = {}, who = owner) =>
      validateBusinessReport(
        check(await who.client.rpc("get_business_report", args(view, extra))),
      );
    const raw = (view, extra = {}, who = owner) =>
      who.client.rpc("get_business_report", args(view, extra));
    const job = async (extra = {}) =>
      check(
        await service
          .from("jobs")
          .insert({
            customer_id: customer.id,
            service_location_id: location.id,
            status: "completed",
            completed_at: "2026-10-03T15:00:00Z",
            created_at: "2026-08-01T12:00:00Z",
            assigned_crew_user_id: crew.id,
            service_type: "tree_removal",
            ...extra,
          })
          .select("*")
          .single(),
      );
    const invoice = async (j, amount, extra = {}) => {
      const row = check(
        await service
          .from("invoices")
          .insert({
            customer_id: customer.id,
            job_id: j.id,
            status: "sent",
            subtotal_cents: amount,
            tax_cents: 0,
            total_cents: amount,
            balance_due_cents: amount,
            sent_at: "2026-10-04T12:00:00Z",
            created_at: "2026-10-04T12:00:00Z",
            ...extra,
            status: extra.status === "void" ? "sent" : (extra.status ?? "sent"),
          })
          .select("*")
          .single(),
      );
      if (extra.status === "void") {
        const lease = check(
          await owner.client.rpc("begin_invoice_void", {
            p_invoice_id: row.id,
          }),
        );
        check(
          await owner.client.rpc("finalize_invoice_void", {
            p_invoice_id: row.id,
            p_token: lease.token,
          }),
        );
      }
      return row;
    };
    const entry = async (j, start, end, approved = true) => {
      const row = check(
        await service
          .from("time_entries")
          .insert({
            job_id: j.id,
            user_id: crew.id,
            entry_type: "job",
            status: "completed",
            clock_in_at: start,
            clock_out_at: end,
            break_minutes: 0,
          })
          .select("id")
          .single(),
      );
      if (approved)
        check(
          await service.from("time_entry_approvals").insert({
            time_entry_id: row.id,
            approved_by_user_id: owner.id,
            approval_status: "approved",
          }),
        );
      return row;
    };
    const j = await job(),
      first = await invoice(j, 100000, { created_at: "2026-08-15T12:00:00Z" }),
      second = await invoice(j, 50000);
    await invoice(j, 80000, { status: "void" });
    await invoice(j, 50000, { status: "draft" });
    const payment = check(
      await service
        .from("payments")
        .insert({
          invoice_id: first.id,
          customer_id: customer.id,
          amount_cents: 100000,
          total_collected_cents: 103000,
          surcharge_cents: 3000,
          status: "succeeded",
          provider: "stripe",
          payment_method: "card",
          paid_at: "2026-10-05T12:00:00Z",
          refunded_principal_cents: 2000,
          disputed_principal_cents: 3000,
          dispute_status: "lost",
        })
        .select("id")
        .single(),
    );
    for (const [from, to, rate] of [
      ["2026-08-01", "2026-08-31", 1000],
      ["2026-09-01", "2026-09-30", 2000],
      ["2026-10-01", null, 3000],
    ])
      check(
        await service.from("employee_labor_cost_rates").insert({
          employee_id: crew.employeeId,
          hourly_cost_cents: rate,
          effective_from: from,
          effective_to: to,
        }),
      );
    await entry(j, "2026-09-01T00:30:00Z", "2026-09-01T01:30:00Z");
    await entry(j, "2026-09-01T12:00:00Z", "2026-09-01T14:00:00Z");
    await entry(j, "2026-10-02T12:00:00Z", "2026-10-02T14:00:00Z");
    const cost = async (amount, extra = {}) =>
      check(
        await service
          .from("job_cost_entries")
          .insert({
            job_id: j.id,
            category: "materials",
            description: "Synthetic PR17 cost",
            amount_cents: amount,
            incurred_on: "2026-09-10",
            review_status: "approved",
            submitted_by_user_id: owner.id,
            reviewed_by_user_id: owner.id,
            reviewed_at: "2026-10-01T12:00:00Z",
            ...extra,
          })
          .select("id")
          .single(),
      );
    const original = await cost(3000);
    await cost(2000);
    await cost(1000, {
      supersedes_cost_id: original.id,
      notes: "Synthetic replacement",
    });
    await cost(99999, { review_status: "rejected" });
    const asset = check(
      await service
        .from("equipment_assets")
        .insert({
          asset_number: "PR17-" + marker,
          name: "Local chipper " + marker,
          category: "chipper",
          status: "available",
        })
        .select("id")
        .single(),
    );
    check(
      await service.from("job_equipment_usage").insert({
        job_id: j.id,
        asset_id: asset.id,
        usage_date: "2026-07-01",
        usage_hours: 2,
        hourly_cost_cents_snapshot: 500,
        calculated_cost_cents: 1000,
      }),
    );
    await run(
      "completion cohort hydrates all dates, multiple issued invoices and each child cost exactly once",
      async () => {
        const r = await read(),
          d = r.datasets.profitability;
        assert.equal(d.total, 1);
        const row = d.rows[0];
        assert.equal(row.id, j.id);
        assert.equal(row.invoiceCount, 2);
        assert.equal(row.billedCents, 150000);
        assert.equal(row.adjustmentCents, 5000);
        assert.equal(row.revenueCents, 145000);
        assert.equal(row.laborHours, 5);
        assert.equal(row.laborCents, 11000);
        assert.equal(row.directCents, 3000);
        assert.equal(row.equipmentCents, 1000);
        assert.equal(row.profitCents, 130000);
        assert.equal(d.stats.profitCents, 130000);
      },
    );
    await run(
      "period receipts include older invoices and exclude surcharge, draft and void invoice value",
      async () => {
        const r = await read("revenue");
        assert.equal(r.datasets.invoices.stats.invoicedCents, 50000);
        assert.equal(r.datasets.invoices.stats.draftCents, 50000);
        assert.equal(r.datasets.payments.stats.grossCents, 100000);
        assert.equal(r.datasets.payments.stats.collectedCents, 95000);
        assert.equal(
          r.datasets.payments.rows[0].number,
          first.invoice_number ?? first.id,
        );
      },
    );
    await run(
      "later refunds restate the original receipt cohort and whole-job estimate without rewriting history",
      async () => {
        check(
          await service
            .from("payments")
            .update({ refunded_principal_cents: 7000 })
            .eq("id", payment.id),
        );
        const p = await read("profitability"),
          r = await read("revenue");
        assert.equal(p.datasets.profitability.rows[0].profitCents, 125000);
        assert.equal(p.datasets.profitability.rows[0].revenueCents, 140000);
        assert.equal(r.datasets.payments.stats.collectedCents, 90000);
      },
    );
    await run(
      "pending time/costs and overlapping rates prevent a falsely complete margin",
      async () => {
        const pending = await cost(100, {
          review_status: "pending",
          reviewed_by_user_id: null,
          reviewed_at: null,
        });
        let d = (await read()).datasets.profitability;
        assert.equal(d.stats.complete, 0);
        assert.equal(d.rows[0].profitCents, null);
        assert.match(d.rows[0].issues, /Costs need review/);
        check(
          await service
            .from("job_cost_entries")
            .update({
              review_status: "rejected",
              reviewed_by_user_id: owner.id,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", pending.id),
        );
        const overlap = check(
          await service
            .from("employee_labor_cost_rates")
            .insert({
              employee_id: crew.employeeId,
              hourly_cost_cents: 9000,
              effective_from: "2026-10-02",
              effective_to: "2026-10-02",
            })
            .select("id")
            .single(),
        );
        d = (await read()).datasets.profitability;
        assert.equal(d.stats.complete, 0);
        assert.match(d.rows[0].issues, /Overlapping labor rates/);
        check(
          await service
            .from("employee_labor_cost_rates")
            .update({
              effective_from: "2035-01-01",
              effective_to: "2035-01-01",
            })
            .eq("id", overlap.id),
        );
        const unapproved = await entry(
          j,
          "2026-10-03T12:00:00Z",
          "2026-10-03T13:00:00Z",
          false,
        );
        d = (await read()).datasets.profitability;
        assert.equal(d.stats.complete, 0);
        assert.match(d.rows[0].issues, /Time needs review/);
        check(
          await service
            .from("time_entries")
            .update({ status: "void" })
            .eq("id", unapproved.id),
        );
      },
    );
    await run(
      "latest approval has a deterministic tie-breaker and voided time is excluded",
      async () => {
        const e = await entry(
          j,
          "2026-10-03T12:00:00Z",
          "2026-10-03T13:00:00Z",
          false,
        );
        check(
          await service.from("time_entry_approvals").insert([
            {
              id: "10000000-0000-4000-8000-" + marker + "0000",
              time_entry_id: e.id,
              approved_by_user_id: owner.id,
              approval_status: "approved",
              approved_at: "2026-10-10T12:00:00Z",
            },
            {
              id: "20000000-0000-4000-8000-" + marker + "0000",
              time_entry_id: e.id,
              approved_by_user_id: owner.id,
              approval_status: "needs_correction",
              approved_at: "2026-10-10T12:00:00Z",
            },
          ]),
        );
        assert.match(
          (await read()).datasets.profitability.rows[0].issues,
          /Time needs review/,
        );
        check(
          await service
            .from("time_entries")
            .update({ status: "void" })
            .eq("id", e.id),
        );
        assert.equal((await read()).datasets.profitability.stats.complete, 1);
      },
    );
    await run(
      "legacy status alone is a quality issue, not a fabricated completion date",
      async () => {
        const legacy = await job({ status: "invoiced", completed_at: null });
        assert.equal((await read()).datasets.profitability.total, 1);
        assert.ok(
          (await read("quality")).datasets.quality.rows.some(
            (x) => x.id === "legacy_completion:" + legacy.id,
          ),
        );
      },
    );
    await run(
      "every office audience uses live roles; estimator data stays own-scope with no financial defaults or employee rates",
      async () => {
        const q1 = check(
          await service
            .from("quotes")
            .insert({
              customer_id: customer.id,
              service_location_id: location.id,
              estimator_user_id: estimator.id,
              status: "sent",
              subtotal_cents: 1000,
              total_cents: 1000,
              created_at: "2026-10-01T12:00:00Z",
              customer_message: "PR17_PRIVATE_NOTES_CANARY",
            })
            .select("id")
            .single(),
        );
        check(
          await service.from("quotes").insert({
            customer_id: customer.id,
            service_location_id: location.id,
            estimator_user_id: estimator2.id,
            status: "sent",
            subtotal_cents: 2000,
            total_cents: 2000,
            created_at: "2026-10-01T12:00:00Z",
          }),
        );
        for (const who of [owner, admin, payroll])
          assert.equal(
            (await read("quotes", {}, who)).datasets.quotes.total,
            2,
          );
        for (const view of ["executive", "quotes", "sources", "services"]) {
          const r = await read(view, {}, estimator);
          assert.equal(r.scope, "own");
          assert.deepEqual(Object.keys(r.settings), ["business_timezone"]);
          assert.equal(
            JSON.stringify(r).includes("PR17_PRIVATE_NOTES_CANARY"),
            false,
          );
          assert.equal(
            Object.keys(r.datasets).some(
              (k) => !["quotes", "quote_lines"].includes(k),
            ),
            false,
          );
          if (view !== "services") {
            assert.equal(r.datasets.quotes.total, 1);
            assert.equal(r.datasets.quotes.rows[0].id, q1.id);
          }
        }
        for (const view of [
          "profitability",
          "revenue",
          "labor",
          "fleet",
          "materials",
          "quality",
          "customers",
          "scheduling",
          "pipeline",
        ]) {
          const r = await read(view, {}, estimator);
          assert.equal(r.restricted, true);
          assert.deepEqual(r.datasets, {});
        }
      },
    );
    await run(
      "anonymous, service, field and customer sessions cannot call the report API",
      async () => {
        for (const who of [anon, service, crew.client, customerActor.client])
          denied(await who.rpc("get_business_report", args()), "42501");
      },
    );
    await run(
      "issued tokens lose access after offboarding, and user-supplied filters cannot widen estimator scope",
      async () => {
        check(
          await service
            .from("profiles")
            .update({ status: "disabled" })
            .eq("id", estimator.id),
        );
        denied(await raw("quotes", {}, estimator), "42501");
        check(
          await service
            .from("profiles")
            .update({ status: "active" })
            .eq("id", estimator.id),
        );
        assert.equal(
          (
            await read(
              "quotes",
              { p_filters: { employee: estimator2.id } },
              estimator,
            )
          ).datasets.quotes.total,
          0,
        );
      },
    );
    await run(
      "pages are deterministic, clamp excessive offsets and reject changed report versions",
      async () => {
        const a = await read("quotes", { p_page_size: 1 }),
          b = await read("quotes", { p_page_size: 1, p_pages: { quotes: 2 } });
        assert.equal(a.datasets.quotes.total, 2);
        assert.equal(a.datasets.quotes.medianAmount, 1500);
        assert.notEqual(
          a.datasets.quotes.rows[0].id,
          b.datasets.quotes.rows[0].id,
        );
        assert.equal(
          (
            await read("quotes", {
              p_page_size: 1,
              p_pages: { quotes: 2 },
              p_versions: { quotes: a.datasets.quotes.version },
            })
          ).datasets.quotes.version,
          a.datasets.quotes.version,
        );
        assert.equal(
          (
            await read("quotes", {
              p_page_size: 1,
              p_pages: { quotes: 999999 },
            })
          ).datasets.quotes.page,
          2,
        );
        check(
          await service
            .from("quotes")
            .update({ status: "declined" })
            .eq("id", b.datasets.quotes.rows[0].id),
        );
        denied(
          await raw("quotes", {
            p_versions: { quotes: a.datasets.quotes.version },
          }),
          "40001",
        );
      },
    );
    await run(
      "CSV summaries and rows share the statement snapshot during a concurrent quote update",
      async () => {
        const baseline = await read("quotes", { p_export: true }),
          target = baseline.datasets.quotes.rows.find(
            (row) => row.status === "sent",
          );
        assert.ok(target);
        const key = 170000000 + parseInt(marker.slice(0, 6), 16),
          application = "pr17_snapshot_" + marker;
        const blocker = spawn(
          process.env.PR17_DOCKER_BIN,
          [
            "exec",
            "-i",
            "supabase_db_ats_pr02_disposable",
            "psql",
            "-X",
            "-qAt",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
          ],
          { env: process.env },
        );
        let out = "";
        const locked = new Promise((resolve, reject) => {
          blocker.stdout.on("data", (b) => {
            out += b;
            if (out.includes("LOCKED")) resolve();
          });
          blocker.on("error", reject);
          blocker.on("exit", () => {
            if (!out.includes("LOCKED"))
              reject(Error("Snapshot test lock was not acquired"));
          });
        });
        blocker.stdin.write(
          `begin;select pg_advisory_xact_lock(${key});select 'LOCKED';\n`,
        );
        await locked;
        const pending = sql(
          `set application_name='${application}';begin;set local role authenticated;set local request.jwt.claims='{"sub":"${owner.id}","role":"authenticated"}';with gate as materialized(select pg_advisory_xact_lock(${key})) select public.get_business_report('quotes','2026-10-01','2026-10-31','{"customer":"${customer.id}"}','{}','{}',50,true) from gate;commit;`,
        );
        try {
          let waiting = false;
          for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
            waiting =
              (await sql(
                `select exists(select 1 from pg_stat_activity where application_name='${application}' and wait_event='advisory')`,
              )) === "t";
            if (!waiting)
              await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert.equal(waiting, true);
          check(
            await service
              .from("quotes")
              .update({ status: "declined" })
              .eq("id", target.id),
          );
        } finally {
          blocker.stdin.end("commit;\n");
        }
        const concurrent = validateBusinessReport(JSON.parse(await pending)),
          after = await read("quotes", { p_export: true });
        assert.equal(
          concurrent.datasets.quotes.version,
          baseline.datasets.quotes.version,
        );
        assert.deepEqual(
          concurrent.datasets.quotes.rows,
          baseline.datasets.quotes.rows,
        );
        assert.notEqual(
          after.datasets.quotes.version,
          baseline.datasets.quotes.version,
        );
        assert.equal(
          after.datasets.quotes.stats.declined,
          baseline.datasets.quotes.stats.declined + 1,
        );
      },
    );
    await run(
      "totals and median include more rows than the Data API cap and the old 5,000 limit",
      async () => {
        const bulk = check(
          await service
            .from("customers")
            .insert({ display_name: "PR17 bulk " + marker })
            .select("id")
            .single(),
        );
        bulkCustomer = bulk.id;
        await sql(
          `insert into public.quotes(customer_id,quote_number,status,subtotal_cents,total_cents,created_at) select '${bulk.id}','PR17-${marker}-first-'||g,'sent',101,101,'2026-10-01T12:00:00Z' from generate_series(1,5006) g`,
        );
        const start = performance.now(),
          r = await read("quotes", { p_filters: { customer: bulk.id } });
        metrics.push({
          kind: "5006-row-real-RPC",
          durationMs: Math.round(performance.now() - start),
          detailRows: r.datasets.quotes.rows.length,
          completeRows: r.datasets.quotes.total,
        });
        assert.equal(r.datasets.quotes.total, 5006);
        assert.equal(r.datasets.quotes.stats.quotedCents, 5006 * 101);
        assert.equal(r.datasets.quotes.medianAmount, 101);
        assert.equal(r.datasets.quotes.rows.length, 50);
        const csv = await owner.client.rpc(
          "get_business_report",
          args("quotes", { p_filters: { customer: bulk.id }, p_export: true }),
        );
        const e = validateBusinessReport(check(csv));
        assert.equal(e.exportComplete, true);
        assert.equal(e.datasets.quotes.rows.length, 5006);
      },
    );
    await run(
      "oversized exports fail explicitly before returning a partial download",
      async () => {
        await sql(
          `insert into public.quotes(customer_id,quote_number,status,subtotal_cents,total_cents,created_at) select '${bulkCustomer}','PR17-${marker}-second-'||g,'sent',101,101,'2026-10-01T12:00:00Z' from generate_series(1,5000) g`,
        );
        denied(
          await raw("quotes", {
            p_filters: { customer: bulkCustomer },
            p_export: true,
          }),
          "54000",
        );
        const response = await fetch(
          process.env.PR17_WEB_URL +
            "/admin/reports/export?view=quotes&range=custom&start=2026-10-01&end=2026-10-31&customer=" +
            bulkCustomer,
          { headers: { cookie: owner.cookie() } },
        );
        assert.equal(response.status, 413);
        assert.match(await response.text(), /10,000/);
      },
    );
    await run(
      "all selected report tabs load complete bounded DTOs without unrelated datasets",
      async () => {
        const views = [
          "executive",
          "pipeline",
          "quotes",
          "revenue",
          "profitability",
          "labor",
          "scheduling",
          "customers",
          "sources",
          "services",
          "fleet",
          "materials",
          "quality",
        ];
        for (const view of views) {
          const r = await read(view);
          assert.equal(r.allTotalsComplete, true);
          assert.ok(
            Object.values(r.datasets).every((d) => d.rows.length <= 50),
          );
          if (view === "quotes")
            assert.deepEqual(Object.keys(r.datasets), ["quotes"]);
          if (view === "labor")
            assert.deepEqual(Object.keys(r.datasets), ["time"]);
          if (view === "profitability")
            assert.deepEqual(Object.keys(r.datasets).sort(), [
              "profitability",
              "rates",
            ]);
        }
      },
    );
    await run(
      "empty and missing-input cohorts do not fabricate profit, capacity or historical rates",
      async () => {
        const none = await read("profitability", {
          p_start: "2040-01-01",
          p_end: "2040-01-31",
        });
        assert.equal(none.datasets.profitability.total, 0);
        assert.equal(
          reportPresentation(none, "profitability").metrics.find(
            (x) => x.label === "Estimated profit — complete inputs only",
          ).value,
          null,
        );
        const noTime = await job({ completed_at: "2026-10-10T12:00:00Z" }),
          d = (await read()).datasets.profitability;
        assert.equal(d.rows.find((r) => r.id === noTime.id).profitCents, null);
        assert.match(
          d.rows.find((r) => r.id === noTime.id).issues,
          /Approved time missing/,
        );
        assert.equal(
          reportPresentation(
            await read("scheduling"),
            "scheduling",
          ).metrics.find((x) => x.label === "Capacity utilization").value,
          null,
        );
      },
    );
    await run(
      "actual HTTP report/export preserves role scope, full cents and private noncacheable downloads",
      async () => {
        const base =
          process.env.PR17_WEB_URL +
          "/admin/reports/export?view=profitability&range=custom&start=2026-10-01&end=2026-10-31&customer=" +
          customer.id;
        const unauthenticated = await fetch(base, { redirect: "manual" });
        assert.equal(unauthenticated.status, 307);
        assert.match(unauthenticated.headers.get("location"), /\/login\?/);
        for (const who of [crew, customerActor, estimator])
          assert.equal(
            (await fetch(base, { headers: { cookie: who.cookie() } })).status,
            403,
          );
        const response = await fetch(base, {
          headers: { cookie: owner.cookie() },
        });
        assert.equal(response.status, 200);
        assert.match(
          response.headers.get("cache-control"),
          /private.*no-store/,
        );
        const text = await response.text();
        assert.ok(text.includes("Export complete"));
        assert.ok(text.includes("125000"));
        for (const secret of [
          c.SERVICE_ROLE_KEY,
          c.ANON_KEY,
          "540-555-0117",
          "17 Local Review Lane",
          "PR17_PRIVATE_NOTES_CANARY",
        ])
          assert.equal(text.includes(secret), false);
        const own = await fetch(base.replace("profitability", "quotes"), {
          headers: { cookie: estimator.cookie() },
        });
        assert.equal(own.status, 200);
        const ownCsv = await own.text();
        assert.equal(ownCsv.includes("Hourly cost"), false);
        const page = await fetch(base.replace("/export?", "?"), {
          headers: { cookie: owner.cookie() },
        });
        assert.equal(page.status, 200);
        const body = await page.text();
        assert.ok(body.includes("Totals cover all matching records"));
        assert.equal(body.includes(c.SERVICE_ROLE_KEY), false);
      },
    );
    await run(
      "current AR retains archived issued history and separates today, overdue and missing due dates",
      async () => {
        const today = await sql(
            "select timezone(business_timezone,now())::date from public.reporting_settings where singleton_key",
          ),
          yesterday = await sql(
            "select timezone(business_timezone,now())::date-1 from public.reporting_settings where singleton_key",
          );
        const current = await invoice(j, 701, {
            created_at: "2024-01-01T12:00:00Z",
            due_at: today + "T23:00:00-04:00",
            archived_at: new Date().toISOString(),
          }),
          late = await invoice(j, 502, {
            created_at: "2024-01-01T12:00:00Z",
            due_at: yesterday + "T23:00:00-04:00",
          });
        const report = await read("revenue", {
            p_start: "2040-01-01",
            p_end: "2040-01-02",
          }),
          d = report.datasets.ar;
        assert.ok(d.rows.some((row) => row.id === current.id));
        assert.equal(
          d.groups.aging.items.find((g) => g.label === "Current / not due")
            .stats.balanceCents,
          701,
        );
        assert.equal(
          d.groups.aging.items.find((g) => g.label === "1–30 days").stats
            .balanceCents,
          502,
        );
        assert.ok(
          d.groups.aging.items.find((g) => g.label === "Due date missing"),
        );
        assert.equal(report.datasets.invoices.total, 0);
      },
    );
    await run(
      "an isolated cohort with no effective labor rate never shows zero profit or an invented wage",
      async () => {
        const missing = await job({ completed_at: "2026-10-20T12:00:00Z" });
        await invoice(missing, 10000);
        const time = check(
          await service
            .from("time_entries")
            .insert({
              user_id: estimator2.id,
              job_id: missing.id,
              entry_type: "job",
              status: "completed",
              clock_in_at: "2026-10-20T12:00:00Z",
              clock_out_at: "2026-10-20T13:00:00Z",
              break_minutes: 0,
            })
            .select("id")
            .single(),
        );
        check(
          await service.from("time_entry_approvals").insert({
            time_entry_id: time.id,
            approved_by_user_id: owner.id,
            approval_status: "approved",
          }),
        );
        const r = await read("profitability", {
          p_start: "2026-10-20",
          p_end: "2026-10-20",
        });
        assert.equal(r.datasets.profitability.total, 1);
        assert.equal(r.datasets.profitability.rows[0].laborCents, null);
        assert.equal(r.datasets.profitability.rows[0].profitCents, null);
        assert.match(
          r.datasets.profitability.rows[0].issues,
          /Labor rate missing/,
        );
        assert.equal(
          reportPresentation(r, "profitability").metrics.find(
            (m) => m.label === "Estimated profit — complete inputs only",
          ).value,
          null,
        );
      },
    );
    await run(
      "source, account, employee and status filters are consistent and cannot widen scope",
      async () => {
        const source = check(
          await service
            .from("lead_sources")
            .select("id")
            .eq("name", "Website")
            .single(),
        );
        check(
          await service
            .from("jobs")
            .update({ lead_source_id: source.id })
            .eq("id", j.id),
        );
        check(
          await service
            .from("customers")
            .update({ lead_source_id: source.id })
            .eq("id", customer.id),
        );
        const p = await read("profitability", {
          p_filters: {
            customer: customer.id,
            source: source.id,
            employee: crew.id,
          },
        });
        assert.ok(p.datasets.profitability.rows.some((row) => row.id === j.id));
        const q = await read("quotes", {
          p_filters: {
            party: "PR17 Whole job " + marker,
            employee: estimator.id,
            source: source.id,
            status: "declined",
          },
        });
        assert.equal(q.datasets.quotes.total, 1);
        assert.equal(
          p.options.exactFilters.customer,
          "PR17 Whole job " + marker,
        );
        assert.equal(p.options.exactFilters.employee, "PR17 crew " + marker);
        assert.equal(
          (
            await read("quotes", {
              p_filters: { customer: customer.id, status: "sent' OR 1=1 --" },
            })
          ).datasets.quotes.total,
          0,
        );
      },
    );
    await run(
      "legacy excess payment allocation blocks a complete margin rather than borrowing from another invoice",
      async () => {
        const extra = await job({ completed_at: "2026-10-22T12:00:00Z" }),
          i = await invoice(extra, 20000);
        await entry(extra, "2026-10-22T12:00:00Z", "2026-10-22T13:00:00Z");
        check(
          await service.from("payments").insert({
            invoice_id: i.id,
            customer_id: customer.id,
            provider: "stripe",
            payment_method: "card",
            status: "succeeded",
            amount_cents: 30000,
            total_collected_cents: 30000,
            paid_at: "2026-10-22T12:00:00Z",
            refunded_principal_cents: 25000,
          }),
        );
        const d = (
          await read("profitability", {
            p_start: "2026-10-22",
            p_end: "2026-10-22",
          })
        ).datasets.profitability;
        assert.match(d.rows[0].issues, /Payment allocation needs review/);
        assert.equal(d.rows[0].profitCents, null);
        assert.equal(d.stats.complete, 0);
      },
    );
    await run(
      "legacy fully-refunded status contributes no retained principal even with old zero refund detail",
      async () => {
        const refunded = await job({ completed_at: "2026-10-23T12:00:00Z" }),
          i = await invoice(refunded, 20000);
        await entry(refunded, "2026-10-23T12:00:00Z", "2026-10-23T13:00:00Z");
        check(
          await service
            .from("payments")
            .insert({
              invoice_id: i.id,
              customer_id: customer.id,
              provider: "stripe",
              payment_method: "card",
              status: "refunded",
              amount_cents: 20000,
              total_collected_cents: 20000,
              paid_at: "2026-10-23T12:00:00Z",
              refunded_principal_cents: 0,
            }),
        );
        const r = await read("revenue", {
            p_start: "2026-10-23",
            p_end: "2026-10-23",
          }),
          p = await read("profitability", {
            p_start: "2026-10-23",
            p_end: "2026-10-23",
          });
        assert.equal(r.datasets.payments.stats.grossCents, 20000);
        assert.equal(r.datasets.payments.stats.collectedCents, 0);
        assert.equal(r.datasets.payments.stats.adjustmentCents, 20000);
        assert.equal(p.datasets.profitability.rows[0].revenueCents, 0);
        assert.equal(p.datasets.profitability.rows[0].profitCents, -3000);
        assert.equal(p.datasets.profitability.rows[0].margin, null);
      },
    );
    await run(
      "view/function permissions remain invoker-only and no reporting read mutates business records or queues",
      async () => {
        assert.equal(
          await sql(
            "select bool_and('security_invoker=true'=any(c.reloptions) and not has_table_privilege('anon',c.oid,'SELECT') and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private' and c.relname like 'report_%' and c.relkind='v'",
          ),
          "t",
        );
        const before = await sql(
          `select jsonb_build_object('emails',(select count(*) from public.email_events where related_customer_id='${customer.id}'),'communications',(select count(*) from public.customer_communications where customer_id='${customer.id}'),'history',(select count(*) from public.activity_log where subject_id='${j.id}'))`,
        );
        await read("profitability");
        assert.equal(
          await sql(
            `select jsonb_build_object('emails',(select count(*) from public.email_events where related_customer_id='${customer.id}'),'communications',(select count(*) from public.customer_communications where customer_id='${customer.id}'),'history',(select count(*) from public.activity_log where subject_id='${j.id}'))`,
          ),
          before,
        );
      },
    );
  },
);
