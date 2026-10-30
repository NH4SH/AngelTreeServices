import { liveDatabaseError } from './live-database.mjs';
const operations = Object.freeze({
  get_firewood_live_handoff_context: [['p_source', 'text']],
  request_firewood_live_office_price: [['p_source', 'text'], ['p_order', 'uuid'], ['p_reference', 'text'], ['p_draft_hash', 'text'], ['p_draft', 'jsonb']],
  read_firewood_live_office_price: [['p_source', 'text'], ['p_order', 'uuid'], ['p_draft_hash', 'text']],
  read_firewood_live_handoff: [['p_source', 'text'], ['p_order', 'uuid'], ['p_invoice', 'uuid'], ['p_hash', 'text']],
  record_firewood_live_handoff_observation: [['p_source', 'text'], ['p_order', 'uuid'], ['p_invoice', 'uuid'], ['p_hash', 'text'], ['p_ledger_hash', 'text'], ['p_financial', 'jsonb']],
});
export function nativeOfficeDatabase(pool) { return { async call(name, args) {
  const operation = Object.hasOwn(operations, name) ? operations[name] : null;
  if (!operation) throw Error('Unsupported office operation');
  try { const result = await pool.query({ text: 'select public.' + name + '(' + operation.map(([, type], i) => '$' + (i + 1) + '::' + type).join(',') + ') as result',
    values: operation.map(([key, type]) => type === 'jsonb' ? JSON.stringify(args[key]) : args[key]), query_timeout: 5000 });
    if (result.rows.length !== 1) throw Error('Missing office receipt'); return result.rows[0].result;
  } catch (error) { throw liveDatabaseError(error); }
} }; }
export function supabaseOfficeDatabase(client) { return { async call(name, args) {
  if (!Object.hasOwn(operations, name)) throw Error('Unsupported office operation');
  const filtered = Object.fromEntries(operations[name].map(([key]) => [key, args[key]]));
  try { const result = await client.rpc(name, filtered).abortSignal(AbortSignal.timeout(5000)); if (result.error) throw result.error; return result.data;
  } catch (error) { throw liveDatabaseError(error); }
} }; }
