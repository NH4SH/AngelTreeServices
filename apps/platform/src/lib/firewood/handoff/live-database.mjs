import { FirewoodLiveHandoffError } from './live-contract.mjs';

// Fixed operation names/types prevent a caller-selected RPC or SQL identifier.
const operations = Object.freeze({
  get_firewood_live_handoff_context: [['p_source', 'text']],
  prepare_firewood_live_handoff: [['p_source', 'text'], ['p_request', 'jsonb'], ['p_capability', 'jsonb']],
  renew_firewood_live_handoff: [['p_source', 'text'], ['p_order', 'uuid'], ['p_invoice', 'uuid'], ['p_hash', 'text'], ['p_version', 'integer'], ['p_capability', 'jsonb']],
  read_firewood_live_handoff: [['p_source', 'text'], ['p_order', 'uuid'], ['p_invoice', 'uuid'], ['p_hash', 'text']],
  record_firewood_live_handoff_observation: [['p_source', 'text'], ['p_order', 'uuid'], ['p_invoice', 'uuid'], ['p_hash', 'text'], ['p_ledger_hash', 'text'], ['p_financial', 'jsonb']],
  get_firewood_live_collector_context: [['p_invoice', 'uuid']],
});
export function liveDatabaseError(error) {
  const message = error?.message ?? '';
  if (/contact requires review|address requires review/.test(message)) return new FirewoodLiveHandoffError('contact_review_required', false, 409);
  if (/approval/.test(message)) return new FirewoodLiveHandoffError('office_approval_unconfirmed', false, 409);
  if (error?.code === '23505' || /identity changed|binding changed/.test(message)) return new FirewoodLiveHandoffError('order_identity_conflict', false, 409);
  if (/revoked/.test(message)) return new FirewoodLiveHandoffError('capability_revoked_review', false, 409);
  if (/version changed/.test(message)) return new FirewoodLiveHandoffError('capability_version_conflict', false, 409);
  if (error?.details === 'provider_snapshot_superseded' || /ledger changed/.test(message)) return new FirewoodLiveHandoffError('settlement_version_conflict', true, 409);
  return new FirewoodLiveHandoffError('database_unconfirmed', true, 503);
}
export function nativeLiveDatabase(pool) {
  return { async call(name, args) {
    const operation = Object.hasOwn(operations, name) ? operations[name] : null;
    if (!operation) throw new FirewoodLiveHandoffError('unsupported_operation');
    try {
      const result = await pool.query({ text: 'select public.' + name + '(' + operation.map(([, type], i) => '$' + (i + 1) + '::' + type).join(',') + ') as result',
        values: operation.map(([key, type]) => type === 'jsonb' ? JSON.stringify(args[key]) : args[key]), query_timeout: 5000 });
      if (result.rows.length !== 1) throw Error('Missing receipt');
      return result.rows[0].result;
    } catch (error) { throw liveDatabaseError(error); }
  } };
}
export function supabaseLiveDatabase(client) {
  return { async call(name, args) {
    if (!Object.hasOwn(operations, name)) throw new FirewoodLiveHandoffError('unsupported_operation');
    try {
      const result = await client.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
      if (result.error) throw result.error;
      return result.data;
    } catch (error) { throw liveDatabaseError(error); }
  } };
}
