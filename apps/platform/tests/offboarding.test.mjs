import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const require = createRequire(import.meta.url),
  ts = require("typescript");
const dir = new URL("../../../supabase/migrations/", import.meta.url),
  name = "20261015042649_reliable_employee_offboarding.sql";
const migration = readFileSync(new URL(name, dir), "utf8");
const prior = readdirSync(dir)
  .filter((n) => n.endsWith(".sql") && n < name)
  .map((n) => readFileSync(new URL(n, dir), "utf8"));
function original(name) {
  const re = new RegExp(
    `create(?: or replace)? function ${name.replaceAll(".", "\\.")}\\([\\s\\S]*?\\n\\$\\$;`,
    "ig",
  );
  const matches = prior.flatMap((s) => [...s.matchAll(re)].map((m) => m[0]));
  assert.ok(matches.length, name);
  return matches.at(-1);
}
function load(file, deps) {
  const js = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const m = { exports: {} };
  new Function("require", "module", "exports", js)(
    (n) => {
      assert.ok(n in deps, `Unexpected import ${n}`);
      return deps[n];
    },
    m,
    m.exports,
  );
  return m.exports;
}
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, otherOwner, admin, estimator, payroll, crew, customer, manager] =
  [1, 2, 3, 4, 5, 6, 7, 8].map(uuid);
const ids = [
    owner,
    otherOwner,
    admin,
    estimator,
    payroll,
    crew,
    customer,
    manager,
  ],
  names = [
    "owner",
    "owner",
    "admin",
    "estimator",
    "payroll_admin",
    "crew",
    "customer",
    "property_manager",
  ];
