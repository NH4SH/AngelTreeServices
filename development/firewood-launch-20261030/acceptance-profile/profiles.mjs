// Pure local profile consistency checks. No environment, credential, network,
// filesystem, database, runtime installer, or activation authority is read here.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const fail = message => { throw new Error('Firewood profile rejected: ' + message); };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const activation = () => ({ orders: false, preparation: false, collection: false, surcharge: false,
  customerSending: false, ownerSending: false, workers: false, publicCheckoutLink: false });
export const BUSINESS_POLICY = freeze({
  termsVersion: 'firewood-household-live-2026-10-29-v1',
  termsHash: 'b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482',
  paymentPolicyVersion: 'firewood-payment-options-live-2026-10-29-v1',
  paymentPolicyHash: '201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3',
});
const identities = freeze({
  production: {
    profile: 'firewood-production-office-v2', officeContract: 'firewood-office-live-v2',
    financialContract: 'firewood-invoice-handoff-live-v1', sourceId: 'website_firewood_invoice_live_v1',
    environmentId: 'ats_firewood_live_v1', mode: 'live', livemode: true,
    expectedAccountId: 'acct_1Tv92EI7tY6VHUvU', sqlIdentityPrefix: 'firewood_live_',
    financialPathPrefix: '/api/integrations/firewood/live/v1', officePathPrefix: '/api/integrations/firewood/live/v2/office',
    financialHmacDomain: 'ATS-FIREWOOD-LIVE-V1', officeHmacDomain: 'ATS-FIREWOOD-OFFICE-LIVE-V2',
  },
  acceptance: {
    profile: 'firewood-acceptance-office-v2', officeContract: 'firewood-office-acceptance-v2',
    financialContract: 'firewood-invoice-handoff-acceptance-v1', sourceId: 'website_firewood_invoice_acceptance_v1',
    environmentId: 'ats_firewood_acceptance_v1', mode: 'test', livemode: false,
    expectedAccountId: 'acct_1UU9U8RAZXGe6tX0', sqlIdentityPrefix: 'firewood_acceptance_',
    financialPathPrefix: '/api/integrations/firewood/acceptance/v1', officePathPrefix: '/api/integrations/firewood/acceptance/v2/office',
    financialHmacDomain: 'ATS-FIREWOOD-ACCEPTANCE-V1', officeHmacDomain: 'ATS-FIREWOOD-OFFICE-ACCEPTANCE-V2',
  },
});
const registered = new WeakMap();
function register(value, kind) { const result = freeze(value); registered.set(result, kind); return result; }
function initial(kind) {
  return register({ ...identities[kind], businessPolicy: structuredClone(BUSINESS_POLICY),
    origins: kind === 'production' ? { portalOrigin: 'https://admin.angeltreeservices.org', websiteOrigin: 'https://checkout.angeltreeservices.org' } : null,
    targetPurpose: kind === 'acceptance' ? 'ats-firewood-acceptance-v1' : null,
    accountVerification: 'UNVERIFIED', expectedDatabase: null, bindings: null,
    state: 'unbound-review-only', providerReady: false, runtimeLoadable: false, activation: activation(),
  }, kind + ':unbound');
}
export const PRODUCTION_DESCRIPTOR = initial('production');
export const ACCEPTANCE_DESCRIPTOR = initial('acceptance');

// This cannot become provider-ready. These inert origins are only for local
// in-memory contract tests, never a provider or actual admission descriptor.
export function createHermeticAcceptanceFixture() {
  return register({ ...structuredClone(ACCEPTANCE_DESCRIPTOR),
    origins: { portalOrigin: 'https://crm.firewood-acceptance.invalid', websiteOrigin: 'https://checkout.firewood-acceptance.invalid' },
    state: 'hermetic-fixture-only', fixtureOnly: true,
  }, 'acceptance:fixture');
}
export function assertKnownDescriptor(value) {
  const kind = registered.get(value);
  if (!kind || value.providerReady !== false || value.runtimeLoadable !== false
    || Object.values(value.activation).some(flag => flag !== false)) fail('unknown descriptor or activation claim');
  return kind;
}
function httpsOrigin(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === value && url.protocol === 'https:' && !url.username && !url.password
      && !url.port && !url.hostname.endsWith('.invalid') && !url.hostname.endsWith('.test')
      && !url.hostname.endsWith('.localhost') && url.hostname !== 'localhost'
      && !/^\d+(?:\.\d+){3}$/u.test(url.hostname) && !url.hostname.includes(':')
      && /^[a-z0-9.-]+$/u.test(url.hostname) && url.hostname.includes('.');
  } catch { return false; }
}
const databaseKeys = ['name', 'oid', 'systemIdentifier', 'markerId', 'purpose', 'comment', 'metaSchema', 'metaTable', 'schemaFingerprint', 'releaseDigest', 'admissionBindingId'];
export function validateAcceptanceDatabaseIdentity(value) {
  if (!exact(value, databaseKeys) || typeof value.name !== 'string'
    || !/^ats_firewood_acceptance_[a-f0-9]{12}$/u.test(value.name)
    || !/^[1-9][0-9]{0,9}$/u.test(value.oid ?? '')
    || !/^[1-9][0-9]{5,19}$/u.test(value.systemIdentifier ?? '') || !uuid(value.markerId)
    || value.purpose !== 'ats-firewood-acceptance-v1'
    || value.comment !== 'ats-firewood-acceptance-v1:' + value.markerId + ':synthetic-only'
    || value.metaSchema !== 'ats_firewood_acceptance_meta' || value.metaTable !== 'target'
    || !hash(value.schemaFingerprint) || !hash(value.releaseDigest) || !uuid(value.admissionBindingId))
    fail('acceptance database purpose or literal identity');
  return freeze(structuredClone(value));
}
function recent(value, nowMs) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    && Date.parse(value) <= nowMs && nowMs - Date.parse(value) <= 600_000;
}

