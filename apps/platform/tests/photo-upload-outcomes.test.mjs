import { isolatedUploadOnly } from "./attachment-test-helpers.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { load } from "./pr10-test-helpers.mjs";

const job = "00000000-0000-4000-8000-000000000001";
const path = job + "/completion/new-local.png";
const mod = load("../src/lib/storage/job-photo-upload.ts", {
  "server-only": {}, "next/cache": { revalidatePath() {} },
  "@/lib/storage/job-photo-paths": { JOB_PHOTO_BUCKET: "job-photos", buildJobPhotoPath: () => path },
  "@/lib/security/attachment-scan-service": isolatedUploadOnly,
  "@/lib/security/upload-validation": { prepareSafeUpload: async () => ({ data: { bytes: new Uint8Array([1]), contentType: "image/png" } }) },
});

async function attempt(failure, cleanup) {
  const removed = [];
  const db = {
    from: table => table === "jobs"
      ? { select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: job }, error: null }) }
      : { insert: async () => { if (failure === "throw") throw Error("Transport"); return { error: failure }; } },
    storage: { from: bucket => {
      assert.equal(bucket, "job-photos");
      return {
        upload: async () => ({ error: null }),
        remove: async paths => { removed.push(...paths); return cleanup(); },
      };
    } },
  };
  const result = await mod.uploadJobPhotoForUser({ caption: "Local", category: "completion",
    file: new File(["local"], "local.png", { type: "image/png" }), jobId: job, userId: "local", supabase: db });
  assert.equal(result.status, "error");
  assert.equal(result.jobId, job);
  return { result, removed };
}

test("uncertain metadata acknowledgements preserve the blob without attempting deletion", async () => {
  for (const failure of ["throw", { code: "", message: "Transport error" }]) {
    const { result, removed } = await attempt(failure, () => assert.fail("Do not delete a possibly committed attachment"));
    assert.deepEqual(removed, []);
    assert.match(result.message, /Check the job photos before uploading again/);
  }
});

test("a definite SQL rollback reports removal only for an exact newly uploaded path receipt", async () => {
  const { result, removed } = await attempt({ code: "23514", message: "Internal audit constraint" },
    () => ({ data: [{ name: path }], error: null }));
  assert.deepEqual(removed, [path]);
  assert.match(result.message, /The uploaded file was removed/);
  assert.doesNotMatch(result.message, /Internal audit constraint/);
});

test("empty, missing, unrelated, rejected or lost cleanup receipts remain unconfirmed", async t => {
  for (const [label, cleanup] of [
    ["empty", () => ({ data: [], error: null })],
    ["null", () => ({ data: null, error: null })],
    ["missing", () => ({ error: null })],
    ["another path", () => ({ data: [{ name: job + "/completion/existing.png" }], error: null })],
    ["multiple paths", () => ({ data: [{ name: path }, { name: "unrelated" }], error: null })],
    ["error", () => ({ data: null, error: { message: "PRIVATE PROVIDER DIAGNOSTIC" } })],
    ["error with data", () => ({ data: [{ name: path }], error: { message: "PRIVATE PROVIDER DIAGNOSTIC" } })],
    ["transport throw", () => { throw Error("PRIVATE PROVIDER DIAGNOSTIC"); }],
  ]) await t.test(label, async () => {
    const { result, removed } = await attempt({ code: "23514", message: "Internal audit constraint" }, cleanup);
    assert.deepEqual(removed, [path]);
    assert.match(result.message, /cleanup could not be confirmed/);
    assert.match(result.message, /administrator before uploading again/);
    assert.doesNotMatch(result.message, /was removed|PRIVATE PROVIDER|Internal audit/);
  });
});
