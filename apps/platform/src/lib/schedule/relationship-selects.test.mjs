import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const relationshipFiles = [
  "../actions/communications.ts",
  "../communications/queue.ts",
  "../data/crew-jobs.ts",
  "../data/schedule.ts",
  "../data/time-clock.ts",
  "../../app/admin/jobs/actions.ts",
];

test("schedule event queries name the operational job relationship explicitly", async () => {
  for (const relativePath of relationshipFiles) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(
      source,
      /schedule_events_job_id_fkey/,
      `${relativePath} must identify schedule_events.job_id rather than the lead provenance relationship`,
    );
  }
});
