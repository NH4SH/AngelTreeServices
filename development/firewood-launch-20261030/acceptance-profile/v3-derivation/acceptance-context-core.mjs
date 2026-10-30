// Pure closed interface for a future, separately reviewed synthetic acceptance
// adapter. No filesystem/environment/DB/network/credential access. This module
// has no authority registration API and cannot return an admitted proof.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const reject = reason => { throw new Error('Closed acceptance context rejected: ' + reason); };

export const ACCEPTANCE_CONTEXT_MODES = freeze(['status', 'preparation', 'office', 'collection', 'sending']);
export const ACCEPTANCE_CONTEXT_TARGET = freeze({
  databaseName: 'ats_firewood_acceptance_c6f62a2c0f61',
  databaseOid: '23849',
  systemIdentifier: '7702496746553905162',
  databaseStartedAt: '2026-10-30T16:27:17.304733+00:00',
  markerId: '5b7af2eb-9889-4663-8992-8560982248fb',
  purpose: 'ats-firewood-acceptance-v1',
  comment: 'ats-firewood-acceptance-v1:5b7af2eb-9889-4663-8992-8560982248fb:synthetic-only',
});
export const ACCEPTANCE_CONTEXT_CONTRACT = freeze({
  kind: 'closed-synthetic-acceptance-context-interface-v1',
  scope: 'synthetic-acceptance', mode: 'test', livemode: false,
  sourceId: 'website_firewood_invoice_acceptance_v1',
  environmentId: 'ats_firewood_acceptance_v1',
  accountId: 'acct_1UU9U8RAZXGe6tX0',
  authorityRegistered: false, actualAdmission: false, nativeProofAssigned: false,
  runtimeLoadable: false, providerReady: false, activationAuthority: false,
});
const targetKeys = Object.keys(ACCEPTANCE_CONTEXT_TARGET);
export function assertExactAcceptanceContextTarget(value) {
  if (!exact(value, targetKeys)
    || targetKeys.some(key => value[key] !== ACCEPTANCE_CONTEXT_TARGET[key])) reject('physical target mismatch');
  return true;
}
const mode = value => {
  if (!ACCEPTANCE_CONTEXT_MODES.includes(value)) reject('one of five explicit modes required');
  return value;
};
const instances = new WeakSet();
/**
 * A typed, immutable negative boundary, not an admission verifier. Root must
 * supply a new reviewed implementation that authenticates the signed synthetic
 * recovery authority and native SQL observations before any positive return.
 * Plain JSON, a callback, a matching physical target, or production/rehearsal
 * proof objects are never registered authority in this implementation.
 */
export class ClosedAcceptanceContext {
  constructor(options = {}) {
    if (new.target !== ClosedAcceptanceContext) reject('subclass authority is not supported');
    if (!exact(options, []) && !exact(options, ['target', 'scope', 'providerMode', 'authority'])) reject('constructor shape');
    const { target = ACCEPTANCE_CONTEXT_TARGET, scope = 'synthetic-acceptance', providerMode = 'test', authority = null } = options;
    assertExactAcceptanceContextTarget(target);
    if (scope !== 'synthetic-acceptance' || providerMode !== 'test') reject('synthetic test scope required');
    if (authority !== null) reject('real synthetic authority is not registered');
    instances.add(this);
    Object.freeze(this);
  }
  get target() { if (!instances.has(this)) reject('unknown boundary'); return ACCEPTANCE_CONTEXT_TARGET; }
  get contract() { if (!instances.has(this)) reject('unknown boundary'); return ACCEPTANCE_CONTEXT_CONTRACT; }
  async readAcceptanceContext(requestedMode, options = {}) {
    if (!instances.has(this)) reject('unknown boundary');
    mode(requestedMode);
    if (!exact(options, []) && !exact(options, ['target', 'scope', 'providerMode', 'authority'])) reject('read shape');
    const { target = ACCEPTANCE_CONTEXT_TARGET, scope = 'synthetic-acceptance', providerMode = 'test', authority = null } = options;
    assertExactAcceptanceContextTarget(target);
    if (scope !== 'synthetic-acceptance' || providerMode !== 'test') reject('synthetic test scope required');
    if (authority !== null) reject('real synthetic authority is not registered');
    return null;
  }
  // Website-compatible callback convention: constructor inputs include an
  // explicit mode; the returned callback receives its pinned transaction.
  // This closed implementation never touches the transaction or accepts it as
  // evidence. It must be replaced by the reviewed real adapter, never unsealed
  // by a caller-supplied flag, function, environment variable or proof JSON.
  createAdmissionVerifier(options = {}) {
    if (!instances.has(this)) reject('unknown boundary');
    if (!exact(options, ['mode']) && !exact(options, ['mode', 'target'])) reject('verifier shape');
    const { mode: requestedMode, target = ACCEPTANCE_CONTEXT_TARGET } = options;
    mode(requestedMode);
    assertExactAcceptanceContextTarget(target);
    return async _transaction => null;
  }
}
Object.freeze(ClosedAcceptanceContext.prototype);
Object.freeze(ClosedAcceptanceContext);