// Root supplies observations from independently verified private operations.
// This checks their consistency; it cannot authenticate their provenance or
// replace root's actual account/key/database/operator-approval verification.
export function bindAcceptanceReviewDescriptor({ expectedDatabase, observedDatabase, approvedOrigins,
  accountObservation, admissionObservation, nowMs }) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 1) fail('explicit observation clock');
  const expected = validateAcceptanceDatabaseIdentity(expectedDatabase);
  const observed = validateAcceptanceDatabaseIdentity(observedDatabase);
  if (databaseKeys.some(key => expected[key] !== observed[key])) fail('database readback mismatch');
  if (!exact(approvedOrigins, ['portalOrigin', 'websiteOrigin', 'financialPathPrefix', 'officePathPrefix', 'approvalId', 'approvalEvidenceSha256'])
    || !httpsOrigin(approvedOrigins.portalOrigin) || !httpsOrigin(approvedOrigins.websiteOrigin)
    || approvedOrigins.financialPathPrefix !== identities.acceptance.financialPathPrefix
    || approvedOrigins.officePathPrefix !== identities.acceptance.officePathPrefix
    || !uuid(approvedOrigins.approvalId) || !hash(approvedOrigins.approvalEvidenceSha256)) fail('operator-approved origins and exact acceptance paths');
  if (!exact(accountObservation, ['accountId', 'livemode', 'mode', 'observedAt', 'evidenceSha256', 'method'])
    || accountObservation.accountId !== identities.acceptance.expectedAccountId || accountObservation.livemode !== false
    || accountObservation.mode !== 'test' || accountObservation.method !== 'independent-account-and-mode-readback'
    || !hash(accountObservation.evidenceSha256) || !recent(accountObservation.observedAt, nowMs)) fail('fresh independent sandbox account/mode readback');
  if (!exact(admissionObservation, ['bindingId', 'databaseName', 'databaseOid', 'systemIdentifier', 'markerId', 'purpose',
    'schemaFingerprint', 'releaseDigest', 'sourceId', 'environmentId', 'accountId', 'livemode', 'observedAt', 'evidenceSha256'])
    || admissionObservation.bindingId !== expected.admissionBindingId || admissionObservation.databaseName !== expected.name
    || admissionObservation.databaseOid !== expected.oid || admissionObservation.systemIdentifier !== expected.systemIdentifier
    || admissionObservation.markerId !== expected.markerId || admissionObservation.purpose !== expected.purpose
    || admissionObservation.schemaFingerprint !== expected.schemaFingerprint || admissionObservation.releaseDigest !== expected.releaseDigest
    || admissionObservation.sourceId !== identities.acceptance.sourceId || admissionObservation.environmentId !== identities.acceptance.environmentId
    || admissionObservation.accountId !== identities.acceptance.expectedAccountId || admissionObservation.livemode !== false
    || !hash(admissionObservation.evidenceSha256) || !recent(admissionObservation.observedAt, nowMs)) fail('fresh exact QA admission readback');
  return register({ ...structuredClone(ACCEPTANCE_DESCRIPTOR), origins: {
    portalOrigin: approvedOrigins.portalOrigin, websiteOrigin: approvedOrigins.websiteOrigin },
    accountVerification: 'MATCHING_OPERATOR_OBSERVATION', expectedDatabase: expected,
    bindings: { approvedOrigins: structuredClone(approvedOrigins), observedDatabase: observed, validatedAtMs: nowMs,
      accountObservation: structuredClone(accountObservation), admissionObservation: structuredClone(admissionObservation) }, state: 'binding-consistent-review-only',
  }, 'acceptance:bound-review');
}
export function assertDerivableAcceptance(value) {
  const kind = assertKnownDescriptor(value);
  if (!['acceptance:fixture', 'acceptance:bound-review'].includes(kind) || !value.origins) fail('acceptance remains unbound');
  return kind;
}
export function assertBoundAcceptance(value) {
  if (assertKnownDescriptor(value) !== 'acceptance:bound-review') fail('literal QA binding required before SQL envelope');
  return value.expectedDatabase;
}

const canonical = value => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
  : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
    : JSON.stringify(value);
export function validateSerializedAcceptanceReviewDescriptor(value) {
  let expected;
  if (value?.state === 'hermetic-fixture-only') expected = createHermeticAcceptanceFixture();
  else if (value?.state === 'binding-consistent-review-only' && value.bindings) {
    expected = bindAcceptanceReviewDescriptor({ expectedDatabase: value.expectedDatabase,
      observedDatabase: value.bindings.observedDatabase, approvedOrigins: value.bindings.approvedOrigins,
      accountObservation: value.bindings.accountObservation, admissionObservation: value.bindings.admissionObservation,
      nowMs: value.bindings.validatedAtMs });
  } else fail('serialized descriptor has no reviewed fixture or bound identity');
  if (canonical(expected) !== canonical(value)) fail('serialized descriptor identity or authority claim changed');
  return expected;
}