// Synthetic issuer, not Supabase Auth. Never a service credential.
const secret = randomUUID();
function token(id) {
  const enc = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const body = `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
function verify(jwt) {
  const [h, p, s] = jwt.split(".");
  assert.ok(
    timingSafeEqual(
      Buffer.from(s, "base64url"),
      createHmac("sha256", secret).update(`${h}.${p}`).digest(),
    ),
  );
  const c = JSON.parse(Buffer.from(p, "base64url"));
  assert.ok(c.exp > Date.now() / 1000);
  return c.sub;
}
async function fixture() {
  const db = new PGlite();
  await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema app_private; create schema private; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create function storage.filename(name text) returns text language sql immutable as $$ select (string_to_array(name,'/'))[array_length(string_to_array(name,'/'),1)] $$;
create table profiles(id uuid primary key,status text default 'active',user_type text default 'crew',full_name text);
create table employee_records(id uuid primary key,auth_user_id uuid unique,employment_status text default 'active',is_active boolean default true,archived_at timestamptz,archived_by_user_id uuid,separation_date date,separation_reason text);
create table roles(id uuid primary key default gen_random_uuid(),name text unique);
create table user_roles(user_id uuid,role_id uuid references roles(id),unique(user_id,role_id));
create table role_assignment_events(id uuid default gen_random_uuid(),actor_user_id uuid,target_user_id uuid,previous_roles text[],assigned_roles text[],reason text);
create table time_clock_permissions(user_id uuid primary key,is_enabled boolean,notes text,created_by_user_id uuid);
create table activity_log(id uuid default gen_random_uuid(),actor_user_id uuid,actor_type text check(actor_type in ('owner','admin','staff','crew','customer','portal','system')),subject_type text,subject_id uuid,event_type text,metadata_json jsonb);
create table employee_separation_items(employee_id uuid,item_key text,label text,completion_status text default 'incomplete',unique(employee_id,item_key));
create table employee_requests(id uuid default gen_random_uuid(),employee_id uuid,request_type text,title text,details text,submitted_by_user_id uuid);
create table jobs(id uuid primary key,assigned_crew_user_id uuid,assigned_crew_employee_id uuid);
create table schedule_events(id uuid primary key,job_id uuid,event_type text,status text);
create table schedule_event_assignments(event_id uuid,user_id uuid,employee_id uuid);
create table job_photos(id uuid default gen_random_uuid(),job_id uuid,uploaded_by_user_id uuid,photo_type text,storage_path text);
create table job_cost_entries(id uuid,receipt_storage_path text,submitted_by_user_id uuid);
create table equipment_assignments(id uuid,asset_id uuid,assigned_user_id uuid,job_id uuid,schedule_event_id uuid,starts_at timestamptz,ends_at timestamptz,returned_at timestamptz,notes text);
create table equipment_assets(id uuid,asset_number text,name text,category text,status text,manufacturer text,model text,photo_storage_path text,safety_class text,ppe_required text,inspection_template_key text,next_inspection_due_at timestamptz,is_active boolean);
create table change_orders(id uuid,job_id uuid,change_order_number text,status text,approved_at timestamptz);
create table job_change_order_scope_items(change_order_id uuid,title text,description text,sort_order integer);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
`);
  // Untouched tables have minimal schemas: gate coverage, not a full chain replay.
  for (const [, schema, table] of migration.matchAll(
    /create policy "Effective platform access required" on (\w+)\.(\w+)/g,
  ))
    await db.exec(
      `create table if not exists ${schema}.${table}(id uuid);alter table ${schema}.${table} enable row level security;`,
    );
  await db.exec(
    "grant usage on schema public,auth,app_private,private,storage to authenticated,anon;grant select,insert,update,delete on all tables in schema public,storage to authenticated;",
  );
  for (const n of [
    "has_staff_role",
    "has_platform_admin_role",
    "has_financial_reporting_role",
    "has_schedule_admin_role",
    "has_schedule_estimator_role",
    "has_schedule_crew_role",
    "has_time_clock_review_role",
    "has_time_clock_eligible_role",
    "is_assigned_to_job",
    "current_employee_id",
    "can_use_time_clock",
  ])
    await db.exec(original(`app_private.${n}`));
  await db.exec(original("private.can_access_job_photo_object"));
  await db.exec(original("public.submit_my_employee_request"));
  await db.exec(`
create policy staff_jobs on jobs for all to authenticated using(app_private.has_staff_role()) with check(app_private.has_staff_role());
create policy crew_jobs on jobs for select to authenticated using(app_private.is_assigned_to_job(id));
create policy staff_profiles on profiles for all to authenticated using(app_private.has_staff_role()) with check(app_private.has_staff_role());
create policy own_profile on profiles for select to authenticated using(id=auth.uid());
create policy admin_employees on employee_records for all to authenticated using(app_private.has_platform_admin_role()) with check(app_private.has_platform_admin_role());
create policy own_employee on employee_records for select to authenticated using(auth_user_id=auth.uid());
create policy own_roles on user_roles for select to authenticated using(user_id=auth.uid() or app_private.has_platform_admin_role());
create policy role_names on roles for select to authenticated using(true);
create policy photo_read on storage.objects for select to authenticated using(bucket_id='job-photos' and private.can_access_job_photo_object(name));
create policy "Authorized users can upload private job photos" on storage.objects for insert to authenticated with check(bucket_id='job-photos' and private.can_access_job_photo_object(name));
create policy true_policy_cannot_bypass_gate on employee_requests for all to authenticated using(true) with check(true);
revoke insert,update,delete on user_roles,roles from authenticated;
`);
  await db.exec(
    readFileSync(
      new URL("20261015040735_job_photo_category_parity.sql", dir),
      "utf8",
    ),
  );
  await db.exec(migration);
  for (let i = 0; i < ids.length; i++) {
    await db.query(
      "insert into profiles(id,status,user_type) values($1,'active',$2)",
      [ids[i], names[i] === "payroll_admin" ? "admin" : names[i]],
    );
    await db.query(
      "insert into roles(name) values($1) on conflict do nothing",
      [names[i]],
    );
    await db.query(
      "insert into user_roles select $1,id from roles where name=$2",
      [ids[i], names[i]],
    );
    if (i < 6)
      await db.query(
        "insert into employee_records(id,auth_user_id) values($1,$1)",
        [ids[i]],
      );
    await db.query(
      "insert into time_clock_permissions values($1,true,null,null)",
      [ids[i]],
    );
  }
  for (let i = 0; i < 6; i++) {
    await db.query(
      "insert into jobs values($1,$2,null),($3,null,$2),($4,null,null)",
      [uuid(100 + i * 3), ids[i], uuid(101 + i * 3), uuid(102 + i * 3)],
    );
    await db.query(
      "insert into schedule_events values($1,$2,'job','scheduled')",
      [uuid(200 + i), uuid(102 + i * 3)],
    );
    await db.query("insert into schedule_event_assignments values($1,$2,$2)", [
      uuid(200 + i),
      ids[i],
    ]);
    for (let j = 0; j < 3; j++)
      await db.query(
        "insert into storage.objects(bucket_id,name) values('job-photos',$1)",
        [`${uuid(100 + i * 3 + j)}/before/photo.jpg`],
      );
  }
  for (let i = 0; i < 6; i++) {
    await db.query(
      "insert into change_orders values($1,$2,'PR02 fixture','approved',now())",
      [uuid(600 + i), uuid(100 + i * 3)],
    );
    await db.query(
      "insert into job_change_order_scope_items values($1,'Fixture scope','Disposable',1)",
      [uuid(600 + i)],
    );
    await db.query(
      "insert into equipment_assets(id,name,is_active) values($1,'Fixture asset',true)",
      [uuid(700 + i)],
    );
    await db.query(
      "insert into equipment_assignments(id,asset_id,assigned_user_id,starts_at) values($1,$2,$3,now()-interval '1 hour')",
      [uuid(800 + i), uuid(700 + i), ids[i]],
    );
  }
  const run = async (id, sql, params = []) => {
    try {
      await db.exec("begin");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      await db.exec("set local role authenticated");
      const r = await db.query(sql, params);
      await db.exec("commit");
      return r.rows;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };
  const jwtRun = (jwt, sql, p) => run(verify(jwt), sql, p);
  const access = (actor, target, status = "inactive") =>
    run(actor, "select set_employee_access_status($1,$2,$3) result", [
      target,
      status,
      "Isolated regression test",
    ]);
  const client = (id) => ({
    auth: { getUser: async () => ({ data: { user: { id } }, error: null }) },
    rpc: async (name) => {
      try {
        return {
          data: (await run(id, `select public.${name}() value`))[0].value,
          error: null,
        };
      } catch {
        return { data: null, error: { message: "denied" } };
      }
    },
    from: () => ({
      select: () => ({
        eq: async () => {
          try {
            return {
              data: (
                await run(
                  id,
                  "select r.name from user_roles ur join roles r on r.id=ur.role_id where ur.user_id=$1",
                  [id],
                )
              ).map((r) => ({ roles: { name: r.name } })),
              error: null,
            };
          } catch {
            return { data: null, error: { message: "denied" } };
          }
        },
      }),
    }),
  });
  return { db, run, jwtRun, access, client };
}
const roles = load("../src/lib/auth/roles.ts", {
  "@/lib/supabase/server": { createClient: async () => null },
});
const crewAccess = load("../src/lib/auth/crewAccess.ts", {
  "@/lib/auth/roles": roles,
});
async function applicationAccess(f, id, jwt, allowed) {
  const client = f.client(id);
  const page = load("../src/lib/auth/pageContext.ts", {
    react: { cache: (fn) => fn },
    "next/navigation": {
      redirect: () => {
        throw Error("redirect");
      },
    },
    "@/lib/auth/roles": roles,
    "@/lib/supabase/server": { createClient: async () => client },
  });
  const context = await page.getAuthenticatedPlatformContext("/admin");
  assert.equal(
    roles.hasAllowedRole(context.roles, roles.platformRoleGroups.crewApp),
    allowed,
  );
  assert.equal(
    roles.hasAllowedRole(context.roles, roles.platformRoleGroups.internalStaff),
    allowed && id !== crew,
  );
  assert.equal(
    crewAccess.canAccessAssignedCrewJob({
      assignedCrewUserId: id,
      roles: context.roles,
      userId: id,
    }),
    allowed,
  );
  const api = load("../src/lib/auth/apiContext.ts", {
    "server-only": {},
    "@supabase/supabase-js": {
      createClient: (_url, _key, options) => {
        assert.equal(options.global.headers.Authorization, `Bearer ${jwt}`);
        assert.equal(verify(jwt), id);
        return client;
      },
    },
    "@/lib/auth/roles": roles,
    "@/lib/supabase/config": {
      getSupabasePublicConfig: () => ({
        url: "http://isolated.invalid",
        anonKey: "synthetic",
      }),
    },
  });
  const result = await api.getCrewApiContext(
    new Request("http://isolated.invalid/api/crew", {
      headers: { authorization: `Bearer ${jwt}` },
    }),
  );
  assert.equal(Boolean(result.context), allowed);
  if (!allowed) assert.equal(result.error.status, 403);
}
test("PR02: actual migration, role matrix, same signed token, RLS/RPC/storage/reactivation", async (t) => {
  const f = await fixture();
  try {
    for (let i = 0; i < 6; i++)
      await t.test(`${names[i]} (${i})`, async () => {
        const id = ids[i],
          actor = id === owner ? otherOwner : owner,
          jwt = token(id),
          jobs = [0, 1, 2].map((j) => uuid(100 + i * 3 + j));
        await f.db.query(
          "update time_clock_permissions set is_enabled=true where user_id=$1",
          [id],
        );
        const before = (await f.db.query("select count(*) from user_roles"))
          .rows[0].count;
        await applicationAccess(f, id, jwt, true);
        assert.deepEqual(await roles.getUserRoles(f.client(id), id), [
          names[i],
        ]);
        assert.equal(
          (await f.jwtRun(jwt, "select has_effective_platform_access() ok"))[0]
            .ok,
          true,
        );
        for (const job of jobs)
          assert.equal(
            (await f.jwtRun(jwt, "select id from jobs where id=$1", [job]))
              .length,
            1,
          );
        assert.ok(
          (await f.jwtRun(jwt, "select * from storage.objects")).length >= 3,
        );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "select * from get_crew_change_order_scope($1)",
              [jobs[0]],
            )
          ).length,
          1,
        );
        assert.equal(
          (await f.jwtRun(jwt, "select * from get_my_assigned_equipment()"))
            .length,
          1,
        );
        for (const category of [
          "before",
          "during",
          "after",
          "issue",
          "equipment_access",
          "completion",
        ])
          await f.jwtRun(
            jwt,
            "insert into storage.objects(bucket_id,name) values('job-photos',$1)",
            [`${jobs[0]}/${category}/new-${i}.jpg`],
          );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "select app_private.can_use_time_clock($1) ok",
              [id],
            )
          )[0].ok,
          true,
        );
        await f.jwtRun(
          jwt,
          "select submit_my_employee_request('other','Test','Isolated fixture')",
        );
        assert.equal(
          (await f.access(actor, id))[0].result.session_cleanup,
          "not_attempted",
        );
        assert.equal(verify(jwt), id, "same JWT remains valid");
        await applicationAccess(f, id, jwt, false);
        assert.deepEqual(await roles.getUserRoles(f.client(id), id), []);
        assert.equal(
          (await f.jwtRun(jwt, "select has_effective_platform_access() ok"))[0]
            .ok,
          false,
        );
        assert.equal(
          (
            await f.jwtRun(
              token(id),
              "select has_effective_platform_access() ok",
            )
          )[0].ok,
          false,
        );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "select app_private.can_use_time_clock($1) ok",
              [id],
            )
          )[0].ok,
          false,
        );
        for (const job of jobs)
          assert.equal(
            (await f.jwtRun(jwt, "select id from jobs where id=$1", [job]))
              .length,
            0,
          );
        for (const table of [
          "profiles",
          "user_roles",
          "roles",
          "employee_records",
          "storage.objects",
          "employee_requests",
        ])
          assert.equal(
            (await f.jwtRun(jwt, `select * from ${table}`)).length,
            0,
            table,
          );
        await assert.rejects(
          f.jwtRun(
            jwt,
            "select submit_my_employee_request('other','Bypass','Denied')",
          ),
          /No employee record/i,
        );
        await assert.rejects(
          f.jwtRun(jwt, "select start_assigned_job($1)", [jobs[0]]),
          /disabled/i,
        );
        await assert.rejects(
          f.jwtRun(jwt, "select save_assigned_job_closeout($1,$2)", [
            jobs[0],
            {},
          ]),
          /disabled/i,
        );
        await assert.rejects(
          f.jwtRun(jwt, "select submit_assigned_job_closeout($1)", [jobs[0]]),
          /disabled/i,
        );
        await assert.rejects(
          f.jwtRun(
            jwt,
            "select submit_crew_service_recommendation($1,$2,$3,$4,$5)",
            [jobs[0], "Bypass", "Denied", "soon", ""],
          ),
          /disabled/i,
        );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "select * from get_crew_change_order_scope($1)",
              [jobs[0]],
            )
          ).length,
          0,
        );
        assert.equal(
          (await f.jwtRun(jwt, "select * from get_my_assigned_equipment()"))
            .length,
          0,
        );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "update jobs set assigned_crew_user_id=$1 where id=$2 returning id",
              [id, jobs[0]],
            )
          ).length,
          0,
        );

        await assert.rejects(
          f.jwtRun(
            jwt,
            "insert into storage.objects(bucket_id,name) values('job-photos',$1)",
            [`${jobs[0]}/during/new.jpg`],
          ),
          /row-level security/i,
        );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "update profiles set status='active' where id=$1 returning id",
              [id],
            )
          ).length,
          0,
        );
        assert.equal(
          (
            await f.jwtRun(
              jwt,
              "update employee_records set is_active=true where id=$1 returning id",
              [id],
            )
          ).length,
          0,
        );
        await assert.rejects(
          f.access(id, id, "active"),
          /active owner or admin/i,
        );
        await assert.rejects(
          f.access(estimator, id, "active"),
          /active owner or admin/i,
        );
        await assert.rejects(
          f.run(
            actor,
            "update employee_records set is_active=true where id=$1",
            [id],
          ),
          /access command/i,
        );
        await assert.rejects(
          f.run(actor, "update profiles set status='active' where id=$1", [id]),
          /privileged employee/i,
        );
        await assert.rejects(
          f.run(actor, "select replace_platform_user_roles($1,$2,$3)", [
            id,
            ["crew"],
            "Inactive target",
          ]),
          /Reactivate/i,
        );
        assert.equal(
          (await f.db.query("select count(*) from user_roles")).rows[0].count,
          before,
        );
        await f.access(actor, id, "active");
        await applicationAccess(f, id, jwt, true);
        assert.deepEqual(await roles.getUserRoles(f.client(id), id), [
          names[i],
        ]);
        assert.equal(
          (await f.jwtRun(jwt, "select id from jobs where id=$1", [jobs[0]]))
            .length,
          1,
        );
        assert.equal(
          (
            await f.db.query(
              "select is_enabled from time_clock_permissions where user_id=$1",
              [id],
            )
          ).rows[0].is_enabled,
          false,
        );
      });
    for (const id of [customer, manager]) {
      assert.equal(
        (await f.run(id, "select has_effective_platform_access() ok"))[0].ok,
        true,
      );
      assert.deepEqual(await roles.getUserRoles(f.client(id), id), [
        names[ids.indexOf(id)],
      ]);
      assert.equal((await f.run(id, "select * from jobs")).length, 0);
    }
    assert.equal(
      (await f.db.query("select count(*) from jobs")).rows[0].count,
      18,
    );
    assert.equal(
      (await f.db.query("select count(*) from schedule_event_assignments"))
        .rows[0].count,
      6,
    );
    assert.equal(
      (await f.db.query("select count(*) from activity_log")).rows[0].count,
      12,
    );
  } finally {
    await f.db.close();
  }
});
test("PR02: owner protections, direct lifecycle bypass and transactional rollback", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.access(owner, owner), /own employee access/i);
    await assert.rejects(f.access(admin, otherOwner), /Only an owner/i);
    await assert.rejects(f.access(estimator, crew), /active owner or admin/i);
    await assert.rejects(
      f.run(estimator, "update profiles set status='disabled' where id=$1", [
        crew,
      ]),
      /privileged employee/i,
    );
    await assert.rejects(
      f.run(
        admin,
        "update employee_records set auth_user_id=null where id=$1",
        [otherOwner],
      ),
      /cannot be detached/i,
    );
    await assert.rejects(
      f.run(
        admin,
        "insert into employee_records(id,auth_user_id,is_active) values($1,$2,false)",
        [uuid(901), customer],
      ),
      /Link an active employee/i,
    );
    await assert.rejects(
      f.run(admin, "delete from employee_records where id=$1", [crew]),
      /permission denied/i,
    );
    await assert.rejects(
      f.run(
        crew,
        "insert into user_roles select $1,id from roles where name='owner'",
        [crew],
      ),
      /permission denied/i,
    );
    await f.access(owner, otherOwner);
    await assert.rejects(f.access(admin, owner), /Only an owner/i);
    await f.db.query(
      "insert into user_roles select $1,id from roles where name='owner'",
      [admin],
    );
    await f.access(owner, admin);
    await f.access(owner, admin, "active");
    await f.run(owner, "select replace_platform_user_roles($1,$2,$3)", [
      admin,
      ["admin"],
      "Remove extra owner",
    ]);
    await assert.rejects(
      f.run(admin, "select replace_platform_user_roles($1,$2,$3)", [
        owner,
        ["crew"],
        "Owner bypass",
      ]),
      /Admins cannot/i,
    );
    await f.db.exec(
      "alter table activity_log add constraint fail_audit check(event_type <> 'employee_marked_inactive') not valid;",
    );
    await assert.rejects(f.access(owner, crew), /fail_audit/i);
    assert.equal(
      (await f.run(crew, "select has_effective_platform_access() ok"))[0].ok,
      true,
    );
    assert.equal(
      (
        await f.db.query(
          "select is_enabled from time_clock_permissions where user_id=$1",
          [crew],
        )
      ).rows[0].is_enabled,
      true,
    );
    assert.equal(
      (
        await f.db.query(
          "select * from employee_separation_items where employee_id=$1",
          [crew],
        )
      ).rows.length,
      0,
    );
    const policies = (
      await f.db.query(
        "select permissive from pg_policies where policyname='Effective platform access required'",
      )
    ).rows;
    assert.equal(
      policies.length,
      [
        ...migration.matchAll(
          /create policy "Effective platform access required" on/g,
        ),
      ].length,
    );
    assert.ok(policies.every((p) => p.permissive === "RESTRICTIVE"));
    assert.equal(
      (
        await f.db.query(
          "select has_function_privilege('anon','public.set_employee_access_status(uuid,text,text)','execute') ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await f.db.close();
  }
});

