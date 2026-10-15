import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import sharp from "sharp";
import { buildJobPhotoPath } from "../src/lib/storage/job-photo-paths.ts";
import { prepareSafeUpload } from "../src/lib/security/upload-validation.ts";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const migration = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
const foundation = migration("0001_initial_platform_schema");
const storage = migration("0004_job_photo_storage");
const hardened = migration("20260716212545_harden_security_definer_functions");
const sessions = migration("20260720005626_multi_day_job_work_sessions");
const identity = migration("20260831124158_align_assigned_employee_rls");
const closeout = migration("20260716222258_crew_job_closeout_workflow");
const parity = migration("20261015040735_job_photo_category_parity");
const categories = ["before", "during", "after", "issue", "equipment_access", "completion"];
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const jobA = uuid(100), jobB = uuid(101), jobC = uuid(102);
const crew = uuid(1), unassigned = uuid(2), employeeCrew = uuid(3), sessionCrew = uuid(4);

// Read production SQL rather than reimplementing its authorization in JavaScript.
function statement(source, prefix) {
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `Missing migration statement: ${prefix}`);
  return source.slice(start, source.indexOf(";", start) + 1);
}

function sqlFunction(source, name) {
  const escaped = name.replaceAll(".", "\\.");
  const match = source.match(new RegExp(`create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `Missing migration function: ${name}`);
  return match[0];
}

function loadModule(file, dependencies) {
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    assert.ok(name in dependencies, `Unexpected import ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

async function fixture() {
  const db = new PGlite();
  // Minimal service-owned schemas only. Public authorization helpers, object
  // policies, metadata policies and the category constraint are loaded below
  // from committed migrations. This is not a replay of the full migration chain.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema app_private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1]
    $$;
    create function storage.filename(name text) returns text language sql immutable as $$
      select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
    $$;
    create table public.roles(id uuid primary key default gen_random_uuid(), name text);
    create table public.user_roles(user_id uuid, role_id uuid references public.roles(id));
    create table public.employee_records(id uuid primary key, auth_user_id uuid, is_active boolean, archived_at timestamptz);
    create table public.jobs(id uuid primary key, assigned_crew_user_id uuid, assigned_crew_employee_id uuid);
    create table public.schedule_events(id uuid primary key, job_id uuid references public.jobs(id), event_type text, status text);
    create table public.schedule_event_assignments(event_id uuid references public.schedule_events(id), user_id uuid, employee_id uuid);
    create table public.job_photos(
      id uuid primary key default gen_random_uuid(), job_id uuid references public.jobs(id),
      uploaded_by_user_id uuid, photo_type text, storage_path text, caption text,
      created_at timestamptz default now()
    );
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
      name text, owner_id text, unique(bucket_id, name)
    );
    alter table public.jobs enable row level security;
    alter table public.job_photos enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, app_private, storage to authenticated, anon;
    grant select on public.jobs to authenticated;
    grant select, insert on public.job_photos to authenticated;
    -- anon is granted SQL privileges deliberately, so the negative case proves
    -- RLS denial rather than relying only on a missing GRANT.
    grant select, insert, delete on storage.objects to authenticated, anon;
  `);
  await db.exec(sqlFunction(foundation, "public.has_staff_role"));
  await db.exec(sqlFunction(hardened, "app_private.has_staff_role"));
  await db.exec(sqlFunction(identity, "app_private.is_assigned_to_job"));
  await db.exec(statement(foundation, 'create policy "Staff can manage jobs"'));
  await db.exec(statement(foundation, 'create policy "Staff can manage job photos"'));
  for (const name of ["Crew can read assigned jobs", "Crew can read photos for assigned jobs", "Crew can add photos to assigned jobs"]) {
    await db.exec(statement(storage, `create policy "${name}"`));
    await db.exec(statement(sessions, `alter policy "${name}"`));
  }
  for (const name of ["Staff can manage jobs", "Staff can manage job photos"]) {
    await db.exec(statement(hardened, `alter policy "${name}"`));
  }
  await db.exec(statement(closeout, "alter table public.job_photos\n  add constraint job_photos_photo_type_check"));
  await db.exec(storage.slice(storage.indexOf("create schema if not exists private;")));
  await db.exec(sqlFunction(sessions, "private.can_access_job_photo_object"));
  await db.exec(migration("20260723013121_manage_private_job_photo_bucket"));
  await db.exec(`
    insert into storage.buckets values ('other', 'other', false, 6291456, array['image/jpeg']);
    insert into public.roles(name) values ('owner'), ('admin'), ('payroll_admin'), ('estimator'), ('crew'), ('customer');
    insert into public.user_roles select '${crew}', id from public.roles where name='crew';
    insert into public.user_roles select '${employeeCrew}', id from public.roles where name='crew';
    insert into public.user_roles select '${sessionCrew}', id from public.roles where name='crew';
    insert into public.user_roles select '${unassigned}', id from public.roles where name='crew';
    insert into public.employee_records values ('${uuid(200)}','${employeeCrew}',true,null), ('${uuid(201)}','${sessionCrew}',true,null);
    insert into public.jobs values ('${jobA}','${crew}',null), ('${jobB}',null,'${uuid(200)}'), ('${jobC}',null,null);
    insert into public.schedule_events values ('${uuid(300)}','${jobC}','job','scheduled');
    insert into public.schedule_event_assignments values ('${uuid(300)}',null,'${uuid(201)}');
  `);
  for (const [index, role] of ["owner", "admin", "payroll_admin", "estimator", "customer"].entries()) {
    await db.query("insert into public.user_roles select $1,id from public.roles where name=$2", [uuid(10 + index), role]);
  }
  return db;
}

async function asUser(db, id, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? ""]);
  assert.ok(["authenticated", "anon"].includes(role));
  await db.exec(`set role ${role}`);
}

// Transport adapter: only database operations and synthetic signed URLs, never
// a hosted Supabase endpoint. All authorization is evaluated by PostgreSQL RLS.
function clientFor(db, userId) {
  return {
    from(table) {
      assert.ok(["jobs", "job_photos"].includes(table));
      const filters = {};
      const rows = () => table === "jobs"
        ? db.query("select id, assigned_crew_user_id from public.jobs where id=$1", [filters.id])
        : db.query("select * from public.job_photos where job_id=$1 order by created_at desc", [filters.job_id]);
      return {
        select() { return this; }, eq(key, value) { filters[key] = value; return this; }, order() { return this; },
        async single() {
          const result = await rows();
          return { data: result.rows[0] ?? null, error: result.rows.length ? null : { message: "Job not available." } };
        },
        async insert(row) {
          try {
            await db.query("insert into public.job_photos(job_id,uploaded_by_user_id,photo_type,storage_path,caption) values($1,$2,$3,$4,$5)",
              [row.job_id, row.uploaded_by_user_id, row.photo_type, row.storage_path, row.caption]);
            return { error: null };
          } catch (error) { return { error }; }
        },
        then(resolve, reject) { return rows().then(({ rows }) => ({ data: rows, error: null })).then(resolve, reject); },
      };
    },
    storage: { from(bucket) {
      return {
        async upload(name, bytes, options) {
          assert.equal(bucket, "job-photos"); assert.equal(options.upsert, false);
          assert.ok(bytes.byteLength > 0); assert.equal(options.contentType, "image/png");
          try {
            await db.query("insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)", [bucket, name, userId]);
            return { error: null };
          } catch (error) { return { error }; }
        },
        async remove(names) {
          await db.query("delete from storage.objects where bucket_id=$1 and name=any($2::text[])", [bucket, names]);
          return { error: null };
        },
        async createSignedUrl(name, lifetime) {
          assert.equal(lifetime, 900, "existing signed URL lifetime must remain 15 minutes");
          const result = await db.query("select id from storage.objects where bucket_id=$1 and name=$2", [bucket, name]);
          return result.rows.length
            ? { data: { signedUrl: `https://storage.example.test/${result.rows[0].id}` }, error: null }
            : { data: null, error: { message: "Object not available." } };
        },
      };
    } },
  };
}

