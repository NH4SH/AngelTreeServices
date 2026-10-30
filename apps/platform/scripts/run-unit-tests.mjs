import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) return findTests(name);
    return entry.name.endsWith(".test.mjs") && !entry.name.endsWith(".integration.test.mjs") ? [name] : [];
  }));
  return files.flat();
}

const tests = [...await findTests(path.join(root, "src/lib")), ...await findTests(path.join(root, "tests"))].sort();
console.info(`Running ${tests.length} local unit/PostgreSQL test files; no provider credentials required.`);
console.info("Local Supabase Auth/Mailpit recovery test is separate: see tests/README.md (test:auth:integration).");
const result = spawnSync(process.execPath, [
  "--conditions=react-server", "--experimental-strip-types", "--test", "--test-concurrency=4", ...tests,
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