test("PR02: independent employment/profile denial, archive, assignment variants, and fail-closed roles", async () => {
  const f = await fixture();
  try {
    // Legacy work-session user IDs and durable employee IDs are tested separately.
    await f.db.query("insert into jobs values($1,null,null),($2,null,null)", [
      uuid(500),
      uuid(501),
    ]);
    await f.db.query(
      "insert into schedule_events values($1,$2,'job','scheduled'),($3,$4,'job','scheduled')",
      [uuid(502), uuid(500), uuid(503), uuid(501)],
    );
    await f.db.query(
      "insert into schedule_event_assignments values($1,$2,null),($3,null,$2)",
      [uuid(502), crew, uuid(503)],
    );
    const jwt = token(crew);
    for (const id of [uuid(500), uuid(501)])
      assert.equal(
        (await f.jwtRun(jwt, "select id from jobs where id=$1", [id])).length,
        1,
      );
    for (const change of [
      "is_active=false",
      "employment_status='inactive'",
      "employment_status='separated'",
      "archived_at=now()",
    ]) {
      await f.db.exec(
        `update employee_records set ${change} where id='${crew}'`,
      );
      assert.equal(
        (await f.jwtRun(jwt, "select has_effective_platform_access() ok"))[0]
          .ok,
        false,
        change,
      );
      for (const id of [uuid(500), uuid(501)])
        assert.equal(
          (await f.jwtRun(jwt, "select id from jobs where id=$1", [id])).length,
          0,
        );
      await f.db.exec(
        `update employee_records set is_active=true,employment_status='active',archived_at=null where id='${crew}'`,
      );
    }
    await f.db.query("update profiles set status='disabled' where id=$1", [
      crew,
    ]);
    assert.equal(
      (await f.jwtRun(jwt, "select has_effective_platform_access() ok"))[0].ok,
      false,
    );
    await f.access(admin, crew, "active");
    await f.access(admin, crew, "archived");
    assert.equal(
      (await f.jwtRun(jwt, "select has_effective_platform_access() ok"))[0].ok,
      false,
    );
    await f.access(admin, crew, "active");
    assert.equal(
      (await f.jwtRun(jwt, "select has_effective_platform_access() ok"))[0].ok,
      true,
    );
    await assert.rejects(
      f.access(admin, admin, "active"),
      /own employee access/i,
    );
    await assert.rejects(
      f.run(owner, "select replace_platform_user_roles($1,$2,$3)", [
        owner,
        ["admin"],
        "Self role removal",
      ]),
      /own platform roles/i,
    );
    // One legal serial ordering of shared-lock operations cannot strand the company.
    await f.run(owner, "select replace_platform_user_roles($1,$2,$3)", [
      otherOwner,
      ["admin"],
      "Remove second owner role",
    ]);
    await assert.rejects(f.access(otherOwner, owner), /Only an owner/i);
    await assert.rejects(f.access(owner, owner), /own employee access/i);
    assert.equal(
      (
        await f.db.query(
          "select count(*) from user_roles ur join roles r on r.id=ur.role_id where r.name='owner' and app_private.effective_platform_access(ur.user_id)",
        )
      ).rows[0].count,
      1,
    );
    // No fabricated roles if the authoritative predicate cannot be read.
    assert.deepEqual(
      await roles.getUserRoles(
        {
          rpc: async () => ({ data: null, error: { message: "offline" } }),
          from: () => {
            throw Error("must not read roles");
          },
        },
        crew,
      ),
      [],
    );
    // Guard all changed definers, even unexpected missing-function deployment drift.
    const definers = (
      await f.db.query(
        "select n.nspname,p.proname,p.proconfig,has_function_privilege('anon',p.oid,'execute') anonymous from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','app_private')",
      )
    ).rows;
    const changed = new Set(
      [
        ...migration.matchAll(/(?:create or replace function) ([\w.]+)\(/gi),
      ].map((m) => m[1]),
    );
    for (const fn of definers.filter((fn) =>
      changed.has(`${fn.nspname}.${fn.proname}`),
    )) {
      assert.equal(fn.anonymous, false, fn.proname);
      assert.ok(
        fn.proconfig.some((v) => v === 'search_path=""'),
        fn.proname,
      );
    }
  } finally {
    await f.db.close();
  }
});

test("PR02: actual server actions surface transactional failure and retained-session warnings", async () => {
  const f = await fixture();
  try {
    let actor = admin,
      forceFailure = false;
    const client = () => {
      const c = f.client(actor),
        originalRpc = c.rpc;
      c.rpc = async (name, args) => {
        if (name !== "set_employee_access_status") return originalRpc(name);
        assert.deepEqual(Object.keys(args).sort(), [
          "p_employee_id",
          "p_reason",
          "p_status",
        ]);
        if (forceFailure)
          return {
            data: null,
            error: { message: "Access change was not completed." },
          };
        try {
          return {
            data: (
              await f.run(
                actor,
                "select set_employee_access_status($1,$2,$3) value",
                [args.p_employee_id, args.p_status, args.p_reason],
              )
            )[0].value,
            error: null,
          };
        } catch {
          return {
            data: null,
            error: { message: "Access change was denied." },
          };
        }
      };
      return c;
    };
    const actions = load("../src/app/admin/employees/actions.ts", {
      "next/cache": { revalidatePath: () => {} },
      "next/navigation": {
        redirect: (path) => {
          throw { redirect: path };
        },
      },
      "@/lib/activity-log": {},
      "@/lib/business-time": {},
      "@/lib/auth/roles": roles,
      "@/lib/data/employees": {},
      "@/lib/supabase/server": { createClient: async () => client() },
      "@/lib/security/upload-validation": {},
      "@/lib/security/errors": { safeStaffMessage: (message) => message },
    });
    const form = new FormData();
    form.set("employee_id", crew);
    form.set("reason", "Disposable action fixture");
    const redirected = async (fn) => {
      try {
        await fn(form);
        assert.fail("Expected action redirect");
      } catch (e) {
        assert.ok(e.redirect);
        return new URL(e.redirect, "http://isolated.invalid").searchParams;
      }
    };
    forceFailure = true;
    assert.equal(
      (await redirected(actions.markEmployeeInactive)).get("access_result"),
      "error",
    );
    assert.equal(
      (await f.run(crew, "select has_effective_platform_access() ok"))[0].ok,
      true,
    );
    forceFailure = false;
    let result = await redirected(actions.markEmployeeInactive);
    assert.equal(result.get("access_result"), "warning");
    assert.match(
      result.get("access_message"),
      /CRM access disabled.*Time clock disabled.*sessions were not revoked/i,
    );
    assert.equal(
      (await f.run(crew, "select has_effective_platform_access() ok"))[0].ok,
      false,
    );
    result = await redirected(actions.reactivateEmployee);
    assert.match(
      result.get("access_message"),
      /restored.*Time clock remains disabled.*unexpired sessions may regain access/i,
    );
    actor = crew;
    assert.equal(
      (await redirected(actions.markEmployeeInactive)).get("access_result"),
      "error",
    );
  } finally {
    await f.db.close();
  }
});

test("Separate recommendation authorization finding: reproduce NULL bypass, then enforce all assignment paths", async () => {
  const f = await fixture();
  try {
    await f.db
      .exec(`alter table jobs add column customer_id uuid,add column organization_id uuid,add column service_location_id uuid;
   alter table service_recommendations alter column id set default gen_random_uuid();
   alter table service_recommendations add column customer_id uuid,add column organization_id uuid,add column service_location_id uuid,add column source_job_id uuid,
   add column title text,add column customer_recommendation text,add column internal_notes text,add column recommended_timeframe text,add column origin text,add column status text,add column created_by_user_id uuid;`);
    const job = uuid(990);
    await f.db.query("insert into jobs(id) values($1)", [job]);
    const call = (actor, id) =>
      f.run(
        actor,
        "select submit_crew_service_recommendation($1,$2,$3,$4,$5) id",
        [
          id,
          "Disposable recommendation",
          "Regression fixture",
          "next_month",
          null,
        ],
      );
    assert.ok(
      (await call(crew, job))[0].id,
      "pre-fix NULL assignee bypass is reproduced",
    );
    await f.db.exec(
      readFileSync(
        new URL(
          "20261015050427_guard_service_recommendation_assignment.sql",
          dir,
        ),
        "utf8",
      ),
    );
    await assert.rejects(call(crew, job), /not assigned/i);
    await assert.rejects(call(crew, uuid(100)), /not assigned/i);
    for (const assigned of [uuid(115), uuid(116), uuid(117)])
      assert.ok(
        (await call(crew, assigned))[0].id,
        "existing assignment helper positives",
      );
    assert.ok((await call(admin, job))[0].id, "staff intended path");
    await f.access(owner, crew);
    for (const assigned of [job, uuid(115), uuid(116), uuid(117)])
      await assert.rejects(call(crew, assigned), /disabled/i);
    await f.access(owner, crew, "active");
    assert.ok((await call(crew, uuid(116)))[0].id);
  } finally {
    await f.db.close();
  }
});