test("photo parity: real PostgreSQL policies and production upload path in isolation", async (t) => {
  const db = await fixture();
  try {
    await asUser(db, crew);
    await t.test("pre-migration policy reproduces the two rejected categories", async () => {
      for (const category of ["during", "equipment_access"]) {
        await assert.rejects(db.query("insert into storage.objects(bucket_id,name,owner_id) values('job-photos',$1,$2)",
          [buildJobPhotoPath({ jobId: jobA, category, fileName: "old.png" }), crew]), /row-level security/i);
      }
      await db.query("insert into storage.objects(bucket_id,name,owner_id) values('job-photos',$1,$2)",
        [buildJobPhotoPath({ jobId: jobA, category: "before", fileName: "old.png" }), crew]);
    });

    await db.exec("reset role");
    const snapshot = async () => ({
      bucket: (await db.query("select * from storage.buckets where id='job-photos'")).rows,
      policies: (await db.query("select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' and cmd<>'INSERT' order by policyname")).rows,
    });
    const before = await snapshot();
    await db.exec(parity);
    await t.test("migration leaves private bucket, size/MIME and read/delete policies unchanged", async () => {
      assert.deepEqual(await snapshot(), before);
      assert.equal(before.bucket[0].public, false);
      assert.equal(Number(before.bucket[0].file_size_limit), 6 * 1024 * 1024);
      assert.deepEqual(before.bucket[0].allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);
      const [policy] = (await db.query("select roles from pg_policies where schemaname='storage' and policyname='Authorized users can upload private job photos'")).rows;
      assert.deepEqual(policy.roles, ["authenticated"]);
    });

    const { uploadJobPhotoForUser } = loadModule("../src/lib/storage/job-photo-upload.ts", {
      "server-only": {}, "next/cache": { revalidatePath() {} },
      "@/lib/activity-log": { async recordActivity() {} },
      "@/lib/storage/job-photo-paths": { buildJobPhotoPath, JOB_PHOTO_BUCKET: "job-photos" },
      "@/lib/security/upload-validation": { prepareSafeUpload },
    });
    const { getJobPhotos } = loadModule("../src/lib/data/job-photos.ts", {
      "@/lib/supabase/server": { createClient() { throw new Error("Must supply isolated client"); } },
      "@/lib/storage/job-photo-paths": { JOB_PHOTO_BUCKET: "job-photos" },
      "@/lib/security/errors": { safeStaffMessage: (value) => value },
    });
    const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: "green" } }).png().toBuffer();
    const upload = (client, actor, jobId, category) => uploadJobPhotoForUser({
      caption: "Isolated test", category, file: new File([bytes], `${randomUUID()}.png`, { type: "image/png" }),
      jobId, supabase: client, userId: actor,
    });
    const actors = [[crew, jobA, "legacy assigned crew"], [employeeCrew, jobB, "employee assigned crew"], [sessionCrew, jobC, "work-session assigned crew"],
      ...["owner", "admin", "payroll_admin", "estimator"].map((role, i) => [uuid(10 + i), jobA, role])];
    for (const [actor, jobId, label] of actors) {
      await t.test(`${label}: all six categories upload, persist metadata and retrieve privately`, async () => {
        await asUser(db, actor);
        const client = clientFor(db, actor);
        for (const category of categories) assert.equal((await upload(client, actor, jobId, category)).status, "success", category);
        const photos = await getJobPhotos(jobId, client);
        assert.equal(photos.error, null);
        assert.ok(photos.data.every((photo) => photo.signed_url));
        for (const category of categories) assert.ok(photos.data.some((photo) => photo.photo_type === category && photo.storage_path.split("/")[1] === category));
      });
    }
    await t.test("application rejects invalid category, malformed job, unsafe and oversized images before storage", async () => {
      await asUser(db, crew); const client = clientFor(db, crew);
      const before = (await db.query("select count(*) from storage.objects")).rows;
      for (const category of ["unknown", "customer_upload"]) {
        assert.equal((await upload(client, crew, jobA, category)).status, "error");
      }
      assert.equal((await upload(client, crew, "not-a-uuid", "before")).status, "error");
      const rejected = await uploadJobPhotoForUser({
        caption: "", category: "before", file: new File(["<svg/>"], "fake.png", { type: "image/png" }),
        jobId: jobA, supabase: client, userId: crew,
      });
      assert.equal(rejected.status, "error");
      const oversized = await uploadJobPhotoForUser({
        caption: "", category: "before", file: new File([new Uint8Array(6 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
        jobId: jobA, supabase: client, userId: crew,
      });
      assert.equal(oversized.status, "error");
      assert.deepEqual((await db.query("select count(*) from storage.objects")).rows, before);
    });
    await t.test("direct Storage INSERT rejects invalid folders and malformed paths, including for staff", async () => {
      await asUser(db, uuid(10));
      for (const name of [`${jobA}/unknown/x.png`, `${jobA}/customer_upload/x.png`, `${jobA}/before/`, `${jobA}/before/extra/x.png`,
        `${jobA}/before/..`, `${jobA}//x.png`, "not-a-job/before/x.png", `/before/x.png`]) {
        await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('job-photos',$1)", [name]), /row-level security/i, name);
      }
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('other',$1)", [`${jobA}/before/x.png`]), /row-level security/i);
    });
    await t.test("anonymous, customer and unassigned crew cannot upload", async () => {
      for (const [actor, role] of [[null, "anon"], [uuid(14), "authenticated"], [unassigned, "authenticated"]]) {
        await asUser(db, actor, role);
        for (const category of categories) await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('job-photos',$1)",
          [buildJobPhotoPath({ jobId: jobA, category, fileName: `${randomUUID()}.png` })]), /row-level security/i);
        assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
      }
    });
    await t.test("assigned crew cannot upload metadata/objects for or retrieve another job", async () => {
      await asUser(db, crew); const client = clientFor(db, crew);
      assert.equal((await upload(client, crew, jobB, "during")).status, "error");
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('job-photos',$1)", [`${jobB}/during/cross.png`]), /row-level security/i);
      await assert.rejects(db.query("insert into public.job_photos(job_id,uploaded_by_user_id,photo_type,storage_path) values($1,$2,'during','cross')", [jobB, crew]), /row-level security/i);
      assert.equal((await getJobPhotos(jobB, client)).data.length, 0);
      assert.equal((await db.query("select * from storage.objects where name like $1", [`${jobB}/%`])).rows.length, 0);
    });
    await t.test("cancelled work-session assignment does not authorize uploads", async () => {
      await db.exec("reset role"); await db.query("update public.schedule_events set status='cancelled' where job_id=$1", [jobC]);
      await asUser(db, sessionCrew);
      await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('job-photos',$1)", [`${jobC}/before/cancelled.png`]), /row-level security/i);
    });
  } finally { await db.close(); }
});
