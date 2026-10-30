// Local source preparation only. Executes the reviewed installers solely in an
// owned disposable engine and exports their DDL; never accepts a connection URL.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createIsolatedLiveDatabase } from '../live/isolated-database.mjs';
import { installOfficeOrderStore } from '../office-v2/orders.mjs';
import { officeFixture } from '../office-v2/test-fixture.mjs';
import { installConfirmationStore } from './confirmations.mjs';
const db = await createIsolatedLiveDatabase(), statements = [];
const transaction = db.transaction.bind(db);
db.transaction = fn => transaction(tx => fn({ query: async (sql, args = []) => {
  if (/^(?:CREATE |ALTER TABLE fwofficev2_prepare |DROP TRIGGER |INSERT INTO fwofficev2_control|INSERT INTO fwofficev2_heartbeat)/iu.test(sql.trim())) {
    if (args.length) throw Error('schema_export_cannot_contain_bound_values');
    statements.push(sql.trim().replace(/;$/u, '') + ';');
  }
  return tx.query(sql, args);
} }));
try {
  const crm = officeFixture(); await installOfficeOrderStore(db,crm.live,crm.office); await installConfirmationStore(db);
  const tables = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(x=>x.table_name);
  if (tables.length !== 15 || tables.some(x=>!x.startsWith('fwofficev2_'))) throw Error('exact_website_store_required');
  const sql = '-- Source-derived Website office-v2 DDL. Requires a fresh private schema and the separately guarded installer.\n'
    + '-- No source/role/admission/credential seed, identity hash, writer grant or activation is included.\n\n' + statements.join('\n\n') + '\n';
  await writeFile(new URL('./schema.sql',import.meta.url),sql);
  console.log(JSON.stringify({tableCount:tables.length,tables,statements:statements.length,sha256:createHash('sha256').update(sql).digest('hex'),productionChanged:false}));
} finally { await db.stop(); }
