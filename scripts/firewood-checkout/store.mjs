import { NetlifyDB } from '@netlify/database-dev';
import { mkdir, chmod, open, unlink, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createOrderStore } from './store-core.mjs';
import { drainControlledEmail } from './email-worker.mjs';

const migrations = fileURLToPath(new URL('./migrations', import.meta.url));
export const defaultDataDirectory = fileURLToPath(new URL('../../.firewood-test-data', import.meta.url));

// SQL is also compatible with a future website-owned Postgres connection. This
// local opener never reads NETLIFY_DB_URL, Supabase, or CRM connection settings.
export async function openOrderStore({ directory, now = Date.now, beforeCapture = async () => {}, controlledEmail = false, mailer = null } = {}) {
  let lock;
  if (directory) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const lockPath = `${directory}/.owner.lock`;
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await readFile(lockPath, 'utf8'));
      let alive = true;
      try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
      if (alive || !Number.isSafeInteger(pid) || pid <= 0) throw new Error('The Firewood test database is already in use. Stop its preview before opening another copy.');
      await unlink(lockPath);
      lock = await open(lockPath, 'wx', 0o600);
    }
    await lock.writeFile(String(process.pid));
  }
  const db = new NetlifyDB({ directory: directory ? `${directory}/postgres` : undefined, logger: () => {} });
  const unlock = async () => { if (lock) { await lock.close(); await unlink(`${directory}/.owner.lock`); lock = null; } };
  try { await db.start(); await db.applyMigrations(migrations); }
  catch (error) { await db.stop().catch(() => {}); await unlock(); throw error; }
  const store = createOrderStore(db, { now, beforeCapture, controlledEmail, close: async () => { await db.stop(); await unlock(); } });
  store.workEmail = () => drainControlledEmail(db, controlledEmail ? mailer : null, { now });
  return store;
}
