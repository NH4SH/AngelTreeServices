// Pure review contract only. No runtime entrypoint, filesystem, environment,
// credential, database, network, admission, or activation capability.
import { createHash } from 'node:crypto';

export const DATABASE_NAME = /^ats_firewood_acceptance_[a-f0-9]{12}$/u;
export const ACCEPTANCE = Object.freeze({
  officeContract: 'firewood-office-acceptance-v2',
  financialContract: 'firewood-invoice-handoff-acceptance-v1',
  sourceId: 'website_firewood_invoice_acceptance_v1',
  environmentId: 'ats_firewood_acceptance_v1',
  accountId: 'acct_1UU9U8RAZXGe6tX0', mode: 'test', livemode: false,
  databasePurpose: 'ats-firewood-acceptance-v1',
  sqlPrefix: 'firewood_acceptance_', storagePrefix: 'fwofficeacceptance_',
  financialPathPrefix: '/api/integrations/firewood/acceptance/v1',
  officePathPrefix: '/api/integrations/firewood/acceptance/v2/office',
  financialHmacDomain: 'ATS-FIREWOOD-ACCEPTANCE-V1',
  officeHmacDomain: 'ATS-FIREWOOD-OFFICE-ACCEPTANCE-V2',
  cookie: '__Host-ats_firewood_acceptance_v1',
  termsHash: 'b58eaaea481bfd1aecf509ef940a8f0bc135f7db4446784533cb3b588c6ac482',
  paymentPolicyHash: '201c6523787fd3e2289843f51e63b1726b85a5fc2978cbae15acf870e79cdad3',
});
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const reject = reason => { throw Error('Acceptance V3 review rejected: ' + reason); };
const databaseKeys = ['name', 'oid', 'systemIdentifier', 'markerId', 'purpose', 'comment', 'metaSchema',
  'metaTable', 'schemaFingerprint', 'releaseDigest', 'admissionBindingId'];

export function validateDatabaseProposal(value) {
  if (!exact(value, databaseKeys) || typeof value.name !== 'string' || !DATABASE_NAME.test(value.name)
    || typeof value.oid !== 'string' || !/^[1-9][0-9]{0,9}$/u.test(value.oid)
    || typeof value.systemIdentifier !== 'string' || !/^[1-9][0-9]{5,19}$/u.test(value.systemIdentifier)
    || !uuid(value.markerId) || value.purpose !== ACCEPTANCE.databasePurpose
    || value.comment !== ACCEPTANCE.databasePurpose + ':' + value.markerId + ':synthetic-only'
    || value.metaSchema !== 'ats_firewood_acceptance_meta' || value.metaTable !== 'target'
    || !hash(value.schemaFingerprint) || !hash(value.releaseDigest) || !uuid(value.admissionBindingId))
    reject('literal acceptance database identity');
  return true;
}

// Names remain input proposals until root actually creates and rereads the
// three native roles. This is not a role creator and proves no ACLs or LOGINs.
export function validateNativeRoleProposal(roles, databaseName) {
  if (!DATABASE_NAME.test(databaseName ?? '') || !exact(roles, ['request', 'worker', 'health'])) reject('three native roles');
  const suffix = databaseName.slice(-12);
  for (const kind of ['request', 'worker', 'health'])
    if (roles[kind] !== 'ats_firewood_acceptance_' + kind + '_' + suffix) reject('native role namespace');
  return true;
}

const reviewedCandidates = new WeakSet();
// Root must establish the provenance of these exact observation bytes. This
// local consistency result never stands in for the signed gate or native proof.
export function reviewBindingConsistency({ expectedDatabase, observedDatabase, roles, accountObservation,
  nativeObservation, nowMs }) {
  validateDatabaseProposal(expectedDatabase); validateDatabaseProposal(observedDatabase);
  if (databaseKeys.some(key => expectedDatabase[key] !== observedDatabase[key])) reject('database readback mismatch');
  validateNativeRoleProposal(roles, expectedDatabase.name);
  if (!Number.isSafeInteger(nowMs) || nowMs < 1) reject('explicit observation clock');
  const recent = at => typeof at === 'string' && Number.isFinite(Date.parse(at))
    && Date.parse(at) <= nowMs && nowMs - Date.parse(at) <= 600_000;
  if (!exact(accountObservation, ['accountId', 'mode', 'livemode', 'keyFingerprint', 'evidenceSha256', 'observedAt'])
    || accountObservation.accountId !== ACCEPTANCE.accountId || accountObservation.mode !== 'test'
    || accountObservation.livemode !== false || !hash(accountObservation.keyFingerprint)
    || !hash(accountObservation.evidenceSha256) || !recent(accountObservation.observedAt)) reject('fresh test account/key observation');
  if (!exact(nativeObservation, ['databaseName', 'databaseOid', 'systemIdentifier', 'markerId', 'admissionBindingId',
    'roles', 'schemaFingerprint', 'releaseDigest', 'proofSha256', 'observedAt'])
    || nativeObservation.databaseName !== expectedDatabase.name || nativeObservation.databaseOid !== expectedDatabase.oid
    || nativeObservation.systemIdentifier !== expectedDatabase.systemIdentifier || nativeObservation.markerId !== expectedDatabase.markerId
    || nativeObservation.admissionBindingId !== expectedDatabase.admissionBindingId
    || nativeObservation.schemaFingerprint !== expectedDatabase.schemaFingerprint
    || nativeObservation.releaseDigest !== expectedDatabase.releaseDigest
    || !exact(nativeObservation.roles, ['request', 'worker', 'health'])
    || ['request', 'worker', 'health'].some(kind => nativeObservation.roles[kind] !== roles[kind])
    || !hash(nativeObservation.proofSha256) || !recent(nativeObservation.observedAt)) reject('fresh matching native proof observation');
  const candidate = Object.freeze({ kind: 'binding-consistency-review-only',
    databaseName: expectedDatabase.name, stripeKeyFingerprint: accountObservation.keyFingerprint,
    accountId: ACCEPTANCE.accountId, mode: 'test', livemode: false,
    actualAdmission: false, providerReady: false, runtimeLoadable: false, activationAuthority: false });
  reviewedCandidates.add(candidate);
  return candidate;
}

// A proposed collector key classifier may be used only in a separately derived
// acceptance module. It never broadens the production rk_live_ classifier.
// Even true is a local consistency fact; it does not construct a Stripe client.
export function testKeyMatchesReviewedCandidate(candidate, key) {
  return Boolean(reviewedCandidates.has(candidate) && typeof key === 'string'
    && /^rk_test_[A-Za-z0-9]+$/u.test(key)
    && createHash('sha256').update(key, 'utf8').digest('hex') === candidate.stripeKeyFingerprint);
}
